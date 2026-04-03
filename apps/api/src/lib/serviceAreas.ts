import { supabaseAdmin } from "./supabaseAdmin";

type Position = [number, number];

type PolygonGeometry = {
  type: "Polygon";
  coordinates: Position[][];
};

type MultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: Position[][][];
};

type ServiceAreaRow = {
  id: string;
  name: string;
  geojson: PolygonGeometry | MultiPolygonGeometry;
};

export type ServiceAreaResponse = {
  id: string;
  name: string;
  geojson: PolygonGeometry | MultiPolygonGeometry;
};

export class OutsideServiceAreaError extends Error {
  areaNames: string[];

  constructor(areaNames: string[]) {
    super("Report location is outside the active service area.");
    this.name = "OutsideServiceAreaError";
    this.areaNames = areaNames;
  }
}

function isValidLongitude(value: number) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function isValidLatitude(value: number) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    isValidLongitude(value[0]) &&
    isValidLatitude(value[1])
  );
}

function isPolygonGeometry(value: unknown): value is PolygonGeometry {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as { type?: string }).type === "Polygon" &&
    Array.isArray((value as { coordinates?: unknown }).coordinates)
  );
}

function isMultiPolygonGeometry(value: unknown): value is MultiPolygonGeometry {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as { type?: string }).type === "MultiPolygon" &&
    Array.isArray((value as { coordinates?: unknown }).coordinates)
  );
}

function isPointOnSegment(
  pointLat: number,
  pointLng: number,
  start: Position,
  end: Position
) {
  const [startLng, startLat] = start;
  const [endLng, endLat] = end;
  const squaredLength =
    (endLng - startLng) * (endLng - startLng) +
    (endLat - startLat) * (endLat - startLat);

  if (squaredLength <= 1e-12) {
    return (
      Math.abs(pointLng - startLng) <= 1e-10 &&
      Math.abs(pointLat - startLat) <= 1e-10
    );
  }

  const cross =
    (pointLat - startLat) * (endLng - startLng) -
    (pointLng - startLng) * (endLat - startLat);

  if (Math.abs(cross) > 1e-10) {
    return false;
  }

  const dot =
    (pointLng - startLng) * (endLng - startLng) +
    (pointLat - startLat) * (endLat - startLat);

  if (dot < 0) {
    return false;
  }

  return dot <= squaredLength;
}

function normalizeRing(ring: Position[]) {
  if (ring.length < 2) {
    return ring;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (
    first[0] === last[0] &&
    first[1] === last[1]
  ) {
    return ring.slice(0, ring.length - 1);
  }

  return ring;
}

function isPointInRing(latitude: number, longitude: number, ring: Position[]) {
  const normalizedRing = normalizeRing(ring);
  if (normalizedRing.length < 3) {
    return false;
  }

  let inside = false;

  for (
    let index = 0, previous = normalizedRing.length - 1;
    index < normalizedRing.length;
    previous = index, index += 1
  ) {
    const current = normalizedRing[index];
    const previousPoint = normalizedRing[previous];

    if (!isValidPosition(current) || !isValidPosition(previousPoint)) {
      continue;
    }

    if (isPointOnSegment(latitude, longitude, previousPoint, current)) {
      return true;
    }

    const [currentLng, currentLat] = current;
    const [previousLng, previousLat] = previousPoint;

    const intersects =
      (currentLat > latitude) !== (previousLat > latitude) &&
      longitude <
        ((previousLng - currentLng) * (latitude - currentLat)) /
          ((previousLat - currentLat) || Number.EPSILON) +
          currentLng;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointInPolygon(latitude: number, longitude: number, rings: Position[][]) {
  if (!Array.isArray(rings) || rings.length === 0) {
    return false;
  }

  const [outerRing, ...holes] = rings;
  if (!Array.isArray(outerRing) || !isPointInRing(latitude, longitude, outerRing)) {
    return false;
  }

  return !holes.some((ring) => Array.isArray(ring) && isPointInRing(latitude, longitude, ring));
}

function doesAreaContainPoint(
  geojson: PolygonGeometry | MultiPolygonGeometry,
  latitude: number,
  longitude: number
) {
  if (isPolygonGeometry(geojson)) {
    return isPointInPolygon(latitude, longitude, geojson.coordinates);
  }

  if (isMultiPolygonGeometry(geojson)) {
    return geojson.coordinates.some((polygon) =>
      isPointInPolygon(latitude, longitude, polygon)
    );
  }

  return false;
}

export async function loadActiveServiceAreas() {
  const { data, error } = await supabaseAdmin
    .from("service_areas")
    .select("id, name, geojson")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ServiceAreaRow[];
}

export async function listActiveServiceAreas(): Promise<ServiceAreaResponse[]> {
  const areas = await loadActiveServiceAreas();
  return areas.map((area) => ({
    id: area.id,
    name: area.name,
    geojson: area.geojson
  }));
}

export async function assertPointWithinActiveServiceArea(
  latitude: number,
  longitude: number
) {
  const areas = await loadActiveServiceAreas();

  if (areas.length === 0) {
    return {
      hasRestriction: false,
      matchedAreaName: null as string | null
    };
  }

  const match = areas.find((area) =>
    doesAreaContainPoint(area.geojson, latitude, longitude)
  );

  if (!match) {
    throw new OutsideServiceAreaError(areas.map((item) => item.name));
  }

  return {
    hasRestriction: true,
    matchedAreaName: match.name
  };
}
