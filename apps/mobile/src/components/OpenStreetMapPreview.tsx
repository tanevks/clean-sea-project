import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

type MapMarker = {
  id?: string;
  latitude: number;
  longitude: number;
  label?: string;
  color?: string;
  isSelected?: boolean;
};

type Props = {
  markers: MapMarker[];
  polygons?: Array<{
    id?: string;
    geojson: unknown;
    color?: string;
  }>;
  preferPolygonBounds?: boolean;
  height?: number;
  onMarkerPress?: (markerId: string) => void;
  onInteractionChange?: (isInteracting: boolean) => void;
};

const DEFAULT_CENTER = {
  latitude: 42.6977,
  longitude: 23.3219
};

export function OpenStreetMapPreview({
  markers,
  polygons = [],
  preferPolygonBounds = false,
  height = 240,
  onMarkerPress,
  onInteractionChange
}: Props) {
  const html = useMemo(
    () => buildHtml(markers, polygons, preferPolygonBounds),
    [markers, polygons, preferPolygonBounds]
  );
  const webViewKey = useMemo(
    () =>
      JSON.stringify({
        markers,
        polygons,
        preferPolygonBounds
      }),
    [markers, polygons, preferPolygonBounds]
  );

  return (
    <View
      style={[styles.container, { height }]}
      onTouchStart={() => onInteractionChange?.(true)}
      onTouchMove={() => onInteractionChange?.(true)}
      onTouchEnd={() => onInteractionChange?.(false)}
      onTouchCancel={() => onInteractionChange?.(false)}
    >
      <WebView
        key={webViewKey}
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        scrollEnabled={false}
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        onMessage={(event) => {
          if (!onMarkerPress) {
            return;
          }

          try {
            const payload = JSON.parse(event.nativeEvent.data) as {
              type?: string;
              id?: string;
            };

            if (payload.type === "markerPress" && payload.id) {
              onMarkerPress(payload.id);
            }
          } catch {
            // Ignore malformed messages from the embedded map.
          }
        }}
      />
    </View>
  );
}

function buildHtml(
  markers: MapMarker[],
  polygons: Array<{ id?: string; geojson: unknown; color?: string }>,
  preferPolygonBounds: boolean
) {
  const payload = JSON.stringify({
    markers,
    polygons,
    preferPolygonBounds,
    defaultCenter: DEFAULT_CENTER
  });

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes"
    />
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
      crossorigin=""
    />
    <style>
      html, body, #map {
        height: 100%;
        margin: 0;
        padding: 0;
      }
      body {
        background: #e2e8f0;
      }
      .leaflet-container {
        font-family: sans-serif;
      }
      .leaflet-control-attribution {
        font-size: 10px;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script
      src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
      integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
      crossorigin=""
    ></script>
    <script>
      const payload = ${payload};
      const map = L.map("map", {
        zoomControl: true,
        attributionControl: true,
        touchZoom: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        dragging: true,
        tap: true
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);

      const markers = [];
      const markerLayers = [];
      const polygonLayers = [];
      const layers = [];

      payload.polygons.forEach((item) => {
        if (!item || !item.geojson) {
          return;
        }

        const color = item.color || "#16a34a";
        const layer = L.geoJSON(item.geojson, {
          style: {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.12
          }
        }).addTo(map);
        polygonLayers.push(layer);
        layers.push(layer);
      });

      payload.markers.forEach((item) => {
        const color = item.color || "#0b6bcb";
        const marker = L.circleMarker([item.latitude, item.longitude], {
          radius: item.isSelected ? 10 : 8,
          color,
          fillColor: color,
          fillOpacity: 0.9,
          weight: item.isSelected ? 3 : 2
        }).addTo(map);

        if (item.label) {
          marker.bindPopup(item.label);
        }

        if (item.id && window.ReactNativeWebView) {
          marker.on("click", () => {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({
                type: "markerPress",
                id: item.id
              })
            );
          });
        }

        markers.push(marker);
        markerLayers.push(marker);
        layers.push(marker);
      });

      if (payload.preferPolygonBounds && polygonLayers.length > 0) {
        const group = L.featureGroup(polygonLayers);
        map.fitBounds(group.getBounds().pad(0.12));
      } else if (markers.length === 1 && layers.length === 1) {
        map.setView(markers[0].getLatLng(), 15);
      } else if (layers.length > 0) {
        const group = L.featureGroup(layers);
        map.fitBounds(group.getBounds().pad(0.2));
      } else {
        map.setView([payload.defaultCenter.latitude, payload.defaultCenter.longitude], 12);
      }
    </script>
  </body>
</html>`;
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: "#e2e8f0"
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent"
  }
});
