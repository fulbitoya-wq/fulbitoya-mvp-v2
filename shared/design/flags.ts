/** Flags de piloto / beta. Código de Plus y pagos totales queda vivo; solo se oculta en UI. */
export const featureFlags = {
  contratacion_habilitada: false,
  pagos_habilitados: false,
  /** Reserva Plus: oculta en beta; más adelante vuelve a ser pago. */
  reserva_plus_habilitada: false,
  /** En reserva simple, cobro total en la app. Beta: solo seña si el predio la pide. */
  reserva_pago_total_habilitado: false,
} as const;
