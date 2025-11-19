<script>
  import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, TimeScale } from 'chart.js';
  import { Line } from 'svelte5-chartjs';
  import { onMount, onDestroy } from 'svelte';
  import { ZONE_COLORS } from '../../../scripts/theme.js';
  import { ZONES } from '../../../scripts/zones.js';
  import {
    aggregateByHour,
    aggregateByDay,
    aggregateByWeek,
    aggregateByMonth,
    getAggregationFunction,
    getRecommendedAggregation
  } from '../utils/timeSeriesAggregator.js';
  import { getSourceDateRange } from '../utils/dataProcessor.js';
  import 'chartjs-adapter-date-fns';

  // Register Chart.js components only once and check if already registered to avoid conflicts
  if (!ChartJS.registered) {
    ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, TimeScale);
    ChartJS.registered = true;
  }

  // Props
  let {
    timeSeriesData = [],
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

  // Process data for chart
  function processDataForChart() {
    if (!timeSeriesData || timeSeriesData.length === 0) {
      aggregatedData = [];
      chartData = null;
      return;
    }

    // Filter out invalid records and normalize field names
    const validData = timeSeriesData.filter(record => {
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
      aggregatedData = [];
      chartData = null;
      sourceDateRange = null;
      return;
    }
    
    // Calculate source date range for accurate summary
    sourceDateRange = getSourceDateRange(validData);

    // Set recommended period if not specified
    if (!selectedPeriod) {
      currentPeriod = getRecommendedAggregation(validData);
    }

    // Special handling for hourly view - create average day
    if (currentPeriod === 'hourly') {
      aggregatedData = createHourlyAverageData(validData);
    } else {
      // Aggregate data based on selected period
      const aggregateFn = getAggregationFunction(currentPeriod);
      try {
        aggregatedData = aggregateFn(validData);
      } catch (error) {
        console.error('Error aggregating time series data:', error);
        aggregatedData = [];
        chartData = null;
        return;
      }
    }

    // Prepare datasets for Chart.js
    const datasets = [];
    
    // For hourly average day, create temperature and RH datasets
    if (currentPeriod === 'hourly') {
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
      
      // Add segment styling if zones is provided
      if (zones || colorSegments) {
        tempDataset.segment = {
          borderColor: ctx => {
            const value = ctx.p1.parsed.y;
            const color1 = getZoneColor(ctx.p0.parsed.y, defaultColor);
            const color2 = getZoneColor(value, defaultColor);
            
            // If colors are the same, return the solid color
            if (color1 === color2) {
              return color1;
            }
            
            // Create gradient between colors
            return createGradient(ctx, color1, color2);
          }
        };
      }
      
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
      // For other periods, group data by zone
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
        
        // Add segment styling if zones is provided
        if (zones || colorSegments) {
          tempDataset.segment = {
            borderColor: ctx => {
              const value = ctx.p1.parsed.y;
              const color1 = getZoneColor(ctx.p0.parsed.y, zoneColor);
              const color2 = getZoneColor(value, zoneColor);
              
              // If colors are the same, return the solid color
              if (color1 === color2) {
                return color1;
              }
              
              // Create gradient between colors
              return createGradient(ctx, color1, color2);
            }
          };
        }
        
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

    // Chart configuration
    chartData = {
      datasets: datasets
    };
    
    // Update chart options
    chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `Temperature Time Series (${currentPeriod.charAt(0).toUpperCase() + currentPeriod.slice(1)})`,
          font: {
            size: 16
          }
        },
        legend: {
          display: currentPeriod !== 'hourly', // Hide default legend for hourly, we'll create custom one
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
          type: currentPeriod === 'hourly' ? 'linear' : 'time',
          time: currentPeriod === 'hourly' ? undefined : {
            unit: currentPeriod === 'daily' ? 'day' :
                  currentPeriod === 'weekly' ? 'week' : 'month',
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
            text: currentPeriod === 'hourly' ? 'Hour of Day' : 'Time'
          },
          min: currentPeriod === 'hourly' ? 0 : undefined,
          max: currentPeriod === 'hourly' ? 23 : undefined,
          ticks: currentPeriod === 'hourly' ? {
            stepSize: 1,
            callback: hourTickCallback
          } : {
            // Format ticks to show readable dates instead of epoch numbers
            callback: function(value) {
              const date = new Date(value);
              if (currentPeriod === 'daily') {
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              } else if (currentPeriod === 'weekly') {
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              } else if (currentPeriod === 'monthly') {
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
      processDataForChart();
    }, 0);
  }

  // Toggle chart visibility
  function toggleChart() {
    showChart = !showChart;
  }

  // Initialize on mount
  onMount(() => {
    processDataForChart();
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
      {#if timeSeriesData && timeSeriesData.length > 0 && chartData}
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

  <!-- Custom Zone Legend for All Charts -->
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

  <!-- Data Summary -->
  {#if aggregatedData && aggregatedData.length > 0}
    <div class="data-summary">
      <p>
        {#if currentPeriod === 'hourly'}
          Showing average day with 24 hourly data points
        {:else}
          Showing {aggregatedData.length} {currentPeriod} data points
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

  .zone-legend {
    margin-top: 1rem;
    padding: 0.5rem;
    background: #f8f9fa;
    border-radius: 4px;
    font-size: 0.9rem;
  }
  
  .zone-legend h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9rem;
    color: #495057;
  }
  
  .legend-item {
    display: flex;
    align-items: center;
    margin-bottom: 0.25rem;
  }
  
  .legend-color {
    width: 16px;
    height: 16px;
    border-radius: 2px;
    margin-right: 0.5rem;
    border: 1px solid #dee2e6;
  }
  
  .data-summary {
    margin-top: 1rem;
    padding: 0.5rem;
    background: #f8f9fa;
    border-radius: 4px;
    font-size: 0.9rem;
    color: #6c757d;
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