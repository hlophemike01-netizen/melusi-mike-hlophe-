/**
 * Geographic helpers.
 *
 * Two rules hold everywhere in this file:
 *   1. Anything shown to someone other than the owner is coarsened first.
 *   2. Coarsening is deterministic (grid snapping), not random jitter.
 *      Random noise averages out over repeated samples and can be removed;
 *      a grid cannot.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Must match `public.coarsen_point`'s default grid in migration 0007. */
export const COMMUNITY_GRID_DEGREES = 0.01;

/** Below this many activities a map cell is suppressed. Matches SQL. */
export const K_ANONYMITY_THRESHOLD = 3;

/** Largest bounding box the density RPC will answer, in degrees. Matches SQL. */
export const MAX_MAP_SPAN_DEGREES = 1.5;

/**
 * Snaps a point to the community grid. Mirrors the SQL function so the client
 * can preview what will be shared before anything is sent.
 */
export function coarsenPoint(point: LatLng, grid = COMMUNITY_GRID_DEGREES): LatLng {
  return {
    latitude: Math.round(point.latitude / grid) * grid,
    longitude: Math.round(point.longitude / grid) * grid,
  };
}

/**
 * The NARROWEST edge of a grid cell at this latitude, in metres.
 *
 * Cells are square in degrees, not in metres: the north-south extent is a
 * constant ~1113m, while the east-west extent shrinks by cos(latitude). The
 * narrow edge is the conservative figure, because a narrower cell localises
 * someone more precisely — it is the number to reason about when judging how
 * much protection the grid actually provides, not the flattering equatorial one.
 *
 * The UI deliberately says "about a kilometre" rather than calling this: the
 * true figure depends on the viewer's latitude, and Mwhite SafeCircle will not
 * ask for someone's location just to render a sentence about privacy.
 */
export function gridSizeMetres(latitude: number, grid = COMMUNITY_GRID_DEGREES): number {
  const metresPerDegreeLat = 111_320;
  const metresPerDegreeLng = metresPerDegreeLat * Math.cos((latitude * Math.PI) / 180);
  return Math.round(Math.min(metresPerDegreeLat, Math.abs(metresPerDegreeLng)) * grid);
}

/** Great-circle distance in metres. */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface MapBounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/**
 * Clamps a viewport to what the density RPC will accept, so the user gets a
 * smaller result rather than an error when they zoom out.
 */
export function clampBounds(bounds: MapBounds): MapBounds {
  const centreLng = (bounds.minLng + bounds.maxLng) / 2;
  const centreLat = (bounds.minLat + bounds.maxLat) / 2;
  const halfSpan = MAX_MAP_SPAN_DEGREES / 2 - 0.001;

  const lngSpan = Math.min(bounds.maxLng - bounds.minLng, MAX_MAP_SPAN_DEGREES - 0.002) / 2;
  const latSpan = Math.min(bounds.maxLat - bounds.minLat, MAX_MAP_SPAN_DEGREES - 0.002) / 2;

  return {
    minLng: Math.max(-180, centreLng - Math.min(lngSpan, halfSpan)),
    maxLng: Math.min(180, centreLng + Math.min(lngSpan, halfSpan)),
    minLat: Math.max(-90, centreLat - Math.min(latSpan, halfSpan)),
    maxLat: Math.min(90, centreLat + Math.min(latSpan, halfSpan)),
  };
}

export function isValidLatLng(point: Partial<LatLng>): point is LatLng {
  return (
    typeof point.latitude === 'number' &&
    typeof point.longitude === 'number' &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

/** PostGIS WKT for a point, used when inserting through PostgREST. */
export function toWkt(point: LatLng): string {
  if (!isValidLatLng(point)) {
    throw new Error('Refusing to serialise an invalid coordinate.');
  }
  return `SRID=4326;POINT(${point.longitude} ${point.latitude})`;
}
