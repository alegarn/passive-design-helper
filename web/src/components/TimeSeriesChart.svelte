<script>
  import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, TimeScale } from 'chart.js';
  import { Line } from 'svelte5-chartjs';
  import { onDestroy } from 'svelte';
  import { ZONE_COLORS } from '../../../scripts/theme.js';
  import { ZONES, preferredZoneForPoint } from '../../../scripts/zones.js';
  import {
    aggregateByHour,
    aggregateByDay,
    aggregateByWeek,
    aggregateByMonth,
    getAggregationFunction,
    getRecommendedAggregation,
    calculateAverage,
    calculateDatasetAverages
  } from '../utils/timeSeriesAggregator.js';
  import { getSourceDateRange, buildDailyBuckets } from '../utils/dataProcessor.js';
  import StatCard from './StatCard.svelte';
  import { timeSeries } from '../stores/fileStore.js';
  import 'chartjs-adapter-date-fns';

  // Register Chart.js components only once and check if already registered to avoid conflicts
  if (!ChartJS.registered) {
    ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, TimeScale);
    ChartJS.registered = true;
  }

  // Props
  let {
    selectedPeriod = 'daily',
    colorSegments = null, // Multi-color line configuration (deprecated, use zones instead)
    zones = null // Zone-based color gradient configuration
  } = $props();
  
  /*
   * Zone-based color gradient support:
   *
   * The zones prop allows rendering a single line with multiple colors
   * based on data values. It accepts two formats:
   *
   * 1. Array of threshold objects:
   *    zones = [
   *      { threshold: 30, color: '#ff0000' },  // Values >= 30: red
   *      { threshold: 20, color: '#ffaa00' },  // Values >= 20: orange
   *      { threshold: 10, color: '#00aa00' }   // Values >= 10: green
   *    ]
   *
   * 2. Function that returns color based on value:
   *    zones = (value) => {
   *      if (value > 25) return '#ff0000';
   *      if (value > 15) return '#ffaa00';
   *      return '#00aa00';
   *    }
   *
   * When zones is provided, each segment of the line between data points
   * will be colored according to the end point's value using Chart.js segment styling.
   * The default zone color is used as fallback when no segment color matches.
   *
   * Hourly chart behavior:
   * - When selectedPeriod is 'hourly', the chart shows an "average day" line
   * - This means exactly 24 points (hours 0-23) showing the average value for each hour
   * across the entire selected period (e.g., a month)
   * - Missing hours with no data are set to null to avoid drawing points
   *
   * Limitations:
   * - Gradients are applied per-segment between consecutive points
   * - Sparse data can make transitions look abrupt
   * - Chart.js segment styling requires v3.0+ for proper gradient support
   */

  // Component state
  let showChart = $state(true);
  let currentPeriod = $state(selectedPeriod);
  let aggregatedData = $state([]);
  let chartData = $state(null);
  let chartOptions = $state({});
  let sourceDateRange = $state(null); // Store actual source date range
  
  // Calculate averages for displayed datasets - reactive to chartData changes
  const datasetAverages = $derived(() => {
    if (!chartData || !chartData.datasets) {
      return [];
    }
    
    // For Daily granularity, use collapsed averages (Temperature and Humidity only)
    if (currentPeriod === 'daily') {
      return calculateDatasetAverages(aggregatedData, {
        collapseClassificationsFor: ['daily'],
        granularity: currentPeriod
      });
    } else {
      // For other granularities, use the original behavior based on chart datasets
      return (chartData.datasets || []).map(dataset => {
        // Extract numeric values from dataset.data array defensively
        const values = (dataset.data || []).map(point => (point && point.y)).filter(val => typeof val === 'number' && !isNaN(val));
        const average = calculateAverage(values, 1);
        return {
          label: dataset.label,
          value: average,
          color: dataset.borderColor
        };
      });
    }
  });
  
  // Calculate zone totals for passive design zones - reactive to aggregatedData/timeSeries and currentPeriod
  // For hourly (average-day) view we scale each hourly-average point by number of days
  // in source range so cards reflect total hours across selected period (consistent
  // with daily/weekly behavior) instead of listing every single sample hour.
  const zoneTotals = $derived(() => {
    const agg = aggregatedData;
    const raw = $timeSeries;
    const period = currentPeriod;
    const totals = {};
    ZONES.forEach(z => (totals[z.id] = 0));
  
    if (period === 'hourly') {
      if (agg && agg.length) {
        // For hourly average-day chart, each of the 24 points represents exactly 1 hour of the day,
        // not the total hours across the source range. So we count each hourly point as 1 hour.
        agg.forEach(point => {
          const t = point.temp, h = point.rh;
          if (t == null || h == null) return;
          const zone = preferredZoneForPoint(t, h);
          if (!zone) return;
          totals[zone.id] = (totals[zone.id] || 0) + 1;
        });
      } else if (raw && raw.length) {
        // Fallback: if no hourly averages available, sum raw durations (defensive)
        raw.forEach(r => {
          const t = r.temp, h = r.rh;
          if (t == null || h == null) return;
          const zone = preferredZoneForPoint(t, h);
          if (!zone) return;
          const hours = r.dur ? r.dur / 3600000 : 1;
          totals[zone.id] = (totals[zone.id] || 0) + hours;
        });
      } else {
        return [];
      }
    } else if (agg && agg.length) {
      // For daily/weekly/monthly use aggregatedData points (prefer displayed data)
      agg.forEach(point => {
        const t = point.temp, h = point.rh;
        if (t == null || h == null) return;
        const zone = preferredZoneForPoint(t, h);
        if (!zone) return;
        // prefer explicit duration in aggregated point (dur_hours), else estimate by period
        let hours = point.dur_hours || point.dur || 0;
        if (!hours) {
          if (period === 'daily') hours = 24;
          else if (period === 'weekly') hours = 24 * 7;
          else if (period === 'monthly') hours = 24 * 30;
          else hours = 1;
        }
        totals[zone.id] = (totals[zone.id] || 0) + hours;
      });
    } else {
      return [];
    }
  
    return ZONES.map(z => ({
      id: z.id,
      name: z.id,
      value: totals[z.id] || 0,
      color: z.color
    })).filter(z => z.value > 0);
  });
  
  // Chart options (defined outside reactive context to avoid cloning issues)
  const hourTickCallback = function(value) {
    return value + ':00';
  };

  // Available periods
  const periods = [
    { value: 'hourly', label: 'Hourly' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' }
  ];

  // Format date based on period
  function formatDateForDisplay(timestamp, period) {
    const date = new Date(timestamp);
    
    switch (period) {
      case 'hourly':
        return date.toLocaleString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit' 
        });
      case 'daily':
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
      case 'weekly':
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
      case 'monthly':
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          year: 'numeric' 
        });
      default:
        return date.toLocaleDateString();
    }
  }

  // Helper function to get color for a value based on zones configuration
  function getZoneColor(value, defaultColor) {
    // Use zones if provided, otherwise fallback to colorSegments for backwards compatibility
    const zoneConfig = zones || colorSegments;
    
    if (!zoneConfig) {
      return defaultColor;
    }
    
    if (typeof zoneConfig === 'function') {
      return zoneConfig(value);
    }
    
    if (Array.isArray(zoneConfig)) {
      // Find the first threshold that the value exceeds
      for (const segment of zoneConfig) {
        if (value >= segment.threshold) {
          return segment.color;
        }
      }
      // If no threshold matched, return default color
      return defaultColor;
    }
    
    return defaultColor;
  }
  
  // Helper function to get zone color based on both temperature and humidity
  function getPassiveDesignZoneColor(temp, rh) {
    const zone = preferredZoneForPoint(temp, rh);
    if (zone && zone.color) {
      return zone.color;
    }
    return ZONE_COLORS['Unclassified'] || '#999999';
  }

  // Create a gradient between two colors for Chart.js segment styling
  function createGradient(ctx, color1, color2) {
    const chart = ctx.chart;
    const {ctx: chartCtx, chartArea} = chart;
    
    if (!chartArea) {
      return color1;
    }
    
    const gradient = chartCtx.createLinearGradient(
      ctx.p0.x, ctx.p0.y, ctx.p1.x, ctx.p1.y
    );
    
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    
    return gradient;
  }

  // Pure function to process data for chart - returns values instead of updating state
  function processDataForChartPure(data, period, selectedPeriodProp) {
    if (!data || data.length === 0) {
      return {
        aggregatedData: [],
        chartData: null,
        chartOptions: {},
        sourceDateRange: null
      };
    }

    // Log source data length for debugging
    console.info(`[TimeSeriesChart] Source rows length: ${data.length}`);

    // Filter out invalid records and normalize field names
    const validData = data.filter(record => {
      return record &&
             record.ts &&
             typeof record.temp === 'number' &&
             typeof record.rh === 'number' &&
             !isNaN(new Date(record.ts).getTime());
    }).map(record => ({
      // Normalize field names for the chart
      timestamp: record.ts, // Convert ts to timestamp
      temp: record.temp,
      rh: record.rh,
      dur_hours: record.dur ? record.dur / 3600000 : 0, // Convert ms to hours
      zone: record.zone || 'Unclassified',
      raw: record.raw
    }));

    if (validData.length === 0) {
      console.warn('No valid time series data found after filtering');
      return {
        aggregatedData: [],
        chartData: null,
        chartOptions: {},
        sourceDateRange: null
      };
    }
    
    // Calculate source date range for accurate summary
    const sourceDateRange = getSourceDateRange(validData);

    // Set recommended period if not specified
    let finalPeriod = period;
    if (!selectedPeriodProp) {
      finalPeriod = getRecommendedAggregation(validData);
    }

    // Special handling for hourly view - create average day
    let aggregatedData;
    if (finalPeriod === 'hourly') {
      aggregatedData = createHourlyAverageData(validData);
    } else if (finalPeriod === 'daily') {
      // Use buildDailyBuckets for daily view to ensure inclusive range with null gaps
      try {
        // Build temperature buckets covering every day from sourceMinDate to sourceMaxDate
        const tempBuckets = buildDailyBuckets(validData, row => row.temp);
        // Build humidity buckets for the same range
        const rhBuckets = buildDailyBuckets(validData, row => row.rh);
        
        // Combine temperature and RH buckets into unified data structure
        aggregatedData = tempBuckets.map((tempBucket, index) => ({
          timestamp: tempBucket.x,
          temp: tempBucket.y,
          rh: rhBuckets[index] ? rhBuckets[index].y : null,
          zone: null // Zone will be determined by color based on temp/rh values
        }));
      } catch (error) {
        console.error('Error building daily buckets:', error);
        // Fallback to regular aggregation if bucket building fails
        const aggregateFn = getAggregationFunction(finalPeriod);
        aggregatedData = aggregateFn(validData);
      }
    } else {
      // Aggregate data based on selected period
      const aggregateFn = getAggregationFunction(finalPeriod);
      try {
        aggregatedData = aggregateFn(validData);
      } catch (error) {
        console.error('Error aggregating time series data:', error);
        return {
          aggregatedData: [],
          chartData: null,
          chartOptions: {},
          sourceDateRange: null
        };
      }
    }

    // --- TRIAGE: ensure every aggregated point has a single zone id
    // Some aggregation paths (e.g. buildDailyBuckets) produce points with `zone: null`.
    // We should triage each point to a single zone for consistent downstream rendering
    // and to avoid leaving many points as 'Unclassified' or multi-match combo strings.
    aggregatedData = aggregatedData.map(pt => {
      const t = pt.temp;
      const h = pt.rh;
      // preserve explicitly provided zone if it's a non-empty string
      if (pt.zone && typeof pt.zone === 'string' && pt.zone !== 'Unclassified') {
        return pt;
      }
      if (t == null || h == null || isNaN(Number(t)) || isNaN(Number(h))) {
        // keep as Unclassified when values are missing
        return { ...pt, zone: 'Unclassified' };
      }
      const z = preferredZoneForPoint(t, h);
      return { ...pt, zone: z ? z.id : 'Unclassified' };
    });

    // Log processed data length for debugging
    console.info(`[TimeSeriesChart] Dataset data length: ${aggregatedData.length}`);

    // Prepare datasets for Chart.js
    const datasets = [];
    
    // For hourly average day, create temperature and RH datasets
    if (finalPeriod === 'hourly') {
      const defaultColor = ZONE_COLORS['Unclassified'] || '#999999';
      
      // Temperature dataset
      const tempDataset = {
        label: 'Temperature (°C)',
        data: aggregatedData.map(point => ({
          x: point.hour, // Use hour (0-23) as x value
          y: point.temp
        })),
        borderColor: defaultColor,
        backgroundColor: defaultColor,
        borderWidth: 2,
        fill: false,
        tension: 0.1,
        pointRadius: 3,
        pointHoverRadius: 5,
        yAxisID: 'y'
      };
      
      // Add segment styling based on Passive Design Zones (T° & RH)
      tempDataset.segment = {
        borderColor: ctx => {
          // Get temperature and humidity values for this segment
          const temp1 = ctx.p0.parsed.y;
          const temp2 = ctx.p1.parsed.y;
          
          // Find corresponding RH values from the aggregated data
          const x1 = ctx.p0.parsed.x;
          const x2 = ctx.p1.parsed.x;
          
          const rh1 = aggregatedData.find(point => point.hour === x1)?.rh || 50;
          const rh2 = aggregatedData.find(point => point.hour === x2)?.rh || 50;
          
          // Get zone colors based on both T° and RH
          const color1 = getPassiveDesignZoneColor(temp1, rh1);
          const color2 = getPassiveDesignZoneColor(temp2, rh2);
          
          // If colors are the same, return the solid color
          if (color1 === color2) {
            return color1;
          }
          
          // Create gradient between colors
          return createGradient(ctx, color1, color2);
        }
      };
      
      datasets.push(tempDataset);
      
      // Relative Humidity dataset (light blue, thin line)
      const rhDataset = {
        label: 'Relative Humidity (%)',
        data: aggregatedData.map(point => ({
          x: point.hour, // Use hour (0-23) as x value
          y: point.rh
        })),
        borderColor: 'rgba(135, 206, 250, 0.7)', // Light blue with transparency
        backgroundColor: 'rgba(135, 206, 250, 0.1)',
        borderWidth: 1,
        fill: false,
        tension: 0.1,
        pointRadius: 2,
        pointHoverRadius: 4,
        yAxisID: 'y1' // Use secondary y-axis for RH
      };
      
      datasets.push(rhDataset);
    } else {
      // Weekly/Monthly/Daily: unified two-series rendering (temp + rh) with per-segment zone coloring
      // Treat `daily` like weekly/monthly so temperature is a single line with per-segment zone colors
      if (finalPeriod === 'weekly' || finalPeriod === 'monthly' || finalPeriod === 'daily') {
        // Build pointMap for efficient lookup keyed by timestamp in milliseconds
        const pointMap = new Map(aggregatedData.map(p => [new Date(p.timestamp).getTime(), p]));
        
        // Temperature dataset (single time-series)
        const tempDataset = {
          label: "Temperature (°C)",
          data: aggregatedData.map(p => ({ x: new Date(p.timestamp), y: p.temp })),
          yAxisID: 'y',
          borderWidth: 2,
          tension: 0.1,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderColor: ZONE_COLORS['Unclassified'] || '#999999',
          backgroundColor: ZONE_COLORS['Unclassified'] || '#999999',
          fill: false
        };
        
        // Add segment styling with per-segment zone coloring
        tempDataset.segment = {
          borderColor: ctx => {
            // Get timestamps for segment endpoints
            const t1 = ctx.p0.parsed.x;
            const t2 = ctx.p1.parsed.x;
            
            // Lookup points using exact timestamp match
            let p1 = pointMap.get(t1);
            let p2 = pointMap.get(t2);
            
            // Fallback to nearest-index lookup if exact match fails
            if (!p1) {
              const index1 = ctx.p0.index;
              p1 = index1 !== undefined && index1 >= 0 && index1 < aggregatedData.length
                ? aggregatedData[index1]
                : null;
            }
            if (!p2) {
              const index2 = ctx.p1.index;
              p2 = index2 !== undefined && index2 >= 0 && index2 < aggregatedData.length
                ? aggregatedData[index2]
                : null;
            }
            
            // Use average values between endpoints for zone coloring
            const avgTemp = (p1?.temp && p2?.temp) ? (p1.temp + p2.temp) / 2 : (p1?.temp || p2?.temp);
            const avgRh = (p1?.rh && p2?.rh) ? (p1.rh + p2.rh) / 2 : (p1?.rh || p2?.rh);
            
            // Get zone color for the averaged values
            return getPassiveDesignZoneColor(avgTemp, avgRh);
          }
        };
        
        datasets.push(tempDataset);
        
        // Relative Humidity dataset (single time-series)
        const rhDataset = {
          label: "Relative Humidity (%)",
          data: aggregatedData.map(p => ({ x: new Date(p.timestamp), y: p.rh })),
          yAxisID: 'y1',
          borderColor: 'rgba(135, 206, 250, 0.7)', // Light blue with transparency
          backgroundColor: 'rgba(135, 206, 250, 0.1)',
          borderWidth: 1,
          tension: 0.1,
          pointRadius: 2,
          pointHoverRadius: 4,
          fill: false
        };
        
        datasets.push(rhDataset);
      } else {
        // For other periods (daily), group data by zone (preserve existing behavior)
        const zoneGroups = {};

        // Group data by zone
        aggregatedData.forEach(point => {
          const zone = point.zone || 'Unclassified';
          if (!zoneGroups[zone]) {
            zoneGroups[zone] = [];
          }
          zoneGroups[zone].push(point);
        });

        // Create a dataset for each zone
        Object.entries(zoneGroups).forEach(([zone, points]) => {
          const zoneColor = ZONE_COLORS[zone] || ZONE_COLORS['Unclassified'];
          
          // Temperature dataset for this zone
          const tempDataset = {
            label: `${zone} (Temperature)`,
            data: points.map(point => {
              // Ensure timestamp is a Date object for Chart.js time scale
              let timestamp = point.timestamp;
              if (typeof timestamp === 'string') {
                // If it's a string, convert to Date
                timestamp = new Date(timestamp);
              } else if (typeof timestamp === 'number') {
                // If it's a number, check if it's in seconds (epoch-like) or milliseconds
                // If it's a large number less than 10^12, it's likely in seconds
                if (timestamp < 1000000000000) {
                  timestamp = new Date(timestamp * 1000); // Convert seconds to milliseconds
                } else {
                  timestamp = new Date(timestamp); // Already in milliseconds
                }
              }
              
              return {
                x: timestamp,
                y: point.temp
              };
            }),
            borderColor: zoneColor,
            backgroundColor: zoneColor,
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 3,
            pointHoverRadius: 5
          };
          
          // Add segment styling based on Passive Design Zones (T° & RH)
          tempDataset.segment = {
            borderColor: ctx => {
              // Get temperature and humidity values for this segment
              const temp1 = ctx.p0.parsed.y;
              const temp2 = ctx.p1.parsed.y;
              
              // Find corresponding RH values from the points data
              const timestamp1 = ctx.p0.parsed.x;
              const timestamp2 = ctx.p1.parsed.x;
              
              const point1 = points.find(p => {
                const pointTime = new Date(p.timestamp).getTime();
                return Math.abs(pointTime - timestamp1) < 3600000; // Within 1 hour
              });
              const point2 = points.find(p => {
                const pointTime = new Date(p.timestamp).getTime();
                return Math.abs(pointTime - timestamp2) < 3600000; // Within 1 hour
              });
              
              const rh1 = point1?.rh || 50;
              const rh2 = point2?.rh || 50;
              
              // Get zone colors based on both T° and RH
              const color1 = getPassiveDesignZoneColor(temp1, rh1);
              const color2 = getPassiveDesignZoneColor(temp2, rh2);
              
              // If colors are the same, return the solid color
              if (color1 === color2) {
                return color1;
              }
              
              // Create gradient between colors
              return createGradient(ctx, color1, color2);
            }
          };
          
          datasets.push(tempDataset);
          
          // RH dataset for this zone (light blue, thin line)
          const rhDataset = {
            label: `${zone} (Humidity)`,
            data: points.map(point => {
              // Ensure timestamp is a Date object for Chart.js time scale
              let timestamp = point.timestamp;
              if (typeof timestamp === 'string') {
                // If it's a string, convert to Date
                timestamp = new Date(timestamp);
              } else if (typeof timestamp === 'number') {
                // If it's a number, check if it's in seconds (epoch-like) or milliseconds
                // If it's a large number less than 10^12, it's likely in seconds
                if (timestamp < 1000000000000) {
                  timestamp = new Date(timestamp * 1000); // Convert seconds to milliseconds
                } else {
                  timestamp = new Date(timestamp); // Already in milliseconds
                }
              }
              
              return {
                x: timestamp,
                y: point.rh
              };
            }),
            borderColor: 'rgba(135, 206, 250, 0.7)', // Light blue with transparency
            backgroundColor: 'rgba(135, 206, 250, 0.1)',
            borderWidth: 1,
            fill: false,
            tension: 0.1,
            pointRadius: 2,
            pointHoverRadius: 4,
            yAxisID: 'y1' // Use secondary y-axis for RH
          };
          
          datasets.push(rhDataset);
        });
      }
    }

    // Chart configuration
    const chartData = {
      datasets: datasets
    };
    
    // Create dynamic chart title based on period and data
    let chartTitle = `Temperature Time Series (${finalPeriod.charAt(0).toUpperCase() + finalPeriod.slice(1)})`;
    
    // Special handling for hourly view - create dynamic title with source date range
    if (finalPeriod === 'hourly' && sourceDateRange && sourceDateRange.minDate && sourceDateRange.maxDate) {
      // Format dates for display (e.g., "Apr 01" or "Apr 01, 2023" if different years)
      const formatDateForTitle = (date) => {
        const d = new Date(date);
        const month = d.toLocaleDateString('en-US', { month: 'short' });
        const day = d.getDate();
        const year = d.getFullYear();
        
        // Include year if data spans different years or not current year
        const currentYear = new Date().getFullYear();
        const includeYear = year !== currentYear ||
                         (sourceDateRange.minDate.getFullYear() !== sourceDateRange.maxDate.getFullYear());
        
        return includeYear ? `${month} ${day}, ${year}` : `${month} ${day}`;
      };
      
      const startDateStr = formatDateForTitle(sourceDateRange.minDate);
      const endDateStr = formatDateForTitle(sourceDateRange.maxDate);
      
      // Use first dataset label if available, otherwise "Average day hourly"
      const datasetLabel = chartData && chartData.datasets && chartData.datasets[0]
        ? chartData.datasets[0].label
        : 'Average day hourly';
      
      // Compose title: "{label} — Average day hourly ({start} → {end})"
      // This format shows the dataset label and the inclusive date range
      chartTitle = `${datasetLabel} — Average day hourly (${startDateStr} → ${endDateStr})`;
    }
    
    // Update chart options
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: chartTitle,
          font: {
            size: 16
          }
        },
        legend: {
          display: false, // Turn off Chart.js dataset legend display - replaced with StatCards
          position: 'top'
        },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: {
          type: finalPeriod === 'hourly' ? 'linear' : 'time',
          time: finalPeriod === 'hourly' ? undefined : {
            unit: finalPeriod === 'daily' ? 'day' :
                  finalPeriod === 'weekly' ? 'week' : 'month',
            displayFormats: {
              day: 'MMM dd',
              week: 'MMM dd',
              month: 'MMM yyyy'
            },
            // Ensure proper parsing of timestamps
            parser: (value) => {
              if (typeof value === 'string') {
                return new Date(value);
              }
              return value; // Assume it's already a Date or timestamp
            }
          },
          title: {
            display: true,
            text: finalPeriod === 'hourly' ? 'Hour of Day' : 'Time'
          },
          min: finalPeriod === 'hourly' ? 0 : undefined,
          max: finalPeriod === 'hourly' ? 23 : undefined,
          ticks: finalPeriod === 'hourly' ? {
            stepSize: 1,
            callback: hourTickCallback
          } : {
            // Format ticks to show readable dates instead of epoch numbers
            callback: function(value) {
              const date = new Date(value);
              if (finalPeriod === 'daily') {
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              } else if (finalPeriod === 'weekly') {
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              } else if (finalPeriod === 'monthly') {
                return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
              }
              return date.toLocaleDateString();
            }
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Temperature (°C)'
          },
          beginAtZero: false
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Relative Humidity (%)'
          },
          beginAtZero: true,
          max: 100,
          grid: {
            drawOnChartArea: false, // Only show grid lines for the primary y-axis
          }
        }
      }
    };
    
    return {
      aggregatedData,
      chartData,
      chartOptions,
      sourceDateRange
    };
  }

  // Process data for chart (legacy function for backward compatibility)
  function processDataForChart() {
    const result = processDataForChartPure($timeSeries, currentPeriod, selectedPeriod);
    aggregatedData = result.aggregatedData;
    chartData = result.chartData;
    chartOptions = result.chartOptions;
    sourceDateRange = result.sourceDateRange;
  }

  // Create hourly average day data (24 points for hours 0-23)
  function createHourlyAverageData(validData) {
    // Initialize hourly aggregates
    const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      tempValues: [],
      rhValues: []
    }));

    // Aggregate values by hour of day
    validData.forEach(record => {
      const date = new Date(record.timestamp);
      const hour = date.getHours();
      
      hourlyData[hour].tempValues.push(record.temp);
      hourlyData[hour].rhValues.push(record.rh);
    });

    // Calculate averages for each hour
    return hourlyData.map(({ hour, tempValues, rhValues }) => {
      const tempAvg = tempValues.length > 0
        ? tempValues.reduce((sum, val) => sum + val, 0) / tempValues.length
        : null;
      
      const rhAvg = rhValues.length > 0
        ? rhValues.reduce((sum, val) => sum + val, 0) / rhValues.length
        : null;
      
      return {
        hour,
        temp: tempAvg,
        rh: rhAvg
      };
    });
  }

  // Handle period change
  function handlePeriodChange() {
    // Use setTimeout to break potential reactive cycles
    setTimeout(() => {
      try {
        processDataForChart();
      } catch (error) {
        console.error('Error processing chart data on period change:', error);
      }
    }, 0);
  }

  // Toggle chart visibility
  function toggleChart() {
    showChart = !showChart;
  }

  
  // Create a derived value for processed chart data to avoid state updates in effects
  const processedChartState = $derived(() => {
    if (!$timeSeries || $timeSeries.length === 0) {
      return {
        aggregatedData: [],
        chartData: null,
        chartOptions: {},
        sourceDateRange: null
      };
    }
    
    try {
      // Create a pure version of processDataForChart that returns values instead of updating state
      return processDataForChartPure($timeSeries, currentPeriod, selectedPeriod);
    } catch (error) {
      console.error('Error processing chart data:', error);
      return {
        aggregatedData: [],
        chartData: null,
        chartOptions: {},
        sourceDateRange: null
      };
    }
  });
  
  // Update state variables from the derived values
  $effect(() => {
    const state = processedChartState();
    aggregatedData = state.aggregatedData;
    chartData = state.chartData;
    chartOptions = state.chartOptions;
    sourceDateRange = state.sourceDateRange;
  });
</script>

<div class="time-series-chart">
  <!-- Chart Controls -->
  <div class="chart-controls">
    <div class="chart-controls__left">
      <label for="period-select">Aggregation Period:</label>
      <select 
        id="period-select" 
        bind:value={currentPeriod} 
        onchange={handlePeriodChange}
        class="period-select"
      >
        {#each periods as period}
          <option value={period.value}>{period.label}</option>
        {/each}
      </select>
    </div>
    
    <div class="chart-controls__right">
      <button 
        type="button" 
        onclick={toggleChart} 
        class="toggle-button"
      >
        {showChart ? 'Hide Chart' : 'Show Chart'}
      </button>
    </div>
  </div>

  <!-- Chart Container -->
  {#if showChart}
    <div class="chart-container">
      {#if $timeSeries && $timeSeries.length > 0 && chartData}
        <div class="chart-wrapper">
          <Line
            data={chartData}
            options={chartOptions}
          />
        </div>
      {:else}
        <div class="no-data">
          <p>No data available for time series chart</p>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Dataset Statistics (replaces Chart.js dataset legend) -->
  {#if datasetAverages && datasetAverages.length > 0}
    <div class="dataset-stats" role="list">
      <h4>Dataset Averages</h4>
      <div class="dataset-stats__grid">
        {#each datasetAverages as dataset (dataset.label)}
          {#if dataset.value > 0}
            <StatCard
              label={dataset.label}
              value={dataset.value}
              color={dataset.color}
              decimals={1}
            />
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  <!-- Passive Design Zone StatCards (replaced custom zone legend at lines ~862-873) -->
  {#if zoneTotals && zoneTotals.length > 0}
    <div class="zone-stats" role="list">
      <h4>Passive Design Zones (Hours)</h4>
      <div class="zone-stats__grid">
        {#each zoneTotals as zone (zone.id)}
          <StatCard
            role="listitem"
            aria-label={`Zone ${zone.name}: ${Math.round(zone.value)} hours`}
            label={zone.name}
            value={zone.value}
            color={zone.color}
            decimals={0}
          />
        {/each}
      </div>
    </div>
  {/if}
  
  <!-- Original Custom Zone Legend (commented out - replaced with StatCards above) -->
  <!--
  {#if currentPeriod === 'hourly' || currentPeriod === 'daily'}
    <div class="zone-legend">
      <h4>Passive Design Zones (Temperature & Humidity)</h4>
      {#each ZONES as zone}
        <div class="legend-item">
          <div class="legend-color" style="background-color: {zone.color};"></div>
          <span>{zone.id}: {zone.note || 'Complex T/RH boundary'}</span>
        </div>
      {/each}
    </div>
  {/if}
  -->

  <!-- Data Summary -->
  {#if aggregatedData && aggregatedData.length > 0}
    <div class="data-summary">
      <p>
        {#if currentPeriod === 'hourly'}
          Showing average day with 24 hourly data points
        {:else}
          {#if currentPeriod === 'daily'}
            <!-- For daily view, show total days in inclusive range from sourceMinDate to sourceMaxDate -->
            Showing {sourceDateRange && sourceDateRange.minDate && sourceDateRange.maxDate
              ? Math.ceil((sourceDateRange.maxDate.getTime() - sourceDateRange.minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
              : aggregatedData.length} daily data points
          {:else}
            Showing {aggregatedData.length} {currentPeriod} data points
          {/if}
          {#if sourceDateRange && sourceDateRange.minDate && sourceDateRange.maxDate}
            from {formatDateForDisplay(sourceDateRange.minDate.getTime(), currentPeriod)}
            to {formatDateForDisplay(sourceDateRange.maxDate.getTime(), currentPeriod)}
          {:else}
            from {formatDateForDisplay(aggregatedData[0].timestamp, currentPeriod)}
            to {formatDateForDisplay(aggregatedData[aggregatedData.length - 1].timestamp, currentPeriod)}
          {/if}
        {/if}
      </p>
    </div>
  {/if}
</div>

<style>
  .time-series-chart {
    background: white;
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    margin: 1rem 0;
  }

  .chart-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .chart-controls__left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .chart-controls__right {
    display: flex;
    align-items: center;
  }

  .period-select {
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    font-size: 0.9rem;
  }

  .toggle-button {
    padding: 0.5rem 1rem;
    background: var(--primary-color, #007bff);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background-color 0.2s;
  }

  .toggle-button:hover {
    background: var(--primary-hover-color, #0056b3);
  }

  .chart-container {
    position: relative;
    height: 400px;
    width: 100%;
  }

  .chart-wrapper {
    height: 100%;
    width: 100%;
  }

  .no-data {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    background: #f8f9fa;
    border: 2px dashed #dee2e6;
    border-radius: 4px;
    color: #6c757d;
    text-align: center;
  }
  
  .data-summary {
    margin-top: 1rem;
    padding: 0.5rem;
    background: #f8f9fa;
    border-radius: 4px;
    font-size: 0.9rem;
    color: #6c757d;
  }

  .dataset-stats {
    margin-top: 1rem;
    padding: 0.5rem;
    background: #f8f9fa;
    border-radius: 4px;
    font-size: 0.9rem;
  }
  
  .dataset-stats h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9rem;
    color: #495057;
  }
  
  .dataset-stats__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
  }

  .zone-stats {
    margin-top: 1rem;
    padding: 0.5rem;
    background: #f8f9fa;
    border-radius: 4px;
    font-size: 0.9rem;
  }
  
  .zone-stats h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9rem;
    color: #495057;
  }
  
  .zone-stats__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
  }

  @media (max-width: 768px) {
    .chart-controls {
      flex-direction: column;
      align-items: stretch;
    }

    .chart-controls__left,
    .chart-controls__right {
      justify-content: center;
    }

    .chart-container {
      height: 300px;
    }
  }
</style>