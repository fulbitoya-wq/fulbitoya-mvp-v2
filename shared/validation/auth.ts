import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Ingresá un email válido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

function edadCumplida(isoDate: string, anios: number): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const born = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(born.getTime())) return false;
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const reached = new Date(Date.UTC(y + anios, mo - 1, d));
  return reached.getTime() <= cutoff.getTime();
}

export const fechaNacimientoSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usá el formato AAAA-MM-DD")
  .refine((v) => {
    const [y, m, d] = v.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, "Fecha de nacimiento inválida")
  .refine((v) => {
    const [y, m, d] = v.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const today = new Date();
    const cutoff = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    return dt.getTime() <= cutoff.getTime();
  }, "La fecha no puede ser futura")
  .refine((v) => edadCumplida(v, 13), "Tenés que tener al menos 13 años para crear una cuenta");

export const dniSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => /^\d{7,8}$/.test(v), "Ingresá un DNI válido (7 u 8 números)");

export const registerSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es demasiado corto"),
  email: z.string().trim().email("Ingresá un email válido"),
  telefono: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  fechaNacimiento: fechaNacimientoSchema,
});

export const completeBirthdateSchema = z.object({
  fechaNacimiento: fechaNacimientoSchema,
});

export const identidadDesafioSchema = z.object({
  fechaNacimiento: fechaNacimientoSchema.refine((v) => edadCumplida(v, 18), "Para desafíos por la cancha tenés que ser mayor de 18"),
  dni: dniSchema,
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Ingresá un email válido"),
});

export const completePhoneSchema = z.object({
  telefono: z.string().trim().min(6, "Ingresá un teléfono válido"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type CompletePhoneInput = z.infer<typeof completePhoneSchema>;

export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos inválidos";
}
