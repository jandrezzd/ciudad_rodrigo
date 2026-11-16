import { API_BASE_URL } from '@/config/constants';

/**
 * Base para pedir al backend los archivos de `uploads/` (fotos, QR, facturas).
 *
 * Se usa la URL del API completa, con su ruta: en producción el backend está
 * detrás de `https://app.ciudadrodrigo.com.ec/sct-api/` y Nginx no conoce
 * `/uploads` en la raíz del dominio. Quedarse solo con el origin (quitarle
 * `/sct-api`) o con el hostname (quitarle el puerto en local) da 404.
 */
export const getBackendBaseUrl = () => {
  const absoluta = new URL(API_BASE_URL, window.location.origin).href;
  // Mismo criterio que el detalle de transporte, que ya funcionaba: un `/api`
  // final es el prefijo del API, no parte de la ruta de los archivos.
  return absoluta.replace(/\/+$/, '').replace(/\/api$/i, '');
};

/** Ruta guardada en la base (`uploads/qr/VE-039.png`) → URL descargable. */
export const resolveBackendFileUrl = (rawUrl?: string | null): string | null => {
  if (!rawUrl) return null;
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  return `${getBackendBaseUrl()}/${rawUrl.replace(/^\/+/, '')}`;
};
