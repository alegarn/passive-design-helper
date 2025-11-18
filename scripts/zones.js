// Refactor derived from logic.js

/**
 * Infinite temperature constant for extending zone polygons
 */
const INF_T = 1e6;

/**
 * Helper function to create temperature/RH points, handling '+' suffix for infinite temperature
 * @param {number|string} t - Temperature value (number or string with '+' suffix)
 * @param {number} rh - Relative humidity value
 * @returns {number[]} [temperature, humidity] pair
 */
function p(t, rh) {
  if (typeof t === 'string' && t.trim().endsWith('+')) {
    return [INF_T, Number(rh)];
  }
  return [Number(t), Number(rh)];
}

/**
 * Zone definitions for passive design tactics
 * Each zone has id, color, polygon points, and optional note
 */
const ZONES = [
  { 
    id: 'Cold', 
    color: '#88c0d0', 
    poly: null, 
    note: 'T < 23°C' 
  },
  { 
    id: 'Comfort', 
    color: '#a3be8c', 
    poly: [ 
      p(23,20), 
      p(23,80), 
      p(25,80), 
      p(28,67), 
      p(29.5,50), 
      p(29.5,20) 
    ]
  },
  { 
    id: 'Ventilation', 
    color: '#ebcb8b', 
    poly: [ 
      p(23,80), 
      p(23,100), 
      p(29.5,100), 
      p(34.5,50), 
      p(34.5,20), 
      p(29.5,20), 
      p(29.5,50), 
      p(28,67), 
      p(25,80) 
    ]
  },
  { 
    id: 'Mass Cooling', 
    color: '#5e81ac', 
    poly: [ 
      p(23,20), 
      p(29.5,20), 
      p(29.5,50), 
      p(28,67), 
      p(36,33), 
      p(39.5,30), 
      p(39.5,7) 
    ]
  },
  { 
    id: 'Evaporative Cooling', 
    color: '#88c0d0', 
    poly: [ 
      p(23,20), 
      p(29.5,20), 
      p(29.5,50), 
      p(28,67), 
      p(39,30), 
      p(42.7,20), 
      p(43.7,10), 
      p(43.7,0), 
      p(31.3,0) 
    ]
  },
  {
    id: 'Mass Cooling & Night Ventilation (or Air Conditioning)',
    color: '#5e81ac',
    poly: [
      p(39.6, 7),
      p(39.6,30),
      p(35.9,42),
      p(43.0,27),
      p(47.8,20),
      p(47.8, 5)
    ]
  },
  {
    id: 'Air Conditioning + Dehumidifier',
    color: '#bf616a', 
    poly: [
      p(34.7, 45),
      p(34.7, 50),
      p(29.8,100),
      p(34.3,100),
      p(50.0,100),
      p(50.0,16)
    ]
  },
  { 
    id: 'Air Conditioning', 
    color: '#d08770', 
    poly: [
      p(43.7,  0),
      p(43.7,  6),
      p(47.3,  6),
      p(47.3, 20),
      p(44.0, 27),
      p(50.0, 17),
      p(50.0,  0)
    ]
  }
];

module.exports = {
  ZONES,
  INF_T
};