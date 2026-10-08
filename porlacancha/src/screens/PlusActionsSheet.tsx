import { useEffect, useRef } from "react";
import { Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, space } from "@shared/design";
import { Calendar, Users, iconStroke } from "../lib/icons";
import { fontFamily } from "../lib/fonts";
import { Button } from "../ui";

type Props = {
  visible: boolean;
  onClose: () => void;
  onReservarCancha: () => void;
  onArmarPartido: () => void;
  onCompletarPartido?: () => void;
};

export function PlusActionsSheet({
  visible,
  onClose,
  onReservarCancha,
  onArmarPartido,
  onCompletarPartido,
}: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(420)).current;
  const dim = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const finishClose = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(translateY, { toValue: 480, duration: 200, useNativeDriver: true }),
      Animated.timing(dim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onCloseRef.current();
    });
  };

  useEffect(() => {
    if (!visible) {
      closing.current = false;
      translateY.setValue(420);
      dim.setValue(0);
      return;
    }
    closing.current = false;
    translateY.setValue(420);
    dim.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }),
      Animated.timing(dim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [visible, translateY, dim]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx) * 0.7,
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        const y = Math.max(0, g.dy);
        translateY.setValue(y);
        dim.setValue(Math.max(0.25, 1 - y / 420));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 56 || g.vy > 0.65) {
          finishClose();
          return;
        }
        Animated.parallel([
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 240 }),
          Animated.timing(dim, { toValue: 1, duration: 140, useNativeDriver: true }),
        ]).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 240 }).start();
      },
    }),
  ).current;

  const handlePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const y = Math.max(0, g.dy);
        translateY.setValue(y);
        dim.setValue(Math.max(0.25, 1 - y / 420));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 40 || g.vy > 0.45) {
          finishClose();
          return;
        }
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 240 }).start();
        Animated.timing(dim, { toValue: 1, duration: 140, useNativeDriver: true }).start();
      },
    }),
  ).current;

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={finishClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.dim, { opacity: dim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={finishClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 24) + 8, transform: [{ translateY }] },
          ]}
          {...pan.panHandlers}
        >
          <View style={styles.grab} {...handlePan.panHandlers}>
            <View style={styles.handle} />
          </View>
          <Text style={styles.h}>¿Qué querés hacer?</Text>
          <View style={styles.list}>
            <Button
              label="Reservar cancha"
              onPress={onReservarCancha}
              icon={<Calendar color={colors.navyDark} size={20} strokeWidth={iconStroke} />}
            />
            <Button
              label="Armar partido"
              onPress={onArmarPartido}
              icon={<Users color={colors.navyDark} size={20} strokeWidth={iconStroke} />}
            />
            {onCompletarPartido ? (
              <Button
                label="Completar mi partido"
                onPress={onCompletarPartido}
                icon={<Users color={colors.navyDark} size={20} strokeWidth={iconStroke} />}
              />
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: colors.navyDark,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: space[20],
    paddingTop: space[4],
  },
  grab: {
    alignItems: "center",
    paddingVertical: space[12],
    minHeight: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(247,245,239,0.30)",
  },
  h: {
    fontFamily: fontFamily.uiBold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.white,
    marginBottom: space[16],
  },
  list: { gap: space[12] },
});
