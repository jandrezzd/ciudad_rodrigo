import { useState, useMemo, useEffect } from 'react';
import { Download, Truck, Building2, ClipboardList, Users, UserCheck, Package, Warehouse } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Table } from '@/shared/components/Table';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { MultiSelect } from '@/shared/components/MultiSelect';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { formatDate, formatDateTime, formatNumber } from '@/shared/utils/format';
import { getReportedTransportIds } from '@/shared/utils/reporting';
import { transportLogService } from '@/modules/registro-transporte/services/transportLogService';
import { useUsers } from '@/modules/users/hooks/useUsers';
import { User } from '@/modules/users/types';
import { useVehicles } from '@/modules/vehicles/hooks/useVehicles';
import { useReportOwners } from '../hooks/useReportOwners';
import { reportsService } from '../services/reportsService';
import { OwnerReportResponse, ReportMovement, ReportVehicle } from '../types';
import { ReporteObrasSection } from './ReporteObrasSection';
import { ReportePlanificacionSection } from './ReportePlanificacionSection';
import { ReporteClientesSection } from './ReporteClientesSection';
import { ReporteSupervisoresSection } from './ReporteSupervisoresSection';
import { ReporteMaterialesSection } from './ReporteMaterialesSection';
import { ReporteProveedorMaterialSection } from './ReporteProveedorMaterialSection';
import { useAuth } from '@/modules/auth/hooks/useAuth';

// ─── Helpers ────────────────────────────────────────────────────────────────

type DisplayTransportStatus = 'EN_PROGRESO' | 'COMPLETADO' | 'CANCELADO' | 'ALERTA' | 'REVISADO';

const statusToBadge = (status: DisplayTransportStatus) => {
  if (status === 'COMPLETADO') return 'completado';
  if (status === 'CANCELADO') return 'cancelado';
  if (status === 'ALERTA') return 'alerta';
  if (status === 'REVISADO') return 'revisado';
  return 'en_progreso';
};

const formatDateInput = (value: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(value);

const roleLabels: Record<string, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
};

const roleTypeLabels: Record<string, string> = {
  OBRA: 'Obra',
  CANTERA: 'Cantera',
};

const companyLabels: Record<string, string> = {
  CIUDAD_RODRIGO: 'Ciudad Rodrigo',
  TRANSVELEZ: 'Transvelez',
  PAXOS: 'Paxos',
  DISMECTRA: 'Dismectra',
  PETROVELCA: 'Petrovelca',
};

type UserDisplay = {
  id?: number;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  roletype?: string | null;
  company?: string | null;
  document?: string | null;
  phone?: string | null;
};

const getUserRoleLabel = (usuario?: UserDisplay | null) => {
  if (!usuario?.role) return null;
  return roleLabels[usuario.role] ?? usuario.role;
};

const getUserSupervisorLabel = (usuario?: UserDisplay | null) => {
  if (!usuario) return null;
  if (usuario.role && usuario.role !== 'SUPERVISOR') return null;
  const name = usuario.name || '—';
  const roleType = usuario.roletype
    ? roleTypeLabels[usuario.roletype] ?? usuario.roletype
    : '';
  if (!roleType) return name;
  return `${name} (${roleType})`;
};

const normalizeTransportStatus = (
  status?: ReportMovement['status'] | null,
): DisplayTransportStatus => {
  if (!status) return 'EN_PROGRESO';
  if (status === 'IN_PROGRESS' || status === 'EN_PROGRESO') return 'EN_PROGRESO';
  if (status === 'COMPLETED' || status === 'COMPLETADO') return 'COMPLETADO';
  if (status === 'CANCELLED' || status === 'CANCELADO') return 'CANCELADO';
  if (status === 'ALERTA') return 'ALERTA';
  if (status === 'REVISADO') return 'REVISADO';
  return 'EN_PROGRESO';
};

const getResolvedM3 = (movement: ReportMovement | null) => {
  if (!movement) return { departure: null, arrival: null, difference: null };
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

const isDeviationAlert = (difference: number | null) => {
  return difference !== null && Math.abs(difference) >= 1;
};

const getDisplayStatus = (movement: ReportMovement) => normalizeTransportStatus(movement.status);

const getStatusLabel = (movement: ReportMovement) => {
  const displayStatus = getDisplayStatus(movement);
  const map: Record<DisplayTransportStatus, string> = {
    EN_PROGRESO: 'En progreso',
    COMPLETADO: 'Completado',
    CANCELADO: 'Cancelado',
    ALERTA: 'Alerta',
    REVISADO: 'Revisado',
  };
  return map[displayStatus] ?? 'En progreso';
};

const renderUserCell = (usuario?: UserDisplay | null) => {
  if (!usuario) return '—';
  const role = getUserRoleLabel(usuario);
  const supervisor = getUserSupervisorLabel(usuario);
  const company = usuario.company
    ? companyLabels[usuario.company] ?? usuario.company
    : '';
  const metaParts = [
    role ? `Rol: ${role}` : null,
    supervisor ? `Supervisor: ${supervisor}` : null,
    company ? `Empresa: ${company}` : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="flex flex-col">
      <span className="font-medium text-gray-900">{usuario.name || '—'}</span>
      {metaParts.length > 0 && (
        <span className="text-xs text-gray-500">{metaParts.join(' · ')}</span>
      )}
      {usuario.email && <span className="text-xs text-gray-500">{usuario.email}</span>}
      {usuario.document && (
        <span className="text-xs text-gray-500">Documento: {usuario.document}</span>
      )}
      {usuario.phone && (
        <span className="text-xs text-gray-500">Tel: {usuario.phone}</span>
      )}
    </div>
  );
};

const reportStatusConfig: Record<string, { label: string; className: string }> = {
  NORMAL: { label: 'Normal', className: 'bg-gray-100 text-gray-800' },
  ALERTA: { label: 'Alerta', className: 'bg-orange-100 text-orange-800' },
  REVISADO: { label: 'Revisado', className: 'bg-purple-100 text-purple-800' },
};

const sanitizeFileName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface ReportRow {
  id: number;
  vehicle: string;
  plate: string;
  departureAt: string;
  arrivalAt: string;
  departureM3: number | null;
  arrivalM3: number | null;
  difference: number | null;
  obra: string;
  cliente: string;
  conductor: string;
  usuario: ReportMovement['usuario'] | null;
  status: DisplayTransportStatus;
  statusLabel: string;
  reportStatus: 'REPORTADO' | 'OK';
  vehicleIsActive: string;
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type TabId = 'proveedores' | 'obras' | 'planificacion' | 'clientes' | 'supervisores' | 'materiales' | 'proveedor-material';

const TABS: { id: TabId; label: string; icon: React.ReactNode; color: string; activeColor: string }[] = [
  {
    id: 'obras',
    label: 'Obras',
    icon: <Building2 size={17} />,
    color: 'text-emerald-600',
    activeColor: 'border-emerald-600 text-emerald-700 bg-emerald-50',
  },
  {
    id: 'materiales',
    label: 'Materiales',
    icon: <Package size={17} />,
    color: 'text-rose-600',
    activeColor: 'border-rose-600 text-rose-700 bg-rose-50',
  },
  {
    id: 'proveedor-material',
    label: 'Prov. Material',
    icon: <Warehouse size={17} />,
    color: 'text-amber-600',
    activeColor: 'border-amber-600 text-amber-700 bg-amber-50',
  },
  {
    id: 'proveedores',
    label: 'Proveedores',
    icon: <Truck size={17} />,
    color: 'text-blue-600',
    activeColor: 'border-blue-600 text-blue-700 bg-blue-50',
  },
  {
    id: 'planificacion',
    label: 'Planificación',
    icon: <ClipboardList size={17} />,
    color: 'text-indigo-600',
    activeColor: 'border-indigo-600 text-indigo-700 bg-indigo-50',
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: <Users size={17} />,
    color: 'text-sky-600',
    activeColor: 'border-sky-600 text-sky-700 bg-sky-50',
  },
  {
    id: 'supervisores',
    label: 'Supervisores',
    icon: <UserCheck size={17} />,
    color: 'text-teal-600',
    activeColor: 'border-teal-600 text-teal-700 bg-teal-50',
  },
];

// ─── Sección de Proveedores (extraída del componente original) ────────────────

const ReporteProveedoresSection = () => {
  const { owners, isLoading: isOwnersLoading } = useReportOwners();
  const { users } = useUsers();
  const { vehicles } = useVehicles();
  const [ownerId, setOwnerId] = useState('');
  const [vehicleIds, setVehicleIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return formatDateInput(date);
  });
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));
  const [report, setReport] = useState<OwnerReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reportedIds, setReportedIds] = useState(() => new Set(getReportedTransportIds()));
  const [transportUserMap, setTransportUserMap] = useState<
    Record<number, { userArrivalId?: number | null }>
  >({});

  useEffect(() => {
    setVehicleIds([]);
  }, [ownerId]);

  const ownerOptions = useMemo(
    () =>
      owners.map((owner) => ({
        value: String(owner.id),
        label: `${owner.companyname}${owner.ruc ? ` (${owner.ruc})` : ''}`,
      })),
    [owners],
  );

  const ownerVehicles = useMemo(() => {
    if (!ownerId) return [];
    return vehicles.filter((vehicle) => String(vehicle.ownerId) === ownerId);
  }, [ownerId, vehicles]);

  const vehicleOptions = useMemo(
    () =>
      ownerVehicles.map((vehicle) => {
        const plate = vehicle.plate || vehicle.vehicleid || '—';
        const code = vehicle.vehicleid && vehicle.vehicleid !== vehicle.plate
          ? ` - ${vehicle.vehicleid}`
          : '';
        const status = vehicle.isActive === false ? ' (Inactivo)' : '';
        return {
          value: String(vehicle.id),
          label: `${plate}${code}${status}`,
        };
      }),
    [ownerVehicles],
  );

  const selectedVehicleSet = useMemo(() => {
    if (vehicleIds.length === 0) return null;
    return new Set(vehicleIds.map((id) => Number(id)));
  }, [vehicleIds]);

  const filteredVehicles = useMemo(() => {
    if (!report) return [] as ReportVehicle[];
    if (!selectedVehicleSet) return report.vehicles;
    return report.vehicles.filter((vehicle) => selectedVehicleSet.has(vehicle.vehicle.id));
  }, [report, selectedVehicleSet]);

  const reportRows = useMemo<ReportRow[]>(() => {
    if (!report) return [];
    const rows: ReportRow[] = [];
    filteredVehicles.forEach((vehicle: ReportVehicle) => {
      vehicle.movements.forEach((movement) => {
        const resolved = getResolvedM3(movement);
        const departureM3 = resolved.departure;
        const arrivalM3 = resolved.arrival;
        const difference =
          resolved.difference != null ? Number(resolved.difference.toFixed(2)) : null;
        const status = getDisplayStatus(movement);
        const reportStatus = reportedIds.has(movement.id) ? 'REPORTADO' : 'OK';
        rows.push({
          id: movement.id,
          vehicle: vehicle.vehicle.vehicleid || vehicle.vehicle.plate || '—',
          vehicleIsActive: vehicle.vehicle.isActive !== false ? 'Activo' : 'Inactivo',
          plate: vehicle.vehicle.plate || '—',
          departureAt: movement.departureAt ? formatDateTime(movement.departureAt) : '—',
          arrivalAt: movement.arrivalAt ? formatDateTime(movement.arrivalAt) : 'Pendiente',
          departureM3,
          arrivalM3,
          difference,
          obra: movement.obras?.name || '—',
          cliente: movement.cliente?.companyname || movement.cliente?.name || '—',
          conductor: movement.driver?.name || '—',
          usuario: movement.usuario ?? null,
          status,
          statusLabel: getStatusLabel(movement),
          reportStatus,
        });
      });
    });
    return rows;
  }, [filteredVehicles, report, reportedIds]);

  const usersMap = useMemo(() => {
    return new Map(users.map((user) => [user.id, user]));
  }, [users]);

  useEffect(() => {
    if (reportRows.length === 0) return;
    const missingIds = reportRows
      .map((row) => row.id)
      .filter((id) => !transportUserMap[id]);
    if (missingIds.length === 0) return;
    let isActive = true;

    Promise.all(
      missingIds.map((id) => transportLogService.getById(id).catch(() => null)),
    ).then((responses) => {
      if (!isActive) return;
      setTransportUserMap((prev) => {
        const next = { ...prev };
        responses.forEach((log) => {
          if (!log) return;
          next[log.id] = {
            userArrivalId: log.userArrivalId ?? null,
          };
        });
        return next;
      });
    });

    return () => {
      isActive = false;
    };
  }, [reportRows, transportUserMap]);

  const resolveUserDisplay = (
    userId?: number | null,
    fallback?: ReportMovement['usuario'] | null,
  ): UserDisplay | null => {
    if (userId && usersMap.has(userId)) {
      const user = usersMap.get(userId) as User;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roletype: user.roletype ?? null,
        company: user.company ?? null,
        document: user.document ?? null,
        phone: user.phone ?? null,
      };
    }
    if (fallback) {
      return {
        id: fallback.id,
        name: fallback.name ?? '—',
        email: fallback.email ?? null,
        role: fallback.role ?? null,
        roletype: fallback.roletype ?? null,
        company: fallback.company ?? null,
        document: fallback.document ?? null,
        phone: fallback.phone ?? null,
      };
    }
    return null;
  };

  const getDepartureUser = (row: ReportRow) =>
    resolveUserDisplay(row.usuario?.id ?? null, row.usuario);

  const getArrivalUser = (row: ReportRow) =>
    resolveUserDisplay(transportUserMap[row.id]?.userArrivalId ?? null, null);

  const reportTotals = useMemo(() => {
    const totals = reportRows.reduce(
      (acc, row) => {
        if (row.departureM3 != null) acc.departure += row.departureM3;
        if (row.arrivalM3 != null) acc.arrival += row.arrivalM3;
        if (row.difference != null) acc.difference += row.difference;
        return acc;
      },
      { departure: 0, arrival: 0, difference: 0 },
    );

    const vehiclesWithDeviation = new Set(
      reportRows
        .filter((row) => isDeviationAlert(row.difference))
        .map((row) => row.plate || row.vehicle),
    );

    return {
      totalDeparture: Number(totals.departure.toFixed(2)),
      totalArrival: Number(totals.arrival.toFixed(2)),
      totalDeviation: Number(totals.difference.toFixed(2)),
      vehiclesWithDeviation: vehiclesWithDeviation.size,
    };
  }, [reportRows]);

  const providerStatus = useMemo(() => {
    if (report?.status) return report.status;
    if (!reportRows.length) return 'NORMAL' as const;
    const hasAlert = reportRows.some((row) => row.status === 'ALERTA');
    if (hasAlert) return 'ALERTA' as const;
    const allReviewed = reportRows.every((row) => row.status === 'REVISADO');
    if (allReviewed) return 'REVISADO' as const;
    return 'NORMAL' as const;
  }, [report?.status, reportRows]);

  const providerStatusDescription = useMemo(() => {
    if (!reportRows.length) return 'Sin movimientos en el periodo seleccionado.';
    if (providerStatus === 'ALERTA') {
      return 'Se encontraron movimientos con desvío ≥ 1 m³.';
    }
    if (providerStatus === 'REVISADO') {
      return 'Todos los movimientos están revisados.';
    }
    return 'Sin alertas en el periodo seleccionado.';
  }, [providerStatus, reportRows.length]);

  const reportedVehicles = useMemo(() => {
    if (!report)
      return [] as Array<{ plate: string; totalDifference: number; affectedMovements: number }>;
    return filteredVehicles
      .map((vehicle) => {
        const differences = vehicle.movements
          .map((movement) => {
            if (!reportedIds.has(movement.id)) return null;
            const resolved = getResolvedM3(movement);
            if (resolved.difference == null) return null;
            return resolved.difference;
          })
          .filter((value): value is number => value !== null && value !== 0);
        const totalDifference = Number(
          differences.reduce((sum, value) => sum + value, 0).toFixed(2),
        );
        if (differences.length === 0) return null;
        return {
          plate: vehicle.vehicle.plate || vehicle.vehicle.vehicleid || '—',
          totalDifference,
          affectedMovements: differences.length,
        };
      })
      .filter(
        (
          item,
        ): item is { plate: string; totalDifference: number; affectedMovements: number } =>
          item !== null,
      );
  }, [filteredVehicles, report, reportedIds]);

  const handleGenerateReport = async () => {
    if (!ownerId) {
      toast.error('Seleccione un proveedor');
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
      const response = await reportsService.getOwnerReport({
        ownerId: Number(ownerId),
        startDate,
        endDate,
      });
      setReport(response);
      setReportedIds(new Set(getReportedTransportIds()));
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
      toast.error('No hay movimientos para exportar con los filtros actuales');
      return;
    }
    try {
      const exportData = reportRows.map((row) => ({
        Vehículo: row.vehicle,
        'Estado Vehículo': row.vehicleIsActive,
        Placa: row.plate,
        Salida: row.departureAt,
        Llegada: row.arrivalAt,
        'M3 Salida': row.departureM3 ?? 0,
        'M3 Llegada': row.arrivalM3 ?? 0,
        Diferencia: row.difference ?? 0,
        'Estado reporte': row.reportStatus,
        Obra: row.obra,
        Cliente: row.cliente,
        Conductor: row.conductor,
        'Usuario salida': getDepartureUser(row)?.name || '—',
        'Cargo salida': getUserRoleLabel(getDepartureUser(row)) || '—',
        'Rol salida': getUserSupervisorLabel(getDepartureUser(row)) || '—',
        'Usuario llegada': getArrivalUser(row)?.name || '—',
        'Cargo llegada': getUserRoleLabel(getArrivalUser(row)) || '—',
        'Rol llegada': getUserSupervisorLabel(getArrivalUser(row)) || '—',
        Estado: row.statusLabel,
      }));
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte');
      const ownerName = sanitizeFileName(report.owner.companyname || 'proveedor');
      const fileName = `reporte_${ownerName}_${startDate}_${endDate}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      toast.success('Excel generado correctamente');
    } catch (error) {
      console.error(error);
      toast.error('No se pudo generar el Excel');
    }
  };

  const columns = [
    { header: 'Vehículo', accessor: 'vehicle' as keyof ReportRow },
    { header: 'Placa', accessor: 'plate' as keyof ReportRow },
    { header: 'Salida', accessor: 'departureAt' as keyof ReportRow },
    { header: 'Llegada', accessor: 'arrivalAt' as keyof ReportRow },
    {
      header: 'M3 Salida',
      accessor: (row: ReportRow) =>
        row.departureM3 != null ? formatNumber(row.departureM3) : '—',
    },
    {
      header: 'M3 Llegada',
      accessor: (row: ReportRow) =>
        row.arrivalM3 != null ? formatNumber(row.arrivalM3) : '—',
    },
    {
      header: 'Diferencia',
      accessor: (row: ReportRow) => {
        if (row.difference == null) return '—';
        const isAlert = isDeviationAlert(row.difference);
        return (
          <span
            className={
              isAlert ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'
            }
          >
            {formatNumber(row.difference)}
          </span>
        );
      },
    },
    {
      header: 'Reporte',
      accessor: (row: ReportRow) => (
        <span
          className={
            row.reportStatus === 'REPORTADO'
              ? 'text-red-600 font-semibold'
              : 'text-green-600 font-semibold'
          }
        >
          {row.reportStatus}
        </span>
      ),
    },
    { header: 'Obra', accessor: 'obra' as keyof ReportRow },
    { header: 'Cliente', accessor: 'cliente' as keyof ReportRow },
    { header: 'Conductor', accessor: 'conductor' as keyof ReportRow },
    {
      header: 'Usuario salida',
      accessor: (row: ReportRow) => renderUserCell(getDepartureUser(row)),
      className: 'whitespace-normal',
    },
    {
      header: 'Usuario llegada',
      accessor: (row: ReportRow) => renderUserCell(getArrivalUser(row)),
      className: 'whitespace-normal',
    },
    {
      header: 'Estado',
      accessor: (row: ReportRow) => <StatusBadge status={statusToBadge(row.status)} />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <Truck size={22} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Reportes de Proveedores</h2>
            <p className="text-gray-600 text-sm mt-0.5">
              Consulta movimientos por proveedor y exporta a Excel
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
          icon={<Download size={16} />}
          onClick={handleExportExcel}
          disabled={!report}
        >
          Exportar Excel
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <SearchableSelect
          label="Proveedor"
          options={ownerOptions}
          value={ownerId}
          onChange={setOwnerId}
        />
        <MultiSelect
          label="Vehículo"
          options={vehicleOptions}
          values={vehicleIds}
          onChange={setVehicleIds}
          placeholder={ownerId ? 'Selecciona uno o varios' : 'Seleccione proveedor primero'}
          disabled={!ownerId || vehicleOptions.length === 0}
          selectAllLabel="Todos"
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
          >
            Generar reporte
          </Button>
        </div>
      </div>

      {isOwnersLoading && (
        <div className="flex justify-center items-center py-6">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      )}

      {report && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div>
                <p className="text-gray-500 text-sm">Proveedor</p>
                <p className="font-semibold text-gray-900">{report.owner.companyname}</p>
                <p className="text-gray-600 text-sm">{report.owner.ruc || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Periodo</p>
                <p className="font-semibold text-gray-900">
                  {formatDate(report.period.startDate)} - {formatDate(report.period.endDate)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Movimientos</p>
                <p className="font-semibold text-gray-900">{reportRows.length}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Total M3 salida</p>
                <p className="font-semibold text-gray-900">
                  {formatNumber(reportTotals.totalDeparture)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Total M3 llegada</p>
                <p className="font-semibold text-gray-900">
                  {formatNumber(reportTotals.totalArrival)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Vehículos con desvío</p>
                <p className="font-semibold text-gray-900">
                  {reportTotals.vehiclesWithDeviation} de {filteredVehicles.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-gray-900 font-semibold">Estado del proveedor</p>
            <div className="flex flex-wrap items-center gap-3">
              {(() => {
                const statusConfig =
                  reportStatusConfig[providerStatus] ?? reportStatusConfig.NORMAL;
                return (
                  <span
                    className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusConfig.className}`}
                  >
                    {statusConfig.label}
                  </span>
                );
              })()}
              <p className="text-gray-600 text-sm">{providerStatusDescription}</p>
            </div>
            <div className="mt-3 text-sm text-gray-600">
              <p>
                Desvío = M3 llegada - M3 salida · Total desvío:{' '}
                <span
                  className={`font-semibold ${
                    reportTotals.totalDeviation < 0 ? 'text-red-600' : 'text-emerald-600'
                  }`}
                >
                  {formatNumber(reportTotals.totalDeviation)} m³
                </span>
              </p>
              <p>
                Total M3 llegada:{' '}
                <span className="font-semibold text-gray-900">
                  {formatNumber(reportTotals.totalArrival)}
                </span>
              </p>
            </div>
            {reportedVehicles.length > 0 && (
              <ul className="mt-3 space-y-2 text-sm">
                {reportedVehicles.map((item) => (
                  <li key={item.plate} className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">{item.plate}</span>
                    <span className="text-gray-500">
                      Movimientos con diferencia: {item.affectedMovements}
                    </span>
                    <span className="text-red-600 font-semibold">
                      Diferencia total: {formatNumber(item.totalDifference)} m³
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-lg shadow">
            <Table
              data={reportRows}
              columns={columns}
              emptyMessage="No hay movimientos en el periodo seleccionado"
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Página principal con Tabs ────────────────────────────────────────────────

export const ReportesPage = () => {
  const { user } = useAuth();
  const isJefeDeObra = user?.role === 'JEFE_DE_OBRA';

  // Para JEFE_DE_OBRA solo mostrar la pestaña de Materiales
  const visibleTabs = isJefeDeObra
    ? TABS.filter((tab) => tab.id === 'materiales')
    : TABS;

  const defaultTab: TabId = isJefeDeObra ? 'materiales' : 'obras';
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);

  return (
    <div className="space-y-6">
      {/* Encabezado general */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Reportes</h1>
        <p className="text-gray-600 mt-1">
          {isJefeDeObra
            ? 'Consulta el material transportado por obra y exporta a Excel'
            : 'Consulta reportes por proveedor, obra, planificación, materiales o cliente y exporta a Excel'
          }
        </p>
      </div>

      {/* Tabs de navegación */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex border-b border-gray-200 px-4 overflow-x-auto">
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-2 transition-all whitespace-nowrap
                  ${
                    isActive
                      ? `${tab.activeColor} border-current`
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                <span className={isActive ? tab.color : 'text-gray-400'}>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Contenido del tab activo */}
        <div className="p-6">
          {activeTab === 'obras' && !isJefeDeObra && <ReporteObrasSection />}
          {activeTab === 'materiales' && <ReporteMaterialesSection />}
          {activeTab === 'proveedores' && !isJefeDeObra && <ReporteProveedoresSection />}
          {activeTab === 'planificacion' && !isJefeDeObra && <ReportePlanificacionSection />}
          {activeTab === 'clientes' && !isJefeDeObra && <ReporteClientesSection />}
          {activeTab === 'supervisores' && !isJefeDeObra && <ReporteSupervisoresSection />}
          {activeTab === 'proveedor-material' && !isJefeDeObra && <ReporteProveedorMaterialSection />}
        </div>
      </div>
    </div>
  );
};
