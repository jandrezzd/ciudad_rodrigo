import { useMemo, useState, useEffect } from "react";
import { Eye, Download, Pencil, SquarePen, Check, Filter, FilterX, Search } from "lucide-react";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";
import { Button } from "@/shared/components/Button";
import { Modal } from "@/shared/components/Modal";
import { Table } from "@/shared/components/Table";
import { Pagination } from "@/shared/components/Pagination";
import { Input } from "@/shared/components/Input";
import { SearchableSelect } from "@/shared/components/SearchableSelect/SearchableSelect";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { formatDateTime, formatNumber } from "@/shared/utils/format";
import { isTransportReported } from "@/shared/utils/reporting";
import { formatMaterialType } from "@/modules/materiales/utils/materialLabels";
import axiosInstance from "@/config/axios";
import { useTransportLogsJefe } from "../hooks/useTransportLogsJefe";
import { transportLogJefeService } from "../services/transportLogJefeService";
import { TransportLog, TransportStatus } from "../types";
import { generateTransportLogJefePdf } from "../utils/transportLogJefePdf";
import {
  VEHICLE_COMPANY_LABELS,
  inferVehicleCompany,
  normalizeVehicleType,
  VehicleType,
} from "@/modules/vehicles/types";
import { useProveedores } from "@/modules/proveedores/hooks/useProveedores";
import { useClientes } from "@/modules/clientes/hooks/useClientes";
import { useObras } from "@/modules/obras/hooks/useObras";
import { usePlanificaciones } from "@/modules/planificacion/hooks/usePlanificaciones";
import { useMateriales } from "@/modules/materiales/hooks/useMateriales";
import { MaterialShowcaseJefe } from "./MaterialShowcaseJefe";

type DisplayTransportStatus =
  | "EN_PROGRESO"
  | "COMPLETADO"
  | "CANCELADO"
  | "ALERTA"
  | "REVISADO"
  | "VALIDADO";

const normalizeTransportStatus = (
  status?: TransportStatus | null,
): DisplayTransportStatus => {
  if (!status) return "EN_PROGRESO";
  if (status === "IN_PROGRESS" || status === "EN_PROGRESO")
    return "EN_PROGRESO";
  if (status === "COMPLETED" || status === "COMPLETADO") return "COMPLETADO";
  if (status === "CANCELLED" || status === "CANCELADO") return "CANCELADO";
  if (status === "ALERTA") return "ALERTA";
  if (status === "REVISADO") return "REVISADO";
  if (status === "VALIDADO") return "VALIDADO";
  return "EN_PROGRESO";
};

// Obtiene los valores M3 directamente desde la BD para la tabla general.
// Usa siempre arrivalM3 y departureM3 (los valores base), no los campos *Corrected,
// para que cualquier modificación directa en la BD se refleje en la interfaz al recargar.
const getResolvedM3 = (log: TransportLog | null) => {
  if (!log) return { departure: null, arrival: null, difference: null };
  const departure = log.departureM3 ?? null;
  const arrival = log.arrivalM3 ?? null;
  const difference =
    departure !== null && arrival !== null ? arrival - departure : null;
  return { departure, arrival, difference };
};

const isDeviationAlert = (difference: number | null) => {
  return difference !== null && Math.abs(difference) >= 1;
};

// Detecta si la salida y/o la llegada superó la capacidad (m³) del vehículo.
// Compara siempre contra los valores base (no los *Corrected), igual que
// getResolvedM3, para que las correcciones manuales se reflejen al recargar.
const getCapacityOveruse = (log: TransportLog | null) => {
  const capacity = log?.vehicle?.capacity ?? null;
  if (!capacity)
    return { departureOver: false, arrivalOver: false, any: false };
  const departureOver = log?.departureM3 != null && log.departureM3 > capacity;
  const arrivalOver = log?.arrivalM3 != null && log.arrivalM3 > capacity;
  return { departureOver, arrivalOver, any: departureOver || arrivalOver };
};

const getDisplayStatus = (log: TransportLog): DisplayTransportStatus => {
  const normalized = normalizeTransportStatus(log.status);
  // Estados explícitos del backend tienen prioridad absoluta
  if (normalized === "CANCELADO") return "CANCELADO";
  if (normalized === "VALIDADO") return "VALIDADO";
  if (normalized === "REVISADO") return "REVISADO";
  if (normalized === "COMPLETADO") return "COMPLETADO";
  if (normalized === "ALERTA") return "ALERTA";
  // Si el estado es EN_PROGRESO, aplicar lógica calculada
  const hasCorrections =
    log.departureM3Corrected != null || log.arrivalM3Corrected != null;
  if (hasCorrections) return "REVISADO";
  const resolved = getResolvedM3(log);
  const hasDeviation = isDeviationAlert(resolved.difference);
  if (hasDeviation) return "ALERTA";
  if (log.arrivalAt) return "COMPLETADO";
  return "EN_PROGRESO";
};

const statusToBadge = (status: DisplayTransportStatus) => {
  if (status === "COMPLETADO") return "completado";
  if (status === "CANCELADO") return "cancelado";
  if (status === "ALERTA") return "alerta";
  if (status === "REVISADO") return "revisado";
  if (status === "VALIDADO") return "validado";
  return "en_progreso";
};

const resolveTransportUrl = (rawUrl?: string | null) => {
  if (!rawUrl) return "";
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  const normalized = rawUrl.replace(/^\/+/, "");
  const baseUrl = axiosInstance.defaults.baseURL ?? "";
  const baseOrigin = baseUrl.replace(/\/api\/?$/i, "");
  if (normalized.startsWith("uploads/")) return `${baseOrigin}/${normalized}`;
  if (normalized.startsWith("transport/"))
    return `${baseOrigin}/uploads/${normalized}`;
  return `${baseOrigin}/uploads/transport/${normalized}`;
};

const getDuration = (start?: string | null, end?: string | null) => {
  if (!start || !end) return "—";
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (isNaN(startTime) || isNaN(endTime)) return "—";
  const diffMs = endTime - startTime;
  if (diffMs < 0) return "—";
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (diffHours === 0) return `${diffMinutes}m`;
  return `${diffHours}h ${diffMinutes}m`;
};

const getInternalCompanyFromLog = (log: TransportLog) => {
  return (
    log.vehicle?.company ??
    inferVehicleCompany(
      `${log.owner?.companyname ?? ""} ${log.owner?.name ?? ""}`,
    ) ??
    inferVehicleCompany(log.vehicle?.vehicleid)
  );
};

const getEmpresaType = (log: TransportLog): VehicleType | null => {
  const internalCompany = getInternalCompanyFromLog(log);
  if (internalCompany) return "INTERNO";

  const normalized = normalizeVehicleType(log.vehicle?.type);
  if (normalized === "EXTERNO") return "EXTERNO";

  const ownerName =
    `${log.owner?.companyname ?? ""} ${log.owner?.name ?? ""}`.toLowerCase();
  if (ownerName) return "EXTERNO";

  return null;
};

const getEmpresaLabel = (log: TransportLog) => {
  const internalCompany = getInternalCompanyFromLog(log);
  if (internalCompany) return VEHICLE_COMPANY_LABELS[internalCompany];
  return "—";
};

const getMaterialLabel = (log: TransportLog) => {
  if (log.material?.materialType) {
    return formatMaterialType(log.material.materialType);
  }
  return "—";
};

const isInternalOwnerName = (companyname?: string, name?: string) => {
  return Boolean(inferVehicleCompany(`${companyname ?? ""} ${name ?? ""}`));
};

const APP_TIME_ZONE = "America/Guayaquil";

const toDateKey = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-CA", { timeZone: APP_TIME_ZONE });
};

const isDateInRange = (dateKey: string | null, from?: string, to?: string) => {
  if (!dateKey) return false;
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
};

export const TransportLogJefePage = () => {
  const { transportLogs, isLoading, refetch } = useTransportLogsJefe();
  const { proveedores } = useProveedores();
  const { clientes } = useClientes();
  const { obras } = useObras();
  const { planificaciones } = usePlanificaciones();
  const { materiales } = useMateriales();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLog, setDetailLog] = useState<TransportLog | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);
  const [isEditM3Open, setIsEditM3Open] = useState(false);
  const [editDepartureM3, setEditDepartureM3] = useState("");
  const [editArrivalM3, setEditArrivalM3] = useState("");
  const [isSavingM3, setIsSavingM3] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [editDescription, setEditDescription] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [proveedorFilter, setProveedorFilter] = useState("");
  const [empresaFilter, setEmpresaFilter] = useState<VehicleType | "">("");
  const [empresaNombreFilter, setEmpresaNombreFilter] = useState("");
  const [clienteFilter, setClienteFilter] = useState("");
  const [obraFilter, setObraFilter] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [placaFilter, setPlacaFilter] = useState("");

  const uniqueProveedores = useMemo(() => {
    const fromProveedores = proveedores.length
      ? proveedores
          .filter((p) => !isInternalOwnerName(p.companyname, p.name))
          .map((p) => p.companyname)
          .filter(Boolean)
      : [];

    const fromLogs = transportLogs
      .filter((log) => getEmpresaType(log) === "EXTERNO")
      .map((log) => log.owner?.companyname)
      .filter(Boolean);

    const combined = fromProveedores.length ? fromProveedores : fromLogs;
    return Array.from(new Set(combined));
  }, [proveedores, transportLogs]);

  const uniqueEmpresas = useMemo(() => {
    const empresas = new Set<string>();
    Object.values(VEHICLE_COMPANY_LABELS).forEach((label) =>
      empresas.add(label),
    );

    transportLogs.forEach((log) => {
      const internalCompany = getInternalCompanyFromLog(log);
      if (internalCompany)
        empresas.add(VEHICLE_COMPANY_LABELS[internalCompany]);
    });

    proveedores.forEach((p) => {
      const company = inferVehicleCompany(
        `${p.companyname ?? ""} ${p.name ?? ""}`,
      );
      if (company) empresas.add(VEHICLE_COMPANY_LABELS[company]);
    });

    return Array.from(empresas);
  }, [transportLogs, proveedores]);

  const planningCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    planificaciones.forEach((planning) => {
      if (!planning?.id) return;
      map.set(
        String(planning.id),
        planning.planningCode || String(planning.id),
      );
    });
    return map;
  }, [planificaciones]);

  const getPlanningLabel = (log: TransportLog) => {
    if (!log.planningId) return "—";
    return (
      planningCodeMap.get(String(log.planningId)) ?? String(log.planningId)
    );
  };

  const clienteOptions = useMemo(() => {
    const entries = new Map<string, string>();
    clientes.forEach((cliente) => {
      const label = cliente.companyname || cliente.name || "";
      if (label) entries.set(String(cliente.id), label);
    });
    transportLogs.forEach((log) => {
      if (!log.client?.id) return;
      const label = log.client.companyname || log.client.name || "";
      if (label) entries.set(String(log.client.id), label);
    });
    return [
      { value: "", label: "Todos" },
      ...Array.from(entries.entries()).map(([value, label]) => ({
        value,
        label,
      })),
    ];
  }, [clientes, transportLogs]);

  const obraOptions = useMemo(() => {
    const entries = new Map<string, string>();
    obras.forEach((obra) => {
      const label = obra.name || "";
      if (label) entries.set(String(obra.id), label);
    });
    transportLogs.forEach((log) => {
      if (!log.constSite?.id) return;
      const label = log.constSite.name || "";
      if (label) entries.set(String(log.constSite.id), label);
    });
    return [
      { value: "", label: "Todas" },
      ...Array.from(entries.entries()).map(([value, label]) => ({
        value,
        label,
      })),
    ];
  }, [obras, transportLogs]);

  const materialOptions = useMemo(() => {
    const entries = new Map<string, string>();
    materiales.forEach((material) => {
      if (!material?.id) return;
      entries.set(
        String(material.id),
        formatMaterialType(material.materialType),
      );
    });
    transportLogs.forEach((log) => {
      const id = log.materialId ?? log.material?.id;
      if (!id) return;
      entries.set(String(id), getMaterialLabel(log));
    });
    return [
      { value: "", label: "Todos" },
      ...Array.from(entries.entries()).map(([value, label]) => ({
        value,
        label,
      })),
    ];
  }, [materiales, transportLogs]);

  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  const handleOpenDetail = async (id: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setShowPhotos(false);
    try {
      const data = await transportLogJefeService.getById(id);
      setDetailLog(data);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo cargar el detalle");
    } finally {
      setDetailLoading(false);
    }
  };

  const resolveExcelStatus = (log: TransportLog) => {
    const displayStatus = getDisplayStatus(log);
    if (displayStatus === "ALERTA") return "Alerta";
    if (displayStatus === "REVISADO") return "Revisado";
    if (displayStatus === "VALIDADO") return "Validado";
    if (displayStatus === "CANCELADO") return "Cancelado";
    if (displayStatus === "COMPLETADO") return "Completado";
    if (!log.arrivalAt) return "Pendiente";
    return "En progreso";
  };

  const handleDownloadExcel = () => {
    if (!filteredLogs.length) {
      toast.error("No hay registros para exportar");
      return;
    }

    const exportData = filteredLogs.map((log) => {
      const resolved = getResolvedM3(log);
      const departureM3 = resolved.departure ?? 0;
      const arrivalM3 = resolved.arrival ?? null;
      const difference =
        resolved.difference != null
          ? Number(resolved.difference.toFixed(2))
          : null;

      return {
        "ID Vehículo": log.vehicle?.vehicleid || log.vehicleId,
        Placa: log.vehicle?.plate || "—",
        Conductor: log.driver?.name || log.vehicle?.driver?.name || "—",
        Marca: log.vehicle?.brand || "—",
        Modelo: log.vehicle?.model || "—",
        Año: log.vehicle?.year ?? "—",
        "Capacidad (m³)": log.vehicle?.capacity ?? "—",
        Proveedor: log.owner?.companyname || "—",
        Empresa: getEmpresaLabel(log),
        Cliente: log.client?.companyname || "—",
        Obra: log.constSite?.name || "—",
        Planificación: getPlanningLabel(log),
        Material: getMaterialLabel(log),
        Abscisa: log.abscisa ?? "—",
        "Fecha/Salida":
          formatDateTime(log.departureAt || log.createdAt || "") || "—",
        "Fecha/Llegada": log.arrivalAt
          ? formatDateTime(log.arrivalAt)
          : "Pendiente",
        "Tiempo Viaje": getDuration(
          log.departureAt || log.createdAt,
          log.arrivalAt,
        ),
        Estado: resolveExcelStatus(log),
        "M3 Salida": departureM3,
        "M3 Llegada": arrivalM3 ?? "—",
        Diferencia: difference ?? "—",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "RTransporte ");
    XLSX.writeFile(
      workbook,
      `registro_transporte_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const handleDownloadPdf = async (id: number) => {
    setPdfLoadingId(id);
    try {
      const data = await transportLogJefeService.getById(id);
      await generateTransportLogJefePdf(data);
      toast.success("PDF generado correctamente");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo generar el PDF");
    } finally {
      setPdfLoadingId(null);
    }
  };

  const handleOpenEditM3 = () => {
    if (!detailLog) return;
    const departureValue =
      detailLog.departureM3Corrected ?? detailLog.departureM3;
    const arrivalValue = detailLog.arrivalM3Corrected ?? detailLog.arrivalM3;
    setEditDepartureM3(departureValue != null ? String(departureValue) : "");
    setEditArrivalM3(arrivalValue != null ? String(arrivalValue) : "");
    setEditDescription(detailLog.observation ?? "");
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
      toast.error("Ingrese al menos un valor de M3");
      return;
    }

    setIsSavingM3(true);
    try {
      const observation = editDescription.trim();
      const updated = await transportLogJefeService.correctMaterial(
        detailLog.id,
        {
          departureM3Corrected: departureValue,
          arrivalM3Corrected: arrivalValue,
          observation: observation || undefined,
        },
      );
      setDetailLog(updated);
      setIsEditM3Open(false);
      refetch();
      toast.success("M3 actualizados correctamente");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo actualizar los M3");
    } finally {
      setIsSavingM3(false);
    }
  };

  const handleMarkValidated = async () => {
    if (!detailLog) return;

    setIsValidating(true);
    try {
      const updated = await transportLogJefeService.markValidated(detailLog.id);
      setDetailLog(updated);
      refetch();
      toast.success("Registro marcado como validado");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo marcar como validado");
    } finally {
      setIsValidating(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return transportLogs.filter((log) => {
      const needle = searchTerm.toLowerCase();
      const matchesSearch =
        !needle ||
        log.vehicle?.plate?.toLowerCase().includes(needle) ||
        log.vehicle?.vehicleid?.toLowerCase().includes(needle) ||
        log.owner?.companyname?.toLowerCase().includes(needle) ||
        log.client?.companyname?.toLowerCase().includes(needle) ||
        log.constSite?.name?.toLowerCase().includes(needle) ||
        getMaterialLabel(log).toLowerCase().includes(needle);

      const matchesStatus =
        !statusFilter || getDisplayStatus(log) === statusFilter;
      const matchesProveedor =
        !proveedorFilter ||
        (getEmpresaType(log) === "EXTERNO" &&
          log.owner?.companyname === proveedorFilter);
      const type = getEmpresaType(log);
      const matchesEmpresa = !empresaFilter || type === empresaFilter;
      const matchesEmpresaNombre =
        !empresaNombreFilter ||
        (type === "INTERNO" && getEmpresaLabel(log) === empresaNombreFilter);
      const matchesCliente =
        !clienteFilter ||
        String(log.clientId ?? log.client?.id ?? "") === clienteFilter;
      const matchesObra =
        !obraFilter ||
        String(log.constSiteId ?? log.constSite?.id ?? "") === obraFilter;
      const matchesMaterial =
        !materialFilter ||
        String(log.materialId ?? log.material?.id ?? "") === materialFilter;
      const matchesPlaca =
        !placaFilter ||
        log.vehicle?.plate?.toLowerCase().includes(placaFilter.toLowerCase());

      let matchesDate = true;
      if (dateFrom || dateTo) {
        const departureKey = toDateKey(
          log.departureAt || log.createdAt || null,
        );
        const arrivalKey = toDateKey(log.arrivalAt || null);
        matchesDate =
          isDateInRange(departureKey, dateFrom, dateTo) ||
          isDateInRange(arrivalKey, dateFrom, dateTo);
      }

      return (
        matchesSearch &&
        matchesStatus &&
        matchesProveedor &&
        matchesEmpresa &&
        matchesEmpresaNombre &&
        matchesCliente &&
        matchesObra &&
        matchesMaterial &&
        matchesDate &&
        matchesPlaca
      );
    });
  }, [
    transportLogs,
    searchTerm,
    statusFilter,
    proveedorFilter,
    empresaFilter,
    empresaNombreFilter,
    clienteFilter,
    obraFilter,
    materialFilter,
    dateFrom,
    dateTo,
    placaFilter,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    searchTerm,
    statusFilter,
    proveedorFilter,
    empresaFilter,
    empresaNombreFilter,
    clienteFilter,
    obraFilter,
    materialFilter,
    dateFrom,
    dateTo,
    placaFilter,
  ]);

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
      header: "ID Vehículo",
      accessor: (row: TransportLog) => row.vehicle?.vehicleid || row.vehicleId,
    },
    {
      header: "Placa",
      accessor: (row: TransportLog) => row.vehicle?.plate || "—",
    },
    {
      header: "Conductor",
      accessor: (row: TransportLog) =>
        row.driver?.name || row.vehicle?.driver?.name || "—",
    },
    {
      header: "Obra",
      accessor: (row: TransportLog) => row.constSite?.name || "—",
    },
    {
      header: "Material",
      accessor: (row: TransportLog) => getMaterialLabel(row),
    },
    {
      header: "Abscisa",
      accessor: (row: TransportLog) => row.abscisa ?? "—",
    },
    {
      header: "Salida",
      accessor: (row: TransportLog) =>
        formatDateTime(row.departureAt || row.createdAt || ""),
    },
    {
      header: "Llegada",
      accessor: (row: TransportLog) =>
        row.arrivalAt ? formatDateTime(row.arrivalAt) : "Pendiente",
    },
    {
      header: "M3 Sal",
      accessor: (row: TransportLog) => {
        const m3 = row.departureM3;
        if (m3 == null) return "—";
        const over = getCapacityOveruse(row).departureOver;
        return (
          <span className={over ? "text-orange-600 font-semibold" : undefined}>
            {formatNumber(m3)}
          </span>
        );
      },
    },
    {
      header: "M3 Lleg",
      accessor: (row: TransportLog) => {
        const m3 = row.arrivalM3;
        if (m3 == null) return "—";
        const over = getCapacityOveruse(row).arrivalOver;
        return (
          <span className={over ? "text-orange-600 font-semibold" : undefined}>
            {formatNumber(m3)}
          </span>
        );
      },
    },
    {
      header: "Dif (m³)",
      accessor: (row: TransportLog) => {
        const resolved = getResolvedM3(row);
        if (resolved.difference === null) return "—";
        const alertDeviation = isDeviationAlert(resolved.difference);
        return (
          <span
            className={
              alertDeviation
                ? "text-red-600 font-semibold"
                : "text-green-600 font-semibold"
            }
          >
            {formatNumber(resolved.difference)}
          </span>
        );
      },
    },
    {
      header: "Estado",
      accessor: (row: TransportLog) => (
        <div className="flex flex-col gap-1 items-start">
          <StatusBadge status={statusToBadge(getDisplayStatus(row))} />
          {getCapacityOveruse(row).any && (
            <span className="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">
              ⚠ Sobrecarga
            </span>
          )}
        </div>
      ),
    },
    {
      header: "Acciones",
      accessor: (row: TransportLog) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
            icon={<Eye size={16} />}
            onClick={() => handleOpenDetail(row.id)}
          ></Button>
          <Button
            size="sm"
            variant="outline"
            className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
            icon={<Download size={16} />}
            onClick={() => handleDownloadPdf(row.id)}
            isLoading={pdfLoadingId === row.id}
          ></Button>
        </div>
      ),
    },
  ];

  const resolvedM3 = getResolvedM3(detailLog);
  const capacityOveruse = getCapacityOveruse(detailLog);
  const detailStatus = detailLog ? getDisplayStatus(detailLog) : "EN_PROGRESO";
  const isReported = detailLog ? isTransportReported(detailLog.id) : false;
  const descriptionValue = detailLog?.observation ?? "";
  const departureObservationValue = detailLog?.departureObservation ?? "";
  const arrivalObservationValue = detailLog?.arrivalObservation ?? "";
  const hasDeviation = isDeviationAlert(resolvedM3.difference);

  // Reglas de botones Jefe de Obra:
  // EN_PROGRESO / CANCELADO → sin botones (ocultos)
  // COMPLETADO / ALERTA     → Validado activo, Editar M3 activo
  // VALIDADO                → Validado desactivado, Editar M3 desactivado
  // REVISADO                → Validado desactivado, Editar M3 desactivado
  const showButtons = !["EN_PROGRESO", "CANCELADO"].includes(detailStatus);
  const disableValidateBtn =
    detailStatus === "REVISADO" || detailStatus === "VALIDADO";
  const disableEditBtn =
    detailStatus === "REVISADO" || detailStatus === "VALIDADO";

  const m3AlertClass =
    detailStatus === "ALERTA" ? "text-red-600 font-semibold" : "font-normal";
  const differenceLabel =
    resolvedM3.difference === null ? "—" : formatNumber(resolvedM3.difference);
  const materialLabel = detailLog ? getMaterialLabel(detailLog) : "—";

  const departureMaterialUrl = resolveTransportUrl(
    detailLog?.departureMaterialPhoto1 ?? detailLog?.departureMaterialPhoto,
  );
  const arrivalMaterialUrl = resolveTransportUrl(
    detailLog?.arrivalMaterialPhoto1 ?? detailLog?.arrivalMaterialPhoto,
  );

  const renderPhoto = (
    label: string,
    path?: string | null,
    emptyLabel?: string,
  ) => {
    const url = resolveTransportUrl(path);
    if (!url) {
      return (
        <p className="text-gray-500">
          Sin foto de {emptyLabel ?? label.toLowerCase()}
        </p>
      );
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

  const [showFilters, setShowFilters] = useState<boolean>(true);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Validación del Material
          </h1>
          <p className="text-gray-600 mt-1">
            Controla salidas, llegadas y trazabilidad de viajes de material
          </p>
        </div>
      </div>

      {/* Barra de acciones: Toggle de filtros y Exportar Excel (Siempre visibles) */}
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="outline"
          className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
          type="button"
          icon={showFilters ? <FilterX size={16} /> : <Filter size={16} />}
          onClick={() => setShowFilters(!showFilters)}
        >
          {showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
        </Button>

        <Button
          variant="outline"
          className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
          icon={<Download size={16} />}
          onClick={handleDownloadExcel}
        >
          Exportar Excel
        </Button>
      </div>

      {/* Tarjeta colapsable con los inputs de filtrado */}
      {showFilters && (
        <div className="bg-white rounded-lg shadow p-4 border border-gray-100 flex flex-col gap-4 relative z-30 overflow-visible">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <Input
              label="Buscar general"
              placeholder="Cualquier texto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Input
              label="Placa de vehículo"
              placeholder="Ej. ABC-123"
              value={placaFilter}
              onChange={(e) => setPlacaFilter(e.target.value)}
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
          </div>
        </div>
      )}

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
            {showButtons && (
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  variant="success"
                  className="!bg-green-200 !text-green-800 hover:!bg-green-300"
                  onClick={handleMarkValidated}
                  disabled={disableValidateBtn || isValidating}
                  isLoading={isValidating}
                >
                  <Check strokeWidth={2.25} /> Validar registro
                </Button>
                <Button
                  className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300"
                  icon={<Pencil size={16} />}
                  onClick={handleOpenEditM3}
                  disabled={disableEditBtn}
                >
                  Editar M3
                </Button>
              </div>
            )}

            <MaterialShowcaseJefe
              departureUrl={departureMaterialUrl}
              arrivalUrl={arrivalMaterialUrl}
              departureM3={detailLog.departureM3}
              departureM3Corrected={detailLog.departureM3Corrected}
              arrivalM3={detailLog.arrivalM3}
              arrivalM3Corrected={detailLog.arrivalM3Corrected}
              departureObservation={departureObservationValue}
              arrivalObservation={arrivalObservationValue}
              m3AlertClass={m3AlertClass}
            />

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                Fotos del viaje
              </h3>
              <Button
                size="sm"
                className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300"
                onClick={() => setShowPhotos((prev) => !prev)}
              >
                {showPhotos ? "Ocultar fotos" : "Ver mas fotos"}
              </Button>
            </div>

            {showPhotos && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-semibold text-gray-800 mb-3">
                    Fotos de salida
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {renderPhoto(
                      "Conductor",
                      detailLog.departureDriverPhoto,
                      "conductor",
                    )}
                    {renderPhoto(
                      "Vehículo",
                      detailLog.departureVehiclePhoto,
                      "vehículo",
                    )}
                    {renderPhoto(
                      "Placa",
                      detailLog.departurePlatePhoto,
                      "placa",
                    )}
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-gray-800 mb-3">
                    Fotos de llegada
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {renderPhoto(
                      "Conductor",
                      detailLog.arrivalDriverPhoto,
                      "conductor",
                    )}
                    {renderPhoto(
                      "Vehículo",
                      detailLog.arrivalVehiclePhoto,
                      "vehículo",
                    )}
                    {renderPhoto("Placa", detailLog.arrivalPlatePhoto, "placa")}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-500 mb-1">Vehículo</p>
                <p className="font-medium text-gray-900 mb-1">
                  {detailLog.vehicle?.plate || detailLog.vehicleId}
                </p>
                <p className="text-gray-600">
                  <span className="font-semibold text-gray-700">
                    Conductor:
                  </span>{" "}
                  <span className="font-normal">
                    {detailLog.driver?.name || detailLog.vehicle?.driver?.name || "N/D"}
                  </span>
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-500 mb-2">Estado</p>
                <div className="mt-1">
                  <StatusBadge
                    status={statusToBadge(getDisplayStatus(detailLog))}
                  />
                </div>
                <p className="text-gray-600 mt-2">
                  <span className="font-semibold text-gray-700">
                    Registrado en Cantera por:
                  </span>{" "}
                  <span className="font-normal">
                    {detailLog.user?.name || "N/D"}
                  </span>
                </p>
                <p className="text-gray-600 mt-2">
                  <span className="font-semibold text-gray-700 mt-2">
                    Registrado en Obra por:
                  </span>{" "}
                  <span className="font-normal">
                    {detailLog.userArrival?.name || "Pendiente"}
                  </span>
                </p>
                <p className="text-gray-600 mt-2">
                  <span className="font-semibold text-gray-700">
                    Planificación:
                  </span>{" "}
                  <span className="font-normal">
                    {getPlanningLabel(detailLog)}
                  </span>
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-500">Salida</p>
                <p className="font-medium text-gray-900">
                  {formatDateTime(
                    detailLog.departureAt || detailLog.createdAt || "",
                  )}
                </p>
                <p className="text-gray-600 mt-2">
                  <span className="font-semibold text-gray-700">Lat/Lng:</span>{" "}
                  <span className="font-normal">
                    {detailLog.departureLat}, {detailLog.departureLng}
                  </span>
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-500">Llegada</p>
                <p className="font-medium text-gray-900">
                  {detailLog.arrivalAt
                    ? formatDateTime(detailLog.arrivalAt)
                    : "Pendiente"}
                </p>
                <p className="text-gray-600 mt-2">
                  <span className="font-semibold text-gray-700">Lat/Lng:</span>{" "}
                  <span className="font-normal">
                    {detailLog.arrivalLat ?? "—"}, {detailLog.arrivalLng ?? "—"}
                  </span>
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-500">Material</p>
                <p className="font-medium text-gray-900">{materialLabel}</p>
                <p className="text-gray-600 mt-2">
                  <span className="font-semibold text-gray-700">Abscisa:</span>{" "}
                  <span className="font-normal">
                    {detailLog.abscisa ?? "—"}
                  </span>
                </p>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg text-sm">
              <p className="text-gray-500">Desviación M3 (Llegada - Salida)</p>
              <p
                className={`font-semibold text-lg ${
                  resolvedM3.difference === null
                    ? "text-gray-400"
                    : isDeviationAlert(resolvedM3.difference)
                      ? "text-red-600"
                      : "text-green-600"
                }`}
              >
                {differenceLabel} m³
              </p>
              <p className="text-gray-600 text-xs mt-1">
                <span className="font-semibold text-gray-700">Salida:</span>{" "}
                <span className="font-normal text-gray-600">
                  {resolvedM3.departure !== null
                    ? formatNumber(resolvedM3.departure)
                    : "—"}
                </span>{" "}
                <span className="text-gray-400">·</span>{" "}
                <span className="font-semibold text-gray-700">Llegada:</span>{" "}
                <span className="font-normal text-gray-600">
                  {resolvedM3.arrival !== null
                    ? formatNumber(resolvedM3.arrival)
                    : "—"}
                </span>
              </p>
              {isReported && (
                <p className="text-orange-600 mt-2">
                  <span className="font-semibold">⚠ Estado:</span>{" "}
                  <span className="font-normal">ALERTA EMITIDA</span>
                </p>
              )}
              {!isReported && hasDeviation && (
                <p className="text-orange-600 mt-2">
                  <span className="font-semibold">⚠ Alerta:</span>{" "}
                  <span className="font-normal">
                    desviación de M3 detectada
                  </span>
                </p>
              )}
              {capacityOveruse.any && (
                <p className="text-orange-600 mt-2">
                  <span className="font-semibold">⚠ Sobrecarga:</span>{" "}
                  <span className="font-normal">
                    superó la capacidad del vehículo (
                    {formatNumber(detailLog.vehicle?.capacity ?? 0)} m³)
                    {capacityOveruse.departureOver &&
                    capacityOveruse.arrivalOver
                      ? " en salida y llegada"
                      : capacityOveruse.departureOver
                        ? " en la salida"
                        : " en la llegada"}
                  </span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-500">Observación de Cantera</p>
                <p className="mt-2 text-gray-800 whitespace-pre-line">
                  {departureObservationValue || "—"}
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-500">Observación de Obra</p>
                <p className="mt-2 text-gray-800 whitespace-pre-line">
                  {arrivalObservationValue || "—"}
                </p>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-gray-500">Nota del Administrador</p>
                <button
                  type="button"
                  title="Editar nota del administrador"
                  aria-label="Editar nota del administrador"
                  onClick={handleOpenEditM3}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
                >
                  <SquarePen className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-gray-800 whitespace-pre-line">
                {descriptionValue || "—"}
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
        className="!rounded-[12px] !overflow-hidden"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsEditM3Open(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveM3}
              isLoading={isSavingM3}
            >
              Guardar cambios
            </Button>
          </>
        }
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nota del Administrador
            </label>
            <textarea
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Escribe una nota..."
            />
          </div>
          <p className="text-xs text-gray-500">
            Los valores editados se guardan como corrección y actualizan la
            diferencia reportada.
          </p>
        </div>
      </Modal>
    </div>
  );
};
