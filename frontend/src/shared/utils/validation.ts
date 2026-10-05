export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidCedula = (cedula: string): boolean => {
  return /^\d{10}$/.test(cedula);
};

export const isValidRuc = (ruc: string): boolean => {
  return /^\d{13}$/.test(ruc);
};

export const isValidPhone = (phone: string): boolean => {
  return /^\d{10}$/.test(phone);
};

export const sanitizeNumeric = (value: string, maxLength: number): string => {
  return value.replace(/\D/g, '').slice(0, maxLength);
};

export const sanitizeAlphanumeric = (value: string, maxLength: number): string => {
  return value.replace(/[^a-zA-Z0-9]/g, '').slice(0, maxLength);
};

export const normalizePlate = (value: string, maxLength = 10): string => {
  return sanitizeAlphanumeric(value, maxLength).toUpperCase();
};

export const formatPlate = (value: string): string => {
  const letters = value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3);
  const numbers = value.replace(/\D/g, '').slice(0, 4);
  return `${letters}${numbers}`;
};

export const isValidPlate = (plate: string): boolean => {
  const normalized = formatPlate(plate);
  // 3 o 4 números: hay vehículos con placa de 3 (ej. SBD258).
  return /^[A-Z]{3}\d{3,4}$/.test(normalized);
};

/** ABC1234, abc-1234, "ABC 1234" → "ABC-1234"; null si no calza. */
const toPlacaOrden = (token: string): string | null => {
  const compacto = token.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return /^[A-Z]{3}\d{4}$/.test(compacto)
    ? `${compacto.slice(0, 3)}-${compacto.slice(3)}`
    : null;
};

/**
 * Placas escritas a mano en una orden de venta, formato ABC-0000. Separadas
 * por coma, punto y coma, salto de línea o espacio. No se usa formatPlate:
 * ese arma ABC1234 sin guion y es el formato de Vehículos.
 */
export const parsePlacasOrden = (
  texto: string
): { placas: string[]; invalidas: string[] } => {
  const placas: string[] = [];
  const invalidas: string[] = [];

  for (const trozo of texto.split(/[,;\n]+/)) {
    if (!trozo.trim()) continue;
    // "ABC 1234" es una sola placa; "ABC-1234 PBX-0123" son dos.
    const entera = toPlacaOrden(trozo);
    const tokens = entera ? [trozo] : trozo.trim().split(/\s+/);
    for (const token of tokens) {
      const placa = toPlacaOrden(token);
      if (!placa) invalidas.push(token.trim());
      else if (!placas.includes(placa)) placas.push(placa);
    }
  }

  return { placas, invalidas };
};

export const isValidYear = (year: number): boolean => {
  const currentYear = new Date().getFullYear();
  return year >= 1900 && year <= currentYear + 1;
};

export const isValidQR = (qr: string): boolean => {
  return qr.trim().length > 0;
};
