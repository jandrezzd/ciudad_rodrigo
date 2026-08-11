import { Truck } from 'lucide-react';
import { useVehicles } from '@/modules/vehicles/hooks/useVehicles';
import { useObras } from '@/modules/obras/hooks/useObras';
import { usePlanificaciones } from '@/modules/planificacion/hooks/usePlanificaciones';
import { useClientes } from '@/modules/clientes/hooks/useClientes';
import { useProveedoresMateriales } from '@/modules/proveedores-materiales/hooks/useProveedoresMateriales';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { useDashboardTotalSummary } from '../hooks/useDashboardTotalSummary';
import { normalizeVehicleType } from '@/modules/vehicles/types';
import { DashboardChart } from './DashboardChart';
import { DashboardLineChart } from './DashboardLineChart';
import { DashboardSyncCharts } from './DashboardSyncCharts';
import { DashboardDailyStatsTable } from './DashboardDailyStatsTable';
import { DashboardTotalSummaryChart } from './DashboardTotalSummaryChart';

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

const StatCard = ({
  title,
  value,
  icon,
  bgColor,
  textColor,
  borderColor,
}: StatCardProps) => (
  <div
    className={`bg-white rounded-xl shadow-sm border ${borderColor} p-4 flex items-center justify-between gap-3 hover:shadow-md transition-shadow duration-200`}
  >
    <div>
      <p className="text-xs text-gray-500 mb-0.5 font-medium">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
    <div
      className={`w-10 h-10 ${bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}
    >
      <div className={textColor}>{icon}</div>
    </div>
  </div>
);

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export const DashboardPage = () => {
  const { vehicles } = useVehicles();
  const { obras } = useObras();
  const { planificaciones } = usePlanificaciones();
  const { clientes } = useClientes();
  const { proveedores: proveedoresMateriales } = useProveedoresMateriales();
  const { stats: dashboardStats, isLoading: isStatsLoading } = useDashboardStats(10000);
  const { summary: totalSummary, isLoading: isTotalSummaryLoading } = useDashboardTotalSummary(10000);

  // ── Stats calculadas del sistema real ──────────────────────────────────────
  const totalClientes = clientes.length;
  const totalPlanificacion = planificaciones.length;
  const totalObras = obras.length;
  const totalProveedoresMaterial = proveedoresMateriales.length;

  const fallbackVehiculosInternos = vehicles.filter(
    (v) => normalizeVehicleType(v.type) === 'INTERNO'
  ).length;
  const fallbackVehiculosExternos = vehicles.filter(
    (v) => normalizeVehicleType(v.type) === 'EXTERNO'
  ).length;

  const vehiculosInternos = dashboardStats?.totalVehicleInternal ?? fallbackVehiculosInternos;
  const vehiculosExternos = dashboardStats?.totalVehicleExternal ?? fallbackVehiculosExternos;
  const totalVehiculos = vehiculosInternos + vehiculosExternos;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1 text-sm">Resumen general del sistema</p>
      </div>

      {/* ── Gráfico (50%) + Stat Cards (50%) ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Columna izquierda — Gráfico de torta */}
        <DashboardChart
          totalClientes={totalClientes}
          totalPlanificacion={totalPlanificacion}
          totalObras={totalObras}
          totalProveedoresMaterial={totalProveedoresMaterial}
        />

        {/* Columna derecha — Stat Cards + Resumen diario */}
        <div className="flex flex-col gap-3">
          <StatCard
            title="Total de Vehículos"
            value={totalVehiculos}
            icon={<Truck size={20} />}
            bgColor="bg-blue-50"
            textColor="text-blue-600"
            borderColor="border-blue-100"
          />
          <StatCard
            title="Vehículos Internos"
            value={vehiculosInternos}
            icon={<Truck size={20} />}
            bgColor="bg-emerald-50"
            textColor="text-emerald-600"
            borderColor="border-emerald-100"
          />
          <StatCard
            title="Vehículos Externos"
            value={vehiculosExternos}
            icon={<Truck size={20} />}
            bgColor="bg-orange-50"
            textColor="text-orange-500"
            borderColor="border-orange-100"
          />

          <DashboardDailyStatsTable stats={dashboardStats} isLoading={isStatsLoading} />
        </div>

      </div>

      {/* ── Fila de Gráficos Secundarios (50% / 50%) ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <DashboardLineChart
          internalVehicleTrips={dashboardStats?.internalVehicleTripsLast30Days}
          externalVehicleTrips={dashboardStats?.externalVehicleTripsLast30Days}
        />

        <DashboardSyncCharts
          materialDelivered={dashboardStats?.materialDeliveredLast30Days}
        />
      </div>

      {/* ── Resumen Total Diario (fila completa) ───────────────────── */}
      <div className="grid grid-cols-1 gap-5">
        <DashboardTotalSummaryChart
          summary={totalSummary}
          isLoading={isTotalSummaryLoading}
        />
      </div>

    </div>
  );
};
