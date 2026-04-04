import "dotenv/config";
import type { ExpoConfig } from "expo/config";

const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

const config: ExpoConfig = {
  name: "Clean Sea Mobile",
  slug: "clean-sea-mobile",
  scheme: "cleansea",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  plugins: [
    "expo-web-browser",
    [
      "expo-image-picker",
      {
        photosPermission: "Allow Clean Sea to access your photos and videos.",
        cameraPermission: "Allow Clean Sea to use your camera."
      }
    ],
    ...(androidGoogleMapsApiKey
      ? [
          [
            "react-native-maps",
            {
              androidGoogleMapsApiKey
            }
          ] as const
        ]
      : [])
  ],
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff"
  },
  ios: {
    supportsTablet: true
  },
  android: {
    usesCleartextTraffic: true,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff"
    },
    package: "com.tanev.cleanseamobile"
  },
  extra: {
    eas: {
      projectId: "9ff4de06-d1aa-4f9b-9222-ae813c1d33f0"
    },
    hasGoogleMapsAndroidApiKey: Boolean(androidGoogleMapsApiKey)
  },
  web: {
    favicon: "./assets/favicon.png"
  }
};

export default config;
