/**
 * Time series data aggregation utilities
 * Functions to aggregate temperature and humidity data by different time periods
 */

// Import ZONE_COLORS for use in dataset averages
import { ZONE_COLORS } from '../../../scripts/theme.js';

/**
 * Group data by a specified time period and calculate averages
 * @param {Array} data - Array of time series records
 * @param {Function} getPeriodKey - Function to get period key for a record
 * @returns {Array} Aggregated data with averages
 */
function aggregateByPeriod(data, getPeriodKey) {
  const groups = {};
  
  data.forEach(record => {
    // Validate record has required fields (check both timestamp and ts fields)
    const timestampField = record.timestamp || record.ts;
    if (!record || 
        (!record.timestamp && !record.ts) || 
        typeof record.temp !== 'number' || 
        typeof record.rh !== 'number') {
      console.warn('Skipping invalid record:', record);
      return;
    }
    
    // Validate timestamp (support both timestamp and ts fields)
    const recordDate = new Date(timestampField);
    if (isNaN(recordDate.getTime())) {
      console.warn('Skipping record with invalid timestamp:', timestampField);
      return;
    }
    
    const key = getPeriodKey({ ...record, timestamp: timestampField });
    if (!key) {
      console.warn('Skipping record with invalid period key:', record);
      return;
    }
    
    if (!groups[key]) {
      groups[key] = {
        timestamp: key,
        temps: [],
        rhs: [],
        zones: {},
        durations: []
      };
    }
    
    groups[key].temps.push(record.temp);
    groups[key].rhs.push(record.rh);
    groups[key].durations.push(record.dur_hours || 0);
    
    // Track zone occurrences
    const zone = record.zone || 'Unclassified';
    if (!groups[key].zones[zone]) {
      groups[key].zones[zone] = 0;
    }
    groups[key].zones[zone] += record.dur_hours || 0;
  });
  
  // Convert groups to array and calculate averages
  return Object.values(groups).map(group => {
    const totalDuration = group.durations.reduce((sum, dur) => sum + dur, 0);
    const avgTemp = group.temps.reduce((sum, temp) => sum + temp, 0) / group.temps.length;
    const avgRh = group.rhs.reduce((sum, rh) => sum + rh, 0) / group.rhs.length;
    
    // Find the dominant zone (zone with most duration)
    let dominantZone = 'Unclassified';
    let maxDuration = 0;
    Object.entries(group.zones).forEach(([zone, duration]) => {
      if (duration > maxDuration) {
        maxDuration = duration;
        dominantZone = zone;
      }
    });
    
    return {
      timestamp: group.timestamp,
      temp: Math.round(avgTemp * 10) / 10, // Round to 1 decimal place
      rh: Math.round(avgRh * 10) / 10,
      dur_hours: totalDuration,
      zone: dominantZone,
      raw: group
    };
  }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

/**
 * Aggregate data by hour
 * @param {Array} data - Array of time series records
 * @returns {Array} Hourly aggregated data
 */
export function aggregateByHour(data) {
  return aggregateByPeriod(data, (record) => {
    const date = new Date(record.timestamp || record.ts);
    if (isNaN(date.getTime())) {
      return null;
    }
    date.setMinutes(0, 0, 0);
    return date.toISOString();
  });
}

/**
 * Aggregate data by day with complete date range coverage
 * @param {Array} data - Array of time series records
 * @returns {Array} Daily aggregated data with nulls for missing days
 */
export function aggregateByDay(data) {
  // First get the basic aggregated data for existing days
  const basicAggregated = aggregateByPeriod(data, (record) => {
    const date = new Date(record.timestamp || record.ts);
    if (isNaN(date.getTime())) {
      return null;
    }
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
  });
  
  // Extract timestamps to find min/max date range
  const timestamps = data.map(record => {
    let ts = record.timestamp || record.ts;
    if (typeof ts === 'string') {
      ts = new Date(ts).getTime();
    } else if (typeof ts === 'number') {
      // Convert seconds to milliseconds if needed
      if (ts < 1000000000000) {
        ts = ts * 1000;
      }
    }
    return ts;
  }).filter(ts => ts && !isNaN(ts));
  
  if (timestamps.length === 0) {
    return basicAggregated;
  }
  
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  
  // Create date objects for min/max dates at start of day
  const minDate = new Date(minTs);
  minDate.setHours(0, 0, 0, 0);
  
  const maxDate = new Date(maxTs);
  maxDate.setHours(0, 0, 0, 0);
  
  // Create complete day range from min to max inclusive
  const completeDayRange = [];
  const currentDate = new Date(minDate);
  
  while (currentDate <= maxDate) {
    const dayKey = currentDate.toISOString();
    completeDayRange.push({
      timestamp: dayKey,
      temp: null,
      rh: null,
      dur_hours: 0,
      zone: 'Unclassified',
      raw: null
    });
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // Merge actual aggregated data with complete range
  const aggregatedMap = new Map();
  basicAggregated.forEach(day => {
    aggregatedMap.set(day.timestamp, day);
  });
  
  // Create final array with complete range, filling in actual data where available
  return completeDayRange.map(dayTemplate => {
    const actualData = aggregatedMap.get(dayTemplate.timestamp);
    return actualData || dayTemplate;
  });
}

/**
 * Aggregate data by week
 * @param {Array} data - Array of time series records
 * @returns {Array} Weekly aggregated data
 */
export function aggregateByWeek(data) {
  const aggregated = aggregateByPeriod(data, (record) => {
    const date = new Date(record.timestamp || record.ts);
    if (isNaN(date.getTime())) {
      return null;
    }
    // Set to start of week (Sunday)
    const dayOfWeek = date.getDay();
    date.setDate(date.getDate() - dayOfWeek);
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
  });
  
  // Weekly/Monthly: output schema required by TimeSeriesChart (temp,rh,dur_hours,zone:null,raw)
  return aggregated.map(bucket => ({
    ...bucket,
    zone: null
  }));
}

/**
 * Aggregate data by month
 * @param {Array} data - Array of time series records
 * @returns {Array} Monthly aggregated data
 */
export function aggregateByMonth(data) {
  const aggregated = aggregateByPeriod(data, (record) => {
    const date = new Date(record.timestamp || record.ts);
    if (isNaN(date.getTime())) {
      return null;
    }
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
  });
  
  // Weekly/Monthly: output schema required by TimeSeriesChart (temp,rh,dur_hours,zone:null,raw)
  return aggregated.map(bucket => ({
    ...bucket,
    zone: null
  }));
}

/**
 * Determine appropriate aggregation level based on data span
 * @param {Array} data - Array of time series records
 * @returns {string} Recommended aggregation level
 */
export function getRecommendedAggregation(data) {
  if (!data || data.length === 0) return 'daily';
  
  const timestamps = data.map(record => new Date(record.timestamp || record.ts));
  const minDate = new Date(Math.min(...timestamps));
  const maxDate = new Date(Math.max(...timestamps));
  const daysDiff = (maxDate - minDate) / (1000 * 60 * 60 * 24);
  
  if (daysDiff < 7) return 'hourly';
  if (daysDiff < 30) return 'daily';
  if (daysDiff < 90) return 'weekly';
  return 'monthly';
}

/**
 * Get aggregation function by name
 * @param {string} period - Aggregation period ('hourly', 'daily', 'weekly', 'monthly')
 * @returns {Function} Corresponding aggregation function
 */
export function getAggregationFunction(period) {
  switch (period) {
    case 'hourly':
      return aggregateByHour;
    case 'daily':
      return aggregateByDay;
    case 'weekly':
      return aggregateByWeek;
    case 'monthly':
      return aggregateByMonth;
    default:
      return aggregateByDay;
  }
}

/**
 * Calculate the average of an array of values
 * @param {Array} values - Array of numeric values
 * @param {number} decimals - Number of decimal places to round to (default: 1)
 * @returns {number|null} The average value rounded to specified decimals, or null if invalid input
 */
export function calculateAverage(values, decimals = 1) {
  // Defensive: handle empty or non-array input
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  
  // Filter out non-numeric values
  const numericValues = values.filter(val => typeof val === 'number' && !isNaN(val));
  
  // Return null if no valid numeric values
  if (numericValues.length === 0) {
    return null;
  }
  
  // Calculate average
  const sum = numericValues.reduce((acc, val) => acc + val, 0);
  const average = sum / numericValues.length;
  
  // Round to specified decimal places
  const multiplier = Math.pow(10, decimals);
  return Math.round(average * multiplier) / multiplier;
}

/**
 * Calculate dataset averages with optional classification collapsing
 * @param {Array} data - Array of time series records
 * @param {Object} options - Configuration options
 * @param {Array} options.collapseClassificationsFor - Array of granularities to collapse classifications for
 * @param {string} options.granularity - Current granularity ('hourly', 'daily', 'weekly', 'monthly')
 * @returns {Array} Dataset averages with optional classification collapsing
 */
export function calculateDatasetAverages(data, options = {}) {
  const { collapseClassificationsFor = [], granularity } = options;
  
  // Check if we should collapse classifications for this granularity
  const shouldCollapse = collapseClassificationsFor.includes(granularity);
  
  if (!shouldCollapse) {
    // Return standard per-classification averages
    return calculateStandardDatasetAverages(data);
  }
  
  // Return collapsed averages (only Temperature and Humidity)
  return calculateCollapsedDatasetAverages(data);
}

/**
 * Calculate standard dataset averages (per classification)
 * @param {Array} data - Array of time series records
 * @returns {Array} Standard dataset averages
 */
function calculateStandardDatasetAverages(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }
  
  // Group data by classification (zone)
  const classificationGroups = {};
  
  data.forEach(record => {
    const zone = record.zone || 'Unclassified';
    if (!classificationGroups[zone]) {
      classificationGroups[zone] = {
        temps: [],
        rhs: []
      };
    }
    
    if (typeof record.temp === 'number' && !isNaN(record.temp)) {
      classificationGroups[zone].temps.push(record.temp);
    }
    if (typeof record.rh === 'number' && !isNaN(record.rh)) {
      classificationGroups[zone].rhs.push(record.rh);
    }
  });
  
  // Calculate averages for each classification
  const averages = [];
  
  Object.entries(classificationGroups).forEach(([zone, values]) => {
    const tempAvg = calculateAverage(values.temps, 1);
    const rhAvg = calculateAverage(values.rhs, 1);
    
    if (tempAvg !== null) {
      averages.push({
        label: `${zone} (Temperature)`,
        value: tempAvg,
        color: ZONE_COLORS[zone] || ZONE_COLORS['Unclassified'] || '#999999'
      });
    }
    
    if (rhAvg !== null) {
      averages.push({
        label: `${zone} (Humidity)`,
        value: rhAvg,
        color: ZONE_COLORS[zone] || ZONE_COLORS['Unclassified'] || '#999999'
      });
    }
  });
  
  return averages;
}

/**
 * Calculate collapsed dataset averages (only Temperature and Humidity)
 * @param {Array} data - Array of time series records
 * @returns {Array} Collapsed dataset averages
 */
function calculateCollapsedDatasetAverages(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }
  
  // Collect all temperature and humidity values regardless of classification
  const allTemps = [];
  const allRhs = [];
  
  data.forEach(record => {
    if (typeof record.temp === 'number' && !isNaN(record.temp)) {
      allTemps.push(record.temp);
    }
    if (typeof record.rh === 'number' && !isNaN(record.rh)) {
      allRhs.push(record.rh);
    }
  });
  
  const averages = [];
  
  // Calculate overall temperature average
  const tempAvg = calculateAverage(allTemps, 1);
  if (tempAvg !== null) {
    averages.push({
      label: 'Temperature',
      value: tempAvg,
      color: '#ff6384' // Default temperature color
    });
  }
  
  // Calculate overall humidity average
  const rhAvg = calculateAverage(allRhs, 1);
  if (rhAvg !== null) {
    averages.push({
      label: 'Relative Humidity',
      value: rhAvg,
      color: 'rgba(135, 206, 250, 0.7)' // Default humidity color
    });
  }
  
  return averages;
}
