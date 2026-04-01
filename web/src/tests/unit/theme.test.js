import { describe, it, expect } from 'vitest';
import { ZONE_COLORS, THEME } from '../../scripts/theme.js';

describe('Theme', () => {
  it('exports ZONE_COLORS with all core zones', () => {
    const required = [
      'Comfort',
      'Ventilation',
      'Mass Cooling',
      'Evaporative Cooling',
      'Air Conditioning + Dehumidifier',
      'Air Conditioning',
      'Heating',
      'Cold',
    ];
    for (const zone of required) {
      expect(ZONE_COLORS[zone], `Missing color for zone: ${zone}`).toBeTruthy();
    }
  });

  it('all ZONE_COLORS are valid CSS hex colors', () => {
    for (const [zone, color] of Object.entries(ZONE_COLORS)) {
      expect(color, `Invalid color for ${zone}`).toMatch(/^#[0-9a-fA-F]{3,6}$/);
    }
  });

  it('exports THEME with primary, success, error keys', () => {
    expect(THEME.primary).toBeTruthy();
    expect(THEME.success).toBeTruthy();
    expect(THEME.error).toBeTruthy();
  });

  it('THEME values reference ZONE_COLORS entries', () => {
    const colorValues = Object.values(ZONE_COLORS);
    expect(colorValues).toContain(THEME.primary);
    expect(colorValues).toContain(THEME.success);
    expect(colorValues).toContain(THEME.error);
  });
});
