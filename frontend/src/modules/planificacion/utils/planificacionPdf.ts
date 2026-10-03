import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, formatDateTime } from '@/shared/utils/format';
import { formatMaterialType } from '@/modules/materiales/utils/materialLabels';
import {
  VEHICLE_COMPANY_LABELS,
  inferVehicleCompany,
  normalizeVehicleType,
} from '@/modules/vehicles/types';
import logoUrl from '@/img/Ciudad Rodrigo logo.png';
import { ConsumoMaterialPlanificacion, Planificacion, ViajePlanificacion } from '../types';

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

const numero = (valor?: number | null) =>
  valor == null ? '—' : valor.toLocaleString('es-EC', { maximumFractionDigits: 2 });

type Vehiculo = NonNullable<Planificacion['vehicles']>[number];

const empresaDe = (vehicle: Vehiculo) => {
  const company =
    vehicle.company ??
    inferVehicleCompany(`${vehicle.owner?.companyname ?? ''} ${vehicle.owner?.name ?? ''}`) ??
    inferVehicleCompany(vehicle.vehicleid);
  return company ? VEHICLE_COMPANY_LABELS[company] : vehicle.owner?.companyname || '—';
};

export interface PlanificacionPdfData {
  planificacion: Planificacion;
  /** Etiqueta del estado tal como se ve en pantalla. */
  estado: string;
  consumo: ConsumoMaterialPlanificacion | null;
  viajes: ViajePlanificacion[];
  generadoPor?: string | null;
}

/** PDF de una planificación: el código va arriba a la izquierda. Sin distancia ni tiempo estimado. */
export const generatePlanificacionPdf = async ({
  planificacion,
  estado,
  consumo,
  viajes,
  generadoPor,
}: PlanificacionPdfData) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const anchoUtil = pageWidth - margin * 2;
  const codigo = planificacion.planningCode || `#${planificacion.id}`;

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
  doc.text('Planificación', margin + 88, 16);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Fecha de emisión: ${formatDateTime(new Date().toISOString())}`, margin + 88, 22);
  if (generadoPor) doc.text(`Generado por: ${generadoPor}`, margin + 88, 27);

  doc.setFontSize(14);
  doc.setTextColor(20);
  doc.setFont('helvetica', 'bold');
  doc.text(codigo, margin, 42);
  doc.setFont('helvetica', 'normal');

  doc.setDrawColor(230);
  doc.line(margin, 47, pageWidth - margin, 47);

  let currentY = 56;
  const finalY = () =>
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? currentY;
  const titulo = (texto: string) => {
    if (currentY > 265) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFontSize(12);
    doc.setTextColor(30);
    doc.text(texto, margin, currentY);
  };
  const estiloTabla = {
    theme: 'grid' as const,
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' as const },
    headStyles: { fillColor: [37, 99, 235] as [number, number, number], textColor: 255 },
    footStyles: {
      fillColor: [243, 244, 246] as [number, number, number],
      textColor: 20,
      fontStyle: 'bold' as const,
    },
    tableWidth: anchoUtil,
    margin: { left: margin, right: margin },
  };

  // ─── Datos generales ─────────────────────────────────────────────────────────
  const cliente = planificacion.client;
  titulo('Datos generales');
  autoTable(doc, {
    ...estiloTabla,
    startY: currentY + 4,
    head: [['Campo', 'Detalle']],
    body: [
      ['Código', codigo],
      ['Obra', planificacion.constSite?.name || '—'],
      ['Cliente', cliente?.companyname || cliente?.name || '—'],
      ['RUC', cliente?.ruc || '—'],
      ['Fecha inicio', planificacion.startDate ? formatDate(planificacion.startDate) : '—'],
      ['Fecha fin', planificacion.endDate ? formatDate(planificacion.endDate) : '—'],
      ['Estado', estado],
      ['N° factura', planificacion.numeroFactura || '—'],
      ['Descripción', planificacion.description || '—'],
    ],
    columnStyles: { 0: { cellWidth: 40 } },
  });
  currentY = finalY() + 10;

  // ─── Vehículos ───────────────────────────────────────────────────────────────
  const vehiculos = planificacion.vehicles ?? [];
  const canteraDe = (vehicle: Vehiculo) => {
    const canteraId = planificacion.vehicleCanteras?.find(
      (vc) => vc.vehicleId === String(vehicle.id),
    )?.canteraId;
    if (!canteraId) return '—';
    const pc = planificacion.canteras?.find(
      (c: { canteraId: number }) => String(c.canteraId) === canteraId,
    );
    return pc?.cantera?.nombre || `Cantera #${canteraId}`;
  };
  const internos = vehiculos.filter((v) => normalizeVehicleType(v.type) === 'INTERNO').length;

  titulo(`Vehículos (${vehiculos.length})`);
  autoTable(doc, {
    ...estiloTabla,
    startY: currentY + 4,
    head: [['N°', 'ID vehículo', 'Placa', 'Conductor', 'Cap. m³', 'Tipo', 'Empresa / propietario', 'Cantera']],
    body: vehiculos.length
      ? vehiculos.map((v, i) => [
          String(i + 1),
          v.vehicleid || '—',
          v.plate || '—',
          v.driver?.name || 'Sin conductor',
          numero(v.capacity),
          normalizeVehicleType(v.type) === 'INTERNO' ? 'Interno' : 'Externo',
          empresaDe(v),
          canteraDe(v),
        ])
      : [[{ content: 'Sin vehículos asignados', colSpan: 8 }]],
    foot: [
      [
        {
          content: `Internos: ${internos}   Externos: ${vehiculos.length - internos}   Total: ${vehiculos.length}`,
          colSpan: 8,
        },
      ],
    ],
  });
  currentY = finalY() + 10;

  // ─── Consumo de material ─────────────────────────────────────────────────────
  titulo('Consumo de material');
  const filasConsumo =
    consumo?.canteras.flatMap((c) =>
      c.materiales.map((m) => [
        c.nombre,
        m.material?.materialType ? formatMaterialType(m.material.materialType) : '—',
        numero(m.asignadoM3),
        numero(m.consumidoEnPlanificacionM3),
        numero(m.disponibleM3),
        String(m.viajes),
      ]),
    ) ?? [];
  autoTable(doc, {
    ...estiloTabla,
    startY: currentY + 4,
    head: [['Cantera', 'Material', 'Asignado m³', 'Consumido m³', 'Disponible m³', 'Viajes']],
    body: filasConsumo.length
      ? filasConsumo
      : [[{ content: 'Sin consumo registrado', colSpan: 6 }]],
    foot: consumo
      ? [
          [
            { content: 'Total', colSpan: 3 },
            numero(consumo.totales.consumidoM3),
            '',
            String(consumo.totales.viajes),
          ],
        ]
      : undefined,
  });
  currentY = finalY() + 10;

  // ─── Viajes realizados ───────────────────────────────────────────────────────
  titulo(`Viajes realizados (${viajes.length})`);
  const totalSalida = viajes.reduce((acc, v) => acc + (v.m3Salida ?? 0), 0);
  const totalLlegada = viajes.reduce((acc, v) => acc + (v.m3Llegada ?? 0), 0);
  autoTable(doc, {
    ...estiloTabla,
    startY: currentY + 4,
    styles: { ...estiloTabla.styles, fontSize: 7.5 },
    head: [['Código', 'Salida', 'Llegada', 'Placa', 'Conductor', 'Material', 'm³ sal.', 'm³ lleg.']],
    body: viajes.length
      ? viajes.map((v) => [
          v.codigo || `#${v.id}`,
          formatDateTime(v.departureAt) || '—',
          v.arrivalAt ? formatDateTime(v.arrivalAt) : 'Pendiente',
          v.plate || v.vehicleid || '—',
          v.conductor || '—',
          v.materialType ? formatMaterialType(v.materialType) : '—',
          numero(v.m3Salida),
          numero(v.m3Llegada),
        ])
      : [[{ content: 'Sin viajes registrados', colSpan: 8 }]],
    foot: viajes.length
      ? [[{ content: 'Total', colSpan: 6 }, numero(totalSalida), numero(totalLlegada)]]
      : undefined,
  });

  doc.save(`Planificacion_${codigo.replace('#', '')}.pdf`);
};
