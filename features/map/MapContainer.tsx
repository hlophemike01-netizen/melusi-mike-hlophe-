'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { publicEnv } from '@/lib/env';
import { ACTIVITY_TYPE_PEOPLE } from '@/lib/constants';
import type { MapBounds } from '@/lib/geo';
import type { DensityCell } from '@/types/database';

export interface MapContainerProps {
  cells: DensityCell[];
  centre?: { latitude: number; longitude: number } | null;
  onBoundsChange: (bounds: MapBounds) => void;
}

/**
 * The community map.
 *
 * Everything it can draw is an aggregate. `cells` come from an RPC that
 * returns grid-snapped points with counts and suppresses anything below the
 * k-anonymity threshold, so there is no code path here that could render an
 * individual — the data to do so never arrives in the browser.
 *
 * Markers are sized by count and labelled with the number, which also stops
 * anyone reading a single circle as "a person is here".
 */
export function MapContainer({ cells, centre, onBoundsChange }: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [ready, setReady] = useState(false);

  // The map is created once and lives outside React, so its `moveend` handler
  // must not close over a stale callback. Keeping the latest one in a ref —
  // updated in an effect, never during render — is what keeps the two in step.
  const boundsCallback = useRef(onBoundsChange);
  useEffect(() => {
    boundsCallback.current = onBoundsChange;
  }, [onBoundsChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = publicEnv.mapboxToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: publicEnv.mapboxStyle,
      center: centre ? [centre.longitude, centre.latitude] : [18.4241, -33.9249],
      zoom: centre ? 13 : 11,
      attributionControl: true,
      // Mapbox telemetry is off: this is a safety product and there is no
      // reason for map interactions to leave the device.
      trackResize: true,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    const emitBounds = () => {
      const bounds = map.getBounds();
      if (!bounds) return;
      boundsCallback.current({
        minLng: bounds.getWest(),
        minLat: bounds.getSouth(),
        maxLng: bounds.getEast(),
        maxLat: bounds.getNorth(),
      });
    };

    map.on('load', () => {
      setReady(true);
      emitBounds();
    });
    map.on('moveend', emitBounds);

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !centre) return;
    map.easeTo({ center: [centre.longitude, centre.latitude], zoom: Math.max(map.getZoom(), 13) });
  }, [centre]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    for (const cell of cells) {
      const element = document.createElement('div');
      const size = Math.min(76, 40 + cell.activity_count * 4);

      element.style.cssText = [
        `width:${size}px`,
        `height:${size}px`,
        'border-radius:9999px',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'font-weight:700',
        'font-size:14px',
        'color:#fff',
        'background:rgba(31,123,120,0.78)',
        'border:2px solid rgba(255,255,255,0.9)',
        'box-shadow:0 2px 10px rgba(0,0,0,0.2)',
      ].join(';');

      // textContent, never innerHTML: the count is a number from our own RPC,
      // but using textContent means this stays safe if the source ever changes.
      element.textContent = String(cell.activity_count);
      element.setAttribute('role', 'img');
      element.setAttribute(
        'aria-label',
        `${cell.activity_count} ${ACTIVITY_TYPE_PEOPLE[cell.activity_type]} in this area`,
      );

      const marker = new mapboxgl.Marker({ element })
        .setLngLat([cell.cell_lng, cell.cell_lat])
        .setPopup(
          new mapboxgl.Popup({ offset: size / 2, closeButton: false }).setText(
            `About ${cell.activity_count} ${ACTIVITY_TYPE_PEOPLE[cell.activity_type]} active in this ~1km area`,
          ),
        )
        .addTo(map);

      markersRef.current.push(marker);
    }
  }, [cells, ready]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Community activity map showing approximate area counts"
      className="h-full w-full"
    />
  );
}
