<script>
  import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, TimeScale } from 'chart.js';
  import { Line } from 'svelte5-chartjs';
  import { onMount, onDestroy } from 'svelte';
  import { ZONE_COLORS } from '../../../scripts/theme.js';
  import {
    aggregateByHour,
    aggregateByDay,
    aggregateByWeek,
    aggregateByMonth,
    getAggregationFunction,
    getRecommendedAggregation
  } from '../utils/timeSeriesAggregator.js';
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
    colorSegments = null // Multi-color line configuration
  } = $props();
  
  /*
   * Multi-color line support:
   *
   * The colorSegments prop allows rendering a single line with multiple colors
   * based on data values. It accepts two formats:
   *
   * 1. Array of threshold objects:
   *    colorSegments = [
   *      { threshold: 30, color: '#ff0000' },  // Values >= 30: red
   *      { threshold: 20, color: '#ffaa00' },  // Values >= 20: orange
   *      { threshold: 10, color: '#00aa00' }   // Values >= 10: green
   *    ]
   *
   * 2. Function that returns color based on value:
   *    colorSegments = (value) => {
   *      if (value > 25) return '#ff0000';
   *      if (value > 15) return '#ffaa00';
   *      return '#00aa00';
   *    }
   *
   * When colorSegments is provided, each segment of the line between data points
   * will be colored according to the end point's value using Chart.js segment styling.
   * The default zone color is used as fallback when no segment color matches.
   */

  // Component state
  let showChart = $state(true);
  let currentPeriod = $state(selectedPeriod);
  let aggregatedData = $state([]);
  let chartData = $state(null);

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

  // Helper function to get color for a value based on colorSegments configuration
  function getColorForValue(value, defaultColor) {
    if (!colorSegments) {
      return defaultColor;
    }
    
    if (typeof colorSegments === 'function') {
      return colorSegments(value);
    }
    
    if (Array.isArray(colorSegments)) {
      // Find the first threshold that the value exceeds
      for (const segment of colorSegments) {
        if (value >= segment.threshold) {
          return segment.color;
        }
      }
      // If no threshold matched, return default color
      return defaultColor;
    }
    
    return defaultColor;
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
      return;
    }

    // Set recommended period if not specified
    if (!selectedPeriod) {
      currentPeriod = getRecommendedAggregation(validData);
    }

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

    // Prepare datasets for Chart.js
    const datasets = [];
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
      
      const dataset = {
        label: zone,
        data: points.map(point => ({
          x: point.timestamp,
          y: point.temp
        })),
        borderColor: zoneColor,
        backgroundColor: zoneColor,
        borderWidth: 2,
        fill: false,
        tension: 0.1,
        pointRadius: 3,
        pointHoverRadius: 5
      };
      
      // Add segment styling if colorSegments is provided
      if (colorSegments) {
        dataset.segment = {
          borderColor: ctx => {
            const value = ctx.p1.parsed.y;
            return getColorForValue(value, zoneColor);
          }
        };
      }
      
      datasets.push(dataset);
    });

    // Chart configuration
    chartData = {
      datasets: datasets
    };
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
            options={{
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
                  display: true,
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
                  type: 'time',
                  time: {
                    unit: currentPeriod === 'hourly' ? 'hour' :
                          currentPeriod === 'daily' ? 'day' :
                          currentPeriod === 'weekly' ? 'week' : 'month',
                    displayFormats: {
                      hour: 'MMM dd, HH:mm',
                      day: 'MMM dd',
                      week: 'MMM dd',
                      month: 'MMM yyyy'
                    }
                  },
                  title: {
                    display: true,
                    text: 'Time'
                  }
                },
                y: {
                  title: {
                    display: true,
                    text: 'Temperature (°C)'
                  },
                  beginAtZero: false
                }
              }
            }}
          />
        </div>
      {:else}
        <div class="no-data">
          <p>No data available for time series chart</p>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Data Summary -->
  {#if aggregatedData && aggregatedData.length > 0}
    <div class="data-summary">
      <p>
        Showing {aggregatedData.length} {currentPeriod} data points 
        from {formatDateForDisplay(aggregatedData[0].timestamp, currentPeriod)} 
        to {formatDateForDisplay(aggregatedData[aggregatedData.length - 1].timestamp, currentPeriod)}
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