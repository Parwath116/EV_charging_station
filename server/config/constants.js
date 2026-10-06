/**
 * VoltGrid Bengaluru Metropolitan Geographic Constants
 * Shared across server validation, database queries, seed generator, and client map boundaries.
 */

export const BENGALURU_BOUNDS = {
  minLng: 77.4,
  maxLng: 77.85,
  minLat: 12.75,
  maxLat: 13.2,
};

export const BENGALURU_CENTER = {
  lat: 12.9716,
  lng: 77.5946,
};

export const BENGALURU_LEAFLET_BOUNDS = [
  [BENGALURU_BOUNDS.minLat, BENGALURU_BOUNDS.minLng],
  [BENGALURU_BOUNDS.maxLat, BENGALURU_BOUNDS.maxLng],
];

export const BENGALURU_AREAS = [
  'Whitefield',
  'Koramangala',
  'Indiranagar',
  'Electronic City',
  'Hebbal',
  'HSR Layout',
  'Jayanagar',
  'Malleshwaram',
];
