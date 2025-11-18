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

export const THEME = {
  primary: ZONE_COLORS['Mass Cooling'],
  success: ZONE_COLORS['Comfort'],
  error: ZONE_COLORS['Air Conditioning + Dehumidifier']
};

export default { ZONE_COLORS, THEME };
