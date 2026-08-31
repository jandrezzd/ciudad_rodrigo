import { useEffect, useMemo, useState } from 'react';
import { Download, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Table } from '@/shared/components/Table';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { MultiSelect } from '@/shared/components/MultiSelect';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { formatDate, formatDateTime, formatNumber } from '@/shared/utils/format';
import { useReportClients } from '../hooks/useReportClients';
import { useReportPlanificaciones } from '../hooks/useReportPlanificaciones';
import { reportsService } from '../services/reportsService';
import {
  ClientReportMovement,
  ClientReportResponse,
  PlanificacionReportItem,
  ReportTransportStatus,
} from '../types';

const formatDateInput = (value: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(value);

const statusLabel = (status: ReportTransportStatus): string => {
  const map: Record<string, string> = {
    EN_PROGRESO: 'En progreso',
    IN_PROGRESS: 'En progreso',
    COMPLETADO: 'Completado',
    COMPLETED: 'Completado',
    CANCELADO: 'Cancelado',
    CANCELLED: 'Cancelado',
    ALERTA: 'Alerta',
    REVISADO: 'Revisado',
  };
  return map[status] ?? status;
};

const statusToBadge = (status: ReportTransportStatus) => {
  if (status === 'COMPLETED' || status === 'COMPLETADO') return 'completado';
  if (status === 'CANCELLED' || status === 'CANCELADO') return 'cancelado';
  if (status === 'ALERTA') return 'alerta';
  if (status === 'REVISADO') return 'revisado';
  if (status === 'IN_PROGRESS' || status === 'EN_PROGRESO') return 'en_progreso';
  return 'pendiente';
};

const sanitizeFileName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

const reportStatusConfig: Record<string, { label: string; className: string }> = {
  NORMAL: { label: 'Normal', className: 'bg-gray-100 text-gray-800' },
  ALERTA: { label: 'Alerta', className: 'bg-orange-100 text-orange-800' },
  REVISADO: { label: 'Revisado', className: 'bg-purple-100 text-purple-800' },
};

const getResolvedM3 = (movement: ClientReportMovement) => {
  const departure = movement.departureM3Corrected ?? movement.departureM3 ?? null;
  const arrival = movement.arrivalM3Corrected ?? movement.arrivalM3 ?? null;
  const difference =
    movement.deviationM3 !== undefined && movement.deviationM3 !== null
      ? movement.deviationM3
      : departure !== null && arrival !== null
        ? arrival - departure
        : null;
  return { departure, arrival, difference };
};

const resolvePlanningLabel = (
  planning: ClientReportMovement['planning'] | null | undefined,
) => {
  if (!planning) return '—';
  return planning.planningCode || `PLAN-${planning.id}`;
};

const resolveClientTypeLabel = (type?: string | null) => {
  if (!type) return '—';
  if (type.toUpperCase() === 'PUBLICO' || type.toUpperCase() === 'PUBLIC') return 'Público';
  if (type.toUpperCase() === 'PRIVADO' || type.toUpperCase() === 'PRIVATE') return 'Privado';
  return type;
};

interface ClientReportRow {
  id: number;
  obra: string;
  planificacion: string;
  vehiculo: string;
  conductor: string;
  proveedor: string;
  salida: string;
  llegada: string;
  departureM3: number | null;
  arrivalM3: number | null;
  difference: number | null;
  estado: ReportTransportStatus;
  registradoPor: string;
  registradoEmail: string;
}

const buildPlanningOptions = (
  planificaciones: PlanificacionReportItem[],
  clientId: string,
  report: ClientReportResponse | null,
) => {
  const map = new Map<string, string>();
  if (clientId) {
    planificaciones
      .filter((p) => String(p.clientId) === clientId)
      .forEach((p) => {
        const label = p.planningCode || p.name || `PLAN-${p.id}`;
        map.set(String(p.id), label);
      });
  }

  if (report) {
    report.movements.forEach((movement) => {
      if (!movement.planning) return;
      const label = movement.planning.planningCode || `PLAN-${movement.planning.id}`;
      map.set(String(movement.planning.id), label);
    });
  }

  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

const buildObraOptions = (
  planificaciones: PlanificacionReportItem[],
  clientId: string,
  report: ClientReportResponse | null,
) => {
  const map = new Map<string, string>();

  if (clientId) {
    planificaciones
      .filter((p) => String(p.clientId) === clientId)
      .forEach((p) => {
        if (p.constSite) {
          map.set(String(p.constSite.id), p.constSite.name);
          return;
        }
        if (p.constSiteId) {
          map.set(String(p.constSiteId), `Obra #${p.constSiteId}`);
        }
      });
  }

  if (report) {
    report.movements.forEach((movement) => {
      if (!movement.constSite) return;
      map.set(String(movement.constSite.id), movement.constSite.name);
    });
  }

  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

export const ReporteClientesSection = () => {
  const { clients, isLoading: isClientsLoading } = useReportClients();
  const { planificaciones, isLoading: isPlanningLoading } = useReportPlanificaciones();

  const [clientId, setClientId] = useState('');
  const [obraIds, setObraIds] = useState<string[]>([]);
  const [planningIds, setPlanningIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return formatDateInput(date);
  });
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));
  const [report, setReport] = useState<ClientReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const clientOptions = useMemo(
    () =>
      clients.map((client) => ({
        value: String(client.id),
        label: `${client.companyname || client.name || 'Cliente'}${client.ruc ? ` (${client.ruc})` : ''}`,
      })),
    [clients],
  );

  const selectedClient = useMemo(
    () => clients.find((client) => String(client.id) === clientId),
    [clients, clientId],
  );

  const obraOptions = useMemo(
    () => buildObraOptions(planificaciones, clientId, report),
    [planificaciones, clientId, report],
  );

  const planningOptions = useMemo(
    () => buildPlanningOptions(planificaciones, clientId, report),
    [planificaciones, clientId, report],
  );

  useEffect(() => {
    setObraIds((prev) => prev.filter((id) => obraOptions.some((opt) => opt.value === id)));
  }, [obraOptions]);

  useEffect(() => {
    setPlanningIds((prev) => prev.filter((id) => planningOptions.some((opt) => opt.value === id)));
  }, [planningOptions]);

  useEffect(() => {
    setReport(null);
    setObraIds([]);
    setPlanningIds([]);
  }, [clientId]);

  const filteredMovements = useMemo(() => {
    if (!report) return [] as ClientReportMovement[];
    const obraSet = obraIds.length > 0 ? new Set(obraIds.map(String)) : null;
    const planningSet = planningIds.length > 0 ? new Set(planningIds.map(String)) : null;

    return report.movements.filter((movement) => {
      if (obraSet) {
        const constSiteId = movement.constSite?.id;
        if (!constSiteId || !obraSet.has(String(constSiteId))) return false;
      }
      if (planningSet) {
        const planId = movement.planning?.id;
        if (!planId || !planningSet.has(String(planId))) return false;
      }
      return true;
    });
  }, [report, obraIds, planningIds]);

  const reportRows = useMemo<ClientReportRow[]>(() => {
    return filteredMovements.map((movement) => {
      const resolved = getResolvedM3(movement);
      return {
        id: movement.id,
        obra: movement.constSite?.name || '—',
        planificacion: resolvePlanningLabel(movement.planning),
        vehiculo:
          movement.vehicle.plate || movement.vehicle.vehicleid || movement.vehicle.brand || '—',
        conductor: movement.driver?.name || '—',
        proveedor:
          movement.vehicle.provider?.companyname || movement.vehicle.provider?.name || 'Interno',
        salida: movement.departureAt ? formatDateTime(movement.departureAt) : '—',
        llegada: movement.arrivalAt ? formatDateTime(movement.arrivalAt) : 'Pendiente',
        departureM3: resolved.departure,
        arrivalM3: resolved.arrival,
        difference: resolved.difference,
        estado: movement.status,
        registradoPor: movement.registeredBy?.name || '—',
        registradoEmail: movement.registeredBy?.email || '—',
      };
    });
  }, [filteredMovements]);

  const resumen = useMemo(() => {
    if (!report) return null;

    const totals = filteredMovements.reduce(
      (acc, movement) => {
        const resolved = getResolvedM3(movement);
        if (resolved.departure != null) acc.totalDeparture += resolved.departure;
        if (resolved.arrival != null) acc.totalArrival += resolved.arrival;
        if (resolved.difference != null) acc.totalDeviation += resolved.difference;

        acc.vehicles.add(movement.vehicle.id);
        if (movement.vehicle.provider?.id) {
          acc.providers.add(movement.vehicle.provider.id);
        } else {
          acc.providers.add('interno');
        }
        if (movement.constSite?.id) {
          acc.constSites.add(movement.constSite.id);
        }
        return acc;
      },
      {
        totalDeparture: 0,
        totalArrival: 0,
        totalDeviation: 0,
        vehicles: new Set<number>(),
        providers: new Set<number | string>(),
        constSites: new Set<number>(),
      },
    );

    return {
      totalMovements: filteredMovements.length,
      totalDeparture: Number(totals.totalDeparture.toFixed(2)),
      totalArrival: Number(totals.totalArrival.toFixed(2)),
      totalDeviation: Number(totals.totalDeviation.toFixed(2)),
      uniqueVehicles: totals.vehicles.size,
      uniqueProviders: totals.providers.size,
      uniqueConstSites: totals.constSites.size,
    };
  }, [report, filteredMovements]);

  const resumenPorObra = useMemo(() => {
    if (!report) return [] as Array<{
      id: number;
      name: string;
      movements: number;
      totalDepartureM3: number;
      totalArrivalM3: number;
      totalDeviation: number;
    }>;

    const map = new Map<number, {
      id: number;
      name: string;
      movements: number;
      totalDepartureM3: number;
      totalArrivalM3: number;
      totalDeviation: number;
    }>();

    filteredMovements.forEach((movement) => {
      if (!movement.constSite?.id) return;
      const id = movement.constSite.id;
      const current = map.get(id) ?? {
        id,
        name: movement.constSite.name,
        movements: 0,
        totalDepartureM3: 0,
        totalArrivalM3: 0,
        totalDeviation: 0,
      };
      const resolved = getResolvedM3(movement);
      current.movements += 1;
      current.totalDepartureM3 += resolved.departure ?? 0;
      current.totalArrivalM3 += resolved.arrival ?? 0;
      current.totalDeviation += resolved.difference ?? 0;
      map.set(id, current);
    });

    return Array.from(map.values()).map((row) => ({
      ...row,
      totalDepartureM3: Number(row.totalDepartureM3.toFixed(2)),
      totalArrivalM3: Number(row.totalArrivalM3.toFixed(2)),
      totalDeviation: Number(row.totalDeviation.toFixed(2)),
    }));
  }, [report, filteredMovements]);

  const handleGenerateReport = async () => {
    if (!clientId) {
      toast.error('Seleccione un cliente');
      return;
    }
    if (!startDate || !endDate) {
      toast.error('Seleccione el rango de fechas');
      return;
    }
    if (startDate > endDate) {
      toast.error('La fecha de inicio no puede ser mayor a la fecha de fin');
      return;
    }

    setIsLoading(true);
    try {
      const response = await reportsService.getClientReport({
        clientId: Number(clientId),
        startDate,
        endDate,
      });
      setReport(response);
      toast.success('Reporte generado correctamente');
    } catch (error) {
      console.error(error);
      toast.error('No se pudo generar el reporte');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (!report || reportRows.length === 0) {
      toast.error('No hay datos para exportar con los filtros actuales');
      return;
    }

    const clientName = report.client.companyname || report.client.name || 'cliente';
    const resumenSheet = resumenPorObra.map((row) => ({
      Obra: row.name,
      Movimientos: row.movements,
      'M3 Salida': row.totalDepartureM3,
      'M3 Llegada': row.totalArrivalM3,
      'Desviación M3': row.totalDeviation,
    }));

    const exportMovements = reportRows.map((row) => ({
      Cliente: clientName,
      RUC: report.client.ruc || '—',
      Tipo: resolveClientTypeLabel(report.client.type),
      'Periodo inicio': formatDate(report.period.startDate),
      'Periodo fin': formatDate(report.period.endDate),
      Obra: row.obra,
      Planificación: row.planificacion,
      Vehículo: row.vehiculo,
      Conductor: row.conductor,
      Proveedor: row.proveedor,
      Salida: row.salida,
      Llegada: row.llegada,
      'M3 Salida': row.departureM3 ?? 0,
      'M3 Llegada': row.arrivalM3 ?? 0,
      'Desviación M3': row.difference ?? 0,
      Estado: statusLabel(row.estado),
      'Registrado por': row.registradoPor,
      'Email registrado': row.registradoEmail,
    }));

    const workbook = XLSX.utils.book_new();
    const movementSheet = XLSX.utils.json_to_sheet(exportMovements);
    XLSX.utils.book_append_sheet(workbook, movementSheet, 'Movimientos');

    if (resumenSheet.length > 0) {
      const obraSheet = XLSX.utils.json_to_sheet(resumenSheet);
      XLSX.utils.book_append_sheet(workbook, obraSheet, 'Resumen por obra');
    }

    const safeName = sanitizeFileName(clientName);
    XLSX.writeFile(workbook, `reporte_clientes_${safeName}_${startDate}_${endDate}.xlsx`);
    toast.success('Excel generado correctamente');
  };

  const columns = [
    { header: 'Obra', accessor: 'obra' as keyof ClientReportRow },
    { header: 'Planificación', accessor: 'planificacion' as keyof ClientReportRow },
    { header: 'Vehículo', accessor: 'vehiculo' as keyof ClientReportRow },
    { header: 'Conductor', accessor: 'conductor' as keyof ClientReportRow },
    { header: 'Proveedor', accessor: 'proveedor' as keyof ClientReportRow },
    { header: 'Salida', accessor: 'salida' as keyof ClientReportRow },
    { header: 'Llegada', accessor: 'llegada' as keyof ClientReportRow },
    {
      header: 'M3 Salida',
      accessor: (row: ClientReportRow) =>
        row.departureM3 != null ? formatNumber(row.departureM3) : '—',
    },
    {
      header: 'M3 Llegada',
      accessor: (row: ClientReportRow) =>
        row.arrivalM3 != null ? formatNumber(row.arrivalM3) : '—',
    },
    {
      header: 'Desviación',
      accessor: (row: ClientReportRow) => {
        if (row.difference == null) return '—';
        const isAlert = Math.abs(row.difference) >= 1;
        return (
          <span className={isAlert ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
            {formatNumber(row.difference)}
          </span>
        );
      },
    },
    {
      header: 'Estado',
      accessor: (row: ClientReportRow) => <StatusBadge status={statusToBadge(row.estado)} />,
    },
    {
      header: 'Registrado por',
      accessor: (row: ClientReportRow) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-900">{row.registradoPor}</span>
          <span className="text-xs text-gray-500">{row.registradoEmail}</span>
        </div>
      ),
      className: 'whitespace-normal',
    },
  ];

  const isAnyLoading = isClientsLoading || isPlanningLoading || isLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-amber-100 p-2 rounded-lg">
            <Users size={22} className="text-amber-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Reportes de Clientes</h2>
            <p className="text-gray-600 text-sm mt-0.5">
              Selecciona un cliente, sus obras y planificaciones para exportar el detalle
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
          icon={<Download size={16} />}
          onClick={handleExportExcel}
          disabled={!report || reportRows.length === 0}
        >
          Exportar Excel
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <SearchableSelect
          label="Cliente"
          options={clientOptions}
          value={clientId}
          onChange={setClientId}
          placeholder="Buscar cliente..."
        />
        <MultiSelect
          label="Obras"
          options={obraOptions}
          values={obraIds}
          onChange={setObraIds}
          placeholder={clientId ? 'Selecciona una o varias' : 'Seleccione cliente primero'}
          disabled={!clientId || obraOptions.length === 0}
          selectAllLabel="Todas"
        />
        <MultiSelect
          label="Planificación"
          options={planningOptions}
          values={planningIds}
          onChange={setPlanningIds}
          placeholder={clientId ? 'Selecciona una o varias' : 'Seleccione cliente primero'}
          disabled={!clientId || planningOptions.length === 0}
          selectAllLabel="Todas"
        />
        <Input
          label="Fecha inicio"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <Input
          label="Fecha fin"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
        <div className="flex items-end">
          <Button
            variant="primary"
            onClick={handleGenerateReport}
            isLoading={isLoading}
            className="w-full"
            style={{ backgroundColor: '#d97706' }}
          >
            Generar reporte
          </Button>
        </div>
      </div>

      {isAnyLoading && (
        <div className="flex justify-center items-center py-6">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600" />
        </div>
      )}

      {report && resumen && (
        <div className="space-y-4">
          {/* Resumen cliente */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-2">
                <p className="text-gray-500 text-sm">Cliente</p>
                <p className="font-semibold text-gray-900">
                  {report.client.companyname || report.client.name || '—'}
                </p>
                <p className="text-gray-600 text-sm">{report.client.ruc || '—'}</p>
                <p className="text-gray-600 text-sm">
                  {resolveClientTypeLabel(report.client.type)}
                </p>
                {report.status && (
                  <div className="mt-2">
                    {(() => {
                      const statusConfig =
                        reportStatusConfig[report.status] ?? reportStatusConfig.NORMAL;
                      return (
                        <span
                          className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusConfig.className}`}
                        >
                          {statusConfig.label}
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>
              <div>
                <p className="text-gray-500 text-sm">Periodo</p>
                <p className="font-semibold text-gray-900">
                  {formatDate(report.period.startDate)} - {formatDate(report.period.endDate)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Movimientos</p>
                <p className="font-semibold text-gray-900">{resumen.totalMovements}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">M3 Salida</p>
                <p className="font-semibold text-gray-900">
                  {formatNumber(resumen.totalDeparture)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">M3 Llegada</p>
                <p className="font-semibold text-gray-900">
                  {formatNumber(resumen.totalArrival)}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Desviación total</p>
                <p className={`text-lg font-bold ${resumen.totalDeviation < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {resumen.totalDeviation > 0 ? `+${formatNumber(resumen.totalDeviation)}` : formatNumber(resumen.totalDeviation)} m³
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Obras únicas</p>
                <p className="text-lg font-bold text-gray-900">{resumen.uniqueConstSites}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Vehículos / Proveedores</p>
                <p className="text-lg font-bold text-gray-900">
                  {resumen.uniqueVehicles} / {resumen.uniqueProviders}
                </p>
              </div>
            </div>
          </div>

          {/* Resumen por obra */}
          {resumenPorObra.length > 0 && (
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-gray-900 font-semibold mb-3">Resumen por obra</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {resumenPorObra.map((row) => (
                  <div key={row.id} className="border rounded-lg p-3">
                    <p className="font-semibold text-gray-900">{row.name}</p>
                    <p className="text-xs text-gray-500">Movimientos: {row.movements}</p>
                    <p className="text-xs text-gray-500">
                      M3 salida: {formatNumber(row.totalDepartureM3)}
                    </p>
                    <p className="text-xs text-gray-500">
                      M3 llegada: {formatNumber(row.totalArrivalM3)}
                    </p>
                    <p className={`text-xs font-semibold ${row.totalDeviation < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      Desviación: {row.totalDeviation > 0 ? `+${formatNumber(row.totalDeviation)}` : formatNumber(row.totalDeviation)} m³
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabla */}
          <div className="bg-white rounded-lg shadow">
            <Table
              data={reportRows}
              columns={columns}
              emptyMessage="No hay movimientos con los filtros seleccionados"
            />
          </div>
        </div>
      )}
    </div>
  );
};
