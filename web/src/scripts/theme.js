// Central theme file for zone colors (ES module)
export const ZONE_COLORS = {
  'Cold': '#88c0d0',
  'Comfort': '#a3be8c',
  'Ventilation': '#ebcb8b',
  'Mass Cooling': '#5e81ac',
  'Evaporative Cooling': '#88c0d0',
  'Mass Cooling & Night Ventilation (or Air Conditioning)': '#5e81ac',
  'Air Conditioning + Dehumidifier': '#bf616a',
  'Air Conditioning': '#d08770',
  'Unclassified': '#999999'
};
// Additional colors for zones identified on the psychrometric chart
// (Added to support newly introduced zones in scripts/zones.js)
ZONE_COLORS['Natural Ventilation'] = '#9fc66b';
ZONE_COLORS['Humidification'] = '#4db6ac';
ZONE_COLORS['Heating'] = '#f2a65a';
ZONE_COLORS['Passive Solar Heating'] = '#ffd087';
ZONE_COLORS['Internal Gains'] = '#b48ead';
ZONE_COLORS['Winter Gains'] = '#c3b0d8';
// Color for the Active Solar Heating zone (approx. orange tone)
ZONE_COLORS['Active Solar Heating'] = '#f7a35c';

export const THEME = {
  primary: ZONE_COLORS['Mass Cooling'],
  success: ZONE_COLORS['Comfort'],
  error: ZONE_COLORS['Air Conditioning + Dehumidifier']
};

export default { ZONE_COLORS, THEME };
