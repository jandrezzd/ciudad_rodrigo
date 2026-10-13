import { useMemo } from 'react';
import HighchartsReact from 'highcharts-react-official';
import Highcharts from 'highcharts';
import { useChartColors } from '../utils/useChartColors';
import { mapDailyStats } from '../utils/chartUtils';

// ─── Props ────────────────────────────────────────────────────────────────────
interface DashboardSyncChartsProps {
  materialDelivered?: Record<string, number>;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export const DashboardSyncCharts = ({
  materialDelivered,
}: DashboardSyncChartsProps) => {

  const c = useChartColors();

  const options = useMemo<Highcharts.Options>(() => {
    const { labels, counts } = mapDailyStats(materialDelivered, 30);

    return {
      chart: {
        type: 'area',
        backgroundColor: c.bg,
        style: {
          fontFamily:
            '-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif',
        },
        animation: { duration: 600 },
        height: 380,
      },

      title: {
        text: 'Metros Cúbicos Transportados',
        align: 'left',
        style: {
          fontSize: '17px',
          fontWeight: '700',
          color: c.title,
        },
      },

      subtitle: {
        text: 'Volumen diario (m³) — últimos 30 días',
        align: 'left',
        style: {
          fontSize: '13px',
          color: c.muted,
        },
      },

      xAxis: {
        categories: labels,
        labels: {
          step: 1,
          style: { color: c.muted, fontSize: '11px' },
          rotation: -45,
        },
        lineColor: c.axis,
        tickColor: c.axis,
      },

      yAxis: {
        title: {
          text: 'Volumen (m³)',
          style: { color: c.muted, fontSize: '12px' },
        },
        gridLineColor: c.grid,
        labels: {
          style: { color: c.muted, fontSize: '11px' },
        },
        min: 0,
      },

      legend: {
        enabled: false,
      },

      plotOptions: {
        area: {
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, 'rgba(59, 130, 246, 0.4)'], // blue-500
              [1, 'rgba(59, 130, 246, 0.0)'],
            ]
          },
          marker: {
            enabled: true,
            symbol: 'circle',
            radius: 4,
            lineWidth: 2,
            lineColor: c.marker,
          },
          lineWidth: 2.5,
          color: '#3b82f6', // blue-500
        },
      },

      series: [
        {
          type: 'area',
          name: 'M³ Transportados',
          data: counts,
        },
      ],

      tooltip: {
        shared: true,
        backgroundColor: c.tooltipBg,
        borderWidth: 0,
        borderRadius: 8,
        style: {
          color: c.tooltipText,
          fontSize: '13px',
        },
        headerFormat: '<b>{point.key}</b><br/>',
        pointFormat:
          '<span style="color:{series.color}\">\u25CF</span> ' +
          '{series.name}: <b>{point.y} m³</b><br/>',
      },
    };
  }, [materialDelivered, c]);

  return (
    <div className="bg-white dark:bg-night-surface rounded-xl shadow-sm border border-gray-100 dark:border-night-border p-5">
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
};

