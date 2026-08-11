import { useMemo } from 'react';
import HighchartsReact from 'highcharts-react-official';
import Highcharts from 'highcharts';
import { DashboardTotalSummary } from '../types';
import { formatDate, formatNumber } from '@/shared/utils/format';

interface DashboardTotalSummaryChartProps {
  summary: DashboardTotalSummary | null;
  isLoading?: boolean;
}

const summaryItems = [
  { key: 'totalDeparturesM3', label: 'M³ Salida', color: 'text-blue-700' },
  { key: 'totalArrivalsM3', label: 'M³ Llegada', color: 'text-emerald-700' },
  { key: 'totalDeviation', label: 'Desviación', color: 'text-orange-600' },
  { key: 'totalDepartures', label: 'Salidas', color: 'text-gray-700' },
  { key: 'totalArrivals', label: 'Llegadas', color: 'text-gray-700' },
];

const systemItems = [
  { key: 'totalClients', label: 'Clientes' },
  { key: 'totalConstSites', label: 'Obras' },
  { key: 'totalOwners', label: 'Propietarios' },
  { key: 'totalPlannings', label: 'Planificaciones' },
];

export const DashboardTotalSummaryChart = ({ summary, isLoading = false }: DashboardTotalSummaryChartProps) => {
  const categories = useMemo(() => {
    return summary ? Object.keys(summary.materialDeliveredByType ?? {}) : [];
  }, [summary]);

  const seriesData = useMemo(() => {
    return summary
      ? Object.values(summary.materialDeliveredByType ?? {}).map((value) => Math.round(value * 100) / 100)
      : [];
  }, [summary]);

  const options = useMemo<Highcharts.Options>(() => {
    return {
      chart: {
        type: 'column',
        backgroundColor: '#ffffff',
        style: {
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        },
        animation: { duration: 700 },
        height: 320,
      },
      title: {
        text: 'M³ entregados por tipo de material',
        align: 'left',
        style: {
          fontSize: '15px',
          fontWeight: '700',
          color: '#111827',
        },
      },
      subtitle: {
        text: 'Totales acumulados de transporte y entrega',
        align: 'left',
        style: {
          fontSize: '12px',
          color: '#6b7280',
        },
      },
      xAxis: {
        categories,
        title: { text: 'Tipo de material' },
        labels: {
          style: { color: '#6b7280', fontSize: '11px' },
        },
        lineColor: '#e5e7eb',
        tickColor: '#e5e7eb',
      },
      yAxis: {
        title: {
          text: 'M³ entregados',
          style: { color: '#6b7280', fontSize: '12px' },
        },
        gridLineColor: '#f3f4f6',
        labels: {
          style: { color: '#6b7280', fontSize: '11px' },
        },
        min: 0,
      },
      series: [
        {
          type: 'column' as const,
          name: 'M³ entregados',
          data: seriesData,
          color: '#2563eb',
          dataLabels: {
            enabled: true,
            formatter: function () {
              return `${formatNumber(this.y as number, 2)} m³`;
            },
            style: { fontSize: '11px', color: '#111827' },
          },
        },
      ],
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
          '<span style="color:{series.color}">●</span> {series.name}: <b>{point.y} m³</b><br/>',
      },
      legend: { enabled: false },
      credits: { enabled: false },
    };
  }, [categories, seriesData]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-lg font-semibold text-gray-900">Resumen Total Acumulado</p>
          <p className="text-sm text-gray-500">
            Totales acumulados del sistema · {summary ? formatDate(summary.date) : 'Actualizado'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 mb-5">
        {summaryItems.map((item) => (
          <div key={item.key} className="rounded-2xl border border-gray-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-gray-500">{item.label}</p>
            <p className={`mt-2 text-2xl font-semibold ${item.color}`}>
              {summary ? formatNumber(summary[item.key as keyof DashboardTotalSummary] as number, item.key === 'totalDeparturesM3' || item.key === 'totalArrivalsM3' || item.key === 'totalDeviation' ? 2 : 0) : '0'}
              {item.key === 'totalDeparturesM3' || item.key === 'totalArrivalsM3' || item.key === 'totalDeviation' ? ' m³' : ''}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        {systemItems.map((item) => (
          <div key={item.key} className="rounded-2xl border border-gray-100 bg-white p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-gray-500">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {summary ? formatNumber(summary[item.key as keyof DashboardTotalSummary] as number, 0) : '0'}
            </p>
          </div>
        ))}
      </div>

      {isLoading || !summary ? (
        <div className="h-[320px] flex items-center justify-center text-sm text-gray-400">
          Cargando resumen total acumulado...
        </div>
      ) : categories.length > 0 ? (
        <HighchartsReact highcharts={Highcharts} options={options} />
      ) : (
        <div className="h-[320px] flex items-center justify-center text-sm text-gray-400">
          No hay datos acumulados de material por tipo para mostrar.
        </div>
      )}
    </div>
  );
};
