import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateTime, formatNumber } from '@/shared/utils/format';
import { formatMaterialType } from '@/modules/materiales/utils/materialLabels';
import logoUrl from '@/img/Ciudad Rodrigo logo.png';
import { VentaCantera } from '../types';
import { resolveQrUrl } from './qrZip';

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

const tipoVehiculo = (venta: VentaCantera) => {
  const tipo = venta.vehicle?.type;
  if (tipo === 'INTERNO') return 'Interno';
  if (tipo === 'EXTERNO') return 'Externo';
  return 'Sin vincular al catálogo';
};

export interface VentaPdfOptions {
  generadoPor?: string | null;
}

/** PDF de un viaje de venta: su código y la orden a la que pertenece van arriba a la izquierda. */
export const generateVentaPdf = async (venta: VentaCantera, options: VentaPdfOptions = {}) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const codigo = venta.codigo || `#${venta.id}`;

  try {
    const logo = await getLogoDataUrl();
    const { width, height } = await getLogoSize();
    const ratio = Math.min(80 / width, 26 / height);
    doc.addImage(logo, 'PNG', margin, 8, width * ratio, height * ratio);
  } catch {
    // Si falla el logo, el PDF se genera igual.
  }

  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text('Viaje de venta de material', margin + 88, 16);

  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Fecha de emisión: ${formatDateTime(new Date().toISOString())}`, margin + 88, 22);
  if (options.generadoPor) {
    doc.text(`Generado por: ${options.generadoPor}`, margin + 88, 27);
  }

  doc.setFontSize(13);
  doc.setTextColor(20);
  doc.setFont('helvetica', 'bold');
  doc.text(`Viaje: ${codigo}`, margin, 41);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text(`Orden: ${venta.orden?.codigo ?? 'Sin orden'}`, margin, 47);

  doc.setDrawColor(230);
  doc.line(margin, 51, pageWidth - margin, 51);

  let currentY = 61;

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

  addSection('Información general', [
    ['Código de viaje', codigo],
    ['Orden', venta.orden?.codigo ?? 'Sin orden'],
    ['Comprador', venta.comprador ?? '—'],
    ['RUC', venta.compradorCliente?.ruc ?? '—'],
    ['Obra', venta.constSite?.name ?? '—'],
    ['Registrado por', venta.user?.name ?? '—'],
  ]);

  addSection('Despacho', [
    ['Fecha y hora', formatDateTime(venta.capturedAt) || '—'],
    ['Cantera', venta.cantera?.nombre ?? '—'],
    ['Proveedor', venta.cantera?.materialProvider?.razonsocial ?? '—'],
    ['Material', venta.material?.materialType ? formatMaterialType(venta.material.materialType) : '—'],
    ['m³', formatNumber(venta.m3 ?? 0)],
    ['Observación', venta.observation ?? '—'],
    ['Latitud', venta.lat != null ? String(venta.lat) : '—'],
    ['Longitud', venta.lng != null ? String(venta.lng) : '—'],
  ]);

  addSection('Vehículo', [
    ['ID vehículo', venta.vehicleIdText],
    ['Placa', venta.plate ?? '—'],
    ['Tipo', tipoVehiculo(venta)],
    ['Chofer', venta.driverName ?? '—'],
  ]);

  addSection('Fotos (links)', [
    ['Placa', resolveQrUrl(venta.platePath) || 'Sin foto'],
    ['Material', resolveQrUrl(venta.materialPath) || 'Sin foto'],
    ['Conductor', resolveQrUrl(venta.driverPath) || 'Sin foto'],
    ['Vehículo', resolveQrUrl(venta.vehiclePath) || 'Sin foto'],
  ]);

  doc.save(`Venta_${codigo.replace('#', '')}.pdf`);
};
