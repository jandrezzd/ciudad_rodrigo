import { useMemo } from 'react';
import HighchartsReact from 'highcharts-react-official';
import Highcharts from 'highcharts';
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

  const options = useMemo<Highcharts.Options>(() => {
    const { labels, counts: internalCounts } = mapDailyStats(internalVehicleTrips, 30);
    const { counts: externalCounts } = mapDailyStats(externalVehicleTrips, 30);

    const allCounts = [internalCounts, externalCounts];

    return {
      chart: {
        type: 'line',
        backgroundColor: '#ffffff',
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
          color: '#111827',
        },
      },

      subtitle: {
        text: 'Cantidad de viajes diarios — últimos 30 días',
        align: 'left',
        style: {
          fontSize: '13px',
          color: '#6b7280',
        },
      },

      xAxis: {
        categories: labels,
        labels: {
          step: 1,
          style: { color: '#6b7280', fontSize: '11px' },
          rotation: -45,
        },
        lineColor: '#e5e7eb',
        tickColor: '#e5e7eb',
        accessibility: {
          description: 'Días del mes',
        },
      },

      yAxis: {
        title: {
          text: 'Cantidad de Vueltas',
          style: { color: '#6b7280', fontSize: '12px' },
        },
        gridLineColor: '#f3f4f6',
        labels: {
          style: { color: '#6b7280', fontSize: '11px' },
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
          color: '#374151',
        },
        itemHoverStyle: { color: '#111827' },
      },

      plotOptions: {
        series: {
          marker: {
            enabled: true,
            radius: 4,
            symbol: 'circle',
            lineWidth: 2,
            lineColor: '#ffffff',
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
          lineColor: '#ffffff',
          lineWidth: 2,
        },
      })),

      tooltip: {
        shared: true,
        backgroundColor: '#1f2937',
        borderWidth: 0,
        borderRadius: 8,
        style: {
          color: '#f9fafb',
          fontSize: '13px',
        },
        headerFormat: '<b>{point.key}</b><br/>',
        pointFormat:
          '<span style="color:{series.color}\">\u25CF</span> ' +
          '{series.name}: <b>{point.y}</b><br/>',
      },
    };
  }, [internalVehicleTrips, externalVehicleTrips]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
};

