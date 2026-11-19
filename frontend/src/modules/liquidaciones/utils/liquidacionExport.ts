import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDateTime, formatNumber } from '@/shared/utils/format';
import { formatMaterialType } from '@/modules/materiales/utils/materialLabels';
import { LiquidacionDetalle } from '../types';
import { formatearDia, formatearDinero } from './liquidacion';
import { getLogoDataUrl, getLogoSize } from './liquidacionViajePdf';

const nombreCliente = (l: LiquidacionDetalle) => l.cliente?.companyname || l.cliente?.name || '—';
const nombreArchivo = (l: LiquidacionDetalle, ext: string) =>
  `Liquidacion_${l.codigo}${l.estado === 'ANULADA' ? '_ANULADA' : ''}.${ext}`;
const m3 = (valor: number | null) => (valor != null ? formatNumber(valor) : '—');
const material = (valor: string | null) => (valor ? formatMaterialType(valor) : '—');

/** PDF de una liquidación: cabecera, viajes con precio, total y auditoría. */
export const generarPdfLiquidacion = async (l: LiquidacionDetalle) => {
  const doc = new jsPDF('l', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;

  try {
    const logo = await getLogoDataUrl();
    const { width, height } = await getLogoSize();
    const ratio = Math.min(70 / width, 22 / height);
    doc.addImage(logo, 'PNG', margin, 8, width * ratio, height * ratio);
  } catch {
    // Sin logo el PDF sale igual.
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text(`Liquidación ${l.codigo}`, pageWidth - margin, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Emitido: ${formatDateTime(new Date().toISOString())}`, pageWidth - margin, 21, {
    align: 'right',
  });

  if (l.estado === 'ANULADA') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(200, 30, 30);
    doc.text('ANULADA', pageWidth - margin, 28, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  }

  autoTable(doc, {
    startY: 34,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32 }, 2: { fontStyle: 'bold', cellWidth: 32 } },
    body: [
      ['Obra', l.obra?.name || '—', 'Fecha', formatearDia(l.fecha)],
      ['Cliente', nombreCliente(l), 'RUC', l.cliente?.ruc || '—'],
      ['Viajes', String(l.viajes.length), 'Monto total', formatearDinero(l.montoTotal)],
      ['Observación', l.observacion || '—', 'Estado', l.estado === 'ANULADA' ? 'Anulada' : 'Activa'],
    ],
  });

  const despuesCabecera =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60;

  autoTable(doc, {
    startY: despuesCabecera + 4,
    head: [['Código', 'Placa', 'ID Vehículo', 'Conductor', 'Material', 'Salida', 'Llegada', 'm³ Sal', 'm³ Lleg', 'Nota', 'Precio']],
    body: l.viajes.map((v) => [
      v.codigo || `#${v.tripId}`,
      v.placa || '—',
      v.vehicleid || '—',
      v.conductor || '—',
      material(v.material),
      v.salida ? formatDateTime(v.salida) : '—',
      v.llegada ? formatDateTime(v.llegada) : '—',
      m3(v.m3Salida),
      m3(v.m3Llegada),
      v.notaLiquidador || '',
      formatearDinero(v.precio),
    ]),
    foot: [['', '', '', '', '', '', '', '', '', 'Total', formatearDinero(l.montoTotal)]],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    footStyles: { fillColor: [236, 253, 245], textColor: [4, 120, 87], fontStyle: 'bold' },
    columnStyles: { 9: { cellWidth: 40 }, 10: { halign: 'right' } },
  });

  let y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100) + 8;
  const linea = (texto: string) => {
    if (y > doc.internal.pageSize.getHeight() - 12) {
      doc.addPage();
      y = 15;
    }
    doc.text(texto, margin, y);
    y += 5;
  };
  doc.setFontSize(8);
  doc.setTextColor(90);
  linea(`Creada por ${l.creadoPor?.name ?? '—'} el ${formatDateTime(l.createdAt)}`);
  if (l.editadoEn) linea(`Última edición por ${l.editadoPor?.name ?? '—'} el ${formatDateTime(l.editadoEn)}`);
  if (l.anuladaEn) {
    linea(`Anulada por ${l.anuladaPor?.name ?? '—'} el ${formatDateTime(l.anuladaEn)}`);
    linea(`Motivo de la anulación: ${l.motivoAnulacion ?? '—'}`);
  }

  doc.save(nombreArchivo(l, 'pdf'));
};

/** Excel de una liquidación: hoja Resumen y hoja Viajes (precios como número). */
export const generarExcelLiquidacion = (l: LiquidacionDetalle) => {
  const resumen = XLSX.utils.aoa_to_sheet([
    ['Liquidación', l.codigo],
    ['Estado', l.estado === 'ANULADA' ? 'Anulada' : 'Activa'],
    ['Fecha', formatearDia(l.fecha)],
    ['Obra', l.obra?.name || '—'],
    ['Cliente', nombreCliente(l)],
    ['RUC', l.cliente?.ruc || '—'],
    ['Viajes', l.viajes.length],
    ['Monto total', l.montoTotal],
    ['Observación', l.observacion || ''],
    ['Creada por', `${l.creadoPor?.name ?? '—'} (${formatDateTime(l.createdAt)})`],
    ...(l.editadoEn ? [['Última edición', `${l.editadoPor?.name ?? '—'} (${formatDateTime(l.editadoEn)})`]] : []),
    ...(l.anuladaEn
      ? [
          ['Anulada por', `${l.anuladaPor?.name ?? '—'} (${formatDateTime(l.anuladaEn)})`],
          ['Motivo de la anulación', l.motivoAnulacion ?? ''],
        ]
      : []),
  ]);

  const viajes = XLSX.utils.json_to_sheet(
    l.viajes.map((v) => ({
      Código: v.codigo || `#${v.tripId}`,
      Placa: v.placa || '',
      'ID Vehículo': v.vehicleid || '',
      Conductor: v.conductor || '',
      Material: material(v.material),
      Salida: v.salida ? formatDateTime(v.salida) : '',
      Llegada: v.llegada ? formatDateTime(v.llegada) : '',
      'm³ Salida': v.m3Salida ?? '',
      'm³ Llegada': v.m3Llegada ?? '',
      'Nota del liquidador': v.notaLiquidador || '',
      Precio: v.precio,
    })),
  );
  XLSX.utils.sheet_add_aoa(viajes, [['', '', '', '', '', '', '', '', '', 'Total', l.montoTotal]], {
    origin: -1,
  });

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, resumen, 'Resumen');
  XLSX.utils.book_append_sheet(libro, viajes, 'Viajes');
  XLSX.writeFile(libro, nombreArchivo(l, 'xlsx'));
};
