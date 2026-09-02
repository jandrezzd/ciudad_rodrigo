import { useMemo, useState } from 'react';
import { Download, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Button } from '@/shared/components/Button';
import { Table } from '@/shared/components/Table';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { formatDate } from '@/shared/utils/format';
import { useReportPlanificaciones } from '../hooks/useReportPlanificaciones';
import {
  PlanificacionReportItem,
  PlanificacionReportStatus,
} from '../types';

const statusLabel = (status: PlanificacionReportStatus): string => {
  const map: Record<PlanificacionReportStatus, string> = {
    PENDIENTE: 'Pendiente',
    EN_PROGRESO: 'En Progreso',
    COMPLETADO: 'Completado',
    CANCELADO: 'Cancelado',
    RETRASADO: 'Retrasado',
  };
  return map[status] ?? status;
};

const statusToBadge = (status: PlanificacionReportStatus) => {
  if (status === 'COMPLETADO') return 'completado';
  if (status === 'CANCELADO') return 'cancelado';
  if (status === 'EN_PROGRESO') return 'en_progreso';
  if (status === 'RETRASADO') return 'retrasado';
  return 'pendiente';
};

interface PlanReportRow {
  id: number;
  nombre: string;
  descripcion: string;
  cliente: string;
  obra: string;
  ubicacion: string;
  vehiculos: string;
  totalVehiculos: number;
  estado: PlanificacionReportStatus;
  fechaInicio: string;
  fechaFin: string;
  activo: string;
  createdAt: string;
}

export const ReportePlanificacionSection = () => {
  const { planificaciones, isLoading } = useReportPlanificaciones();

  // Filtros
  const [clienteFiltro, setClienteFiltro] = useState('');
  const [obraFiltro, setObraFiltro] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [resultado, setResultado] = useState<PlanificacionReportItem[] | null>(null);

  // Opciones únicas de clientes para filtro
  const clienteOptions = useMemo(() => {
    const set = new Map<string, string>();
    planificaciones.forEach((p) => {
      if (p.client) {
        const label = p.client.companyname || p.client.name || '';
        if (label) set.set(String(p.client.id), label);
      }
    });
    return [{ value: '', label: 'Seleccione un cliente' }, ...Array.from(set.entries()).map(([value, label]) => ({ value, label }))];
  }, [planificaciones]);

  const obraOptions = useMemo(() => {
    if (!clienteFiltro) {
      return [{ value: '', label: 'Seleccione un cliente primero' }];
    }

    const set = new Map<string, string>();
    planificaciones
      .filter((p) => String(p.clientId) === clienteFiltro)
      .forEach((p) => {
        if (p.constSite) {
          const label = p.constSite.name || '';
          if (label) set.set(String(p.constSite.id), label);
        }
      });

    const options = Array.from(set.entries()).map(([value, label]) => ({ value, label }));
    return [{ value: '', label: 'Todas las obras' }, ...options];
  }, [planificaciones, clienteFiltro]);

  const handleGenerarReporte = () => {
    if (!clienteFiltro) {
      toast.error('Seleccione un cliente');
      return;
    }

    if (!fechaInicio || !fechaFin) {
      toast.error('Seleccione fecha inicio y fin');
      return;
    }

    if (fechaInicio > fechaFin) {
      toast.error('La fecha de inicio no puede ser mayor a la fecha de fin');
      return;
    }

    const filtered = planificaciones.filter((p) => {
      if (String(p.clientId) !== clienteFiltro) return false;

      if (obraFiltro && String(p.constSiteId) !== obraFiltro) return false;

      const planStart = p.startDate ? p.startDate.slice(0, 10) : '';
      const planEnd = p.endDate ? p.endDate.slice(0, 10) : planStart;

      if (fechaInicio && planStart < fechaInicio) return false;
      if (fechaFin && planEnd > fechaFin) return false;

      return true;
    });

    setResultado(filtered);

    if (filtered.length === 0) {
      toast('No se encontraron planificaciones con los filtros seleccionados', {
        icon: '⚠️',
      });
    } else {
      toast.success(`Se encontraron ${filtered.length} planificación(es)`);
    }
  };

  const handleLimpiarFiltros = () => {
    setClienteFiltro('');
    setObraFiltro('');
    setFechaInicio('');
    setFechaFin('');
    setResultado(null);
  };

  const reportRows = useMemo<PlanReportRow[]>(() => {
    if (!resultado) return [];
    return resultado.map((p) => {
      const planningLabel = p.planningCode || p.name || `PLAN-${p.id}`;
      const vehiculosPlacas = (p.vehicles ?? [])
        .map((v) => {
          const plate = v.vehicle.plate || v.vehicle.vehicleid || '—';
          const status = v.vehicle.isActive !== false ? 'Activo' : 'Inactivo';
          return `${plate} (${status})`;
        })
        .join(', ');

      return {
        id: p.id,
        nombre: planningLabel,
        descripcion: p.description || '—',
        cliente: p.client?.companyname || p.client?.name || '—',
        obra: p.constSite?.name || '—',
        ubicacion: p.constSite
          ? `${p.constSite.province ?? ''}, ${p.constSite.canton ?? ''}`
          : '—',
        vehiculos: vehiculosPlacas || 'Sin vehículos',
        totalVehiculos: (p.vehicles ?? []).length,
        estado: p.status,
        fechaInicio: p.startDate ? formatDate(p.startDate) : '—',
        fechaFin: p.endDate ? formatDate(p.endDate) : 'Sin fecha fin',
        activo: p.isActive ? 'Sí' : 'No',
        createdAt: p.createdAt ? formatDate(p.createdAt) : '—',
      };
    });
  }, [resultado]);

  // Estadísticas resumen
  const resumen = useMemo(() => {
    if (!resultado) return null;
    const completados = resultado.filter((p) => p.status === 'COMPLETADO').length;
    const enProgreso = resultado.filter((p) => p.status === 'EN_PROGRESO').length;
    const pendientes = resultado.filter((p) => p.status === 'PENDIENTE').length;
    const retrasados = resultado.filter((p) => p.status === 'RETRASADO').length;
    const cancelados = resultado.filter((p) => p.status === 'CANCELADO').length;
    const totalVehiculos = resultado.reduce((sum, p) => sum + (p.vehicles?.length ?? 0), 0);
    return { completados, enProgreso, pendientes, retrasados, cancelados, totalVehiculos };
  }, [resultado]);

  const handleExportExcel = () => {
    if (!resultado || reportRows.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    const exportData = reportRows.map((row) => ({
      'ID': row.id,
      Planificación: row.nombre,
      Descripción: row.descripcion,
      Cliente: row.cliente,
      Obra: row.obra,
      Ubicación: row.ubicacion,
      Vehículos: row.vehiculos,
      'Total Vehículos': row.totalVehiculos,
      Estado: statusLabel(row.estado),
      'Fecha Inicio': row.fechaInicio,
      'Fecha Fin': row.fechaFin,
      Activo: row.activo,
      'Creado el': row.createdAt,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Planificaciones');
    const hoy = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `reporte_planificaciones_${hoy}.xlsx`);
  };

  const columns = [
    { header: 'Planificación', accessor: 'nombre' as keyof PlanReportRow },
    { header: 'Cliente', accessor: 'cliente' as keyof PlanReportRow },
    { header: 'Obra', accessor: 'obra' as keyof PlanReportRow },
    { header: 'Ubicación', accessor: 'ubicacion' as keyof PlanReportRow },
    {
      header: 'Vehículos',
      accessor: (row: PlanReportRow) => (
        <span className="text-xs text-gray-700 max-w-xs block truncate" title={row.vehiculos}>
          {row.vehiculos}
        </span>
      ),
    },
    {
      header: 'Total',
      accessor: (row: PlanReportRow) => (
        <span className="font-semibold text-indigo-700">{row.totalVehiculos}</span>
      ),
    },
    {
      header: 'Estado',
      accessor: (row: PlanReportRow) => <StatusBadge status={statusToBadge(row.estado)} />,
    },
    { header: 'Inicio', accessor: 'fechaInicio' as keyof PlanReportRow },
    { header: 'Fin', accessor: 'fechaFin' as keyof PlanReportRow },
    {
      header: 'Activo',
      accessor: (row: PlanReportRow) => (
        <span
          className={
            row.activo === 'Sí'
              ? 'text-green-600 font-semibold'
              : 'text-red-500 font-semibold'
          }
        >
          {row.activo}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-2 rounded-lg">
            <ClipboardList size={22} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Reportes de Planificación</h2>
            <p className="text-gray-600 text-sm mt-0.5">
              Consulta y filtra planificaciones por cliente, obra y período
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
          icon={<Download size={16} />}
          onClick={handleExportExcel}
          disabled={!resultado || reportRows.length === 0}
        >
          Exportar Excel
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Cliente */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Cliente</label>
            <select
              value={clienteFiltro}
              onChange={(e) => {
                setClienteFiltro(e.target.value);
                setObraFiltro('');
              }}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              {clienteOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Obra */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Obra</label>
            <select
              value={obraFiltro}
              onChange={(e) => setObraFiltro(e.target.value)}
              disabled={!clienteFiltro}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
            >
              {obraOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha inicio */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Fecha inicio</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFechaInicio(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Fecha fin */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Fecha fin</label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFechaFin(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mt-2">
          <Button
            variant="primary"
            onClick={handleGenerarReporte}
            className="w-full"
            style={{ backgroundColor: '#4f46e5' }}
          >
            Generar reporte
          </Button>
          <Button
            variant="outline"
            className="!bg-indigo-200 !text-indigo-800 hover:!bg-indigo-300 border-none w-full"
            onClick={handleLimpiarFiltros}
          >
            Limpiar filtros
          </Button>
        </div>
      </div>

      {/* Spinner */}
      {isLoading && (
        <div className="flex justify-center items-center py-6">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      )}

      {/* Resultado */}
      {resultado !== null && resumen && (
        <div className="space-y-4">
          {/* Tarjetas resumen */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: 'Total', value: resultado.length, color: 'text-gray-900', bg: 'bg-gray-50' },
              { label: 'Completados', value: resumen.completados, color: 'text-green-700', bg: 'bg-green-50' },
              { label: 'En Progreso', value: resumen.enProgreso, color: 'text-blue-700', bg: 'bg-blue-50' },
              { label: 'Pendientes', value: resumen.pendientes, color: 'text-yellow-700', bg: 'bg-yellow-50' },
              { label: 'Retrasados', value: resumen.retrasados, color: 'text-amber-700', bg: 'bg-amber-50' },
              { label: 'Cancelados', value: resumen.cancelados, color: 'text-red-700', bg: 'bg-red-50' },
            ].map((card) => (
              <div key={card.label} className={`${card.bg} rounded-lg p-3 shadow-sm border`}>
                <p className="text-gray-500 text-xs">{card.label}</p>
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Vehículos totales */}
          <div className="bg-indigo-50 rounded-lg p-3 shadow-sm border border-indigo-100">
            <p className="text-gray-500 text-sm">
              Total vehículos asignados en planificaciones filtradas:{' '}
              <span className="font-bold text-indigo-700">{resumen.totalVehiculos}</span>
            </p>
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-lg shadow">
            <Table
              data={reportRows}
              columns={columns}
              emptyMessage="No hay planificaciones que coincidan con los filtros"
            />
          </div>
        </div>
      )}
    </div>
  );
};
