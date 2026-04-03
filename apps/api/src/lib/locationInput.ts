import { geocodeAddress, type Coordinates } from "./geocoding";

function areValidCoordinates(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function extractCoordinatesFromText(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  const coordinateToken = "[+-]?\\d+(?:\\.\\d+)?";
  const patterns = [
    new RegExp(`@(${coordinateToken}),\\s*(${coordinateToken})`),
    new RegExp(`q=(${coordinateToken}),\\s*(${coordinateToken})`),
    new RegExp(`ll=(${coordinateToken}),\\s*(${coordinateToken})`),
    new RegExp(`!3d(${coordinateToken})!4d(${coordinateToken})`),
    new RegExp(`(${coordinateToken})\\s*,\\s*(${coordinateToken})`),
    new RegExp(`(${coordinateToken})\\s+(${coordinateToken})`)
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) {
      continue;
    }

    const latitude = Number.parseFloat(match[1]);
    const longitude = Number.parseFloat(match[2]);

    if (areValidCoordinates(latitude, longitude)) {
      return { latitude, longitude };
    }
  }

  return null;
}

function decodeRepeatedly(value: string) {
  let current = value;

  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) {
        break;
      }

      current = decoded;
    } catch {
      break;
    }
  }

  return current;
}

function decodeGoogleHtmlValue(value: string) {
  return decodeRepeatedly(value.replace(/&amp;/g, "&").trim());
}

function extractGoogleMapsUrlFromHtml(html: string) {
  const candidates = [
    ...html.matchAll(/continue=([^"'\\s>]+)/gi),
    ...html.matchAll(/https:\/\/www\.google\.com\/maps\/(?:search|place)\/[^"'\\s<]+/gi)
  ];

  for (const candidate of candidates) {
    const rawValue = candidate[1] ?? candidate[0];
    const decoded = decodeGoogleHtmlValue(rawValue);
    if (/https:\/\/www\.google\.com\/maps\//i.test(decoded)) {
      return decoded;
    }
  }

  return "";
}

function extractCoordinatesFromGoogleContent(text: string) {
  const matches = [
    ...text.matchAll(/maps\/search\/([+-]?\d+(?:\.\d+)?),\+?([+-]?\d+(?:\.\d+)?)/gi),
    ...text.matchAll(/maps\/place\/([+-]?\d+(?:\.\d+)?),\+?([+-]?\d+(?:\.\d+)?)/gi)
  ];

  for (const match of matches) {
    const latitude = Number.parseFloat(match[1]);
    const longitude = Number.parseFloat(match[2]);
    if (areValidCoordinates(latitude, longitude)) {
      return { latitude, longitude };
    }
  }

  return null;
}

function normalizeAddressCandidate(value: string) {
  return decodeRepeatedly(value).replace(/\+/g, " ").trim();
}

function extractAddressCandidateFromUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const directCandidate =
      url.searchParams.get("q") ??
      url.searchParams.get("query") ??
      url.searchParams.get("daddr");

    if (directCandidate) {
      return normalizeAddressCandidate(directCandidate);
    }

    const placePathMatch = url.pathname.match(/\/maps\/place\/([^/]+)/i);
    if (placePathMatch?.[1]) {
      return normalizeAddressCandidate(placePathMatch[1]);
    }

    const searchPathMatch = url.pathname.match(/\/maps\/search\/([^/]+)/i);
    if (searchPathMatch?.[1]) {
      return normalizeAddressCandidate(searchPathMatch[1]);
    }
  } catch {
    // Not a URL.
  }

  return "";
}

function looksLikeAddressText(text: string) {
  return /[A-Za-z\u0400-\u04FF]/.test(text);
}

async function expandMapsShortUrl(text: string) {
  if (!/https?:\/\/maps\.app\.goo\.gl\//i.test(text.trim())) {
    return text;
  }

  try {
    const response = await fetch(text, {
      method: "GET",
      redirect: "follow"
    });

    if (response.url && !/https?:\/\/maps\.app\.goo\.gl\//i.test(response.url)) {
      return response.url;
    }

    const responseText = await response.text();
    const extractedFromHtml = extractGoogleMapsUrlFromHtml(responseText);
    if (extractedFromHtml) {
      return extractedFromHtml;
    }
  } catch {
    // Fall back to original text.
  }

  return text;
}

export async function resolveCoordinatesFromInput(text: string): Promise<Coordinates | null> {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  const directCoordinates = extractCoordinatesFromText(normalized);
  if (directCoordinates) {
    return directCoordinates;
  }

  const expanded = await expandMapsShortUrl(normalized);
  const normalizedExpanded = decodeRepeatedly(expanded);

  const parsedCoordinates = extractCoordinatesFromText(normalizedExpanded);
  if (parsedCoordinates) {
    return parsedCoordinates;
  }

  try {
    const candidate = extractAddressCandidateFromUrl(normalizedExpanded);
    if (candidate) {
      const candidateCoordinates = extractCoordinatesFromText(candidate);
      if (candidateCoordinates) {
        return candidateCoordinates;
      }

      const geocodedCandidate = await geocodeAddress(candidate);
      if (geocodedCandidate) {
        return geocodedCandidate;
      }
    }
  } catch {
    // Continue to next strategy.
  }

  const googleCoordinates = extractCoordinatesFromGoogleContent(normalizedExpanded);
  if (googleCoordinates) {
    return googleCoordinates;
  }

  if (looksLikeAddressText(normalizedExpanded)) {
    return geocodeAddress(normalizedExpanded);
  }

  return null;
}
