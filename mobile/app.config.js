const path = require("path");
const fs = require("fs");

// EAS Build dostarcza plik przez env var GOOGLE_SERVICES_JSON (ścieżka do pliku)
// Lokalnie plik leży w ./google-services.json
const googleServicesFile = (() => {
  // EAS env:create --type file ustawia zmienną na ścieżkę do tymczasowego pliku
  if (process.env.GOOGLE_SERVICES_JSON) {
    return process.env.GOOGLE_SERVICES_JSON;
  }
  // Lokalny fallback
  const local = path.resolve(__dirname, "google-services.json");
  if (fs.existsSync(local)) {
    return "./google-services.json";
  }
  console.warn("⚠️  google-services.json not found — FCM will not work");
  return undefined;
})();

module.exports = {
  expo: {
    name: "Sushi Tutaj - Panel",
    slug: "sushitutaj-ordering",
    version: "1.0.0",
    orientation: "default",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#f8fafc",
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#f8fafc",
      },
      package: "com.sushitutaj.admin",
      ...(googleServicesFile && { googleServicesFile }),
      permissions: [
        "INTERNET",
        "VIBRATE",
        "RECEIVE_BOOT_COMPLETED",
        "WAKE_LOCK",
      ],
    },
    ios: {
      bundleIdentifier: "com.sushitutaj.admin",
      supportsTablet: true,
      infoPlist: {
        UIBackgroundModes: ["remote-notification"],
      },
    },
    plugins: [
      [
        "expo-notifications",
        {
          icon: "./assets/notification-icon.png",
          color: "#000000",
          sounds: ["./assets/new_order.mp3"],
          defaultChannel: "orders",
          enableBackgroundRemoteNotifications: true,
        },
      ],
    ],
    extra: {
      eas: {
        projectId: "f2806a28-d085-434a-b7a1-a3257a19dadd",
      },
    },
  },
};
