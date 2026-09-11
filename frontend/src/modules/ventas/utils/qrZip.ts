import JSZip from 'jszip';
import toast from 'react-hot-toast';
import axiosInstance from '@/config/axios';

/**
 * Descarga de los QR de venta como ZIP.
 *
 * Es una copia de la que usa VehiclesPage, no una extracción: refactorizar
 * aquella tocaría el flujo de QR de vehículos, que funciona, sin ganancia real.
 * El backend no arma ZIPs — devuelve las rutas y el navegador comprime.
 */
const resolveQrUrl = (rawUrl?: string | null) => {
  if (!rawUrl) return null;
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  const normalized = rawUrl.replace(/^\/+/, '');
  const baseUrl = axiosInstance.defaults.baseURL ?? window.location.origin;
  const baseOrigin = new URL(baseUrl, window.location.origin).origin;
  return `${baseOrigin}/${normalized}`;
};

export const downloadVentaQrZip = async (qrUrls: string[], zipName: string) => {
  if (!qrUrls.length) {
    toast.error('No hay QRs para descargar');
    return;
  }

  const zip = new JSZip();

  for (const rawUrl of qrUrls) {
    const resolvedUrl = resolveQrUrl(rawUrl);
    if (!resolvedUrl) continue;

    try {
      const response = await axiosInstance.get<ArrayBuffer>(resolvedUrl, {
        responseType: 'arraybuffer',
      });

      const filename = resolvedUrl.split('/').pop() || `qr_${Date.now()}.png`;
      zip.file(filename, response.data);
    } catch (error) {
      console.error(error);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const blobUrl = window.URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = zipName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
};

/** Descarga un solo PNG, para reimprimir el QR de una cantera puntual. */
export const downloadVentaQrImage = async (rawUrl: string, filename: string) => {
  const resolvedUrl = resolveQrUrl(rawUrl);
  if (!resolvedUrl) return;

  const response = await axiosInstance.get(resolvedUrl, { responseType: 'blob' });
  const blobUrl = window.URL.createObjectURL(response.data as Blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
};

export { resolveQrUrl };
