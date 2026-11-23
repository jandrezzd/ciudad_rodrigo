import axios from 'axios';

const ZONA = 'America/Guayaquil';

/** Hoy en Ecuador, AAAA-MM-DD. */
export const hoyEcuador = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: ZONA });

/** Primer día del mes actual en Ecuador, AAAA-MM-DD. */
export const inicioMesEcuador = () => `${hoyEcuador().slice(0, 8)}01`;

/** AAAA-MM-DD → dd/mm/aaaa (sin pasar por Date: no se corre de día). */
export const formatearDia = (dia?: string | null) => {
  if (!dia) return '—';
  const [a, m, d] = dia.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

/** Dólares con separadores de Ecuador: $1.234,50 */
export const formatearDinero = (valor: number) =>
  valor.toLocaleString('es-EC', { style: 'currency', currency: 'USD' });

/** Hasta 7 enteros y 2 decimales; vacío permitido mientras se escribe. */
const PRECIO_EN_EDICION = /^\d{0,7}(\.\d{0,2})?$/;

/** Acepta lo que el usuario escribe en un campo de precio (coma → punto). */
export const normalizarPrecio = (texto: string): string | null => {
  const limpio = texto.replace(',', '.');
  return PRECIO_EN_EDICION.test(limpio) ? limpio : null;
};

/** Precio válido para guardar: número > 0. null si está vacío o no es válido. */
export const precioValido = (texto: string | undefined): number | null => {
  if (!texto) return null;
  const n = Number(texto);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

/** Suma en centavos para no acumular errores de redondeo. */
export const sumarPrecios = (precios: number[]) =>
  precios.reduce((suma, p) => suma + Math.round(p * 100), 0) / 100;

/**
 * Subtotal de un viaje: m³ de llegada × precio unitario, redondeado al
 * centavo. Misma fórmula que el backend (`subtotalCentavos`).
 */
export const subtotalViaje = (m3: number, precioUnitario: number) =>
  Math.round(m3 * precioUnitario * 100) / 100;

/**
 * m³ y subtotal de un viaje de una liquidación. Las fotos de anulación
 * anteriores al precio unitario no traen `m3`/`subtotal`: se calculan.
 */
export const montosViajeLiquidado = (v: {
  m3?: number | null;
  m3Llegada: number | null;
  precio: number;
  subtotal?: number | null;
}) => {
  const m3 = v.m3 ?? v.m3Llegada ?? 0;
  return { m3, subtotal: v.subtotal ?? subtotalViaje(m3, v.precio) };
};

/** Mensaje del backend ({ message }) o uno genérico. */
export const mensajeDeError = (error: unknown, porDefecto: string) => {
  if (axios.isAxiosError(error)) {
    const mensaje = error.response?.data?.message;
    if (typeof mensaje === 'string' && mensaje) return mensaje;
  }
  return porDefecto;
};
