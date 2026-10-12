import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateTime } from '@/shared/utils/format';
import { formatMaterialType } from '@/modules/materiales/utils/materialLabels';
import logoUrl from '@/img/Ciudad Rodrigo logo.png';
import { EMPRESA_VENDEDORA_LABELS, VentaOrden } from '../types';

const ESTADO_LABELS: Record<VentaOrden['estado'], string> = {
  ABIERTA: 'Abierta',
  COMPLETADA: 'Completada',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

interface DespachoFila {
  codigo: string;
  plate: string;
  material: string;
  m3: number;
  capturedAt: string;
}

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

export interface GenerarVentaOrdenPdfOpciones {
  /** Detalle de cada despacho real (placa, m³, hora), no las placas escritas a
   *  mano en la orden — esas no tienen m³ ni hora porque no son un despacho. */
  incluirVehiculos: boolean;
  /** Nombre del usuario que está generando el reporte en este momento — solo
   *  sale impreso en el PDF, no se guarda en ningún lado. */
  generadoPor?: string | null;
}

export const generateVentaOrdenPdf = async (
  orden: VentaOrden,
  opciones: GenerarVentaOrdenPdfOpciones,
) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  try {
    const logo = await getLogoDataUrl();
    const { width, height } = await getLogoSize();
    const maxLogoWidth = 80;
    const maxLogoHeight = 26;
    const ratio = Math.min(maxLogoWidth / width, maxLogoHeight / height);
    doc.addImage(logo, 'PNG', margin, 8, width * ratio, height * ratio);
  } catch {
    // Si falla el logo, seguimos sin bloquear el PDF.
  }

  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text('Reporte de orden de venta', margin + 88, 16);

  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Orden: ${orden.codigo}`, margin + 88, 22);
  doc.text(`Fecha de emisión: ${formatDateTime(new Date().toISOString())}`, margin + 88, 27);
  if (opciones.generadoPor) {
    doc.text(`Generado por: ${opciones.generadoPor}`, margin + 88, 32);
  }

  doc.setDrawColor(230);
  doc.line(margin, 38, pageWidth - margin, 38);

  let currentY = 48;

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

  const cliente = orden.client.companyname || orden.client.name;

  addSection('Información de la orden', [
    ['Código', orden.codigo],
    ['Cliente', cliente],
    ['Obra', orden.constSite.name],
    ...(orden.empresaVendedora
      ? ([['Empresa vendedora', EMPRESA_VENDEDORA_LABELS[orden.empresaVendedora]]] as [
          string,
          string,
        ][])
      : []),
    ...(orden.transportista
      ? ([['Transportista', orden.transportista.name]] as [string, string][])
      : []),
    ['Estado', ESTADO_LABELS[orden.estado]],
    ['Fecha de apertura', formatDateTime(orden.fechaApertura) || '—'],
    ...(orden.fechaCierre
      ? ([['Fecha de cierre', formatDateTime(orden.fechaCierre) || '—']] as [string, string][])
      : []),
    ...(orden.motivoCierre
      ? ([['Motivo de cierre', orden.motivoCierre]] as [string, string][])
      : []),
    ...(orden.observacion ? ([['Observación', orden.observacion]] as [string, string][]) : []),
    // Vehículos asignados a la orden (lo que se espera que despache), distinto
    // de los despachos reales de abajo. Las órdenes viejas solo tienen placas.
    ...(orden.vehiculos?.length
      ? ([
          [
            'Vehículos asignados',
            orden.vehiculos
              .map((v) => `${v.vehicleid} · ${v.plate} · ${v.capacity} m³`)
              .join('\n'),
          ],
        ] as [string, string][])
      : orden.placas.length > 0
        ? ([['Placas informadas', orden.placas.join(', ')]] as [string, string][])
        : []),
  ]);

  // ─── Materiales ─────────────────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text(
    `Materiales (${orden.items.length} línea${orden.items.length === 1 ? '' : 's'})`,
    margin,
    currentY,
  );

  autoTable(doc, {
    startY: currentY + 4,
    head: [['Material', 'Asignado m³', 'Despachado m³', 'Disponible m³']],
    body: orden.items.map((item) => [
      item.material?.materialType ? formatMaterialType(item.material.materialType) : '—',
      item.m3Asignados.toLocaleString('es-EC', { maximumFractionDigits: 3 }),
      item.despachadoM3.toLocaleString('es-EC', { maximumFractionDigits: 3 }),
      item.disponibleM3.toLocaleString('es-EC', { maximumFractionDigits: 3 }),
    ]),
    foot: [[
      'Total',
      orden.totales.asignadoM3.toLocaleString('es-EC', { maximumFractionDigits: 3 }),
      orden.totales.despachadoM3.toLocaleString('es-EC', { maximumFractionDigits: 3 }),
      orden.totales.disponibleM3.toLocaleString('es-EC', { maximumFractionDigits: 3 }),
    ]],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5, halign: 'right' },
    columnStyles: { 0: { halign: 'left' } },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: 'bold' },
    tableWidth: pageWidth - margin * 2,
  });

  currentY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? currentY) +
    10;

  // ─── Vehículos despachados (opcional) ───────────────────────────────────────
  // Placa + m³ + hora de cada despacho real, no solo la placa suelta: para eso
  // ya está "Placas informadas" arriba. Dos tablas lado a lado (no una sola
  // columna larga) para no gastar hojas de más si hubo muchos despachos.
  const despachos: DespachoFila[] = orden.items.flatMap((item) =>
    item.despachos.map((d) => ({
      codigo: d.codigo ?? '—',
      plate: d.plate,
      material: item.material?.materialType ? formatMaterialType(item.material.materialType) : '—',
      m3: d.m3,
      capturedAt: d.capturedAt,
    })),
  );
  despachos.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  if (opciones.incluirVehiculos && despachos.length > 0) {
    doc.setFontSize(12);
    doc.setTextColor(30);
    doc.text(
      `Vehículos despachados (${despachos.length})`,
      margin,
      currentY,
    );

    const startY = currentY + 4;
    const mitad = Math.ceil(despachos.length / 2);
    const izquierda = despachos.slice(0, mitad);
    const derecha = despachos.slice(mitad);
    const columnaAncho = (pageWidth - margin * 2 - 4) / 2;

    const filaTabla = (d: DespachoFila) => [
      d.codigo,
      d.plate,
      d.material,
      d.m3.toLocaleString('es-EC', { maximumFractionDigits: 2 }),
      formatDateTime(d.capturedAt) || '—',
    ];

    autoTable(doc, {
      startY,
      margin: { left: margin, right: pageWidth - margin - columnaAncho },
      tableWidth: columnaAncho,
      head: [['Viaje', 'Placa', 'Material', 'm³', 'Hora']],
      body: izquierda.map(filaTabla),
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.8 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    });
    const finalYIzquierda =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY;

    let finalYDerecha = startY;
    if (derecha.length > 0) {
      autoTable(doc, {
        startY,
        margin: { left: margin + columnaAncho + 4, right: margin },
        tableWidth: columnaAncho,
        head: [['Viaje', 'Placa', 'Material', 'm³', 'Hora']],
        body: derecha.map(filaTabla),
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 1.8 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      });
      finalYDerecha =
        (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY;
    }

    currentY = Math.max(finalYIzquierda, finalYDerecha) + 10;
  }

  doc.save(`OrdenVenta_${orden.codigo}.pdf`);
};
