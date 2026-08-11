import { Table } from '@/shared/components/Table';
import { formatDate, formatNumber } from '@/shared/utils/format';
import { DashboardStats } from '../types';

interface DailyStatsRow {
  id: string;
  m3Salida: number;
  m3Llegada: number;
  salidasHoy: number;
  llegadasHoy: number;
}

interface DashboardDailyStatsTableProps {
  stats: DashboardStats | null;
  isLoading?: boolean;
}

export const DashboardDailyStatsTable = ({
  stats,
  isLoading = false,
}: DashboardDailyStatsTableProps) => {
  const data: DailyStatsRow[] = stats
    ? [
        {
          id: stats.date || 'today',
          m3Salida: stats.totalDeparturesM3 ?? 0,
          m3Llegada: stats.totalArrivalsM3 ?? 0,
          salidasHoy: stats.totalDepartures ?? 0,
          llegadasHoy: stats.totalArrivals ?? 0,
        },
      ]
    : [];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-[17px] font-bold text-gray-900">Resumen Diario</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            M3 salida · M3 llegada · Salidas · Llegadas
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {stats?.date ? `Actualizado: ${formatDate(stats.date)}` : 'Actualizado: —'}
        </div>
      </div>

      <Table
        data={data}
        isLoading={isLoading}
        emptyMessage="Sin datos del día"
        columns={[
          {
            header: 'M3 salida',
            accessor: (row) => `${formatNumber(row.m3Salida)} m³`,
            className: 'font-semibold text-blue-700',
          },
          {
            header: 'M3 llegada',
            accessor: (row) => `${formatNumber(row.m3Llegada)} m³`,
            className: 'font-semibold text-emerald-700',
          },
          {
            header: 'Salidas hoy',
            accessor: (row) => formatNumber(row.salidasHoy, 0),
            className: 'text-gray-900',
          },
          {
            header: 'Llegadas hoy',
            accessor: (row) => formatNumber(row.llegadasHoy, 0),
            className: 'text-gray-900',
          },
        ]}
      />
    </div>
  );
};
