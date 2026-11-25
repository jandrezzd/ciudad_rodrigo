import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDateTime, formatNumber } from '@/shared/utils/format';
import { formatMaterialType } from '@/modules/materiales/utils/materialLabels';
import { LiquidacionDetalle } from '../types';
import { formatearDia, formatearDinero, montosViajeLiquidado } from './liquidacion';
import { getLogoDataUrl, getLogoSize } from './liquidacionViajePdf';
import { etiquetaEmpresa, getDuration } from './viaje';

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

  // Un viaje por fila. Subtotal = m³ de llegada × precio unitario.
  autoTable(doc, {
    startY: despuesCabecera + 4,
    head: [[
      'Código', 'Placa', 'ID Vehículo', 'Cantera', 'Salida', 'Obra', 'Llegada', 'Material',
      'm³ Sal', 'm³ Lleg', 'P. unit.', 'Subtotal',
    ]],
    body: l.viajes.map((v) => [
      v.codigo || `#${v.tripId}`,
      v.placa || '—',
      v.vehicleid || '—',
      v.cantera || '—',
      v.salida ? formatDateTime(v.salida) : '—',
      l.obra?.name || '—',
      v.llegada ? formatDateTime(v.llegada) : '—',
      material(v.material),
      m3(v.m3Salida),
      m3(v.m3Llegada),
      formatearDinero(v.precio),
      formatearDinero(montosViajeLiquidado(v).subtotal),
    ]),
    foot: [['', '', '', '', '', '', '', '', '', '', 'Total', formatearDinero(l.montoTotal)]],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
    // Encabezado gris pizarra y total sin fondo: más sobrio que el azul y el verde.
    headStyles: { fillColor: [153, 204, 255], textColor: [30, 41, 59], fontStyle: 'bold' },
    footStyles: { fillColor: [255, 255, 255], textColor: [30, 41, 59], fontStyle: 'bold' },
    columnStyles: { 10: { halign: 'right' }, 11: { halign: 'right' } },
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

/**
 * Excel de una liquidación: una sola hoja con un viaje por fila y las mismas
 * columnas (nombre y orden) que el Excel de Liquidaciones de viajes, más los
 * campos propios de la liquidación. Los montos van como número.
 */
export const generarExcelLiquidacion = (l: LiquidacionDetalle) => {
  const filas = l.viajes.map((v) => {
    const diferencia =
      v.m3Salida != null && v.m3Llegada != null
        ? Number((v.m3Llegada - v.m3Salida).toFixed(2))
        : null;

    return {
      Liquidación: l.codigo,
      Estado: l.estado === 'ANULADA' ? 'Anulada' : 'Activa',
      'Fecha liquidación': formatearDia(l.fecha),
      Código: v.codigo || `#${v.tripId}`,
      Planificación: v.planificacion || '—',
      'ID Vehículo': v.vehicleid || '—',
      Placa: v.placa || '—',
      Cantera: v.cantera || '—',
      Marca: v.marca || '—',
      Modelo: v.modelo || '—',
      Año: v.anio ?? '—',
      'Capacidad (m³)': v.capacidad ?? '—',
      Proveedor: v.proveedor || '—',
      Empresa: etiquetaEmpresa({
        company: v.empresa,
        ownerCompany: v.proveedor,
        ownerName: v.proveedorNombre,
        vehicleid: v.vehicleid,
      }),
      Cliente: nombreCliente(l),
      RUC: l.cliente?.ruc || '—',
      Obra: l.obra?.name || '—',
      Material: material(v.material),
      Abscisa: v.abscisa ?? '—',
      'Fecha/Salida': v.salida ? formatDateTime(v.salida) : '—',
      'Fecha/Llegada': v.llegada ? formatDateTime(v.llegada) : '—',
      'Tiempo Viaje': getDuration(v.salida, v.llegada),
      'M3 Salida': v.m3Salida ?? '—',
      'M3 Llegada': v.m3Llegada ?? '—',
      Diferencia: diferencia ?? '—',
      'P. unit. ($/m³)': v.precio,
      Subtotal: montosViajeLiquidado(v).subtotal,
      'Nota del liquidador': v.notaLiquidador || '—',
      Observación: l.observacion || '—',
      'Creada por': `${l.creadoPor?.name ?? '—'} (${formatDateTime(l.createdAt)})`,
      'Última edición': l.editadoEn
        ? `${l.editadoPor?.name ?? '—'} (${formatDateTime(l.editadoEn)})`
        : '—',
      ...(l.anuladaEn && {
        'Anulada por': `${l.anuladaPor?.name ?? '—'} (${formatDateTime(l.anuladaEn)})`,
        'Motivo de la anulación': l.motivoAnulacion || '—',
      }),
    };
  });

  const hoja = XLSX.utils.json_to_sheet(filas);

  // Fila final: "Total" bajo P. unit. y el monto bajo Subtotal.
  const columnas = Object.keys(filas[0] ?? {});
  const columnaTotal = columnas.indexOf('Subtotal');
  if (columnaTotal > 0) {
    XLSX.utils.sheet_add_aoa(
      hoja,
      [[...Array(columnaTotal - 1).fill(null), 'Total', l.montoTotal]],
      { origin: -1 },
    );
  }

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Liquidación');
  XLSX.writeFile(libro, nombreArchivo(l, 'xlsx'));
};
