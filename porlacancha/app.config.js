module.exports = {
  expo: {
    name: "PorLaCancha",
    slug: "porlacancha",
    scheme: "porlacancha",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    splash: {
      image: "./assets/porlacancha.png",
      backgroundColor: "#001B44",
      resizeMode: "contain",
    },
    ios: {
      bundleIdentifier: "com.porlacancha.app",
      appleTeamId: "MRH577CDBK",
      associatedDomains: ["applinks:porlacancha.com"],
      supportsTablet: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription:
          "PorLaCancha usa la cámara para tu foto de perfil.",
        NSPhotoLibraryUsageDescription:
          "PorLaCancha usa tus fotos para el perfil y el escudo del equipo.",
        NSLocationWhenInUseUsageDescription:
          "PorLaCancha usa tu ubicación para mostrarte predios y canchas cerca tuyo.",
      },
    },
    android: {
      package: "com.porlacancha.app",
      adaptiveIcon: {
        backgroundColor: "#001B44",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
    },
    web: {
      favicon: "./assets/favicon.png",
      name: "PorLaCancha",
      shortName: "PorLaCancha",
      lang: "es",
      themeColor: "#001B44",
      backgroundColor: "#001B44",
      display: "standalone",
    },
    plugins: [
      "expo-font",
      "expo-asset",
      "expo-splash-screen",
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "PorLaCancha usa tu ubicación para mostrarte predios y canchas cerca tuyo.",
        },
      ],
      [
        "react-native-maps",
        {
          androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "PorLaCancha usa tus fotos para el perfil y el escudo del equipo.",
          cameraPermission: "PorLaCancha usa la cámara para tu foto de perfil.",
        },
      ],
    ],
    extra: {
      eas: {
        projectId: "57876a67-5f75-4184-9436-c9ac56e50d3d",
      },
    },
    // Cuando haya credenciales Google/Apple (NO en Expo Go):
    // extra plugins:
    //   ["@react-native-google-signin/google-signin", { iosUrlScheme: "com.googleusercontent.apps.XXXX" }],
    //   "expo-apple-authentication",
  },
};
