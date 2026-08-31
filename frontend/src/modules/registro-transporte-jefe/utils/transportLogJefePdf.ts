import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import axiosInstance from '@/config/axios';
import { formatDateTime, formatNumber } from '@/shared/utils/format';
import { formatMaterialType } from '@/modules/materiales/utils/materialLabels';
import logoUrl from '@/img/Ciudad Rodrigo logo.png';
import { TransportLog } from '../types';

type DisplayTransportStatus = 'EN_PROGRESO' | 'COMPLETADO' | 'CANCELADO' | 'ALERTA' | 'REVISADO';

const statusLabels: Record<string, string> = {
  IN_PROGRESS: 'En progreso',
  EN_PROGRESO: 'En progreso',
  COMPLETED: 'Completado',
  COMPLETADO: 'Completado',
  CANCELLED: 'Cancelado',
  CANCELADO: 'Cancelado',
  ALERTA: 'Alerta',
  REVISADO: 'Revisado',
};

const resolveMaterialLabel = (log: TransportLog) => {
  if (log.material?.materialType) return formatMaterialType(log.material.materialType);
  return '—';
};

// Resuelve los valores M3 usando deviationM3 calculado por el backend
const resolveM3Values = (log: TransportLog) => {
  const departure = log.departureM3Corrected ?? log.departureM3 ?? null;
  const arrival = log.arrivalM3Corrected ?? log.arrivalM3 ?? null;
  // Prioridad: deviationM3 del backend (calculado automáticamente al registrar llegada o corregir)
  const difference = log.deviationM3 !== undefined && log.deviationM3 !== null
    ? log.deviationM3
    : (departure !== null && arrival !== null ? arrival - departure : null);
  return { departure, arrival, difference };
};

const isDeviationAlert = (difference: number | null) => {
  return difference !== null && Math.abs(difference) >= 1;
};

const normalizeTransportStatus = (status?: TransportLog['status'] | null): DisplayTransportStatus => {
  if (!status) return 'EN_PROGRESO';
  if (status === 'IN_PROGRESS' || status === 'EN_PROGRESO') return 'EN_PROGRESO';
  if (status === 'COMPLETED' || status === 'COMPLETADO') return 'COMPLETADO';
  if (status === 'CANCELLED' || status === 'CANCELADO') return 'CANCELADO';
  if (status === 'ALERTA') return 'ALERTA';
  if (status === 'REVISADO') return 'REVISADO';
  return 'EN_PROGRESO';
};

const resolveDisplayStatus = (log: TransportLog): DisplayTransportStatus => {
  const normalized = normalizeTransportStatus(log.status);
  if (normalized === 'CANCELADO') return 'CANCELADO';
  const hasCorrections = log.departureM3Corrected != null || log.arrivalM3Corrected != null;
  if (hasCorrections) return 'REVISADO';
  if (normalized === 'REVISADO') return 'REVISADO';
  const resolved = resolveM3Values(log);
  const hasDeviation = isDeviationAlert(resolved.difference);
  if (hasDeviation) return 'ALERTA';

  if (normalized === 'COMPLETADO') return 'COMPLETADO';

  if (log.arrivalAt) return 'COMPLETADO';

  return 'EN_PROGRESO';
};

const resolveReportStatus = (log: TransportLog) => {
  const displayStatus = resolveDisplayStatus(log);
  return statusLabels[displayStatus] || displayStatus;
};

const resolveTransportUrl = (rawUrl?: string | null) => {
  if (!rawUrl) return '';

  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;

  const normalized = rawUrl.replace(/^\/+/, '');

  const baseUrl = axiosInstance.defaults.baseURL ?? '';
  const urlObj = new URL(baseUrl);
  const baseOrigin = `${urlObj.protocol}//${urlObj.hostname}`;

  if (normalized.startsWith('uploads/')) {
    return `${baseOrigin}/${normalized}`;
  }

  if (normalized.startsWith('transport/')) {
    return `${baseOrigin}/uploads/${normalized}`;
  }

  return `${baseOrigin}/uploads/transport/${normalized}`;
};

let cachedLogoDataUrl: string | null = null;
let cachedLogoSize: { width: number; height: number } | null = null;
const getLogoDataUrl = async () => {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  const response = await fetch(logoUrl);
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('No se pudo cargar el logo'));
    reader.readAsDataURL(blob);
  });
  cachedLogoDataUrl = dataUrl;
  return dataUrl;
};

const getLogoSize = async () => {
  if (cachedLogoSize) return cachedLogoSize;
  const dataUrl = await getLogoDataUrl();
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error('No se pudo leer el tamaño del logo'));
    img.src = dataUrl;
  });
  cachedLogoSize = size;
  return size;
};

const buildFileName = (log: TransportLog) => {
  const plate = log.vehicle?.plate || log.vehicleId || `transporte-${log.id}`;
  return `RegistroTransporte_${plate}_${log.id}.pdf`;
};

export const generateTransportLogJefePdf = async (log: TransportLog) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  try {
    const logo = await getLogoDataUrl();
    const { width, height } = await getLogoSize();
    const maxLogoWidth = 80;
    const maxLogoHeight = 26;
    const ratio = Math.min(maxLogoWidth / width, maxLogoHeight / height);
    const logoWidth = width * ratio;
    const logoHeight = height * ratio;
    doc.addImage(logo, 'PNG', margin, 8, logoWidth, logoHeight);
  } catch {
    // Si falla el logo, continuamos sin bloquear el PDF.
  }

  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text('Registro de Transporte', margin + 88, 16);

  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`ID: ${log.id}`, margin + 88, 22);
  doc.text(`Fecha de emisión: ${formatDateTime(new Date().toISOString())}`, margin + 88, 27);

  doc.setDrawColor(230);
  doc.line(margin, 33, pageWidth - margin, 33);

  let currentY = 45;

  const addSection = (title: string, rows: Array<[string, string]>) => {
    doc.setFontSize(12);
    doc.setTextColor(30);
    doc.text(title, margin, currentY);

    autoTable(doc, {
      startY: currentY + 4,
      head: [['Campo', 'Detalle']],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: pageWidth - margin * 2 - 45 },
      },
      tableWidth: pageWidth - margin * 2,
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    currentY = (finalY ?? currentY) + 10;
  };

  const resolvedM3 = resolveM3Values(log);

  addSection('Información general', [
    ['Vehículo', log.vehicle?.plate || String(log.vehicleId) || '—'],
    ['Conductor', log.driver?.name || log.vehicle?.driver?.name || '—'],
    ['Proveedor', log.owner?.companyname || '—'],
    ['Cliente', log.client?.companyname || '—'],
    ['Obra', log.constSite?.name || '—'],
    ['Material', resolveMaterialLabel(log)],
    ['Estado', resolveReportStatus(log)],
    ['Registrado en Cantera por', log.user?.name || '—'],
    ['Registrado en Obra por', log.userArrival?.name || 'Pendiente'],
  ]);

  addSection('Datos de salida', [
    ['Fecha y hora', formatDateTime(log.departureAt || log.createdAt || '') || '—'],
    ['M3 salida', formatNumber(log.departureM3 || 0)],
    ['M3 salida corregido', log.departureM3Corrected != null ? formatNumber(log.departureM3Corrected) : '—'],
    ['Latitud', log.departureLat?.toString() || '—'],
    ['Longitud', log.departureLng?.toString() || '—'],
  ]);

  addSection('Datos de llegada', [
    ['Fecha y hora', log.arrivalAt ? formatDateTime(log.arrivalAt) : 'Pendiente'],
    ['M3 llegada', log.arrivalM3 ? formatNumber(log.arrivalM3) : '—'],
    ['M3 llegada corregido', log.arrivalM3Corrected != null ? formatNumber(log.arrivalM3Corrected) : '—'],
    ['Desviación M3 (backend)', resolvedM3.difference != null ? `${formatNumber(resolvedM3.difference)} m³` : '—'],
    ['Latitud', log.arrivalLat?.toString() || '—'],
    ['Longitud', log.arrivalLng?.toString() || '—'],
    ['Abscisa', log.abscisa != null ? String(log.abscisa) : '—'],
  ]);

  addSection('Fotos (links)', [
    ['Conductor (salida)', resolveTransportUrl(log.departureDriverPhoto) || 'Sin foto'],
    ['Vehículo (salida)', resolveTransportUrl(log.departureVehiclePhoto) || 'Sin foto'],
    ['Placa (salida)', resolveTransportUrl(log.departurePlatePhoto) || 'Sin foto'],
    ['Material (salida)', resolveTransportUrl(log.departureMaterialPhoto1 ?? log.departureMaterialPhoto) || 'Sin foto'],
    ['Conductor (llegada)', resolveTransportUrl(log.arrivalDriverPhoto) || 'Sin foto'],
    ['Vehículo (llegada)', resolveTransportUrl(log.arrivalVehiclePhoto) || 'Sin foto'],
    ['Placa (llegada)', resolveTransportUrl(log.arrivalPlatePhoto) || 'Sin foto'],
    ['Material (llegada)', resolveTransportUrl(log.arrivalMaterialPhoto1 ?? log.arrivalMaterialPhoto) || 'Sin foto'],
  ]);

  doc.save(buildFileName(log));
};
