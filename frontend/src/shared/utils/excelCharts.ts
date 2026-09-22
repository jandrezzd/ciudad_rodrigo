import * as ExcelJS from 'exceljs';

export interface ChartSeries {
  name: string;
  color: string;
  values: number[];
}

export interface GroupedBarChartOptions {
  title: string;
  categories: string[];
  series: ChartSeries[];
  valueSuffix?: string;
  width?: number;
  height?: number;
}

const truncateLabel = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * Dibuja un gráfico de barras (agrupadas si hay más de una serie) sobre un
 * canvas y lo devuelve como PNG en base64.
 *
 * No usa ninguna librería de gráficos (ni siquiera Highcharts, que el
 * proyecto ya tiene para el dashboard): acá el resultado tiene que ser una
 * imagen fija embebida en el Excel, no un gráfico interactivo en pantalla, y
 * exportar eso desde Highcharts (SVG → canvas, módulo de exportación) es más
 * trabajo que dibujar barras a mano para este caso puntual.
 */
export const renderGroupedBarChartPng = (opts: GroupedBarChartOptions): string => {
  const width = opts.width ?? 760;
  const height = opts.height ?? 420;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(opts.title, 16, 28);

  const hasLegend = opts.series.length > 1;
  const paddingLeft = 64;
  const paddingRight = 24;
  const paddingTop = hasLegend ? 60 : 46;
  const paddingBottom = 90;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxCategories = 14;
  const categories = opts.categories.slice(0, maxCategories);
  const series = opts.series.map((s) => ({ ...s, values: s.values.slice(0, maxCategories) }));

  if (!categories.length) {
    ctx.fillStyle = '#6B7280';
    ctx.font = '13px Arial, sans-serif';
    ctx.fillText('Sin datos para graficar.', 16, height / 2);
    return canvas.toDataURL('image/png');
  }

  const maxValue = Math.max(1, ...series.flatMap((s) => s.values));

  // Ejes
  ctx.strokeStyle = '#9CA3AF';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(paddingLeft, paddingTop);
  ctx.lineTo(paddingLeft, paddingTop + chartHeight);
  ctx.lineTo(paddingLeft + chartWidth, paddingTop + chartHeight);
  ctx.stroke();

  // Líneas guía y etiquetas del eje Y
  const steps = 4;
  ctx.font = '11px Arial, sans-serif';
  for (let i = 0; i <= steps; i++) {
    const y = paddingTop + chartHeight - (chartHeight * i) / steps;
    const value = (maxValue * i) / steps;
    ctx.strokeStyle = '#E5E7EB';
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(paddingLeft + chartWidth, y);
    ctx.stroke();
    ctx.fillStyle = '#6B7280';
    ctx.textAlign = 'right';
    ctx.fillText(value.toFixed(0), paddingLeft - 8, y + 4);
  }

  // Leyenda (solo si hay más de una serie, ej. asignado vs despachado)
  if (hasLegend) {
    let legendX = paddingLeft;
    const legendY = 44;
    ctx.font = '12px Arial, sans-serif';
    series.forEach((s) => {
      ctx.fillStyle = s.color;
      ctx.fillRect(legendX, legendY - 10, 10, 10);
      ctx.fillStyle = '#374151';
      ctx.textAlign = 'left';
      ctx.fillText(s.name, legendX + 14, legendY);
      legendX += ctx.measureText(s.name).width + 40;
    });
  }

  // Barras
  const groupCount = categories.length;
  const groupGap = 16;
  const groupWidth = (chartWidth - groupGap * (groupCount + 1)) / groupCount;
  const barGap = 4;
  const barWidth = series.length
    ? (groupWidth - barGap * (series.length - 1)) / series.length
    : groupWidth;

  categories.forEach((label, i) => {
    const groupX = paddingLeft + groupGap + i * (groupWidth + groupGap);

    series.forEach((s, si) => {
      const value = s.values[i] ?? 0;
      const barHeight = maxValue > 0 ? (value / maxValue) * chartHeight : 0;
      const x = groupX + si * (barWidth + barGap);
      const y = paddingTop + chartHeight - barHeight;

      ctx.fillStyle = s.color;
      ctx.fillRect(x, y, Math.max(barWidth, 1), barHeight);

      if (value > 0) {
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 10px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${value.toFixed(1)}${opts.valueSuffix ?? ''}`, x + barWidth / 2, y - 4);
      }
    });

    // Etiqueta de categoría, rotada para que quepan varias sin pisarse.
    ctx.save();
    ctx.translate(groupX + groupWidth / 2, paddingTop + chartHeight + 14);
    ctx.rotate(-Math.PI / 6);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#374151';
    ctx.font = '11px Arial, sans-serif';
    ctx.fillText(truncateLabel(label, 18), 0, 0);
    ctx.restore();
  });

  return canvas.toDataURL('image/png');
};

/** Inserta una imagen PNG (data URL) en una hoja, anclada a un rango de celdas. */
export const addPngImage = (
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  pngDataUrl: string,
  range: string
) => {
  const base64 = pngDataUrl.split(',')[1] ?? '';
  if (!base64) return;
  const imageId = workbook.addImage({ base64, extension: 'png' });
  worksheet.addImage(imageId, range);
};

/**
 * Arma el archivo final y dispara la descarga.
 *
 * `exceljs` no trae un `writeFile` de navegador como sí tenía `xlsx`: hay que
 * armar el Blob y el link de descarga a mano.
 */
export const downloadExcelWorkbook = async (
  workbook: ExcelJS.Workbook,
  filename: string
): Promise<void> => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
