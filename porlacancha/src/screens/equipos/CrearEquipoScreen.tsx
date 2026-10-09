import { useEffect, useState } from "react";
import {
  Image, 
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors } from "@shared/design";
import * as ImagePicker from "expo-image-picker";
import {
  crearEquipoSchema,
  mensajeErrorEquipo,
  rpcCrearEquipo,
  type MatchFormato } from "@shared/equipos";
import { firstZodError } from "@shared/validation/auth";
import { useAuth } from "../../auth/AuthProvider";
import { listLocalidades, listPartidos, listProvincias } from "../../lib/equipos";
import { supabase } from "../../lib/supabase";
import { showNotice, TAB_BAR_CONTENT_INSET } from "../../ui";

const FORMATOS: MatchFormato[] = ["f5", "f7", "f9", "f11"];
const BUCKET = "equipo-logos";

type Lugar = { id: string; nombre: string };

type Props = {
  onBack: () => void;
  onCreated: (equipoId: string) => void;
};

export function CrearEquipoScreen({ onBack, onCreated }: Props) {
  const { profile } = useAuth();
  const [nombre, setNombre] = useState("");
  const [formato, setFormato] = useState<MatchFormato>("f5");
  const [escudoUri, setEscudoUri] = useState<string | null>(null);
  const [provincias, setProvincias] = useState<Lugar[]>([]);
  const [partidos, setPartidos] = useState<Lugar[]>([]);
  const [localidades, setLocalidades] = useState<Lugar[]>([]);
  const [provinciaId, setProvinciaId] = useState<string | null>(null);
  const [partidoId, setPartidoId] = useState<string | null>(null);
  const [localidadId, setLocalidadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listProvincias().then(setProvincias);
  }, []);

  useEffect(() => {
    setPartidoId(null);
    setLocalidadId(null);
    setLocalidades([]);
    if (!provinciaId) {
      setPartidos([]);
      return;
    }
    listPartidos(provinciaId).then(setPartidos);
  }, [provinciaId]);

  useEffect(() => {
    setLocalidadId(null);
    if (!partidoId) {
      setLocalidades([]);
      return;
    }
    listLocalidades(partidoId).then(setLocalidades);
  }, [partidoId]);

  const pickCrest = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showNotice("Permiso", "Necesitamos acceso a tus fotos para el escudo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8 });
    if (!result.canceled && result.assets[0]?.uri) {
      setEscudoUri(result.assets[0].uri);
    }
  };

  const uploadCrest = async (): Promise<string | null> => {
    if (!escudoUri || !profile) return null;
    const path = `${profile.id}/${Date.now()}.jpg`;
    const response = await fetch(escudoUri);
    const body = await response.arrayBuffer();
    const { data, error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, body, {
      contentType: "image/jpeg",
      upsert: false });
    if (uploadErr) throw new Error(uploadErr.message);
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const submit = async () => {
    setError(null);
    const parsed = crearEquipoSchema.safeParse({
      nombre,
      formato_habitual: formato,
      provincia_id: provinciaId,
      partido_id: partidoId,
      localidad_id: localidadId });
    if (!parsed.success) {
      setError(firstZodError(parsed.error));
      return;
    }
    setLoading(true);
    try {
      const escudo_url = await uploadCrest();
      const res = await rpcCrearEquipo(supabase, {
        ...parsed.data,
        escudo_url });
      if (!res.ok) {
        setError(mensajeErrorEquipo(res.error));
        return;
      }
      onCreated(res.equipo_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el equipo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.page, { backgroundColor: colors.navy }]}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>← Volver</Text>
      </Pressable>
      <Text style={styles.h1}>Nuevo equipo</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.label}>Nombre</Text>
      <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Los Pibes" />

      <Text style={styles.label}>Formato habitual</Text>
      <View style={styles.chips}>
        {FORMATOS.map((f) => (
          <Pressable
            key={f}
            style={[styles.chip, formato === f && styles.chipOn]}
            onPress={() => setFormato(f)}
          >
            <Text style={[styles.chipTxt, formato === f && styles.chipTxtOn]}>{f.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Escudo</Text>
      <Pressable style={styles.ghost} onPress={pickCrest}>
        <Text style={styles.ghostTxt}>{escudoUri ? "Cambiar foto" : "Elegir foto"}</Text>
      </Pressable>
      {escudoUri ? <Image source={{ uri: escudoUri }} style={styles.preview} /> : null}

      <Text style={styles.label}>Zona (opcional)</Text>
      <ChipList
        items={provincias}
        selected={provinciaId}
        onSelect={setProvinciaId}
        empty="Sin provincias"
      />
      {partidoId || provinciaId ? (
        <ChipList items={partidos} selected={partidoId} onSelect={setPartidoId} empty="Elegí provincia" />
      ) : null}
      {localidadId || partidoId ? (
        <ChipList
          items={localidades}
          selected={localidadId}
          onSelect={setLocalidadId}
          empty="Elegí partido"
        />
      ) : null}

      <Pressable style={styles.cta} onPress={submit} disabled={loading}>
        <Text style={styles.ctaTxt}>{loading ? "Creando..." : "Crear equipo"}</Text>
      </Pressable>
    </ScrollView>
    </View>
  );
}

function ChipList({
  items,
  selected,
  onSelect,
  empty }: {
  items: Lugar[];
  selected: string | null;
  onSelect: (id: string) => void;
  empty: string;
}) {
  if (items.length === 0) {
    return <Text style={styles.muted}>{empty}</Text>;
  }
  return (
    <View style={styles.chips}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          style={[styles.chip, selected === item.id && styles.chipOn]}
          onPress={() => onSelect(item.id)}
        >
          <Text style={[styles.chipTxt, selected === item.id && styles.chipTxtOn]}>{item.nombre}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.navyDark },
  scroll: { flex: 1, backgroundColor: "transparent" },
  content: { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 48 + TAB_BAR_CONTENT_INSET },
  back: { color: colors.gold, fontWeight: "700", marginBottom: 12 },
  h1: { fontSize: 26, fontWeight: "800", color: colors.white, marginBottom: 16 },
  label: { fontWeight: "700", color: colors.white, marginBottom: 8, marginTop: 10 },
  error: { color: colors.danger, marginBottom: 10 },
  muted: { color: colors.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.white,
    borderWidth: 1,
    borderColor: colors.border },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8 },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipTxt: { fontWeight: "700", color: colors.white, fontSize: 12 },
  chipTxtOn: { color: colors.navyDark },
  ghost: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center" },
  ghostTxt: { fontWeight: "700", color: colors.white },
  preview: { width: 72, height: 72, borderRadius: 36, marginTop: 10 },
  cta: {
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 22 },
  ctaTxt: { color: colors.navyDark, fontWeight: "800" } });
