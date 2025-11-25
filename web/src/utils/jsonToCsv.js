// Lightweight JSON -> CSV conversion utility used by dynamic import sites
// Keeps this small so dynamic imports can split into a separate chunk.
export function jsonToCsv(payload) {
  if (!payload) return '';

  // Open-Meteo common payload: { hourly: { time: [...], var1: [...], var2: [...] } }
  if (payload.hourly && Array.isArray(payload.hourly.time)) {
    const keys = ['time', ...Object.keys(payload.hourly).filter(k => k !== 'time')];
    const rows = payload.hourly.time.map((t, i) => {
      return [t, ...keys.slice(1).map(k => {
        const v = payload.hourly[k] && payload.hourly[k][i];
        return v === null || v === undefined ? '' : String(v);
      })].join(',');
    });
    return [keys.join(','), ...rows].join('\n');
  }

  // Array of objects: [{ a: 1, b: 2 }, ...]
  if (Array.isArray(payload) && payload.length > 0 && typeof payload[0] === 'object') {
    const keys = Array.from(payload.reduce((acc, curr) => {
      Object.keys(curr).forEach(k => acc.add(k));
      return acc;
    }, new Set()));
    const rows = payload.map(obj => keys.map(k => obj[k] == null ? '' : String(obj[k])).join(','));
    return [keys.join(','), ...rows].join('\n');
  }

  // Generic object with arrays (columns)
  if (typeof payload === 'object') {
    const keys = Object.keys(payload).filter(k => Array.isArray(payload[k]));
    if (keys.length > 0) {
      const len = payload[keys[0]].length;
      const rows = [];
      for (let i = 0; i < len; i++) {
        rows.push(keys.map(k => payload[k][i] == null ? '' : String(payload[k][i])).join(','));
      }
      return [keys.join(','), ...rows].join('\n');
    }
  }

  // Fallback: pretty-printed JSON
  return JSON.stringify(payload, null, 2);
}
