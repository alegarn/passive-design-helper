// Refactor derived from logic.js
function parseNumberSafe(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function datePartsFactory(treatAsUTC) {
  return function(ts) {
    const d = new Date(ts);
    if (treatAsUTC) {
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hours: d.getUTCHours(),
        minutes: d.getUTCMinutes(),
        seconds: d.getUTCSeconds()
      };
    } else {
      return {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
        hours: d.getHours(),
        minutes: d.getMinutes(),
        seconds: d.getSeconds()
      };
    }
  };
}

function humanizePeriod(unit) {
  switch (unit) {
    case 'month': return 'per-month';
    case 'day': return 'per-day';
    case 'hour': return 'per-hour';
    default: return unit;
  }
}

export { parseNumberSafe, datePartsFactory, humanizePeriod };
