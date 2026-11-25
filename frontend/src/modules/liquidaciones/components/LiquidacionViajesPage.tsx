import { useMemo, useState, useEffect } from "react";
import { Eye, Download, Filter, FilterX, Save } from "lucide-react";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";
import { Button } from "@/shared/components/Button";
import { Modal } from "@/shared/components/Modal";
import { Table } from "@/shared/components/Table";
import { Pagination } from "@/shared/components/Pagination";
import { Input } from "@/shared/components/Input";
import { SearchableSelect } from "@/shared/components/SearchableSelect/SearchableSelect";
import { formatDateTime, formatNumber } from "@/shared/utils/format";
import { isTransportReported } from "@/shared/utils/reporting";
import { normalizePlate } from "@/shared/utils/validation";
import { formatMaterialType } from "@/modules/materiales/utils/materialLabels";
import axiosInstance from "@/config/axios";
import { usePermissions } from "@/modules/auth/hooks/usePermissions";
import { useViajesLiquidables } from "../hooks/useViajesLiquidables";
import { liquidacionService } from "../services/liquidacionService";
import { TransportLog, TransportStatus } from "../types";
import { generarPdfViajeLiquidacion } from "../utils/liquidacionViajePdf";
import {
  formatearDinero,
  hoyEcuador,
  mensajeDeError,
  normalizarPrecio,
  precioValido,
  subtotalViaje,
  sumarPrecios,
} from "../utils/liquidacion";
import { etiquetaEmpresa, getDuration } from "../utils/viaje";
import { usePlanificaciones } from "@/modules/planificacion/hooks/usePlanificaciones";
import { useMateriales } from "@/modules/materiales/hooks/useMateriales";
import { MaterialShowcaseLiquidacion } from "./MaterialShowcaseLiquidacion";
import { GuardarLiquidacionModal } from "./GuardarLiquidacionModal";
import { UbicacionLlegadaDetalle } from '@/modules/registro-transporte/components/UbicacionLlegadaDetalle';

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

// m³ que valen para liquidar: el corregido (editado en Registro de transporte)
// si existe; si no, el registrado. Mismo criterio que Registro de transporte,
// el PDF del viaje y el detalle de la liquidación.
const getResolvedM3 = (log: TransportLog | null) => {
  if (!log) return { departure: null, arrival: null, difference: null };
  const departure = log.departureM3Corrected ?? log.departureM3 ?? null;
  const arrival = log.arrivalM3Corrected ?? log.arrivalM3 ?? null;
  const difference =
    departure !== null && arrival !== null ? arrival - departure : null;
  return { departure, arrival, difference };
};

const isDeviationAlert = (difference: number | null) => {
  return difference !== null && Math.abs(difference) >= 1;
};

// Detecta si la salida y/o la llegada superó la capacidad (m³) del vehículo,
// con los mismos m³ que se muestran (corregidos si los hay).
const getCapacityOveruse = (log: TransportLog | null) => {
  const capacity = log?.vehicle?.capacity ?? null;
  if (!capacity)
    return { departureOver: false, arrivalOver: false, any: false };
  const { departure, arrival } = getResolvedM3(log);
  const departureOver = departure != null && departure > capacity;
  const arrivalOver = arrival != null && arrival > capacity;
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

/**
 * Solo se liquidan viajes ya emparejados (con salida y llegada). El backend
 * ya excluye los cancelados, los pendientes y los liquidados; este filtro
 * queda como respaldo con el mismo criterio de estados de siempre.
 */
const ESTADOS_LIQUIDABLES: DisplayTransportStatus[] = [
  "COMPLETADO",
  "REVISADO",
  "ALERTA",
  "VALIDADO",
];

const esViajeLiquidable = (log: TransportLog) =>
  Boolean(log.arrivalAt) && ESTADOS_LIQUIDABLES.includes(getDisplayStatus(log));

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

const getEmpresaLabel = (log: TransportLog) =>
  etiquetaEmpresa({
    company: log.vehicle?.company,
    ownerCompany: log.owner?.companyname,
    ownerName: log.owner?.name,
    vehicleid: log.vehicle?.vehicleid,
  });

const getMaterialLabel = (log: TransportLog) => {
  if (log.material?.materialType) {
    return formatMaterialType(log.material.materialType);
  }
  return "—";
};

const nombreCliente = (c?: { companyname?: string | null; name?: string | null } | null) =>
  c?.companyname || c?.name || "—";

/**
 * Cantera de salida del viaje. Si el viaje no la tiene guardada y su
 * planificación tiene una sola cantera, se usa esa.
 */
const getCanteraLabel = (log: TransportLog) => {
  if (log.cantera?.nombre) return log.cantera.nombre;
  const nombres = (log.planning?.canteras ?? [])
    .map((c) => c.cantera?.nombre)
    .filter((n): n is string => Boolean(n));
  return nombres.length === 1 ? nombres[0] : "—";
};

export const LiquidacionViajesPage = () => {
  const { canCreate, canEdit } = usePermissions("liquidaciones");
  // Todas (también terminadas o inactivas): pueden tener viajes sin liquidar.
  const { allPlanificaciones: planificaciones } = usePlanificaciones();
  const { materiales } = useMateriales();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLog, setDetailLog] = useState<TransportLog | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);

  // Filtros que van al backend. Las fechas empiezan vacías: un viaje sin
  // liquidar de un mes anterior sigue pendiente y tiene que verse.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // La planificación ya define obra y cliente: una liquidación es de una sola.
  const [planningFilter, setPlanningFilter] = useState("");
  // Filtros en el navegador
  const [searchTerm, setSearchTerm] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [placaFilter, setPlacaFilter] = useState("");

  const { viajes: transportLogs, isLoading, refetch } = useViajesLiquidables({
    desde: dateFrom,
    hasta: dateTo,
    planningId: planningFilter ? Number(planningFilter) : undefined,
  });

  // Precio unitario por m³ de cada viaje (texto, para poder escribir "45."
  // sin que salte).
  // Indexado por id: no se pierde al cambiar de página.
  const [precios, setPrecios] = useState<Record<number, string>>({});

  /** m³ de llegada × precio unitario; null si falta alguno de los dos. */
  const subtotalDe = (log: TransportLog) => {
    const precio = precioValido(precios[log.id]);
    const m3 = getResolvedM3(log).arrival;
    return precio != null && m3 != null && m3 > 0 ? subtotalViaje(m3, precio) : null;
  };
  const [guardarOpen, setGuardarOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const hayPrecios = Object.values(precios).some((p) => precioValido(p) !== null);

  /** Cambiar de planificación borra los precios: esos viajes no van juntos. */
  const cambiarFiltroDeGrupo = (aplicar: () => void) => {
    if (
      hayPrecios &&
      !window.confirm("Se borrarán los precios ingresados. ¿Continuar?")
    ) {
      return;
    }
    setPrecios({});
    aplicar();
  };

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
      log.planning?.planningCode ??
      planningCodeMap.get(String(log.planningId)) ??
      String(log.planningId)
    );
  };

  // Etiqueta: código · obra · cliente.
  const planningOptions = useMemo(() => {
    const entries = new Map<string, string>();
    const etiqueta = (codigo: string, obra?: string | null, cliente?: string | null) =>
      [codigo, obra, cliente].filter(Boolean).join(" · ");
    planificaciones.forEach((planning) => {
      if (!planning?.id) return;
      entries.set(
        String(planning.id),
        etiqueta(
          planning.planningCode || String(planning.id),
          planning.constSite?.name,
          planning.client ? nombreCliente(planning.client) : null,
        ),
      );
    });
    transportLogs.forEach((log) => {
      if (!log.planningId || entries.has(String(log.planningId))) return;
      entries.set(
        String(log.planningId),
        etiqueta(
          log.planning?.planningCode || String(log.planningId),
          log.constSite?.name,
          log.client ? nombreCliente(log.client) : null,
        ),
      );
    });
    return [
      { value: "", label: "Todas" },
      ...Array.from(entries.entries()).map(([value, label]) => ({
        value,
        label,
      })),
    ];
  }, [planificaciones, transportLogs]);

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

  // Nota del liquidador del viaje abierto en el detalle.
  const [notaTexto, setNotaTexto] = useState("");
  const [guardandoNota, setGuardandoNota] = useState(false);

  const handleOpenDetail = async (id: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setShowPhotos(false);
    try {
      const data = await liquidacionService.obtenerViaje(id);
      setDetailLog(data);
      setNotaTexto(data.notaLiquidador ?? "");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo cargar el detalle");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleGuardarNota = async () => {
    if (!detailLog) return;
    setGuardandoNota(true);
    try {
      const guardada = await liquidacionService.guardarNotaViaje(
        detailLog.id,
        notaTexto.trim() || null,
      );
      setDetailLog({ ...detailLog, ...guardada });
      setNotaTexto(guardada.notaLiquidador ?? "");
      toast.success("Nota guardada");
    } catch (error) {
      console.error(error);
      toast.error(mensajeDeError(error, "No se pudo guardar la nota"));
    } finally {
      setGuardandoNota(false);
    }
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
        Código: log.codigo || `#${log.id}`,
        Planificación: getPlanningLabel(log),
        "ID Vehículo": log.vehicle?.vehicleid || log.vehicleId,
        Placa: log.vehicle?.plate || "—",
        Cantera: getCanteraLabel(log),
        Marca: log.vehicle?.brand || "—",
        Modelo: log.vehicle?.model || "—",
        Año: log.vehicle?.year ?? "—",
        "Capacidad (m³)": log.vehicle?.capacity ?? "—",
        Proveedor: log.owner?.companyname || "—",
        Empresa: getEmpresaLabel(log),
        Cliente: log.client?.companyname || "—",
        Obra: log.constSite?.name || "—",
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
        "M3 Salida": departureM3,
        "M3 Llegada": arrivalM3 ?? "—",
        Diferencia: difference ?? "—",
        "P. unit. ($/m³)": precioValido(precios[log.id]) ?? "",
        Subtotal: subtotalDe(log) ?? "",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Liquidaciones");
    XLSX.writeFile(
      workbook,
      `liquidaciones_viajes_${hoyEcuador()}.xlsx`,
    );
  };

  const handleDownloadPdf = async (id: number) => {
    setPdfLoadingId(id);
    try {
      const data = await liquidacionService.obtenerViaje(id);
      await generarPdfViajeLiquidacion(data);
      toast.success("PDF generado correctamente");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo generar el PDF");
    } finally {
      setPdfLoadingId(null);
    }
  };

  // Fechas y planificación ya vienen filtradas del backend.
  const filteredLogs = useMemo(() => {
    return transportLogs.filter((log) => {
      if (!esViajeLiquidable(log)) return false;

      const needle = searchTerm.toLowerCase();
      const matchesSearch =
        !needle ||
        log.codigo?.toLowerCase().includes(needle) ||
        getPlanningLabel(log).toLowerCase().includes(needle) ||
        log.vehicle?.plate?.toLowerCase().includes(needle) ||
        log.vehicle?.vehicleid?.toLowerCase().includes(needle) ||
        log.owner?.companyname?.toLowerCase().includes(needle) ||
        log.client?.companyname?.toLowerCase().includes(needle) ||
        log.constSite?.name?.toLowerCase().includes(needle) ||
        getCanteraLabel(log).toLowerCase().includes(needle) ||
        getMaterialLabel(log).toLowerCase().includes(needle);

      const matchesMaterial =
        !materialFilter ||
        String(log.materialId ?? log.material?.id ?? "") === materialFilter;
      const matchesPlaca =
        !placaFilter ||
        log.vehicle?.plate?.toUpperCase().includes(placaFilter);

      return matchesSearch && matchesMaterial && matchesPlaca;
    });
  }, [transportLogs, searchTerm, materialFilter, placaFilter, planningCodeMap]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, planningFilter, materialFilter, dateFrom, dateTo, placaFilter]);

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

  // ─── Total en vivo y guardado ────────────────────────────────────────────
  // Sobre TODOS los viajes filtrados (no solo la página visible).
  // Subtotal = m³ de llegada (corregidos si los hay) × precio unitario.
  const conPrecio = useMemo(
    () =>
      filteredLogs
        .map((log) => ({
          log,
          precio: precioValido(precios[log.id]),
          m3: getResolvedM3(log).arrival,
        }))
        .filter(
          (v): v is { log: TransportLog; precio: number; m3: number | null } =>
            v.precio !== null,
        ),
    [filteredLogs, precios],
  );
  const viajesConPrecio = useMemo(
    () =>
      conPrecio
        .filter((v): v is typeof v & { m3: number } => v.m3 != null && v.m3 > 0)
        .map((v) => ({ ...v, subtotal: subtotalViaje(v.m3, v.precio) })),
    [conPrecio],
  );
  const conPrecioSinM3 = conPrecio.length - viajesConPrecio.length;
  const total = useMemo(
    () => sumarPrecios(viajesConPrecio.map((v) => v.subtotal)),
    [viajesConPrecio],
  );
  // Obra y cliente salen de los viajes: el backend exige que todos coincidan.
  const gruposConPrecio = useMemo(
    () =>
      new Set(
        viajesConPrecio.map(
          (v) =>
            `${v.log.constSiteId ?? v.log.constSite?.id}-${v.log.clientId ?? v.log.client?.id}`,
        ),
      ),
    [viajesConPrecio],
  );
  const viajeReferencia = viajesConPrecio[0]?.log;

  const motivoBloqueo = !planningFilter
    ? "Elija una planificación para liquidar"
    : viajesConPrecio.length === 0
      ? "Ingrese el precio de al menos un viaje"
      : conPrecioSinM3 > 0
        ? "Hay viajes con precio sin m³ de llegada"
        : gruposConPrecio.size > 1
          ? "Los viajes con precio son de distintas obras o clientes"
          : null;

  const cambiarPrecio = (id: number, texto: string) => {
    const normalizado = normalizarPrecio(texto);
    if (normalizado === null) return; // tecla no válida: se ignora
    setPrecios((prev) => {
      const siguiente = { ...prev };
      if (normalizado === "") delete siguiente[id];
      else siguiente[id] = normalizado;
      return siguiente;
    });
  };

  // ─── Llenado rápido de precios ───────────────────────────────────────────
  // Se aplica a TODOS los viajes filtrados (no solo la página visible); cada
  // precio se puede ajustar a mano después.
  const [precioFijo, setPrecioFijo] = useState("");

  /** Si ya hay precios en los viajes filtrados, pide confirmar antes de reemplazarlos. */
  const confirmarReemplazo = () =>
    !filteredLogs.some((log) => precioValido(precios[log.id]) !== null) ||
    window.confirm("Se reemplazarán los precios ya ingresados en los viajes filtrados. ¿Continuar?");

  const aplicarPrecioFijo = () => {
    const precio = precioValido(precioFijo);
    if (precio === null) {
      toast.error("Ingrese un precio mayor que 0");
      return;
    }
    if (!filteredLogs.length || !confirmarReemplazo()) return;
    setPrecios((prev) => {
      const siguiente = { ...prev };
      filteredLogs.forEach((log) => (siguiente[log.id] = precio.toFixed(2)));
      return siguiente;
    });
    toast.success(`Precio unitario ${formatearDinero(precio)}/m³ aplicado a ${filteredLogs.length} viaje(s)`);
  };

  const handleGuardar = async ({ fecha, observacion }: { fecha: string; observacion: string }) => {
    if (!viajeReferencia || motivoBloqueo) return;
    setIsSaving(true);
    try {
      const creada = await liquidacionService.crear({
        constSiteId: Number(viajeReferencia.constSiteId ?? viajeReferencia.constSite?.id),
        clientId: Number(viajeReferencia.clientId ?? viajeReferencia.client?.id),
        fecha,
        observacion: observacion || undefined,
        viajes: viajesConPrecio.map((v) => ({ tripId: v.log.id, precio: v.precio })),
      });
      toast.success(`Liquidación ${creada.codigo} guardada`);
      setPrecios({});
      setGuardarOpen(false);
      refetch();
    } catch (error) {
      console.error(error);
      // Los precios se conservan para corregir y volver a guardar.
      toast.error(mensajeDeError(error, "No se pudo guardar la liquidación"));
      refetch();
    } finally {
      setIsSaving(false);
    }
  };

  const columns = [
    {
      header: "Código",
      accessor: (row: TransportLog) => (
        <span className="font-mono text-xs whitespace-nowrap">
          {row.codigo || `#${row.id}`}
        </span>
      ),
    },
    {
      header: "ID Vehículo",
      accessor: (row: TransportLog) => row.vehicle?.vehicleid || row.vehicleId,
    },
    {
      header: "Placa",
      accessor: (row: TransportLog) => row.vehicle?.plate || "—",
    },
    {
      header: "Cantera",
      accessor: (row: TransportLog) => getCanteraLabel(row),
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
        const m3 = getResolvedM3(row).departure;
        if (m3 == null) return "—";
        const over = getCapacityOveruse(row).departureOver;
        const corregido = row.departureM3Corrected != null;
        return (
          <span
            className={over ? "text-orange-600 dark:text-orange-400 font-semibold" : undefined}
            title={corregido ? `Corregido (registrado: ${formatNumber(row.departureM3)})` : undefined}
          >
            {formatNumber(m3)}
          </span>
        );
      },
    },
    {
      header: "M3 Lleg",
      accessor: (row: TransportLog) => {
        const m3 = getResolvedM3(row).arrival;
        if (m3 == null) return "—";
        const over = getCapacityOveruse(row).arrivalOver;
        const corregido = row.arrivalM3Corrected != null;
        return (
          <span
            className={over ? "text-orange-600 dark:text-orange-400 font-semibold" : undefined}
            title={corregido ? `Corregido (registrado: ${formatNumber(row.arrivalM3 ?? 0)})` : undefined}
          >
            {formatNumber(m3)}
          </span>
        );
      },
    },
    {
      header: "Dif (m³)",
      accessor: (row: TransportLog) => {
        const resolved = getResolvedM3(row);
        const alertDeviation = isDeviationAlert(resolved.difference);
        return (
          <div className="flex flex-col gap-1 items-start">
            {resolved.difference === null ? (
              "—"
            ) : (
              <span
                className={
                  alertDeviation
                    ? "text-red-500 dark:text-red-400 font-semibold"
                    : "text-green-500 dark:text-green-400 font-semibold"
                }
              >
                {formatNumber(resolved.difference)}
              </span>
            )}
            {getCapacityOveruse(row).any && (
              <span className="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 dark:bg-orange-500/15 text-orange-800 dark:text-orange-300">
                Sobrecarga
              </span>
            )}
          </div>
        );
      },
    },
    // Sin permiso de crear no se ingresan precios.
    ...(canCreate
      ? [
          {
            header: "P. unit. ($/m³)",
            accessor: (row: TransportLog) => (
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                aria-label={`Precio unitario por m³ del viaje ${row.codigo || row.id}`}
                value={precios[row.id] ?? ""}
                onChange={(e) => cambiarPrecio(row.id, e.target.value)}
                className="w-24 border border-gray-300 dark:border-night-border dark:bg-night-raised dark:text-night-text rounded-md px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            ),
          },
          {
            header: "Subtotal",
            accessor: (row: TransportLog) => {
              const subtotal = subtotalDe(row);
              return (
                <span className="whitespace-nowrap font-semibold text-gray-900 dark:text-night-text">
                  {subtotal == null ? "—" : formatearDinero(subtotal)}
                </span>
              );
            },
          },
        ]
      : []),
    {
      header: "Acciones",
      accessor: (row: TransportLog) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25 border-none"
            icon={<Eye size={16} />}
            onClick={() => handleOpenDetail(row.id)}
          ></Button>
          <Button
            size="sm"
            variant="outline"
            className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25 border-none"
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

  // Liquidaciones es de solo consulta: el detalle no tiene acciones que
  // cambien el viaje (ni validar ni editar m³). El estado solo se usa aquí para
  // resaltar en rojo los m³ con desviación.
  const m3AlertClass =
    detailStatus === "ALERTA" ? "text-red-600 dark:text-red-400 font-semibold" : "font-normal";
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
        <p className="text-gray-500 dark:text-night-muted">
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
          className="h-32 w-full rounded-lg border border-gray-200 dark:border-night-border object-cover transition group-hover:opacity-90"
        />
        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 group-hover:underline">
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-night-text">
            Liquidaciones de viajes
          </h1>
          <p className="text-gray-600 dark:text-night-muted mt-1">
            Asigna el precio unitario por m³ de cada viaje emparejado y guarda la liquidación.
          </p>
        </div>
      </div>

      {/* Barra de acciones: Toggle de filtros y Exportar Excel (Siempre visibles) */}
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="outline"
          className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25 border-none"
          type="button"
          icon={showFilters ? <FilterX size={16} /> : <Filter size={16} />}
          onClick={() => setShowFilters(!showFilters)}
        >
          {showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
        </Button>

        <Button
          variant="outline"
          className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25 border-none"
          icon={<Download size={16} />}
          onClick={handleDownloadExcel}
        >
          Exportar Excel
        </Button>
      </div>

      {/* Tarjeta colapsable con los inputs de filtrado */}
      {showFilters && (
        <div className="bg-white dark:bg-night-surface rounded-lg shadow p-4 border border-gray-100 dark:border-night-border flex flex-col gap-4 relative z-30 overflow-visible">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 [&_label]:!mb-3">
            <SearchableSelect
              label="Planificación"
              value={planningFilter}
              onChange={(val) => cambiarFiltroDeGrupo(() => setPlanningFilter(val))}
              options={planningOptions}
            />
            <SearchableSelect
              label="Material"
              value={materialFilter}
              onChange={(val) => setMaterialFilter(val)}
              options={materialOptions}
            />
            <Input
              label="Placa de vehículo"
              placeholder="Ej. ABC1234"
              value={placaFilter}
              onChange={(e) => setPlacaFilter(normalizePlate(e.target.value))}
            />
            <Input
              label="Buscar general"
              placeholder="Cualquier texto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
            {/* Llenado rápido de precios (sobre los viajes filtrados) */}
            {canCreate && (
              <div className="w-full">
                <label
                  htmlFor="precio-fijo-viajes"
                  className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-night-muted mb-1"
                >
                  Asignar precio unitario ($/m³) a los {filteredLogs.length} viaje(s) seleccionados
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <Input
                      id="precio-fijo-viajes"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={precioFijo}
                      onChange={(e) => {
                        const v = normalizarPrecio(e.target.value);
                        if (v !== null) setPrecioFijo(v);
                      }}
                    />
                  </div>
                  <Button
                    className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25 border-none"
                    disabled={!precioFijo || filteredLogs.length === 0}
                    onClick={aplicarPrecioFijo}
                  >
                    Aplicar a todos
                  </Button>
                </div>
                {hayPrecios && (
                  <button
                    type="button"
                    className="mt-1 text-xs text-red-600 dark:text-red-400 hover:underline"
                    onClick={() => {
                      if (window.confirm("¿Borrar todos los precios ingresados?")) setPrecios({});
                    }}
                  >
                    Borrar precios
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!dateFrom && !dateTo && transportLogs.length >= 500 && (
        <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-4 py-2">
          Se muestran los 500 viajes pendientes más recientes. Use las fechas, la obra o el cliente para ver los demás.
        </p>
      )}

      <div className="bg-white dark:bg-night-surface rounded-lg shadow">
        <Table
          className="rounded-t-lg"
          data={paginatedLogs}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No hay viajes por liquidar con estos filtros"
        />
        <Pagination
          className="px-4 pb-4"
          total={totalLogs}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />

        {/* Pie: total en vivo y guardar */}
        {canCreate && (
          <div className="border-t border-gray-100 dark:border-night-border px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <p className="text-sm text-gray-600 dark:text-night-muted">
              Viajes con precio:{" "}
              <span className="font-semibold text-gray-900 dark:text-night-text">
                {viajesConPrecio.length}
              </span>{" "}
              de {totalLogs}
            </p>
            <div className="flex flex-col items-stretch md:items-end gap-1">
              <div className="flex items-center gap-4 justify-between md:justify-end">
                <p className="text-lg text-gray-700 dark:text-night-text">
                  Total:{" "}
                  <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                    {formatearDinero(total)}
                  </span>
                </p>
                <Button
                  variant="primary"
                  icon={<Save size={16} />}
                  disabled={Boolean(motivoBloqueo)}
                  onClick={() => setGuardarOpen(true)}
                >
                  Guardar liquidación
                </Button>
              </div>
              {motivoBloqueo && (
                <p className="text-xs text-gray-500 dark:text-night-muted">{motivoBloqueo}</p>
              )}
            </div>
          </div>
        )}
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
            <div>
              <p className="font-mono text-base font-semibold text-gray-900 dark:text-night-text">
                {detailLog.codigo || `#${detailLog.id}`}
              </p>
            </div>
            <MaterialShowcaseLiquidacion
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
              <h3 className="text-sm font-semibold text-gray-800 dark:text-night-text">
                Fotos del viaje
              </h3>
              <Button
                size="sm"
                className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25"
                onClick={() => setShowPhotos((prev) => !prev)}
              >
                {showPhotos ? "Ocultar fotos" : "Ver mas fotos"}
              </Button>
            </div>

            {showPhotos && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-semibold text-gray-800 dark:text-night-text mb-3">
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
                  <p className="font-semibold text-gray-800 dark:text-night-text mb-3">
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
              <div className="bg-gray-50 dark:bg-night-raised p-4 rounded-lg">
                <p className="text-gray-500 dark:text-night-muted mb-1">Vehículo</p>
                <p className="font-medium text-gray-900 dark:text-night-text mb-1">
                  {detailLog.vehicle?.plate || detailLog.vehicleId}
                </p>
                <p className="text-gray-600 dark:text-night-muted">
                  <span className="font-semibold text-gray-700 dark:text-night-text">
                    Conductor:
                  </span>{" "}
                  <span className="font-normal">
                    {detailLog.driver?.name || detailLog.vehicle?.driver?.name || "N/D"}
                  </span>
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-night-raised p-4 rounded-lg">
                <p className="text-gray-500 dark:text-night-muted">Registro</p>
                <p className="text-gray-600 dark:text-night-muted mt-2">
                  <span className="font-semibold text-gray-700 dark:text-night-text">
                    Registrado en Cantera por:
                  </span>{" "}
                  <span className="font-normal">
                    {detailLog.user?.name || "N/D"}
                  </span>
                </p>
                <p className="text-gray-600 dark:text-night-muted mt-2">
                  <span className="font-semibold text-gray-700 dark:text-night-text">
                    Registrado en Obra por:
                  </span>{" "}
                  <span className="font-normal">
                    {detailLog.userArrival?.name || "N/D"}
                  </span>
                </p>
                <p className="text-gray-600 dark:text-night-muted mt-2">
                  <span className="font-semibold text-gray-700 dark:text-night-text">
                    Planificación:
                  </span>{" "}
                  <span className="font-normal">
                    {detailLog.planning?.planningCode || "N/D"}
                  </span>
                </p>          
              </div>
              <div className="bg-gray-50 dark:bg-night-raised p-4 rounded-lg">
                <p className="text-gray-500 dark:text-night-muted">Salida</p>
                <p className="font-medium text-gray-900 dark:text-night-text">
                  {formatDateTime(
                    detailLog.departureAt || detailLog.createdAt || "",
                  )}
                </p>
                <p className="text-gray-600 dark:text-night-muted mt-2">
                  <span className="font-semibold text-gray-700 dark:text-night-text">Lat/Lng:</span>{" "}
                  <span className="font-normal">
                    {detailLog.departureLat}, {detailLog.departureLng}
                  </span>
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-night-raised p-4 rounded-lg">
                <p className="text-gray-500 dark:text-night-muted">Llegada</p>
                <p className="font-medium text-gray-900 dark:text-night-text">
                  {detailLog.arrivalAt
                    ? formatDateTime(detailLog.arrivalAt)
                    : "Pendiente"}
                </p>
                <p className="text-gray-600 dark:text-night-muted mt-2">
                  <span className="font-semibold text-gray-700 dark:text-night-text">GPS del escaneo:</span>{" "}
                  <span className="font-normal">
                    {detailLog.arrivalLat ?? "—"}, {detailLog.arrivalLng ?? "—"}
                    {detailLog.arrivalGpsPrecisionM != null &&
                      ` (± ${Math.round(detailLog.arrivalGpsPrecisionM)} m)`}
                  </span>
                </p>
                <UbicacionLlegadaDetalle ubicacion={detailLog.ubicacionLlegada} />
              </div>
              <div className="bg-gray-50 dark:bg-night-raised p-4 rounded-lg">
                <p className="text-gray-500 dark:text-night-muted">Material</p>
                <p className="font-medium text-gray-900 dark:text-night-text">{materialLabel}</p>
                <p className="text-gray-600 dark:text-night-muted mt-2">
                  <span className="font-semibold text-gray-700 dark:text-night-text">Abscisa:</span>{" "}
                  <span className="font-normal">
                    {detailLog.abscisa ?? "—"}
                  </span>
                </p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-night-raised p-4 rounded-lg text-sm">
              <p className="text-gray-500 dark:text-night-muted">Desviación M3 (Llegada - Salida)</p>
              <p
                className={`font-semibold text-lg ${
                  resolvedM3.difference === null
                    ? "text-gray-400 dark:text-night-subtle"
                    : isDeviationAlert(resolvedM3.difference)
                      ? "text-red-600 dark:text-red-400"
                      : "text-green-600 dark:text-green-400"
                }`}
              >
                {differenceLabel} m³
              </p>
              <p className="text-gray-600 dark:text-night-muted text-xs mt-1">
                <span className="font-semibold text-gray-700 dark:text-night-text">Salida:</span>{" "}
                <span className="font-normal text-gray-600 dark:text-night-muted">
                  {resolvedM3.departure !== null
                    ? formatNumber(resolvedM3.departure)
                    : "—"}
                </span>{" "}
                <span className="text-gray-400 dark:text-night-subtle">·</span>{" "}
                <span className="font-semibold text-gray-700 dark:text-night-text">Llegada:</span>{" "}
                <span className="font-normal text-gray-600 dark:text-night-muted">
                  {resolvedM3.arrival !== null
                    ? formatNumber(resolvedM3.arrival)
                    : "—"}
                </span>
              </p>
              {isReported && (
                <p className="text-orange-600 dark:text-orange-400 mt-2">
                  <span className="font-semibold">Alerta emitida</span>
                </p>
              )}
              {!isReported && hasDeviation && (
                <p className="text-orange-600 dark:text-orange-400 mt-2">
                  <span className="font-semibold">Alerta:</span>{" "}
                  <span className="font-normal">
                    desviación de M3 detectada
                  </span>
                </p>
              )}
              {capacityOveruse.any && (
                <p className="text-orange-600 dark:text-orange-400 mt-2">
                  <span className="font-semibold">Sobrecarga:</span>{" "}
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
              <div className="bg-gray-50 dark:bg-night-raised p-4 rounded-lg">
                <p className="text-gray-500 dark:text-night-muted">Observación de Cantera</p>
                <p className="mt-2 text-gray-800 dark:text-night-text whitespace-pre-line">
                  {departureObservationValue || "—"}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-night-raised p-4 rounded-lg">
                <p className="text-gray-500 dark:text-night-muted">Observación de Obra</p>
                <p className="mt-2 text-gray-800 dark:text-night-text whitespace-pre-line">
                  {arrivalObservationValue || "—"}
                </p>
              </div>
            </div>

            {/* Nota propia del liquidador (campo separado de las notas del sistema). */}
            <div className="bg-gray-50 dark:bg-night-raised p-4 rounded-lg text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-gray-500 dark:text-night-muted">Nota del liquidador</p>
                {detailLog.notaLiquidadorEn && (
                  <p className="text-xs text-gray-500 dark:text-night-muted">
                    {detailLog.notaLiquidadorPor?.name ?? "—"} ·{" "}
                    {formatDateTime(detailLog.notaLiquidadorEn)}
                  </p>
                )}
              </div>
              {canEdit ? (
                <>
                  <textarea
                    value={notaTexto}
                    maxLength={1000}
                    rows={3}
                    onChange={(e) => setNotaTexto(e.target.value)}
                    placeholder="Ej. Precio acordado con el cliente por teléfono"
                    className="mt-2 w-full border border-gray-300 dark:border-night-border dark:bg-night-surface dark:text-night-text rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="primary"
                      isLoading={guardandoNota}
                      disabled={guardandoNota || notaTexto.trim() === (detailLog.notaLiquidador ?? "")}
                      onClick={handleGuardarNota}
                    >
                      Guardar nota
                    </Button>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-gray-800 dark:text-night-text whitespace-pre-line">
                  {detailLog.notaLiquidador || "—"}
                </p>
              )}
            </div>

            {/* Notas automáticas del sistema (desemparejar, cambio de planificación, etc.). */}
            {descriptionValue && (
              <div className="bg-gray-50 dark:bg-night-raised p-4 rounded-lg text-sm">
                <p className="text-gray-500 dark:text-night-muted">Notas del sistema</p>
                <p className="mt-2 text-gray-800 dark:text-night-text whitespace-pre-line">
                  {descriptionValue}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <GuardarLiquidacionModal
        isOpen={guardarOpen}
        onClose={() => setGuardarOpen(false)}
        obra={viajeReferencia?.constSite?.name ?? "—"}
        cliente={nombreCliente(viajeReferencia?.client)}
        cantidadViajes={viajesConPrecio.length}
        total={total}
        isSaving={isSaving}
        onConfirm={handleGuardar}
      />
    </div>
  );
};
