import { useMemo, useState, useEffect } from 'react';
import { Eye, Download, Pencil, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Modal';
import { Table } from '@/shared/components/Table';
import { Pagination } from '@/shared/components/Pagination';
import { Input } from '@/shared/components/Input';
import { Select } from '@/shared/components/Select';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { formatDateTime, formatNumber } from '@/shared/utils/format';
import { formatMaterialType } from '@/modules/materiales/utils/materialLabels';
import axiosInstance from '@/config/axios';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { useTransportLogs } from '../hooks/useTransportLogs';
import { transportLogService } from '../services/transportLogService';
import { TransportLog, TransportStatus } from '../types';
import { generateTransportLogPdf } from '../utils/transportLogPdf';
import { VEHICLE_COMPANY_LABELS, inferVehicleCompany, normalizeVehicleType, VehicleType } from '@/modules/vehicles/types';
import { useProveedores } from '@/modules/proveedores/hooks/useProveedores';
import { useObras } from '@/modules/obras/hooks/useObras';
import { usePlanificaciones } from '@/modules/planificacion/hooks/usePlanificaciones';
import { useMateriales } from '@/modules/materiales/hooks/useMateriales';
import { MaterialShowcase } from './MaterialShowcase';
import { TransportePlanForm } from './TransportePlanForm';

type DisplayTransportStatus = 'EN_PROGRESO' | 'COMPLETADO' | 'CANCELADO' | 'ALERTA' | 'REVISADO' | 'VALIDADO';

const normalizeTransportStatus = (status?: TransportStatus | null): DisplayTransportStatus => {
  if (!status) return 'EN_PROGRESO';
  if (status === 'IN_PROGRESS' || status === 'EN_PROGRESO') return 'EN_PROGRESO';
  if (status === 'COMPLETED' || status === 'COMPLETADO') return 'COMPLETADO';
  if (status === 'CANCELLED' || status === 'CANCELADO') return 'CANCELADO';
  if (status === 'ALERTA') return 'ALERTA';
  if (status === 'REVISADO') return 'REVISADO';
  if (status === 'VALIDADO') return 'VALIDADO';
  return 'EN_PROGRESO';
};

// Obtiene los valores M3 directamente desde la BD para la tabla general.
// Usa siempre arrivalM3 y departureM3 (los valores base), no los campos *Corrected,
// para que cualquier modificación directa en la BD se refleje en la interfaz al recargar.
const getResolvedM3 = (log: TransportLog | null) => {
  if (!log) return { departure: null, arrival: null, difference: null };
  const departure = log.departureM3Corrected ?? log.departureM3 ?? null;
  const arrival = log.arrivalM3Corrected ?? log.arrivalM3 ?? null;
  const difference = departure !== null && arrival !== null ? arrival - departure : null;
  return { departure, arrival, difference };
};

const isDeviationAlert = (difference: number | null) => {
  return difference !== null && Math.abs(difference) >= 1;
};

const getDisplayStatus = (log: TransportLog): DisplayTransportStatus => {
  const normalized = normalizeTransportStatus(log.status);
  // Estados explícitos del backend tienen prioridad absoluta
  if (normalized === 'CANCELADO') return 'CANCELADO';
  if (normalized === 'VALIDADO') return 'VALIDADO';
  if (normalized === 'REVISADO') return 'REVISADO';
  if (normalized === 'COMPLETADO') return 'COMPLETADO';
  if (normalized === 'ALERTA') return 'ALERTA';
  // Si el estado es EN_PROGRESO, aplicar lógica calculada
  const hasCorrections = log.departureM3Corrected != null || log.arrivalM3Corrected != null;
  if (hasCorrections) return 'REVISADO';
  const resolved = getResolvedM3(log);
  const hasDeviation = isDeviationAlert(resolved.difference);
  if (hasDeviation || log.initialStatus === 'ALERTA') return 'ALERTA';
  if (log.arrivalAt) return 'COMPLETADO';
  return 'EN_PROGRESO';
};

const statusToBadge = (status: DisplayTransportStatus) => {
  if (status === 'COMPLETADO') return 'completado';
  if (status === 'CANCELADO') return 'cancelado';
  if (status === 'ALERTA') return 'alerta';
  if (status === 'REVISADO') return 'revisado';
  if (status === 'VALIDADO') return 'validado';
  return 'en_progreso';
};

const resolveTransportUrl = (rawUrl?: string | null) => {
  if (!rawUrl) return '';
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  const normalized = rawUrl.replace(/^\/+/, '');
  const baseUrl = axiosInstance.defaults.baseURL ?? '';
  const baseOrigin = baseUrl.replace(/\/api\/?$/i, '');
  if (normalized.startsWith('uploads/')) return `${baseOrigin}/${normalized}`;
  if (normalized.startsWith('transport/')) return `${baseOrigin}/uploads/${normalized}`;
  return `${baseOrigin}/uploads/transport/${normalized}`;
};

const getDuration = (start?: string | null, end?: string | null) => {
  if (!start || !end) return '—';
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (isNaN(startTime) || isNaN(endTime)) return '—';
  const diffMs = endTime - startTime;
  if (diffMs < 0) return '—';
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (diffHours === 0) return `${diffMinutes}m`;
  return `${diffHours}h ${diffMinutes}m`;
};

const getInternalCompanyFromLog = (log: TransportLog) => {
  return (
    log.vehicle?.company ??
    inferVehicleCompany(`${log.owner?.companyname ?? ''} ${log.owner?.name ?? ''}`) ??
    inferVehicleCompany(log.vehicle?.vehicleid)
  );
};

const getEmpresaType = (log: TransportLog): VehicleType | null => {
  const internalCompany = getInternalCompanyFromLog(log);
  if (internalCompany) return 'INTERNO';

  const normalized = normalizeVehicleType(log.vehicle?.type);
  if (normalized === 'EXTERNO') return 'EXTERNO';

  const ownerName = `${log.owner?.companyname ?? ''} ${log.owner?.name ?? ''}`.toLowerCase();
  if (ownerName) return 'EXTERNO';

  return null;
};

const getEmpresaLabel = (log: TransportLog) => {
  const internalCompany = getInternalCompanyFromLog(log);
  if (internalCompany) return VEHICLE_COMPANY_LABELS[internalCompany];
  return '—';
};

const getMaterialLabel = (log: TransportLog) => {
  if (log.material?.materialType) {
    return formatMaterialType(log.material.materialType);
  }
  return '—';
};

const isInternalOwnerName = (companyname?: string, name?: string) => {
  return Boolean(inferVehicleCompany(`${companyname ?? ''} ${name ?? ''}`));
};

const APP_TIME_ZONE = 'America/Guayaquil';

const toDateKey = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-CA', { timeZone: APP_TIME_ZONE });
};

const isDateInRange = (dateKey: string | null, from?: string, to?: string) => {
  if (!dateKey) return false;
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
};

export const TransportLogPage = () => {
  const { user } = useAuth();
  const { transportLogs, isLoading, refetch } = useTransportLogs();
  const { proveedores } = useProveedores();
  const { obras } = useObras();
  const { planificaciones } = usePlanificaciones();
  const { materiales } = useMateriales();
  const [detailOpen, setDetailOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLog, setDetailLog] = useState<TransportLog | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);
  const [isEditM3Open, setIsEditM3Open] = useState(false);
  const [editDepartureM3, setEditDepartureM3] = useState('');
  const [editArrivalM3, setEditArrivalM3] = useState('');
  const [isSavingM3, setIsSavingM3] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [isMarkingReviewed, setIsMarkingReviewed] = useState(false);
  const [editDescription, setEditDescription] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [propietarioFilter, setPropietarioFilter] = useState('');
  const [obraFilter, setObraFilter] = useState('');
  const [materialFilter, setMaterialFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [vehicleIdFilter, setVehicleIdFilter] = useState('');
  const [proveedorMaterialFilter, setProveedorMaterialFilter] = useState('');
  const [canteraFilter, setCanteraFilter] = useState('');
  const [facturaFilter, setFacturaFilter] = useState('');

  // Opciones unificadas de Propietario: empresas internas + proveedores externos
  const propietarioOptions = useMemo(() => {
    const options: { value: string; label: string; type: 'INTERNO' | 'EXTERNO' }[] = [];

    // Empresas internas (los 2 valores de VEHICLE_COMPANY_LABELS)
    const empresasInternas = new Set<string>();
    Object.values(VEHICLE_COMPANY_LABELS).forEach((label) => empresasInternas.add(label));
    transportLogs.forEach((log) => {
      const internalCompany = getInternalCompanyFromLog(log);
      if (internalCompany) empresasInternas.add(VEHICLE_COMPANY_LABELS[internalCompany]);
    });
    proveedores.forEach((p) => {
      const company = inferVehicleCompany(`${p.companyname ?? ''} ${p.name ?? ''}`);
      if (company) empresasInternas.add(VEHICLE_COMPANY_LABELS[company]);
    });
    empresasInternas.forEach((label) =>
      options.push({ value: `INTERNO::${label}`, label, type: 'INTERNO' })
    );

    // Proveedores externos
    const fromProveedores = proveedores.length
      ? proveedores
          .filter((p) => !isInternalOwnerName(p.companyname, p.name))
          .map((p) => p.companyname)
          .filter(Boolean) as string[]
      : [];
    const fromLogs = transportLogs
      .filter((log) => getEmpresaType(log) === 'EXTERNO')
      .map((log) => log.owner?.companyname)
      .filter(Boolean) as string[];
    const extProveedores = Array.from(new Set(fromProveedores.length ? fromProveedores : fromLogs));
    extProveedores.forEach((name) =>
      options.push({ value: `EXTERNO::${name}`, label: name, type: 'EXTERNO' })
    );

    return options;
  }, [proveedores, transportLogs]);

  const planningCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    planificaciones.forEach((planning) => {
      if (!planning?.id) return;
      map.set(String(planning.id), planning.planningCode || String(planning.id));
    });
    return map;
  }, [planificaciones]);

  const getPlanningLabel = (log: TransportLog) => {
    if (!log.planningId) return '—';
    return planningCodeMap.get(String(log.planningId)) ?? String(log.planningId);
  };
  const obraOptions = useMemo(() => {
    const entries = new Map<string, string>();
    obras.forEach((obra) => {
      const label = obra.name || '';
      if (label) entries.set(String(obra.id), label);
    });
    transportLogs.forEach((log) => {
      if (!log.constSite?.id) return;
      const label = log.constSite.name || '';
      if (label) entries.set(String(log.constSite.id), label);
    });
    return [
      { value: '', label: 'Todas' },
      ...Array.from(entries.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [obras, transportLogs]);

  const materialOptions = useMemo(() => {
    const entries = new Map<string, string>();
    materiales.forEach((material) => {
      if (!material?.id) return;
      entries.set(String(material.id), formatMaterialType(material.materialType));
    });
    transportLogs.forEach((log) => {
      const id = log.materialId ?? log.material?.id;
      if (!id) return;
      entries.set(String(id), getMaterialLabel(log));
    });
    return [
      { value: '', label: 'Todos' },
      ...Array.from(entries.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [materiales, transportLogs]);

  const proveedorMaterialOptions = useMemo(() => {
    const options = new Set<string>();
    transportLogs.forEach((log) => {
      log.planning?.canteras?.forEach((planningCantera) => {
        const providerName = planningCantera?.cantera?.materialProvider?.razonsocial;
        if (providerName) options.add(providerName);
      });
    });
    return [
      { value: '', label: 'Todos' },
      ...Array.from(options)
        .sort((a, b) => a.localeCompare(b, 'es'))
        .map((label) => ({ value: label, label })),
    ];
  }, [transportLogs]);

  const canteraOptions = useMemo(() => {
    const options = new Set<string>();
    transportLogs.forEach((log) => {
      log.planning?.canteras?.forEach((planningCantera) => {
        const canteraName = planningCantera?.cantera?.nombre;
        if (canteraName) options.add(canteraName);
      });
    });
    return [
      { value: '', label: 'Todas' },
      ...Array.from(options)
        .sort((a, b) => a.localeCompare(b, 'es'))
        .map((label) => ({ value: label, label })),
    ];
  }, [transportLogs]);

  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  const handleOpenDetail = async (id: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setShowPhotos(false);
    try {
      const data = await transportLogService.getById(id);
      setDetailLog(data);
    } catch (err) {
      console.error(err);
      toast.error('No se pudo cargar el detalle');
    } finally {
      setDetailLoading(false);
    }
  };

  const resolveExcelStatus = (log: TransportLog) => {
    const displayStatus = getDisplayStatus(log);
    if (displayStatus === 'ALERTA') return 'Alerta';
    if (displayStatus === 'REVISADO') return 'Revisado';
    if (displayStatus === 'VALIDADO') return 'Validado';
    if (displayStatus === 'CANCELADO') return 'Cancelado';
    if (displayStatus === 'COMPLETADO') return 'Completado';
    if (!log.arrivalAt) return 'Pendiente';
    return 'En progreso';
  };

  const handleDownloadExcel = () => {
    if (!filteredLogs.length) {
      toast.error('No hay registros para exportar');
      return;
    }

    const exportData = filteredLogs.map((log) => {
      const resolved = getResolvedM3(log);
      const departureM3 = resolved.departure ?? 0;
      const arrivalM3 = resolved.arrival ?? null;
      const difference = resolved.difference != null ? Number(resolved.difference.toFixed(2)) : null;

      return {
        'ID del vehiculo': log.vehicle?.vehicleid || log.vehicleId,
        'placa': log.vehicle?.plate || '—',
        'conductor': log.vehicle?.driver?.name || '—',
        'Canteras': log.planning?.canteras?.map((c: any) => c.cantera?.nombre).join(', ') || '—',
        'Material': getMaterialLabel(log),
        'abscisa': log.abscisa ?? '—',
        'fecha salida': formatDateTime(log.departureAt || log.createdAt || '') || '—',
        'fecha llegada': log.arrivalAt ? formatDateTime(log.arrivalAt) : 'Pendiente',
        'tiempo de viaje': getDuration(log.departureAt || log.createdAt, log.arrivalAt),
        'estado': resolveExcelStatus(log),
        'm3 salida': departureM3,
        'm3 de llegada': arrivalM3 ?? '—',
        'desviacion': difference ?? '—',
        'capacidad m3': log.vehicle?.capacity ?? '—',
        'marca': log.vehicle?.brand || '—',
        'modelo': log.vehicle?.model || '—',
        'año': log.vehicle?.year ?? '—',
        'proveedor': log.owner?.companyname || '—',
        'empresa': getEmpresaLabel(log),
        'cliente': log.client?.companyname || '—',
        'obra': log.constSite?.name || '—',
        'factura': log.numeroFactura || log.planning?.numeroFactura || '—',
        'planificacion': getPlanningLabel(log),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Registro Transporte ');
    XLSX.writeFile(workbook, `registro_transporte_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleDownloadPdf = async (id: number) => {
    setPdfLoadingId(id);
    try {
      const data = await transportLogService.getById(id);
      await generateTransportLogPdf(data);
      toast.success('PDF generado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo generar el PDF');
    } finally {
      setPdfLoadingId(null);
    }
  };

  const handleOpenEditM3 = () => {
    if (!detailLog) return;
    const departureValue = detailLog.departureM3Corrected ?? detailLog.departureM3;
    const arrivalValue = detailLog.arrivalM3Corrected ?? detailLog.arrivalM3;
    setEditDepartureM3(departureValue != null ? String(departureValue) : '');
    setEditArrivalM3(arrivalValue != null ? String(arrivalValue) : '');
    setEditDescription(detailLog.observation ?? '');
    setIsEditM3Open(true);
  };

  const parseM3Value = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const handleSaveM3 = async () => {
    if (!detailLog) return;
    const departureValue = parseM3Value(editDepartureM3);
    const arrivalValue = parseM3Value(editArrivalM3);

    if (departureValue === undefined && arrivalValue === undefined) {
      toast.error('Ingrese al menos un valor de M3');
      return;
    }

    setIsSavingM3(true);
    try {
      const observation = editDescription.trim();
      const updated = await transportLogService.correctMaterial(detailLog.id, {
        departureM3Corrected: departureValue,
        arrivalM3Corrected: arrivalValue,
        observation: observation || undefined,
      });
      setDetailLog(updated);
      setIsEditM3Open(false);
      refetch();
      toast.success('M3 actualizados correctamente');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo actualizar los M3');
    } finally {
      setIsSavingM3(false);
    }
  };

  const handleReportM3 = async () => {
    if (!detailLog) return;
    const status = getDisplayStatus(detailLog);
    if (status !== 'COMPLETADO' && status !== 'VALIDADO') {
      toast.error('Solo puedes marcar alerta en registros completados o validados');
      return;
    }
    const resolved = getResolvedM3(detailLog);
    if (resolved.departure === null || resolved.arrival === null) {
      toast.error('Debe existir M3 de salida y llegada para reportar');
      return;
    }

    setIsReporting(true);
    try {
      const updated = await transportLogService.markAsAlert(detailLog.id);
      setDetailLog(updated);
      refetch();
      toast.success('Alerta guardada en el sistema');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo guardar la alerta');
    } finally {
      setIsReporting(false);
    }
  };

  const handleMarkReviewed = async () => {
    if (!detailLog) return;
    if (getDisplayStatus(detailLog) !== 'COMPLETADO') {
      toast.error('Solo puedes marcar como revisado un registro completado');
      return;
    }

    setIsMarkingReviewed(true);
    try {
      const updated = await transportLogService.markReviewed(detailLog.id);
      setDetailLog(updated);
      refetch();
      toast.success('Registro marcado como revisado');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo marcar como revisado');
    } finally {
      setIsMarkingReviewed(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return transportLogs.filter((log) => {
      const needle = searchTerm.toLowerCase();
      const invoiceText = (log.numeroFactura || log.planning?.numeroFactura || '').toLowerCase();
      const providerNames =
        log.planning?.canteras?.flatMap((planningCantera) => {
          const providerName = planningCantera?.cantera?.materialProvider?.razonsocial;
          return providerName ? [providerName.toLowerCase()] : [];
        }) ?? [];
      const canteraNames =
        log.planning?.canteras?.flatMap((planningCantera) => {
          const canteraName = planningCantera?.cantera?.nombre;
          return canteraName ? [canteraName.toLowerCase()] : [];
        }) ?? [];

      const matchesSearch =
        !needle ||
        log.vehicle?.plate?.toLowerCase().includes(needle) ||
        log.vehicle?.vehicleid?.toLowerCase().includes(needle) ||
        log.owner?.companyname?.toLowerCase().includes(needle) ||
        log.constSite?.name?.toLowerCase().includes(needle) ||
        getMaterialLabel(log).toLowerCase().includes(needle) ||
        invoiceText.includes(needle) ||
        providerNames.some((name) => name.includes(needle)) ||
        canteraNames.some((name) => name.includes(needle));

      const matchesStatus = !statusFilter || getDisplayStatus(log) === statusFilter;

      let matchesPropietario = true;
      if (propietarioFilter) {
        const [pType, pName] = propietarioFilter.split('::');
        const type = getEmpresaType(log);
        if (pType === 'INTERNO') {
          matchesPropietario = type === 'INTERNO' && getEmpresaLabel(log) === pName;
        } else {
          matchesPropietario = type === 'EXTERNO' && log.owner?.companyname === pName;
        }
      }

      const matchesProveedorMaterial =
        !proveedorMaterialFilter || providerNames.includes(proveedorMaterialFilter.toLowerCase());
      const matchesCantera =
        !canteraFilter || canteraNames.includes(canteraFilter.toLowerCase());
      const matchesFactura =
        !facturaFilter || invoiceText.includes(facturaFilter.toLowerCase());
      const matchesObra = !obraFilter || String(log.constSiteId ?? log.constSite?.id ?? '') === obraFilter;
      const matchesMaterial = !materialFilter || String(log.materialId ?? log.material?.id ?? '') === materialFilter;
      const matchesVehicleId = !vehicleIdFilter || log.vehicle?.vehicleid?.toLowerCase().includes(vehicleIdFilter.toLowerCase());

      let matchesDate = true;
      if (dateFrom || dateTo) {
        const departureKey = toDateKey(log.departureAt || log.createdAt || null);
        const arrivalKey = toDateKey(log.arrivalAt || null);
        matchesDate =
          isDateInRange(departureKey, dateFrom, dateTo) ||
          isDateInRange(arrivalKey, dateFrom, dateTo);
      }

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPropietario &&
        matchesProveedorMaterial &&
        matchesCantera &&
        matchesFactura &&
        matchesObra &&
        matchesMaterial &&
        matchesDate &&
        matchesVehicleId
      );
    });
  }, [transportLogs, searchTerm, statusFilter, propietarioFilter, obraFilter, materialFilter, dateFrom, dateTo, vehicleIdFilter, proveedorMaterialFilter, canteraFilter, facturaFilter]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, propietarioFilter, obraFilter, materialFilter, dateFrom, dateTo, vehicleIdFilter, proveedorMaterialFilter, canteraFilter, facturaFilter]);

  const totalLogs = filteredLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalLogs / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const columns = [
    {
      header: 'Num. de Factura',
      accessor: (row: TransportLog) => row.numeroFactura || row.planning?.numeroFactura || '—',
    },
    {
      header: 'ID Vehículo',
      accessor: (row: TransportLog) => row.vehicle?.vehicleid || row.vehicleId,
    },
    {
      header: 'Placa',
      accessor: (row: TransportLog) => row.vehicle?.plate || '—',
    },
    {
      header: 'Obra',
      accessor: (row: TransportLog) => row.constSite?.name || '—',
    },
    {
      header: 'Cantera',
      // La del viaje es la que realmente despachó; las de la planificación
      // quedan como respaldo para los registros anteriores al cambio.
      // Se muestra el proveedor porque distintos proveedores pueden tener una
      // cantera con el mismo nombre, y el stock de cada una es independiente.
      accessor: (row: TransportLog) => {
        if (!row.cantera) {
          return row.planning?.canteras?.map((c: any) => c.cantera?.nombre).join(', ') || '—';
        }
        const proveedor = row.cantera.materialProvider;
        return (
          <div className="text-sm">
            <p className="text-gray-900">{row.cantera.nombre}</p>
            {proveedor && (
              <p className="text-xs text-gray-500 truncate max-w-[180px]">
                {proveedor.razonsocial}
              </p>
            )}
          </div>
        );
      },
    },
    {
      header: 'Material',
      accessor: (row: TransportLog) => getMaterialLabel(row),
    },
    {
      header: 'Salida',
      accessor: (row: TransportLog) => formatDateTime(row.departureAt || row.createdAt || ''),
    },
    {
      header: 'Llegada',
      accessor: (row: TransportLog) => row.arrivalAt ? formatDateTime(row.arrivalAt) : 'Pendiente',
    },
    {
      header: 'Tiempo',
      accessor: (row: TransportLog) => getDuration(row.departureAt || row.createdAt, row.arrivalAt),
    },
    {
      header: 'M3 Sal',
      accessor: (row: TransportLog) => {
        const m3 = getResolvedM3(row).departure;
        return m3 != null ? formatNumber(m3) : '—';
      },
    },
    {
      header: 'M3 Lleg',
      accessor: (row: TransportLog) => {
        const m3 = getResolvedM3(row).arrival;
        return m3 != null ? formatNumber(m3) : '—';
      },
    },
    {
      header: 'Dif (m³)',
      accessor: (row: TransportLog) => {
        const resolved = getResolvedM3(row);
        if (resolved.difference === null) return '—';
        const alertDeviation = isDeviationAlert(resolved.difference);
        return (
          <span className={alertDeviation ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
            {formatNumber(resolved.difference)}
          </span>
        );
      },
    },
    {
      header: 'Estado',
      accessor: (row: TransportLog) => <StatusBadge status={statusToBadge(getDisplayStatus(row))} />,
    },
    {
      header: 'Acciones',
      accessor: (row: TransportLog) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={<Eye size={16} />}
            onClick={() => handleOpenDetail(row.id)}
          >
           
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<Download size={16} />}
            onClick={() => handleDownloadPdf(row.id)}
            isLoading={pdfLoadingId === row.id}
          >
            
          </Button>
        </div>
      ),
    },
  ];

  const resolvedM3 = getResolvedM3(detailLog);
  const detailStatus = detailLog ? getDisplayStatus(detailLog) : 'EN_PROGRESO';
  const isReported = detailLog ? detailLog.initialStatus === 'ALERTA' || detailLog.status === 'ALERTA' : false;
  const descriptionValue = detailLog?.observation ?? '';
  const hasDeviation = isDeviationAlert(resolvedM3.difference);
  // Reglas de botones por estado:
  // Se han activado los botones para estado COMPLETADO según la nueva regla
  const canReport = ['VALIDADO', 'COMPLETADO', 'REVISADO'].includes(detailStatus);
  const canMarkReviewed = ['COMPLETADO', 'VALIDADO', 'ALERTA'].includes(detailStatus);
  const canEditM3 = ['ALERTA', 'COMPLETADO', 'REVISADO', 'VALIDADO'].includes(detailStatus);
  const m3AlertClass = detailStatus === 'ALERTA' ? 'text-red-600 font-semibold' : 'font-normal';
  const differenceLabel = resolvedM3.difference === null
    ? '—'
    : formatNumber(resolvedM3.difference);
  const materialLabel = detailLog ? getMaterialLabel(detailLog) : '—';

  const departureMaterialUrl = resolveTransportUrl(
    detailLog?.departureMaterialPhoto1 ?? detailLog?.departureMaterialPhoto,
  );
  const arrivalMaterialUrl = resolveTransportUrl(
    detailLog?.arrivalMaterialPhoto1 ?? detailLog?.arrivalMaterialPhoto,
  );

  const renderPhoto = (label: string, path?: string | null, emptyLabel?: string) => {
    const url = resolveTransportUrl(path);
    if (!url) {
      return <p className="text-gray-500">Sin foto de {emptyLabel ?? label.toLowerCase()}</p>;
    }
    return (
      <a
        className="group flex flex-col gap-2"
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        <img
          src={url}
          alt={label}
          loading="lazy"
          decoding="async"
          className="h-32 w-full rounded-lg border border-gray-200 object-cover transition group-hover:opacity-90"
        />
        <span className="text-xs font-medium text-blue-600 group-hover:underline">
          {label}
        </span>
      </a>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Registro Transporte del Material</h1>
          <p className="text-gray-600 mt-1">Controla salidas, llegadas y trazabilidad de viajes de material</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 border border-gray-100 flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
          <Input
            label="Buscar general"
            placeholder="Cualquier texto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Input
            label="ID de vehículo"
            placeholder="Ej. VH-001"
            value={vehicleIdFilter}
            onChange={(e) => setVehicleIdFilter(e.target.value)}
          />
          <SearchableSelect
            label="Proveedor material"
            value={proveedorMaterialFilter}
            onChange={(val) => setProveedorMaterialFilter(val)}
            options={proveedorMaterialOptions}
          />
          <SearchableSelect
            label="Cantera"
            value={canteraFilter}
            onChange={(val) => setCanteraFilter(val)}
            options={canteraOptions}
          />
          <Input
            label="Factura"
            placeholder="Número de factura..."
            value={facturaFilter}
            onChange={(e) => setFacturaFilter(e.target.value)}
          />
          <SearchableSelect
            label="Propietario"
            value={propietarioFilter}
            onChange={(val) => setPropietarioFilter(val)}
            options={[
              { value: '', label: 'Todos' },
              ...propietarioOptions.map(o => ({ value: o.value, label: o.label }))
            ]}
          />
          <SearchableSelect
            label="Obra"
            value={obraFilter}
            onChange={(val) => setObraFilter(val)}
            options={obraOptions}
          />
          <SearchableSelect
            label="Material"
            value={materialFilter}
            onChange={(val) => setMaterialFilter(val)}
            options={materialOptions}
          />
          <Input
            label="Fecha desde"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <Input
            label="Fecha hasta"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <Select
            label="Estado"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            hideDefaultOption={true}
            options={[
              { value: '', label: 'Todos' },
              { value: 'EN_PROGRESO', label: 'En progreso' },
              { value: 'COMPLETADO', label: 'Completado' },
              { value: 'CANCELADO', label: 'Cancelado' },
              { value: 'ALERTA', label: 'Alerta' },
              { value: 'REVISADO', label: 'Revisado' },
              { value: 'VALIDADO', label: 'Validado' },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-4">
            {user?.role === 'ADMIN' && (
              <Button
                variant="primary"
                icon={<Plus size={16} />}
                onClick={() => setIsCreateOpen(true)}
              >
                Nuevo Registro
              </Button>
            )}
            <Button
              variant="outline"
              icon={<Download size={16} />}
              onClick={handleDownloadExcel}
            >
              Exportar Excel
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <Table
          data={paginatedLogs}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No hay registros de transporte"
        />
        <Pagination
          className="px-4 pb-4"
          total={totalLogs}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      <Modal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Detalle de registro"
        size="lg"
      >
        {detailLoading && (
          <div className="flex justify-center items-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        )}
        {!detailLoading && detailLog && (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                variant="danger"
                onClick={handleReportM3}
                disabled={!canReport || isReporting}
                isLoading={isReporting}
              >
                ⚠ Alerta
              </Button>
              <Button
                variant="success"
                onClick={handleMarkReviewed}
                disabled={!canMarkReviewed || isMarkingReviewed}
                isLoading={isMarkingReviewed}
              >
                ✅ Revisado
              </Button>
              <Button
                variant="outline"
                icon={<Pencil size={16} />}
                onClick={handleOpenEditM3}
                disabled={!canEditM3}
              >
                Editar M3
              </Button>
            </div>

            <MaterialShowcase
              departureUrl={departureMaterialUrl}
              arrivalUrl={arrivalMaterialUrl}
              departureM3={detailLog.departureM3}
              departureM3Corrected={detailLog.departureM3Corrected}
              arrivalM3={detailLog.arrivalM3}
              arrivalM3Corrected={detailLog.arrivalM3Corrected}
              m3AlertClass={m3AlertClass}
              vehicleCapacity={detailLog.vehicle?.capacity}
            />

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Fotos del viaje</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowPhotos((prev) => !prev)}
              >
                {showPhotos ? 'Ocultar fotos' : 'Ver mas fotos'}
              </Button>
            </div>

            {showPhotos && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-semibold text-gray-800 mb-3">Fotos de salida</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {renderPhoto('Conductor', detailLog.departureDriverPhoto, 'conductor')}
                    {renderPhoto('Vehículo', detailLog.departureVehiclePhoto, 'vehículo')}
                    {renderPhoto('Placa', detailLog.departurePlatePhoto, 'placa')}
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-gray-800 mb-3">Fotos de llegada</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {renderPhoto('Conductor', detailLog.arrivalDriverPhoto, 'conductor')}
                    {renderPhoto('Vehículo', detailLog.arrivalVehiclePhoto, 'vehículo')}
                    {renderPhoto('Placa', detailLog.arrivalPlatePhoto, 'placa')}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-500">Vehículo</p>
                <p className="font-medium text-gray-900">{detailLog.vehicle?.plate || detailLog.vehicleId}</p>
                <p className="text-gray-600">
                  <span className="font-semibold text-gray-700">Conductor:</span>{' '}
                  <span className="font-normal">{detailLog.vehicle?.driver?.name || 'N/D'}</span>
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-500">Estado</p>
                <div className="mt-1">
                  <StatusBadge status={statusToBadge(getDisplayStatus(detailLog))} />
                </div>
                <p className="text-gray-600 mt-2">
                  <span className="font-semibold text-gray-700">Registrado por:</span>{' '}
                  <span className="font-normal">{detailLog.user?.name || 'N/D'}</span>
                </p>
                <p className="text-gray-600 mt-1">
                  <span className="font-semibold text-gray-700">Planificación:</span>{' '}
                  <span className="font-normal">{getPlanningLabel(detailLog)}</span>
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-500">Salida</p>
                <p className="font-medium text-gray-900">{formatDateTime(detailLog.departureAt || detailLog.createdAt || '')}</p>
                <p className="text-gray-600 mt-2">
                  <span className="font-semibold text-gray-700">Lat/Lng:</span>{' '}
                  <span className="font-normal">{detailLog.departureLat}, {detailLog.departureLng}</span>
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-500">Llegada</p>
                <p className="font-medium text-gray-900">{detailLog.arrivalAt ? formatDateTime(detailLog.arrivalAt) : 'Pendiente'}</p>
                <p className="text-gray-600 mt-2">
                  <span className="font-semibold text-gray-700">Lat/Lng:</span>{' '}
                  <span className="font-normal">{detailLog.arrivalLat ?? '—'}, {detailLog.arrivalLng ?? '—'}</span>
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-500">Material</p>
                <p className="font-medium text-gray-900">{materialLabel}</p>
                <p className="text-gray-600 mt-2">
                  <span className="font-semibold text-gray-700">Abscisa:</span>{' '}
                  <span className="font-normal">{detailLog.abscisa ?? '—'}</span>
                </p>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg text-sm">
              <p className="text-gray-500">Desviación M3 (Llegada - Salida)</p>
              <p className={`font-semibold text-lg ${
                resolvedM3.difference === null
                  ? 'text-gray-400'
                  : isDeviationAlert(resolvedM3.difference)
                  ? 'text-red-600'
                  : 'text-green-600'
              }`}>
                {differenceLabel} m³
              </p>
              <p className="text-gray-600 text-xs mt-1">
                <span className="font-semibold text-gray-700">Salida:</span>{' '}
                <span className="font-normal text-gray-600">
                  {resolvedM3.departure !== null ? formatNumber(resolvedM3.departure) : '—'}
                </span>{' '}
                <span className="text-gray-400">·</span>{' '}
                <span className="font-semibold text-gray-700">Llegada:</span>{' '}
                <span className="font-normal text-gray-600">
                  {resolvedM3.arrival !== null ? formatNumber(resolvedM3.arrival) : '—'}
                </span>
              </p>
              {isReported && (
                <p className="text-orange-600 mt-2">
                  <span className="font-semibold">⚠ Estado:</span>{' '}
                  <span className="font-normal">ALERTA EMITIDA</span>
                </p>
              )}
              {!isReported && hasDeviation && (
                <p className="text-orange-600 mt-2">
                  <span className="font-semibold">⚠ Alerta:</span>{' '}
                  <span className="font-normal">desviación de M3 detectada</span>
                </p>
              )}
            </div>

            <div className="bg-gray-50 p-4 rounded-lg text-sm">
              <p className="text-gray-500">Descripción</p>
              <p className="mt-2 text-gray-800 whitespace-pre-line">
                {descriptionValue || '—'}
              </p>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isEditM3Open}
        onClose={() => setIsEditM3Open(false)}
        title="Editar M3"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setIsEditM3Open(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSaveM3} isLoading={isSavingM3}>
              Guardar cambios
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Input
            label="M3 de salida"
            type="number"
            min="0"
            step="0.01"
            value={editDepartureM3}
            onChange={(e) => setEditDepartureM3(e.target.value)}
          />
          <Input
            label="M3 de llegada"
            type="number"
            min="0"
            step="0.01"
            value={editArrivalM3}
            onChange={(e) => setEditArrivalM3(e.target.value)}
          />
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Escribe una descripción..."
            />
          </div>
          <p className="text-xs text-gray-500">
            Los valores editados se guardan como corrección y actualizan la diferencia reportada.
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Nuevo Registro"
        size="lg"
      >
        <TransportePlanForm
          onSubmit={async (data) => {
            const getCoordinates = (): Promise<{ lat: number; lng: number }> => {
              return new Promise((resolve) => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    (position) => {
                      resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                      });
                    },
                    () => {
                      resolve({ lat: -2.1894, lng: -79.8890 });
                    },
                    { enableHighAccuracy: true, timeout: 5000 }
                  );
                } else {
                  resolve({ lat: -2.1894, lng: -79.8890 });
                }
              });
            };

            const coords = await getCoordinates();
            const loadingToast = toast.loading('Guardando registro(s) de transporte...');
            try {
              if (data.registroType === 'SALIDA') {
                // Cantera asignada a cada vehículo en la planificación: es la
                // que define de qué stock se descuenta el material.
                const planificacionSalida = planificaciones.find(
                  (p) => String(p.id) === String(data.planningId),
                );

                // Ejecutar salida de cada vehículo seleccionado
                await Promise.all(
                  data.vehicleIds.map(async (vehicleId) => {
                    const canteraId = planificacionSalida?.vehicleCanteras?.find(
                      (vc) => vc.vehicleId === String(vehicleId),
                    )?.canteraId;

                    await transportLogService.createDeparture({
                      vehicleId: Number(vehicleId),
                      planningId: Number(data.planningId),
                      departureM3: data.departureM3,
                      departureLat: coords.lat,
                      departureLng: coords.lng,
                      materialId: data.materialType ? Number(data.materialType) : undefined,
                      canteraId: canteraId ? Number(canteraId) : undefined,
                      materialFile: data.materialPhoto || undefined,
                    });
                  })
                );
                toast.success('Despacho de salida creado exitosamente.', { id: loadingToast });
              } else {
                // Registrar llegada de cada vehículo seleccionado
                await Promise.all(
                  data.vehicleIds.map(async (vehicleId) => {
                    const activeLog = transportLogs.find(
                      (log) =>
                        String(log.planningId) === String(data.planningId) &&
                        String(log.vehicleId) === String(vehicleId) &&
                        (log.status === 'IN_PROGRESS' || log.status === 'EN_PROGRESO')
                    );
                    if (!activeLog) {
                      throw new Error(`No se encontró un viaje activo en progreso para el vehículo.`);
                    }
                    await transportLogService.registerArrival(activeLog.id, {
                      arrivalM3: data.arrivalM3,
                      arrivalLat: coords.lat,
                      arrivalLng: coords.lng,
                      abscisa: data.abscisa,
                      materialFile: data.materialPhoto || undefined,
                    });
                  })
                );
                toast.success('Llegada registrada exitosamente.', { id: loadingToast });
              }
              refetch(); // Refrescar la grilla en tiempo real
              setIsCreateOpen(false);
            } catch (err: any) {
              const errMsg = err?.response?.data?.message || err?.message || 'Error al guardar los registros';
              toast.error(`Error: ${errMsg}`, { id: loadingToast });
              throw err; // Lanza el error para que TransportePlanForm no apague el loading antes de tiempo
            }
          }}
          onCancel={() => setIsCreateOpen(false)}
        />
      </Modal>
    </div>
  );
};
