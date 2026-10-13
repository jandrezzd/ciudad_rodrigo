import { useMemo } from 'react';
import HighchartsReact from 'highcharts-react-official';
import Highcharts from 'highcharts';
import { useChartColors } from '../utils/useChartColors';
import { mapDailyStats } from '../utils/chartUtils';

// ─── Props ────────────────────────────────────────────────────────────────────
interface DashboardLineChartProps {
  internalVehicleTrips?: Record<string, number>;
  externalVehicleTrips?: Record<string, number>;
}

// ─── Paleta de colores ────────────────────────────────────────────────────────
const SERIES_CONFIG = [
  { name: 'Vehículos Internos', color: '#10b981' }, // verde
  { name: 'Vehículos Externos', color: '#f97316' }, // naranja
];

// ─── Componente ───────────────────────────────────────────────────────────────
export const DashboardLineChart = ({
  internalVehicleTrips,
  externalVehicleTrips,
}: DashboardLineChartProps) => {

  const c = useChartColors();

  const options = useMemo<Highcharts.Options>(() => {
    const { labels, counts: internalCounts } = mapDailyStats(internalVehicleTrips, 30);
    const { counts: externalCounts } = mapDailyStats(externalVehicleTrips, 30);

    const allCounts = [internalCounts, externalCounts];

    return {
      chart: {
        type: 'line',
        backgroundColor: c.bg,
        style: {
          fontFamily:
            '-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif',
        },
        animation: { duration: 800 },
        height: 380,
      },

      title: {
        text: 'Vueltas de Vehículos',
        align: 'left',
        style: {
          fontSize: '17px',
          fontWeight: '700',
          color: c.title,
        },
      },

      subtitle: {
        text: 'Cantidad de viajes diarios — últimos 30 días',
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
        accessibility: {
          description: 'Días del mes',
        },
      },

      yAxis: {
        title: {
          text: 'Cantidad de Vueltas',
          style: { color: c.muted, fontSize: '12px' },
        },
        gridLineColor: c.grid,
        labels: {
          style: { color: c.muted, fontSize: '11px' },
        },
        min: 0,
        allowDecimals: false,
      },

      legend: {
        layout: 'horizontal',
        align: 'center',
        verticalAlign: 'bottom',
        itemStyle: {
          fontSize: '13px',
          fontWeight: '500',
          color: c.text,
        },
        itemHoverStyle: { color: c.title },
      },

      plotOptions: {
        series: {
          marker: {
            enabled: true,
            radius: 4,
            symbol: 'circle',
            lineWidth: 2,
            lineColor: c.marker,
          },
          lineWidth: 2.5,
        },
      },

      series: SERIES_CONFIG.map((cfg, i) => ({
        type: 'line' as const,
        name: cfg.name,
        color: cfg.color,
        data: allCounts[i],
        marker: {
          fillColor: cfg.color,
          lineColor: c.marker,
          lineWidth: 2,
        },
      })),

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
          '{series.name}: <b>{point.y}</b><br/>',
      },
    };
  }, [internalVehicleTrips, externalVehicleTrips, c]);

  return (
    <div className="bg-white dark:bg-night-surface rounded-xl shadow-sm border border-gray-100 dark:border-night-border p-5">
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
};

