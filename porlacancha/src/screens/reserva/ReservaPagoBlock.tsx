import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { colors, radius, space } from "@shared/design";
import { etiquetaTipo, formatFechaCorta, formatHora } from "../../lib/desafios";
import { Check, iconStroke } from "../../lib/icons";
import {
  pesosReserva,
  reglasPredioUrl,
  type OpcionesCobroReserva,
} from "../../lib/reserva";
import { Mute } from "../../ui";
import { typeStyle } from "../../ui/textStyle";

type TipoCobro = "sena" | "total";

type Props = {
  opciones: OpcionesCobroReserva;
  tipo: TipoCobro | null;
  acepto: boolean;
  onSelectTipo: (t: TipoCobro) => void;
  onToggleAcepto: () => void;
};

function PayCard({
  title,
  primary,
  secondary,
  highlight,
  selected,
  disabled,
  aclaracion,
  onPress,
  stacked,
}: {
  title: string;
  primary: string;
  secondary: string;
  highlight?: string | null;
  selected: boolean;
  disabled: boolean;
  aclaracion?: string | null;
  onPress: () => void;
  stacked: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={[
        styles.payCard,
        stacked ? styles.payCardStacked : styles.payCardSide,
        selected && styles.payCardOn,
        disabled && styles.payCardOff,
      ]}
    >
      <View style={styles.payTop}>
        <Text style={styles.payTitle}>{title}</Text>
        {selected ? (
          <View style={styles.check}>
            <Check color={colors.navyDark} size={14} strokeWidth={iconStroke} />
          </View>
        ) : (
          <View style={styles.checkEmpty} />
        )}
      </View>
      <Text style={styles.payPrimary}>{primary}</Text>
      <Text style={styles.paySecondary}>{secondary}</Text>
      {highlight ? <Text style={styles.payHighlight}>{highlight}</Text> : null}
      {disabled && aclaracion ? <Text style={styles.payHint}>{aclaracion}</Text> : null}
    </Pressable>
  );
}

export function ReservaPagoBlock({ opciones, tipo, acepto, onSelectTipo, onToggleAcepto }: Props) {
  const { width } = useWindowDimensions();
  const stacked = width < 380;
  const sena = opciones.opcion_sena;
  const total = opciones.opcion_total;
  const reglasUrl = reglasPredioUrl(opciones.slug);

  const selectedOpt = tipo === "sena" ? sena : tipo === "total" ? total : null;
  const formaLabel = tipo === "sena" ? "Seña" : tipo === "total" ? "Pago total" : null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.h}>¿Cómo querés reservar?</Text>
      <View style={[styles.row, stacked && styles.col]}>
        <PayCard
          stacked={stacked}
          title="Seña"
          primary={sena.disponible && sena.monto_pagar != null ? `Pagás ${pesosReserva(sena.monto_pagar)} ahora` : "No disponible"}
          secondary={
            sena.disponible && sena.resta_en_predio != null
              ? `Restan ${pesosReserva(sena.resta_en_predio)} en el predio`
              : "—"
          }
          selected={tipo === "sena"}
          disabled={!sena.disponible}
          aclaracion={sena.aclaracion}
          onPress={() => onSelectTipo("sena")}
        />
        <PayCard
          stacked={stacked}
          title="Pago total"
          primary={
            total.disponible && total.monto_pagar != null
              ? `Pagás ${pesosReserva(total.monto_pagar)} ahora`
              : "No disponible"
          }
          secondary={total.disponible ? "Todo pago" : "—"}
          highlight={
            total.disponible && total.descuento > 0
              ? `Ahorrás ${pesosReserva(total.descuento)} (${Math.round(total.descuento_pct)}%)`
              : null
          }
          selected={tipo === "total"}
          disabled={!total.disponible}
          aclaracion={total.aclaracion}
          onPress={() => onSelectTipo("total")}
        />
      </View>
      <Mute>La seña asegura el turno. El importe restante se paga según las condiciones del predio.</Mute>

      {tipo && selectedOpt?.disponible ? (
        <View style={styles.summary}>
          <Text style={styles.summaryH}>Resumen</Text>
          <SummaryLine label="Predio" value={opciones.cancha_nombre} />
          <SummaryLine label="Día" value={formatFechaCorta(opciones.fecha)} />
          <SummaryLine label="Horario" value={formatHora(opciones.hora_inicio)} />
          <SummaryLine label="Formato" value={etiquetaTipo(opciones.formato)} />
          <SummaryLine label="Forma de pago" value={formaLabel ?? ""} />
          <SummaryLine
            label="Pagás ahora"
            value={pesosReserva(selectedOpt.monto_pagar ?? 0)}
            emphasize
          />
          <SummaryLine
            label="Resta en el predio"
            value={pesosReserva(selectedOpt.resta_en_predio ?? 0)}
          />
        </View>
      ) : null}

      {tipo ? (
        <View style={styles.rules}>
          <Text style={styles.rulesT}>{opciones.texto_cancelacion}</Text>
          {reglasUrl ? (
            <Pressable
              onPress={() => void Linking.openURL(reglasUrl)}
              accessibilityRole="link"
              hitSlop={8}
            >
              <Text style={styles.link}>Ver reglas completas del predio</Text>
            </Pressable>
          ) : (
            <Text style={styles.rulesMuted}>{opciones.texto_reglas}</Text>
          )}
          <Pressable
            onPress={onToggleAcepto}
            style={styles.checkRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acepto }}
          >
            <View style={[styles.box, acepto && styles.boxOn]}>
              {acepto ? <Check color={colors.navyDark} size={14} strokeWidth={iconStroke} /> : null}
            </View>
            <Text style={styles.checkLabel}>Acepto las condiciones del predio</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function SummaryLine({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, emphasize && styles.summaryEmph]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space[16], gap: space[12] },
  h: typeStyle("h3", colors.white),
  row: { flexDirection: "row", gap: space[10] },
  col: { flexDirection: "column" },
  payCard: {
    backgroundColor: colors.navyDark,
    borderWidth: 1.5,
    borderColor: colors.sky,
    borderRadius: radius.lg,
    padding: space[12],
    gap: 6,
    minHeight: 120,
  },
  payCardSide: { flex: 1 },
  payCardStacked: { width: "100%" },
  payCardOn: {
    backgroundColor: colors.surfaceHover,
    borderColor: colors.gold,
    borderWidth: 1.5,
  },
  payCardOff: { opacity: 0.45 },
  payTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  payTitle: typeStyle("h3", colors.white),
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  checkEmpty: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "rgba(139,201,235,0.45)",
  },
  payPrimary: typeStyle("body", colors.white),
  paySecondary: typeStyle("caption", colors.textSecondary),
  payHighlight: typeStyle("bodySmall", colors.gold),
  payHint: typeStyle("caption", colors.textSecondary),
  summary: {
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.30)",
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: space[12],
    gap: 8,
  },
  summaryH: typeStyle("h3", colors.white),
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  summaryLabel: typeStyle("caption", colors.textSecondary),
  summaryValue: { ...typeStyle("bodySmall", colors.white), flexShrink: 1, textAlign: "right" },
  summaryEmph: typeStyle("body", colors.gold),
  rules: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: space[12],
    gap: space[10],
  },
  rulesT: typeStyle("bodySmall", colors.white),
  rulesMuted: typeStyle("caption", colors.textSecondary),
  link: { ...typeStyle("bodySmall", colors.sky), textDecorationLine: "underline" },
  checkRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: space[12] },
  box: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.gold },
  checkLabel: { flex: 1, ...typeStyle("body", colors.white) },
});
