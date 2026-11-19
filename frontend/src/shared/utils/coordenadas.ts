export interface Coordenadas {
  lat: number;
  lng: number;
}

export type ResultadoCoordenadas =
  | { ok: true; valor: Coordenadas | null }
  | { ok: false; error: string };

/** "latitud, longitud" con o sin espacios: el formato que copia Google Maps. */
const PATRON_COORDENADAS = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

/**
 * Texto pegado por el usuario → coordenadas.
 * Vacío = sin ubicación (válido: el campo es opcional).
 */
export const parseCoordenadas = (texto: string | null | undefined): ResultadoCoordenadas => {
  const limpio = (texto ?? '').trim();
  if (!limpio) return { ok: true, valor: null };

  const coincidencia = PATRON_COORDENADAS.exec(limpio);
  if (!coincidencia) {
    return {
      ok: false,
      error: 'Pega las coordenadas como "latitud, longitud". Ej: -0.9996084, -79.7662313',
    };
  }

  const lat = Number(coincidencia[1]);
  const lng = Number(coincidencia[2]);
  if (Math.abs(lat) > 90) {
    return { ok: false, error: 'La latitud debe estar entre -90 y 90.' };
  }
  if (Math.abs(lng) > 180) {
    return { ok: false, error: 'La longitud debe estar entre -180 y 180.' };
  }
  if (lat === 0 && lng === 0) {
    return { ok: false, error: '0, 0 no es una ubicación válida.' };
  }
  return { ok: true, valor: { lat, lng } };
};

export const formatCoordenadas = (lat: number, lng: number, decimales = 6) =>
  `${lat.toFixed(decimales)}, ${lng.toFixed(decimales)}`;

export const urlGoogleMaps = (lat: number, lng: number) =>
  `https://www.google.com/maps?q=${lat},${lng}`;

/** "850 m" o "1,2 km". */
export const formatearDistancia = (metros: number) =>
  metros < 1000
    ? `${Math.round(metros)} m`
    : `${(metros / 1000).toLocaleString('es-EC', { maximumFractionDigits: 1 })} km`;

/** Radio de tolerancia: entero de 20 a 5000 m. Devuelve el error o null. */
export const validarRadioLlegada = (texto: string | null | undefined): string | null => {
  const limpio = (texto ?? '').trim();
  if (!limpio) return 'Ingresa el radio de tolerancia en metros.';
  const valor = Number(limpio);
  if (!Number.isInteger(valor) || valor < 20 || valor > 5000) {
    return 'El radio debe ser un número entero entre 20 y 5000 m.';
  }
  return null;
};
