import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { colors } from "@shared/design";

export type MapPin = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
  label?: string;
  active?: boolean;
};

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type Props = {
  style?: StyleProp<ViewStyle>;
  region: Region;
  pins: MapPin[];
  onSelectPin?: (id: string) => void;
  scrollEnabled?: boolean;
};

export function CanchaMap({ style, region, pins, onSelectPin, scrollEnabled = true }: Props) {
  return (
    <MapView
      style={style}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      initialRegion={region}
      zoomEnabled={scrollEnabled}
      scrollEnabled={scrollEnabled}
      rotateEnabled={scrollEnabled}
      pitchEnabled={scrollEnabled}
      zoomTapEnabled={scrollEnabled}
      pointerEvents={scrollEnabled ? "auto" : "none"}
    >
      {pins.map((pin) => {
        if (Platform.OS === "ios" || !pin.label) {
          return (
            <Marker
              key={pin.id}
              coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
              title={pin.title}
              description={pin.description}
              pinColor={pin.active ? colors.gold : colors.sky}
              onPress={() => onSelectPin?.(pin.id)}
            />
          );
        }
        return (
          <Marker
            key={pin.id}
            coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
            onPress={() => onSelectPin?.(pin.id)}
            tracksViewChanges={false}
          >
            <View style={[styles.pin, pin.active && styles.pinActive]}>
              <Text style={styles.pinText}>{pin.label}</Text>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: {
    backgroundColor: colors.sky,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pinActive: { backgroundColor: colors.gold },
  pinText: { fontSize: 12, fontWeight: "800", color: colors.navyDark },
});
