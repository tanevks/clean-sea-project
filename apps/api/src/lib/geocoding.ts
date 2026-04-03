import { env } from "./env";

type NominatimSearchResult = {
  lat: string;
  lon: string;
};

export type Coordinates = {
  latitude: number;
  longitude: number;
};

function getGeocodingBaseUrl() {
  return env.NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org";
}

function getUserAgent() {
  return env.GEOCODING_USER_AGENT ?? "clean-sea-project/0.1";
}

export async function geocodeAddress(query: string): Promise<Coordinates | null> {
  const normalized = query.trim();
  if (!normalized) {
    return null;
  }

  const url = new URL("/search", getGeocodingBaseUrl());
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", normalized);

  const response = await fetch(url, {
    headers: {
      "User-Agent": getUserAgent(),
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed with HTTP ${response.status}.`);
  }

  const items = (await response.json()) as NominatimSearchResult[];
  const first = items[0];
  if (!first) {
    return null;
  }

  const latitude = Number.parseFloat(first.lat);
  const longitude = Number.parseFloat(first.lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}
