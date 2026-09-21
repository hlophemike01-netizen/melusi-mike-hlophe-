import { handleServiceError } from '@/lib/errors';
import { clampBounds, type MapBounds } from '@/lib/geo';
import type { Db } from '@/services/types';
import type { ActivitySummaryRow, ActivityType, DensityCell } from '@/types/database';

/**
 * Community map data.
 *
 * Both calls go through SECURITY DEFINER RPCs that aggregate server-side. No
 * function in this file can return an individual's position — there is no code
 * path from here to `activity_locations`, by design.
 */
export async function getDensityCells(
  db: Db,
  bounds: MapBounds,
  types?: ActivityType[],
): Promise<DensityCell[]> {
  const safe = clampBounds(bounds);

  const { data, error } = await db.rpc('community_activity_density', {
    min_lng: safe.minLng,
    min_lat: safe.minLat,
    max_lng: safe.maxLng,
    max_lat: safe.maxLat,
    types: types && types.length > 0 ? types : null,
  });

  if (error) throw handleServiceError('getDensityCells', error);
  return (data ?? []) as DensityCell[];
}

/** "14 runners nearby" counts within a radius of a point. */
export async function getNearbySummary(
  db: Db,
  centre: { latitude: number; longitude: number },
  radiusMetres = 5000,
): Promise<ActivitySummaryRow[]> {
  const { data, error } = await db.rpc('community_activity_summary', {
    centre_lng: centre.longitude,
    centre_lat: centre.latitude,
    radius_metres: radiusMetres,
  });

  if (error) throw handleServiceError('getNearbySummary', error);
  return (data ?? []) as ActivitySummaryRow[];
}

/** Count of the caller's own groups with something running right now. */
export async function getActiveGroupCount(db: Db): Promise<number> {
  const { data, error } = await db.rpc('community_active_group_count');
  if (error) throw handleServiceError('getActiveGroupCount', error);
  return typeof data === 'number' ? data : 0;
}
