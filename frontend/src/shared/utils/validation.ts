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
  return /^[A-Z]{3}\d{4}$/.test(normalized);
};

export const isValidYear = (year: number): boolean => {
  const currentYear = new Date().getFullYear();
  return year >= 1900 && year <= currentYear + 1;
};

export const isValidQR = (qr: string): boolean => {
  return qr.trim().length > 0;
};
