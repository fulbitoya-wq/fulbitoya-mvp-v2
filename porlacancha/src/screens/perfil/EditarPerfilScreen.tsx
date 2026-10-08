import { useEffect, useMemo, useState, type ComponentProps } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { colors, radius, space } from "@shared/design";
import { usernameSchema } from "@shared/validation/equipos";
import type { JugateLaProfile } from "../../auth/AuthProvider";
import { hapticMedium } from "../../lib/haptics";
import { ChevronLeft, iconStroke } from "../../lib/icons";
import {
  DISPONIBILIDADES,
  FORMATOS,
  PIERNAS,
  PUESTOS,
  TARIFA_MAX,
  TARIFA_MIN,
  formatTarifa,
  parseTarifaInput,
  savePlayerProfile,
  splitNombre,
  usernameDisponible,
  type FootballProfile,
  type ModoJuego,
} from "../../lib/perfil";
import { compressAvatarUri } from "../../lib/compress-avatar";
import { supabase } from "../../lib/supabase";
import { BirthdateField, Button, IconBtn, PlayerAvatar, showAppDialog, showConfirm, showNotice } from "../../ui";
import { typeStyle } from "../../ui/textStyle";
import { fontFamily } from "../../lib/fonts";

const BUCKET = "equipo-logos";

type Props = {
  profile: JugateLaProfile;
  football: FootballProfile;
  onBack: () => void;
  onSaved: (nombre: string, username: string, avatar: string | null, fp: FootballProfile, telefono: string | null) => void;
};

export function EditarPerfilScreen({ profile, football, onBack, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const split = splitNombre(profile.nombre);
  const [nombre, setNombre] = useState(split.nombre);
  const [apellido, setApellido] = useState(football.apellido || split.apellido);
  const [username, setUsername] = useState(profile.username ?? "");
  const [telefono, setTelefono] = useState(profile.telefono ?? "");
  const [nacimiento, setNacimiento] = useState(football.fechaNacimiento ?? "");
  const [zona, setZona] = useState(football.zona);
  const [puesto, setPuesto] = useState(football.puestoPrincipal);
  const [puesto2, setPuesto2] = useState(football.puestoSecundario);
  const [pierna, setPierna] = useState(football.pierna);
  const [formatos, setFormatos] = useState<string[]>(football.formatos);
  const [disp, setDisp] = useState(football.disponibilidad);
  const [bio, setBio] = useState(football.bio);
  const [buscaEquipo, setBuscaEquipo] = useState(football.buscaEquipo);
  const [modoJuego, setModoJuego] = useState<ModoJuego>(football.modoJuego);
  const [tarifaText, setTarifaText] = useState(
    football.tarifaPartido != null ? formatTarifa(football.tarifaPartido) : ""
  );
  const [avatar, setAvatar] = useState(profile.avatar_url);
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const [userMsg, setUserMsg] = useState<string | null>(null);
  const [userOk, setUserOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const snapshot = useMemo(
    () =>
      JSON.stringify({
        nombre,
        apellido,
        username,
        telefono,
        nacimiento,
        zona,
        puesto,
        puesto2,
        pierna,
        formatos,
        disp,
        bio,
        buscaEquipo,
        modoJuego,
        tarifaText,
        localPhoto,
        avatar,
      }),
    [
      nombre,
      apellido,
      username,
      telefono,
      nacimiento,
      zona,
      puesto,
      puesto2,
      pierna,
      formatos,
      disp,
      bio,
      buscaEquipo,
      modoJuego,
      tarifaText,
      localPhoto,
      avatar,
    ]
  );
  const [initial] = useState(snapshot);
  const dirty = snapshot !== initial;

  useEffect(() => {
    const t = setTimeout(() => {
      const raw = username.trim().toLowerCase();
      if (!raw || raw === (profile.username ?? "")) {
        setUserMsg(null);
        setUserOk(false);
        return;
      }
      const parsed = usernameSchema.safeParse(raw);
      if (!parsed.success) {
        setUserOk(false);
        setUserMsg(parsed.error.issues[0]?.message ?? "Username inválido");
        return;
      }
      void usernameDisponible(profile.id, parsed.data).then((r) => {
        if (!r.ok) {
          setUserOk(false);
          setUserMsg(r.error);
          return;
        }
        setUserOk(r.disponible);
        setUserMsg(r.disponible ? "Username disponible" : "Este username ya está en uso");
      });
    }, 450);
    return () => clearTimeout(t);
  }, [username, profile.id, profile.username]);

  const askLeave = () => {
    showConfirm({
      title: "¿Descartar cambios?",
      body: "Si salís ahora, se pierden los cambios que no guardaste.",
      cancelLabel: "Seguir editando",
      confirmLabel: "Descartar",
      danger: true,
      onConfirm: onBack,
    });
  };

  const pickPhoto = () => {
    showAppDialog({
      title: "Foto de perfil",
      body: "La recortamos para que suba liviana.",
      actions: [
        {
          label: "Cámara",
          variant: "primary",
          onPress: () => {
            void (async () => {
              const perm = await ImagePicker.requestCameraPermissionsAsync();
              if (!perm.granted) return;
              const res = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [3, 4] });
              if (!res.canceled && res.assets[0]?.uri) setLocalPhoto(res.assets[0].uri);
            })();
          },
        },
        {
          label: "Galería",
          variant: "secondary",
          onPress: () => {
            void (async () => {
              const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (!perm.granted) return;
              const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                quality: 0.7,
                allowsEditing: true,
                aspect: [3, 4],
              });
              if (!res.canceled && res.assets[0]?.uri) setLocalPhoto(res.assets[0].uri);
            })();
          },
        },
        {
          label: "Eliminar foto",
          variant: "danger",
          onPress: () => {
            setLocalPhoto(null);
            setAvatar(null);
          },
        },
        { label: "Cancelar", variant: "ghost" },
      ],
    });
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!localPhoto) return avatar;
    const compressed = await compressAvatarUri(localPhoto);
    const path = `${profile.id}/avatar-${Date.now()}.jpg`;
    const response = await fetch(compressed);
    const body = await response.arrayBuffer();
    const { data, error: up } = await supabase.storage.from(BUCKET).upload(path, body, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (up) {
      const msg = (up.message ?? "").toLowerCase();
      if (msg.includes("size") || msg.includes("maximum") || msg.includes("exceed")) {
        throw new Error("La foto sigue pesando de más. Probá otra o recortala más.");
      }
      throw new Error(up.message);
    }
    return supabase.storage.from(BUCKET).getPublicUrl(data.path).data.publicUrl;
  };

  const save = async () => {
    setError(null);
    const nextUser = username.trim().toLowerCase();
    if (nextUser) {
      const parsed = usernameSchema.safeParse(nextUser);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Username inválido");
        return;
      }
    }
    const birth = nacimiento.trim();
    if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) {
      setError("Elegí la fecha de nacimiento con el selector.");
      return;
    }
    let tarifa: number | null = null;
    if (modoJuego === "cobro_por_partido") {
      tarifa = parseTarifaInput(tarifaText);
      if (tarifa == null || tarifa < TARIFA_MIN || tarifa > TARIFA_MAX) {
        setError("La tarifa tiene que estar entre $1.000 y $500.000.");
        return;
      }
    }
    setSaving(true);
    try {
      let avatarUrl = avatar;
      try {
        avatarUrl = await uploadPhoto();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No pudimos subir la foto. El resto se puede guardar igual.");
      }
      const phone = telefono.trim() || null;
      const fp: FootballProfile = {
        apellido: apellido.trim(),
        zona: zona.trim(),
        bio: bio.trim().slice(0, 160),
        puestoPrincipal: puesto,
        puestoSecundario: puesto2,
        pierna,
        formatos,
        disponibilidad: disp,
        fechaNacimiento: birth || null,
        buscaEquipo,
        modoJuego,
        tarifaPartido: tarifa,
      };
      const saved = await savePlayerProfile({
        userId: profile.id,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        telefono: phone,
        username: nextUser,
        previousUsername: profile.username,
        avatarUrl,
        football: fp,
      });
      if (!saved.ok) {
        setError(saved.error);
        showNotice("No se pudo guardar", saved.error);
        return;
      }
      void hapticMedium();
      const fullName = `${nombre.trim()} ${apellido.trim()}`.trim();
      onSaved(fullName, nextUser || profile.username || "", avatarUrl, fp, phone);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar los cambios. Intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const toggleFmt = (f: string) => {
    setFormatos((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  };

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.bar, { paddingTop: Math.max(insets.top, space[8]) }]}>
        <IconBtn onPress={dirty ? askLeave : onBack} label="Volver">
          <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
        </IconBtn>
        <Text style={styles.title}>Editar perfil</Text>
        <Pressable
          onPress={save}
          disabled={saving}
          hitSlop={8}
          style={[styles.savePill, saving && { opacity: 0.6 }]}
          accessibilityRole="button"
        >
          <Text style={styles.saveTxt}>{saving ? "..." : "Guardar"}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space[32] }]} keyboardShouldPersistTaps="handled">
        <View style={styles.center}>
          <PlayerAvatar uri={localPhoto || avatar} nombre={nombre} apellido={apellido} onCamera={pickPhoto} />
          <Pressable onPress={pickPhoto} style={{ marginTop: space[12] }}>
            <Text style={styles.link}>Cambiar foto de perfil</Text>
          </Pressable>
          <Text style={styles.hint}>JPG o PNG. Máximo 2 MB. La comprimimos al guardar.</Text>
        </View>

        {error ? <Text style={styles.err}>{error}</Text> : null}

        <Text style={styles.h2}>Datos básicos</Text>
        <LabelInput label="Nombre" value={nombre} onChangeText={setNombre} />
        <LabelInput label="Apellido" value={apellido} onChangeText={setApellido} />
        <LabelInput
          label="Email"
          value={profile.email}
          editable={false}
          autoCapitalize="none"
        />
        <LabelInput
          label="Teléfono"
          value={telefono}
          onChangeText={setTelefono}
          keyboardType="phone-pad"
        />
        <LabelInput
          label="Username (opcional)"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>Si lo cargás, los demás te encuentran por @usuario. Si no, figurás con tu nombre.</Text>
        {userMsg ? (
          <Text style={[styles.hint, userOk ? styles.ok : styles.err]}>{userOk ? `✓ ${userMsg}` : userMsg}</Text>
        ) : null}
        <BirthdateField value={nacimiento} onChange={setNacimiento} label="Fecha de nacimiento" />
        <Text style={styles.hint}>
          Privada (mín. 13 años). El DNI se carga en Configuración → Datos personales y no se puede cambiar después.
        </Text>
        <LabelInput label="Zona" value={zona} onChangeText={setZona} placeholder="Palermo, CABA" />

        <Text style={styles.h2}>Mi perfil futbolero</Text>
        <Text style={styles.lab}>Puesto principal</Text>
        <View style={styles.chips}>
          {PUESTOS.map((p) => {
            const on = puesto === p;
            return (
              <Pressable key={p} onPress={() => setPuesto(p)} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipT, on && styles.chipTOn]}>{p}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.lab}>Puesto secundario</Text>
        <View style={styles.chips}>
          {["Ninguno", ...PUESTOS].map((p) => {
            const on = (p === "Ninguno" && !puesto2) || puesto2 === p;
            return (
              <Pressable
                key={p}
                onPress={() => setPuesto2(p === "Ninguno" ? "" : p)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipT, on && styles.chipTOn]}>{p}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.lab}>Pierna hábil</Text>
        <View style={styles.chips}>
          {PIERNAS.map((p) => {
            const on = pierna === p;
            return (
              <Pressable key={p} onPress={() => setPierna(p)} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipT, on && styles.chipTOn]}>{p}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.lab}>Formato preferido</Text>
        <View style={styles.chips}>
          {FORMATOS.map((f) => {
            const on = formatos.includes(f);
            return (
              <Pressable key={f} onPress={() => toggleFmt(f)} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipT, on && styles.chipTOn]}>{f.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.lab}>Disponibilidad</Text>
        <View style={styles.chips}>
          {DISPONIBILIDADES.map((d) => {
            const on = disp === d;
            return (
              <Pressable key={d} onPress={() => setDisp(d)} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipT, on && styles.chipTOn]}>{d}</Text>
              </Pressable>
            );
          })}
        </View>
        <LabelInput label="Sobre mí" value={bio} onChangeText={(t) => setBio(t.slice(0, 160))} multiline />
        <Text style={styles.hint}>{bio.length}/160</Text>

        <Text style={styles.h2}>Cómo jugás</Text>
        <Text style={styles.hint}>
          Independiente de si buscás equipo. Podés jugar gratis o cobrar, y igual aparecer en Buscar jugadores.
        </Text>
        <View style={styles.chips}>
          {(
            [
              ["sin_cobrar", "Juego sin cobrar"],
              ["cobro_por_partido", "Cobro por partido"],
            ] as const
          ).map(([id, label]) => {
            const on = modoJuego === id;
            return (
              <Pressable key={id} onPress={() => setModoJuego(id)} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipT, on && styles.chipTOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {modoJuego === "cobro_por_partido" ? (
          <>
            <LabelInput
              label="Tarifa por partido"
              value={tarifaText}
              onChangeText={(t) => {
                const n = parseTarifaInput(t);
                setTarifaText(n != null ? formatTarifa(n) : t);
              }}
              keyboardType="number-pad"
              placeholder="$10.000"
            />
            <Text style={styles.hint}>Se muestra en Buscar jugadores junto a tu ficha.</Text>
          </>
        ) : (
          <Text style={styles.hint}>En Buscar jugadores vas a figurar como Gratis.</Text>
        )}

        <Text style={styles.h2}>Busco equipo</Text>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.lab}>Aparecer en Buscar jugadores</Text>
            <Text style={styles.hint}>
              Sirve si jugás gratis o si cobrás: un capitán te puede sumar a un plantel. No está atado a cómo cobrás.
            </Text>
          </View>
          <Switch
            value={buscaEquipo}
            onValueChange={setBuscaEquipo}
            trackColor={{ false: colors.border, true: colors.sky }}
            thumbColor={colors.white}
            accessibilityLabel="Busco equipo"
          />
        </View>

        <View style={{ marginTop: space[16] }}>
          <Button label={saving ? "Guardando..." : "Guardar cambios"} onPress={save} loading={saving} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LabelInput({
  label,
  ...rest
}: { label: string } & ComponentProps<typeof TextInput>) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: space[12] }}>
      <Text style={styles.lab}>{label}</Text>
      <TextInput
        {...rest}
        placeholderTextColor={colors.textSecondary}
        onFocus={(e) => {
          setFocus(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          rest.onBlur?.(e);
        }}
        style={[styles.input, focus && styles.inputOn, rest.multiline && { minHeight: 88, textAlignVertical: "top" }, rest.style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navy },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space[8],
    paddingBottom: space[8],
  },
  title: { ...typeStyle("h3", colors.white), flex: 1, textAlign: "center" },
  savePill: {
    minHeight: 36,
    paddingHorizontal: space[16],
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    justifyContent: "center",
  },
  saveTxt: { ...typeStyle("caption", colors.navyDark), fontWeight: "700" },
  body: { paddingHorizontal: space[16] },
  center: { alignItems: "center", marginVertical: space[16] },
  link: typeStyle("bodySmall", colors.sky),
  hint: { ...typeStyle("caption", colors.textSecondary), marginTop: 4 },
  ok: { color: colors.success },
  err: { ...typeStyle("bodySmall", colors.danger), marginBottom: space[8] },
  h2: { ...typeStyle("h3", colors.white), marginTop: space[20], marginBottom: space[12] },
  lab: { ...typeStyle("caption", colors.textSecondary), marginBottom: space[8] },
  input: {
    minHeight: 48,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space[16],
    paddingVertical: space[12],
    color: colors.white,
    fontFamily: fontFamily.ui,
    fontSize: 16,
    justifyContent: "center",
  },
  inputOn: { borderColor: colors.sky },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[8], marginBottom: space[12] },
  chip: {
    minHeight: 36,
    paddingHorizontal: space[16],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.sky, borderColor: colors.sky },
  chipT: typeStyle("caption", colors.white),
  chipTOn: { color: colors.navyDark, fontWeight: "700" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    marginBottom: space[12],
  },
});
