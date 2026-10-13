import { useTheme } from '@/shared/context/ThemeContext';

/** Colores de los gráficos de Highcharts según el tema (no leen las clases de Tailwind). */
export interface ChartColors {
  bg: string;
  title: string;
  text: string;
  muted: string;
  axis: string;
  grid: string;
  marker: string;
  tooltipBg: string;
  tooltipText: string;
}

// Claro: los mismos colores que tenían los gráficos.
const LIGHT: ChartColors = {
  bg: '#ffffff',
  title: '#111827',
  text: '#374151',
  muted: '#6b7280',
  axis: '#e5e7eb',
  grid: '#f3f4f6',
  marker: '#ffffff',
  tooltipBg: '#1f2937',
  tooltipText: '#f9fafb',
};

// Oscuro: paleta night (tailwind.config.js). Fondo transparente = toma el de la tarjeta.
const DARK: ChartColors = {
  bg: 'transparent',
  title: '#e5e9f0',
  text: '#cbd5e1',
  muted: '#a0abbd',
  axis: '#2f3b4f',
  grid: '#263142',
  marker: '#1b2433',
  tooltipBg: '#0c121c',
  tooltipText: '#e5e9f0',
};

export const useChartColors = (): ChartColors => {
  const { isDark } = useTheme();
  return isDark ? DARK : LIGHT;
};
