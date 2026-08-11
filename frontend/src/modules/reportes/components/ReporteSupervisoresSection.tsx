import { useEffect, useMemo, useState } from 'react';
import { Download, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Table } from '@/shared/components/Table';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { formatDate, formatDateTime, formatNumber } from '@/shared/utils/format';
import { transportLogService } from '@/modules/registro-transporte/services/transportLogService';
import { TransportLog } from '@/modules/registro-transporte/types';
import { useReportSupervisors } from '../hooks/useReportSupervisors';
import { reportsService } from '../services/reportsService';
import {
  ReportSupervisorOption,
  ReportTransportStatus,
  SupervisorReportMovement,
  SupervisorReportResponse,
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

const roleTypeLabels: Record<string, string> = {
  OBRA: 'Obra',
  CANTERA: 'Cantera',
};

const resolveRoleType = (value?: string | null) => {
  if (!value) return '—';
  return roleTypeLabels[value] ?? value;
};

const sanitizeFileName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

interface SupervisorRow {
  id: number;
  action: SupervisorReportMovement['action'];
  date: string;
  status: ReportTransportStatus;
  vehicle: string;
  plate: string;
  constSite: string;
  client: string;
  planning: string;
  m3: number | null;
}

type TransportDetail = {
  clientLabel?: string;
  planningLabel?: string;
  constSiteLabel?: string;
  departureAt?: string | null;
  arrivalAt?: string | null;
};

const getTransportDetail = (log: TransportLog | null): TransportDetail => {
  if (!log) return {};
  const planningLabel = log.planning?.name
    ? log.planning.name
    : log.planning?.id
      ? `PLAN-${log.planning.id}`
      : undefined;
  const clientLabel = log.client?.companyname || log.client?.name;
  const constSiteLabel = log.constSite?.name;
  return {
    clientLabel,
    planningLabel,
    constSiteLabel,
    departureAt: log.departureAt ?? null,
    arrivalAt: log.arrivalAt ?? null,
  };
};

const resolveMovementDate = (
  movement: SupervisorReportMovement,
  detail?: TransportDetail,
) => {
  if (movement.action === 'LLEGADA' && detail?.arrivalAt) {
    return detail.arrivalAt;
  }
  if (movement.action === 'SALIDA' && detail?.departureAt) {
    return detail.departureAt;
  }
  return movement.date;
};

const buildSupervisorLabel = (supervisor: ReportSupervisorOption | null) => {
  if (!supervisor) return 'Supervisor';
  const roleType = resolveRoleType(supervisor.roletype);
  return roleType && roleType !== '—'
    ? `${supervisor.name} (${roleType})`
    : supervisor.name;
};

export const ReporteSupervisoresSection = () => {
  const { supervisors, isLoading: isSupervisorsLoading } = useReportSupervisors();
  const [supervisorId, setSupervisorId] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return formatDateInput(date);
  });
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));
  const [report, setReport] = useState<SupervisorReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [transportDetails, setTransportDetails] = useState<Record<number, TransportDetail>>({});

  const supervisorOptions = useMemo(
    () =>
      supervisors.map((supervisor) => ({
        value: String(supervisor.id),
        label: buildSupervisorLabel(supervisor),
      })),
    [supervisors],
  );

  const selectedSupervisor = useMemo(
    () => supervisors.find((supervisor) => String(supervisor.id) === supervisorId) ?? null,
    [supervisors, supervisorId],
  );

  const handleGenerateReport = async () => {
    if (!supervisorId) {
      toast.error('Seleccione un supervisor');
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
      const response = await reportsService.getSupervisorReport({
        supervisorId: Number(supervisorId),
        startDate,
        endDate,
      });
      setReport(response);
      setTransportDetails({});
      toast.success('Reporte generado correctamente');
    } catch (error) {
      console.error(error);
      toast.error('No se pudo generar el reporte');
    } finally {
      setIsLoading(false);
    }
  };

  const reportRows = useMemo(() => report?.details ?? [], [report]);

  useEffect(() => {
    if (reportRows.length === 0) return;
    const missingIds = reportRows
      .map((row) => row.id)
      .filter((id) => !transportDetails[id]);
    if (missingIds.length === 0) return;
    let isActive = true;

    Promise.all(
      missingIds.map((id) => transportLogService.getById(id).catch(() => null)),
    ).then((responses) => {
      if (!isActive) return;
      setTransportDetails((prev) => {
        const next = { ...prev };
        responses.forEach((log) => {
          if (!log) return;
          next[log.id] = getTransportDetail(log);
        });
        return next;
      });
    });

    return () => {
      isActive = false;
    };
  }, [reportRows, transportDetails]);

  const rows = useMemo<SupervisorRow[]>(() => {
    return reportRows.map((movement) => {
      const detail = transportDetails[movement.id];
      const date = resolveMovementDate(movement, detail);
      return {
        id: movement.id,
        action: movement.action,
        date: date ? formatDateTime(date) : '—',
        status: movement.status,
        vehicle: movement.vehicle.vehicleid || movement.vehicle.plate || '—',
        plate: movement.vehicle.plate || '—',
        constSite: detail?.constSiteLabel || movement.constSite || '—',
        client: detail?.clientLabel || '—',
        planning: detail?.planningLabel || '—',
        m3: movement.m3 ?? null,
      };
    });
  }, [reportRows, transportDetails]);

  const resumen = useMemo(() => {
    if (!report) return null;
    const uniqueClients = new Set(
      Object.values(transportDetails)
        .map((detail) => detail.clientLabel)
        .filter((value): value is string => Boolean(value)),
    );
    const uniquePlannings = new Set(
      Object.values(transportDetails)
        .map((detail) => detail.planningLabel)
        .filter((value): value is string => Boolean(value)),
    );

    return {
      ...report.summary,
      uniqueClients: uniqueClients.size,
      uniquePlannings: uniquePlannings.size,
    };
  }, [report, transportDetails]);

  const planningList = useMemo(() => {
    return Array.from(
      new Set(
        Object.values(transportDetails)
          .map((detail) => detail.planningLabel)
          .filter((value): value is string => Boolean(value)),
      ),
    );
  }, [transportDetails]);

  const clientList = useMemo(() => {
    return Array.from(
      new Set(
        Object.values(transportDetails)
          .map((detail) => detail.clientLabel)
          .filter((value): value is string => Boolean(value)),
      ),
    );
  }, [transportDetails]);

  const handleExportExcel = () => {
    if (!report || rows.length === 0) {
      toast.error('No hay movimientos para exportar con los filtros actuales');
      return;
    }

    const supervisorName = report.supervisor.name || 'supervisor';
    const exportData = rows.map((row) => ({
      Supervisor: supervisorName,
      Email: report.supervisor.email || '—',
      'Tipo supervisor': resolveRoleType(report.supervisor.roleType),
      Acción: row.action,
      Fecha: row.date,
      Vehículo: row.vehicle,
      Placa: row.plate,
      Obra: row.constSite,
      Cliente: row.client,
      Planificación: row.planning,
      'M3': row.m3 ?? 0,
      Estado: statusLabel(row.status),
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Supervisor');
    const safeName = sanitizeFileName(supervisorName);
    XLSX.writeFile(workbook, `reporte_supervisor_${safeName}_${startDate}_${endDate}.xlsx`);
    toast.success('Excel generado correctamente');
  };

  const columns = [
    { header: 'Acción', accessor: 'action' as keyof SupervisorRow },
    { header: 'Fecha', accessor: 'date' as keyof SupervisorRow },
    { header: 'Vehículo', accessor: 'vehicle' as keyof SupervisorRow },
    { header: 'Placa', accessor: 'plate' as keyof SupervisorRow },
    { header: 'Obra', accessor: 'constSite' as keyof SupervisorRow },
    { header: 'Cliente', accessor: 'client' as keyof SupervisorRow },
    { header: 'Planificación', accessor: 'planning' as keyof SupervisorRow },
    {
      header: 'M3',
      accessor: (row: SupervisorRow) =>
        row.m3 != null ? formatNumber(row.m3) : '—',
    },
    {
      header: 'Estado',
      accessor: (row: SupervisorRow) => <StatusBadge status={statusToBadge(row.status)} />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-teal-100 p-2 rounded-lg">
            <UserCheck size={22} className="text-teal-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Reportes de Supervisores</h2>
            <p className="text-gray-600 text-sm mt-0.5">
              Consulta movimientos supervisados y exporta el detalle
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          icon={<Download size={16} />}
          onClick={handleExportExcel}
          disabled={!report || rows.length === 0}
        >
          Exportar Excel
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SearchableSelect
          label="Supervisor"
          options={supervisorOptions}
          value={supervisorId}
          onChange={setSupervisorId}
          placeholder="Buscar supervisor..."
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
            style={{ backgroundColor: '#0d9488' }}
          >
            Generar reporte
          </Button>
        </div>
      </div>

      {isSupervisorsLoading && (
        <div className="flex justify-center items-center py-6">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
        </div>
      )}

      {report && resumen && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-2">
                <p className="text-gray-500 text-sm">Supervisor</p>
                <p className="font-semibold text-gray-900">{report.supervisor.name}</p>
                <p className="text-gray-600 text-sm">{report.supervisor.email || '—'}</p>
                <p className="text-gray-600 text-sm">
                  {resolveRoleType(report.supervisor.roleType)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Periodo</p>
                <p className="font-semibold text-gray-900">
                  {formatDate(report.period.startDate)} - {formatDate(report.period.endDate)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Acciones</p>
                <p className="font-semibold text-gray-900">{resumen.totalActions}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Salidas</p>
                <p className="font-semibold text-gray-900">{resumen.totalDeparturesManaged}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Llegadas</p>
                <p className="font-semibold text-gray-900">{resumen.totalArrivalsManaged}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">M3 supervisados</p>
                <p className="text-lg font-bold text-gray-900">
                  {formatNumber(resumen.totalM3Supervised)} m³
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Clientes únicos</p>
                <p className="text-lg font-bold text-gray-900">
                  {resumen.uniqueClients}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Planificaciones únicas</p>
                <p className="text-lg font-bold text-gray-900">
                  {resumen.uniquePlannings}
                </p>
              </div>
            </div>
          </div>

          {(clientList.length > 0 || planningList.length > 0) && (
            <div className="bg-white rounded-lg shadow p-4 space-y-4">
              {clientList.length > 0 && (
                <div>
                  <p className="text-gray-900 font-semibold">Clientes</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {clientList.map((client) => (
                      <span
                        key={client}
                        className="px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-medium"
                      >
                        {client}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {planningList.length > 0 && (
                <div>
                  <p className="text-gray-900 font-semibold">Planificaciones</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {planningList.map((planning) => (
                      <span
                        key={planning}
                        className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium"
                      >
                        {planning}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-lg shadow">
            <Table
              data={rows}
              columns={columns}
              emptyMessage="No hay movimientos en el periodo seleccionado"
            />
          </div>
        </div>
      )}
    </div>
  );
};
