// Refactor derived from logic.js

/**
 * Safely parse a number, returning NaN if invalid
 * @param {string|number} value - Value to parse
 * @returns {number} Parsed number or NaN
 */
function parseNumberSafe(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Create a date parts factory function based on UTC preference
 * @param {boolean} treatAsUTC - Whether to treat dates as UTC
 * @returns {Function} Function that takes timestamp and returns date parts
 */
function datePartsFactory(treatAsUTC) {
  return function(ts) {
    const d = new Date(ts);
    if (treatAsUTC) {
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1, // 1-based month
        day: d.getUTCDate(),
        hours: d.getUTCHours(),
        minutes: d.getUTCMinutes(),
        seconds: d.getUTCSeconds()
      };
    } else {
      return {
        year: d.getFullYear(),
        month: d.getMonth() + 1, // 1-based month
        day: d.getDate(),
        hours: d.getHours(),
        minutes: d.getMinutes(),
        seconds: d.getSeconds()
      };
    }
  };
}

/**
 * Humanize a time period for display
 * @param {string} unit - Time unit ('month', 'day', 'hour')
 * @returns {string} Human-readable description
 */
function humanizePeriod(unit) {
  switch (unit) {
    case 'month': return 'per-month';
    case 'day': return 'per-day';
    case 'hour': return 'per-hour';
    default: return unit;
  }
}

export { parseNumberSafe, datePartsFactory, humanizePeriod };