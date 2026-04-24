import { describe, it, expect, vi } from 'vitest';
import { zonePrefix, zonePointNames, drawPointLabels } from '../../scripts/psychro/dev-annotations.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockCtx() {
  const ctx = {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn(),
  };
  return ctx;
}

const mockPsychroToCanvas = vi.fn(() => ({ x: 100, y: 100 }));

// ---------------------------------------------------------------------------
// zonePrefix
// ---------------------------------------------------------------------------

describe('zonePrefix', () => {
  it('returns "C" for Comfort', () => {
    expect(zonePrefix('Comfort')).toBe('C');
  });

  it('returns "V" for Ventilation', () => {
    expect(zonePrefix('Ventilation')).toBe('V');
  });

  it('returns "ACD" for Air Conditioning + Dehumidifier', () => {
    expect(zonePrefix('Air Conditioning + Dehumidifier')).toBe('ACD');
  });

  it('returns "AC" for Air Conditioning', () => {
    expect(zonePrefix('Air Conditioning')).toBe('AC');
  });

  it('returns first 3 uppercase chars for unknown zone id', () => {
    // 'My Special Zone' → uppercase letters: M, S, Z → 'MSZ'
    expect(zonePrefix('My Special Zone')).toBe('MSZ');
  });

  it('returns empty string for unknown zone id with no uppercase chars', () => {
    expect(zonePrefix('unknown')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// zonePointNames
// ---------------------------------------------------------------------------

describe('zonePointNames', () => {
  it('returns 3 items with names C1, C2, C3 and preserved T/RH for Comfort poly', () => {
    const poly = [[22.8, 20], [22.8, 80], [29.8, 50]];
    const result = zonePointNames('Comfort', poly);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: 'C1', T: 22.8, RH: 20 });
    expect(result[1]).toEqual({ name: 'C2', T: 22.8, RH: 80 });
    expect(result[2]).toEqual({ name: 'C3', T: 29.8, RH: 50 });
  });

  it('uses "V" prefix for Ventilation zone', () => {
    const poly = [[22.8, 80], [22.8, 100], [29.8, 100]];
    const result = zonePointNames('Ventilation', poly);
    expect(result.every(p => p.name.startsWith('V'))).toBe(true);
    expect(result[0].name).toBe('V1');
    expect(result[2].name).toBe('V3');
  });

  it('returns empty array for empty poly', () => {
    expect(zonePointNames('Comfort', [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// drawPointLabels
// ---------------------------------------------------------------------------

describe('drawPointLabels', () => {
  it('returns early without throwing when ctx is null', () => {
    expect(() => drawPointLabels(null, [{ id: 'Comfort', color: '#aaa', poly: [[22.8, 50]] }], mockPsychroToCanvas)).not.toThrow();
  });

  it('returns early without throwing when zones is null', () => {
    expect(() => drawPointLabels(makeMockCtx(), null, mockPsychroToCanvas)).not.toThrow();
  });

  it('calls ctx.save() and ctx.restore() exactly once for valid args', () => {
    const ctx = makeMockCtx();
    const zones = [{ id: 'Comfort', color: '#00f', poly: [[22.8, 50]] }];
    drawPointLabels(ctx, zones, mockPsychroToCanvas);
    expect(ctx.save).toHaveBeenCalledOnce();
    expect(ctx.restore).toHaveBeenCalledOnce();
  });

  it('calls psychroToCanvas once per valid vertex', () => {
    const canvas = vi.fn(() => ({ x: 50, y: 50 }));
    const ctx = makeMockCtx();
    const zones = [{
      id: 'Comfort',
      color: '#0f0',
      poly: [[22.8, 20], [22.8, 80], [29.8, 50]],
    }];
    drawPointLabels(ctx, zones, canvas);
    expect(canvas).toHaveBeenCalledTimes(3);
  });

  it('skips non-finite vertices without throwing', () => {
    const canvas = vi.fn(() => ({ x: 50, y: 50 }));
    const ctx = makeMockCtx();
    const zones = [{
      id: 'Comfort',
      color: '#0f0',
      poly: [[NaN, 50], [Infinity, 20], [22.8, 80]],
    }];
    expect(() => drawPointLabels(ctx, zones, canvas)).not.toThrow();
    // Only the finite vertex should reach psychroToCanvas
    expect(canvas).toHaveBeenCalledTimes(1);
  });

  it('skips a zone with no poly without throwing', () => {
    const canvas = vi.fn(() => ({ x: 50, y: 50 }));
    const ctx = makeMockCtx();
    const zones = [
      { id: 'Comfort', color: '#f00' },                          // no poly property
      { id: 'Ventilation', color: '#0f0', poly: [] },            // empty poly
      { id: 'Heating', color: '#00f', poly: [[10, 50]] },        // valid
    ];
    expect(() => drawPointLabels(ctx, zones, canvas)).not.toThrow();
    expect(canvas).toHaveBeenCalledTimes(1);
  });

  it('resets globalAlpha to 1.0 before ctx.restore()', () => {
    let globalAlphaAtRestore;
    const ctx = makeMockCtx();
    ctx.restore = vi.fn(() => { globalAlphaAtRestore = ctx.globalAlpha; });

    const zones = [{ id: 'Comfort', color: '#f00', poly: [[22.8, 50]] }];
    drawPointLabels(ctx, zones, mockPsychroToCanvas);

    expect(globalAlphaAtRestore).toBe(1.0);
  });
});
