import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_GRID_DEGREES,
  clampBounds,
  coarsenPoint,
  distanceMetres,
  gridSizeMetres,
  isValidLatLng,
  MAX_MAP_SPAN_DEGREES,
  toWkt,
} from '@/lib/geo';

describe('coarsenPoint', () => {
  it('snaps to the community grid', () => {
    const coarse = coarsenPoint({ latitude: -33.92487, longitude: 18.42406 });
    expect(coarse.latitude).toBeCloseTo(-33.92, 5);
    expect(coarse.longitude).toBeCloseTo(18.42, 5);
  });

  it('is deterministic, so repeated samples cannot be averaged back', () => {
    // This is the property that makes grid snapping safer than random jitter:
    // 200 nearby readings all collapse to the same cell rather than forming a
    // cloud whose mean is the true position.
    const readings = Array.from({ length: 200 }, (_, index) => ({
      latitude: -33.9249 + (index % 7) * 0.00004,
      longitude: 18.4241 + (index % 5) * 0.00004,
    }));

    const cells = new Set(
      readings.map((reading) => {
        const cell = coarsenPoint(reading);
        return `${cell.latitude.toFixed(6)},${cell.longitude.toFixed(6)}`;
      }),
    );

    expect(cells.size).toBe(1);
  });

  it('moves a point by at most half a cell, so the cell centre is not the person', () => {
    const point = { latitude: -33.9249, longitude: 18.4241 };
    const coarse = coarsenPoint(point);
    expect(Math.abs(coarse.latitude - point.latitude)).toBeLessThanOrEqual(
      COMMUNITY_GRID_DEGREES / 2 + 1e-9,
    );
  });
});

describe('gridSizeMetres', () => {
  it('reports a cell roughly a kilometre across', () => {
    const size = gridSizeMetres(-33.9);
    expect(size).toBeGreaterThan(700);
    expect(size).toBeLessThan(1200);
  });
});

describe('clampBounds', () => {
  it('leaves a small viewport alone', () => {
    const bounds = { minLng: 18.3, minLat: -34.0, maxLng: 18.5, maxLat: -33.8 };
    const clamped = clampBounds(bounds);
    expect(clamped.maxLng - clamped.minLng).toBeCloseTo(0.2, 5);
  });

  it('shrinks a world-sized viewport below the server limit', () => {
    const clamped = clampBounds({ minLng: -180, minLat: -90, maxLng: 180, maxLat: 90 });
    expect(clamped.maxLng - clamped.minLng).toBeLessThan(MAX_MAP_SPAN_DEGREES);
    expect(clamped.maxLat - clamped.minLat).toBeLessThan(MAX_MAP_SPAN_DEGREES);
  });

  it('keeps the result inside valid coordinate ranges', () => {
    const clamped = clampBounds({ minLng: 179, minLat: 89, maxLng: 180, maxLat: 90 });
    expect(clamped.maxLng).toBeLessThanOrEqual(180);
    expect(clamped.maxLat).toBeLessThanOrEqual(90);
  });
});

describe('distanceMetres', () => {
  it('measures a known distance', () => {
    // Cape Town city centre to Sea Point, about 4km.
    const metres = distanceMetres(
      { latitude: -33.9249, longitude: 18.4241 },
      { latitude: -33.9153, longitude: 18.3845 },
    );
    expect(metres).toBeGreaterThan(3000);
    expect(metres).toBeLessThan(5000);
  });

  it('is zero for the same point', () => {
    const point = { latitude: -33.9249, longitude: 18.4241 };
    expect(distanceMetres(point, point)).toBeCloseTo(0, 6);
  });
});

describe('isValidLatLng and toWkt', () => {
  it('rejects NaN and out-of-range values', () => {
    expect(isValidLatLng({ latitude: Number.NaN, longitude: 0 })).toBe(false);
    expect(isValidLatLng({ latitude: 0, longitude: 200 })).toBe(false);
    expect(isValidLatLng({ latitude: -33.9, longitude: 18.4 })).toBe(true);
  });

  it('serialises a valid point with an explicit SRID', () => {
    expect(toWkt({ latitude: -33.9249, longitude: 18.4241 })).toBe(
      'SRID=4326;POINT(18.4241 -33.9249)',
    );
  });

  it('refuses to serialise an invalid point rather than sending garbage to PostGIS', () => {
    expect(() => toWkt({ latitude: 999, longitude: 0 })).toThrow();
  });
});
