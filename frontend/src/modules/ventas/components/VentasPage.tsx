import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as ExcelJS from 'exceljs';
import { addPngImage, downloadExcelWorkbook, renderGroupedBarChartPng } from '@/shared/utils/excelCharts';
import {
  Download,
  Eye,
  FileText,
  Filter,
  Package,
  Pencil,
  QrCode,
  Trash2,
  // Mismo alias que usa TransportLogPage: en esta versión de lucide el ícono se
  // llama AlertTriangle.
  AlertTriangle as TriangleAlert,
} from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Modal';
import { Table } from '@/shared/components/Table';
import { Pagination } from '@/shared/components/Pagination';
import { Input } from '@/shared/components/Input';
import { Select } from '@/shared/components/Select';
import { formatDateTime, formatNumber } from '@/shared/utils/format';
import { formatMaterialType } from '@/modules/materiales/utils/materialLabels';
import { PAGINATION } from '@/config/constants';
// Los compradores son los clientes registrados: se reusa su hook, no hay
// catálogo aparte.
import { useClientes } from '@/modules/clientes';
import { useMateriales } from '@/modules/materiales/hooks/useMateriales';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { useVentas } from '../hooks/useVentas';
import { ventasService } from '../services/ventasService';
import { CatalogoComprador, VentaCantera } from '../types';
import { VentaQrModal } from './VentaQrModal';
import { VentaStockModal } from './VentaStockModal';
import { resolveQrUrl } from '../utils/qrZip';
import { generateVentaPdf } from '../utils/ventaPdf';
import { idVehiculoVenta, placaVehiculoVenta } from '../utils/vehiculoVenta';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import {
  EMPRESA_VENDEDORA_CORTO,
  EMPRESA_VENDEDORA_LABELS,
} from '@/modules/ventas-ordenes/types';

/** Etiqueta legible del material, o guión si el registro no lo trae resuelto. */
const materialLabel = (venta: VentaCantera) =>
  venta.material?.materialType ? formatMaterialType(venta.material.materialType) : '—';

/**
 * INTERNO / EXTERNO no se guarda en la venta: sale del vehículo vinculado. Si el
 * vehículo no se pudo resolver, se infiere del prefijo del código solo para
 * mostrar — nunca se persiste una inferencia.
 */
const tipoVehiculo = (venta: VentaCantera): string => {
  if (venta.vehicle?.type) return venta.vehicle.type;
  const texto = venta.vehicleIdText?.trim().toUpperCase() ?? '';
  if (texto.startsWith('VI-')) return 'INTERNO (?)';
  if (texto.startsWith('VE-')) return 'EXTERNO (?)';
  return '—';
};

const vehiculoNoResuelto = (venta: VentaCantera) => venta.vehicleId == null;

/** El de la venta; en ventas anteriores, el de la orden. */
const transportistaDe = (venta: VentaCantera) =>
  venta.transportista ?? venta.orden?.transportista ?? null;

const APP_TIME_ZONE = 'America/Guayaquil';

/**
 * Día del despacho en hora de Ecuador, no en UTC.
 *
 * Recortar el ISO (`capturedAt.slice(0, 10)`) lee la fecha UTC: un despacho de
 * las 19:30 se guarda como el día siguiente y quedaría fuera del filtro del día
 * correcto. Mismo criterio que usa TransportLogPage.
 */
const toDateKey = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-CA', { timeZone: APP_TIME_ZONE });
};

export const VentasPage = () => {
  const { ventas, isLoading, refetch } = useVentas();
  const { user } = useAuth();
  const { clientes } = useClientes();
  const { materiales } = useMateriales();

  const [showFilters, setShowFilters] = useState(true);
  const [filtroCantera, setFiltroCantera] = useState('');
  const [filtroMaterial, setFiltroMaterial] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroVehiculo, setFiltroVehiculo] = useState('');
  const [filtroComprador, setFiltroComprador] = useState('');
  const [filtroOrden, setFiltroOrden] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.DEFAULT_PAGE_SIZE);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVenta, setDetailVenta] = useState<VentaCantera | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isStockOpen, setIsStockOpen] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editM3, setEditM3] = useState('');
  const [editComprador, setEditComprador] = useState('');
  const [editMaterialSeleccion, setEditMaterialSeleccion] = useState('');
  // Lo que tenía la venta al abrir el modal — si no cambia, no se manda
  // materialId/ordenItemId: re-mandarlo re-validaría la orden (y fallaría si
  // ya no está ABIERTA) aunque el usuario no haya tocado ese campo.
  const [editMaterialSeleccionOriginal, setEditMaterialSeleccionOriginal] = useState('');
  const [editObservacion, setEditObservacion] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);

  // Catálogo cliente→obra→orden→materiales para el selector de Material de
  // "Editar venta" (filtrado más abajo por el comprador elegido). Se pide una
  // sola vez al montar la página, igual que useClientes/useMateriales.
  const [catalogoCompradores, setCatalogoCompradores] = useState<CatalogoComprador[]>([]);
  useEffect(() => {
    ventasService
      .getOrdenesAbiertas()
      .then(setCatalogoCompradores)
      .catch((error) => console.error('No se pudo cargar el catálogo de órdenes abiertas:', error));
  }, []);

  // ─── Opciones de filtro, derivadas de lo que hay ───────────────────────────

  /**
   * Compradores para filtrar y para corregir una venta.
   *
   * Salen del catálogo de clientes, no de las ventas ya cargadas: si salieran de
   * ahí, al filtrar por un cliente la lista se reduciría a ese único cliente y no
   * habría forma de cambiar a otro. Se agregan además los clientes que aparecen
   * en alguna venta pero ya están dados de baja, para que sus ventas sigan siendo
   * filtrables.
   */
  const compradorOptions = useMemo(() => {
    const mapa = new Map<string, string>();
    clientes
      .filter((cliente) => cliente.isActive !== false)
      .forEach((cliente) => mapa.set(String(cliente.id), cliente.companyname));

    ventas.forEach((venta) => {
      if (venta.compradorId && !mapa.has(String(venta.compradorId))) {
        mapa.set(
          String(venta.compradorId),
          venta.compradorCliente?.companyname ?? venta.comprador ?? '—',
        );
      }
    });

    return [
      { value: '', label: 'Todos' },
      ...[...mapa.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [clientes, ventas]);

  /**
   * Material de "Editar venta": primero las líneas de órdenes ABIERTAS del
   * comprador elegido (eligiéndolas se vincula la venta a esa línea), y abajo
   * el resto del catálogo general por si el despacho no es contra una orden.
   * `ordenItemId` va en el `value` codificado (`orden:<id>` / `libre:<id>`)
   * para no tener que volver a buscarlo al guardar.
   */
  const materialOptionsEdit = useMemo(() => {
    const compradorSeleccionado = catalogoCompradores.find(
      (c) => String(c.clientId) === editComprador,
    );

    const deOrdenes: { value: string; label: string; materialId: number; ordenItemId: number }[] = [];
    compradorSeleccionado?.obras.forEach((obra) => {
      obra.ordenes.forEach((orden) => {
        orden.items.forEach((item) => {
          deOrdenes.push({
            value: `orden:${item.ordenItemId}`,
            label: `${formatMaterialType(item.materialType)} — ${obra.constSiteNombre} (${orden.codigo})`,
            materialId: item.materialId,
            ordenItemId: item.ordenItemId,
          });
        });
      });
    });

    // La línea que ya tenía esta venta puede pertenecer a una orden que ya no
    // está ABIERTA (se cerró o se completó) — no sale en el catálogo en vivo,
    // pero igual tiene que aparecer seleccionada para no perder el dato.
    const yaNoAbierta =
      detailVenta?.ordenItemId != null &&
      !deOrdenes.some((o) => o.ordenItemId === detailVenta.ordenItemId) &&
      String(detailVenta.compradorId ?? '') === editComprador
        ? [
            {
              value: `orden:${detailVenta.ordenItemId}`,
              label: `${materialLabel(detailVenta)} — ${detailVenta.constSite?.name ?? '?'} (${
                detailVenta.orden?.codigo ?? '?'
              }, no abierta)`,
              materialId: detailVenta.materialId,
              ordenItemId: detailVenta.ordenItemId,
            },
          ]
        : [];

    const libres = materiales.map((m) => ({
      value: `libre:${m.id}`,
      label: `${formatMaterialType(m.materialType)} (sin orden)`,
      materialId: m.id,
      ordenItemId: 0, // no se usa: value empieza con "libre:"
    }));

    return [...deOrdenes, ...yaNoAbierta, ...libres];
  }, [catalogoCompradores, editComprador, materiales, detailVenta]);

  const canteraOptions = useMemo(() => {
    const mapa = new Map<number, string>();
    ventas.forEach((venta) => {
      if (venta.canteraId) {
        mapa.set(venta.canteraId, venta.cantera?.nombre ?? `Cantera ${venta.canteraId}`);
      }
    });
    return [...mapa.entries()].map(([id, nombre]) => ({
      value: String(id),
      label: nombre,
    }));
  }, [ventas]);

  const materialOptions = useMemo(() => {
    const mapa = new Map<number, string>();
    ventas.forEach((venta) => {
      if (venta.material) {
        mapa.set(venta.material.id, formatMaterialType(venta.material.materialType));
      }
    });
    return [...mapa.entries()].map(([id, label]) => ({ value: String(id), label }));
  }, [ventas]);

  /**
   * Solo las que sí tienen orden: las que no, se filtran con "Sin orden".
   *
   * La etiqueta lleva el cliente para poder buscar la orden escribiendo su
   * nombre. Con un cliente elegido se listan solo sus órdenes — así el
   * selector no ofrece combinaciones que siempre darían cero resultados.
   */
  const ordenesPorId = useMemo(() => {
    const mapa = new Map<number, { codigo: string; compradorId: string; cliente: string }>();
    ventas.forEach((venta) => {
      if (venta.ordenId && venta.orden?.codigo) {
        mapa.set(venta.ordenId, {
          codigo: venta.orden.codigo,
          compradorId: String(venta.compradorId ?? ''),
          cliente: venta.compradorCliente?.companyname ?? venta.comprador ?? '',
        });
      }
    });
    return mapa;
  }, [ventas]);

  const ordenOptions = useMemo(
    () => [
      { value: '', label: 'Todas' },
      { value: 'SIN_ORDEN', label: 'Sin orden' },
      ...[...ordenesPorId.entries()]
        .filter(([, orden]) => !filtroComprador || orden.compradorId === filtroComprador)
        .map(([id, orden]) => ({
          value: String(id),
          label: orden.cliente ? `${orden.codigo} — ${orden.cliente}` : orden.codigo,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [ordenesPorId, filtroComprador],
  );

  /** Al cambiar de cliente se descarta la orden elegida si no es suya. */
  const handleFiltroCompradorChange = (valor: string) => {
    setFiltroComprador(valor);
    setFiltroOrden((actual) => {
      if (!valor || !actual || actual === 'SIN_ORDEN') return actual;
      return ordenesPorId.get(Number(actual))?.compradorId === valor ? actual : '';
    });
    setCurrentPage(1);
  };

  // ─── Filtrado ──────────────────────────────────────────────────────────────

  const ventasFiltradas = useMemo(() => {
    return ventas.filter((venta) => {
      if (filtroCantera && String(venta.canteraId) !== filtroCantera) return false;
      if (filtroMaterial && String(venta.materialId) !== filtroMaterial) return false;

      if (filtroTipo) {
        const tipo = venta.vehicle?.type ?? '';
        if (filtroTipo === 'SIN_RESOLVER') {
          if (!vehiculoNoResuelto(venta)) return false;
        } else if (tipo !== filtroTipo) {
          return false;
        }
      }

      if (filtroVehiculo) {
        const busqueda = filtroVehiculo.trim().toLowerCase();
        const enTexto =
          venta.vehicleIdText?.toLowerCase().includes(busqueda) ||
          venta.vehicle?.vehicleid?.toLowerCase().includes(busqueda);
        const enPlaca = venta.plate?.toLowerCase().includes(busqueda);
        const enCodigo = venta.codigo?.toLowerCase().includes(busqueda);
        if (!enTexto && !enPlaca && !enCodigo) return false;
      }

      // Se compara por id, no por nombre: el nombre guardado es el del momento
      // del despacho y puede diferir del actual si el cliente se renombró.
      if (filtroComprador && String(venta.compradorId ?? '') !== filtroComprador) {
        return false;
      }

      if (filtroOrden) {
        if (filtroOrden === 'SIN_ORDEN') {
          if (venta.ordenId != null) return false;
        } else if (String(venta.ordenId ?? '') !== filtroOrden) {
          return false;
        }
      }

      // Se filtra por capturedAt (hora real del despacho): usar createdAt
      // dejaría fuera de "hoy" una venta despachada hoy y sincronizada mañana.
      if (filtroDesde || filtroHasta) {
        const fecha = toDateKey(venta.capturedAt);
        if (!fecha) return false;
        if (filtroDesde && fecha < filtroDesde) return false;
        if (filtroHasta && fecha > filtroHasta) return false;
      }

      return true;
    });
  }, [
    ventas,
    filtroCantera,
    filtroMaterial,
    filtroTipo,
    filtroVehiculo,
    filtroComprador,
    filtroOrden,
    filtroDesde,
    filtroHasta,
  ]);

  const paginadas = useMemo(() => {
    const inicio = (currentPage - 1) * pageSize;
    return ventasFiltradas.slice(inicio, inicio + pageSize);
  }, [ventasFiltradas, currentPage, pageSize]);

  const handlePageSizeChange = (nuevo: number) => {
    setPageSize(nuevo);
    setCurrentPage(1);
  };

  const totalM3 = useMemo(
    () => ventasFiltradas.reduce((acc, venta) => acc + (venta.m3 ?? 0), 0),
    [ventasFiltradas]
  );

  // ─── Acciones ──────────────────────────────────────────────────────────────

  const handleOpenDetail = async (id: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      setDetailVenta(await ventasService.getById(id));
    } catch (error) {
      console.error(error);
      toast.error('No se pudo cargar el detalle de la venta');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDownloadPdf = async (id: number) => {
    setPdfLoadingId(id);
    try {
      const venta = await ventasService.getById(id);
      await generateVentaPdf(venta, { generadoPor: user?.name });
    } catch (error) {
      console.error(error);
      toast.error('No se pudo generar el PDF de la venta');
    } finally {
      setPdfLoadingId(null);
    }
  };

  const handleOpenEdit = () => {
    if (!detailVenta) return;
    setEditM3(String(detailVenta.m3 ?? ''));
    setEditComprador(detailVenta.compradorId ? String(detailVenta.compradorId) : '');
    const seleccionInicial =
      detailVenta.ordenItemId != null
        ? `orden:${detailVenta.ordenItemId}`
        : detailVenta.materialId
        ? `libre:${detailVenta.materialId}`
        : '';
    setEditMaterialSeleccion(seleccionInicial);
    setEditMaterialSeleccionOriginal(seleccionInicial);
    setEditObservacion(detailVenta.observation ?? '');
    setIsEditOpen(true);
  };

  /** Cambiar de comprador puede dejar sin sentido la línea de orden elegida
   *  (era de otro cliente) — se limpia para que el usuario vuelva a elegir. */
  const handleEditCompradorChange = (valor: string) => {
    setEditComprador(valor);
    setEditMaterialSeleccion((actual) => {
      const compradorNuevo = catalogoCompradores.find((c) => String(c.clientId) === valor);
      const sigueSiendoValida = compradorNuevo?.obras.some((o) =>
        o.ordenes.some((ord) => ord.items.some((i) => `orden:${i.ordenItemId}` === actual)),
      );
      return actual.startsWith('orden:') && !sigueSiendoValida ? '' : actual;
    });
  };

  const handleSaveEdit = async () => {
    if (!detailVenta) return;

    const m3 = Number(editM3);
    if (!Number.isFinite(m3) || m3 < 0) {
      toast.error('Los m³ deben ser un número válido');
      return;
    }

    const materialCambio = editMaterialSeleccion !== editMaterialSeleccionOriginal;
    const opcionMaterial = materialOptionsEdit.find((o) => o.value === editMaterialSeleccion);
    if (materialCambio && editMaterialSeleccion && !opcionMaterial) {
      toast.error('Elija un material válido');
      return;
    }

    try {
      setIsSaving(true);
      const actualizada = await ventasService.update(detailVenta.id, {
        m3,
        compradorId: editComprador ? Number(editComprador) : undefined,
        observation: editObservacion.trim() || null,
        ...(materialCambio &&
          opcionMaterial && {
            materialId: opcionMaterial.materialId,
            ordenItemId: opcionMaterial.value.startsWith('orden:') ? opcionMaterial.ordenItemId : null,
          }),
      });
      setDetailVenta(actualizada);
      setIsEditOpen(false);
      toast.success('Venta actualizada');
      refetch();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.response?.data?.message || 'No se pudo actualizar la venta');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!detailVenta) return;

    const avisoOrden = detailVenta.orden
      ? `\n\nEsta venta pertenece a la orden ${detailVenta.orden.codigo}: al anularla, su saldo disponible sube de inmediato.`
      : '';

    const confirmado = window.confirm(
      `¿Eliminar la venta #${detailVenta.id}?\n\n` +
        'Dejará de aparecer en el listado y en los reportes. ' +
        'El registro se conserva en la base de datos.' +
        avisoOrden
    );
    if (!confirmado) return;

    try {
      setIsDeleting(true);
      await ventasService.remove(detailVenta.id);
      toast.success('Venta eliminada');
      setDetailOpen(false);
      refetch();
    } catch (error) {
      console.error(error);
      toast.error('No se pudo eliminar la venta');
    } finally {
      setIsDeleting(false);
    }
  };

  /** Suma m³ agrupando por lo que devuelva `clave`, para los gráficos. */
  const sumarM3Por = (clave: (venta: VentaCantera) => string) => {
    const mapa = new Map<string, number>();
    ventasFiltradas.forEach((venta) => {
      const k = clave(venta);
      mapa.set(k, (mapa.get(k) ?? 0) + (venta.m3 ?? 0));
    });
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  };

  const handleDownloadExcel = async () => {
    if (!ventasFiltradas.length) {
      toast.error('No hay registros para exportar');
      return;
    }

    const workbook = new ExcelJS.Workbook();

    // ─── Hoja de datos ──────────────────────────────────────────────────────
    const dataSheet = workbook.addWorksheet('Ventas de cantera');
    dataSheet.columns = [
      { header: 'Codigo', key: 'codigo', width: 16 },
      { header: 'Fecha', key: 'fecha', width: 18 },
      { header: 'Cantera', key: 'cantera', width: 20 },
      { header: 'Proveedor', key: 'proveedor', width: 22 },
      { header: 'ID vehiculo', key: 'idVehiculo', width: 14 },
      { header: 'Placa', key: 'placa', width: 12 },
      { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Chofer', key: 'chofer', width: 20 },
      { header: 'Material', key: 'material', width: 18 },
      { header: 'm3', key: 'm3', width: 10 },
      { header: 'Comprador', key: 'comprador', width: 22 },
      { header: 'Obra', key: 'obra', width: 20 },
      { header: 'Orden', key: 'orden', width: 16 },
      { header: 'Empresa vendedora', key: 'empresaVendedora', width: 30 },
      { header: 'Transportista', key: 'transportista', width: 26 },
      { header: 'Observacion', key: 'observacion', width: 26 },
      { header: 'Registrado por', key: 'registradoPor', width: 18 },
      { header: 'Vehiculo vinculado', key: 'vehiculoVinculado', width: 16 },
    ];
    dataSheet.getRow(1).font = { bold: true };
    ventasFiltradas.forEach((venta) => {
      dataSheet.addRow({
        codigo: venta.codigo || `#${venta.id}`,
        fecha: formatDateTime(venta.capturedAt) || '—',
        cantera: venta.cantera?.nombre ?? '—',
        proveedor: venta.cantera?.materialProvider?.razonsocial ?? '—',
        idVehiculo: idVehiculoVenta(venta),
        placa: placaVehiculoVenta(venta),
        tipo: tipoVehiculo(venta),
        chofer: venta.driverName ?? '—',
        material: materialLabel(venta),
        m3: venta.m3,
        comprador: venta.comprador ?? '—',
        obra: venta.constSite?.name ?? '—',
        orden: venta.orden?.codigo ?? 'SIN ORDEN',
        empresaVendedora: venta.orden?.empresaVendedora
          ? EMPRESA_VENDEDORA_LABELS[venta.orden.empresaVendedora]
          : '—',
        transportista: transportistaDe(venta)?.name ?? '—',
        observacion: venta.observation ?? '—',
        registradoPor: venta.user?.name ?? '—',
        vehiculoVinculado: vehiculoNoResuelto(venta) ? 'NO' : 'SI',
      });
    });

    // ─── Hoja de gráficos ───────────────────────────────────────────────────
    // Imágenes, no gráficos nativos: la librería gratuita de Excel no los
    // soporta. Se dibujan con los mismos datos ya filtrados de la grilla.
    const chartSheet = workbook.addWorksheet('Gráficos');

    const porMaterial = sumarM3Por((v) => materialLabel(v));
    addPngImage(
      workbook,
      chartSheet,
      renderGroupedBarChartPng({
        title: 'm³ vendidos por material',
        categories: porMaterial.map(([label]) => label),
        series: [
          { name: 'm³', color: '#2563EB', values: porMaterial.map(([, valor]) => valor) },
        ],
        valueSuffix: ' m³',
      }),
      'B2:M22'
    );

    const porCantera = sumarM3Por((v) => v.cantera?.nombre ?? '—');
    addPngImage(
      workbook,
      chartSheet,
      renderGroupedBarChartPng({
        title: 'm³ vendidos por cantera',
        categories: porCantera.map(([label]) => label),
        series: [
          { name: 'm³', color: '#16A34A', values: porCantera.map(([, valor]) => valor) },
        ],
        valueSuffix: ' m³',
      }),
      'B24:M44'
    );

    await downloadExcelWorkbook(
      workbook,
      `ventas_cantera_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  // ─── Columnas ──────────────────────────────────────────────────────────────

  const columns = [
    {
      header: 'Código',
      accessor: (row: VentaCantera) => (
        <span className="font-mono text-xs whitespace-nowrap">
          {row.codigo || `#${row.id}`}
        </span>
      ),
    },
    {
      header: 'Fecha',
      accessor: (row: VentaCantera) => formatDateTime(row.capturedAt) || '—',
    },
    {
      header: 'Cantera',
      accessor: (row: VentaCantera) => (
        <div className="text-sm">
          <p className="text-gray-900 dark:text-night-text">{row.cantera?.nombre ?? '—'}</p>
          {row.cantera?.materialProvider?.razonsocial && (
            <p className="text-xs text-gray-500 dark:text-night-muted truncate max-w-[180px]">
              {row.cantera.materialProvider.razonsocial}
            </p>
          )}
        </div>
      ),
    },
    {
      header: 'ID Vehículo',
      accessor: (row: VentaCantera) => (
        <div className="flex items-center gap-1">
          <span>{idVehiculoVenta(row)}</span>
          {vehiculoNoResuelto(row) && (
            <span
              title={`El vehículo "${row.vehicleIdText}" no está registrado en el catálogo`}
              className="text-amber-600 dark:text-amber-400"
            >
              <TriangleAlert size={14} />
            </span>
          )}
        </div>
      ),
    },
    { header: 'Placa', accessor: (row: VentaCantera) => placaVehiculoVenta(row) },
    { header: 'Tipo', accessor: (row: VentaCantera) => tipoVehiculo(row) },
    { header: 'Chofer', accessor: (row: VentaCantera) => row.driverName ?? '—' },
    { header: 'Material', accessor: (row: VentaCantera) => materialLabel(row) },
    {
      header: 'm³',
      accessor: (row: VentaCantera) => (
        <span className="font-semibold text-gray-900 dark:text-night-text">{formatNumber(row.m3 ?? 0)}</span>
      ),
    },
    { header: 'Comprador', accessor: (row: VentaCantera) => row.comprador ?? '—' },
    {
      header: 'Orden',
      accessor: (row: VentaCantera) => (
        <div className="text-sm">
          <p className={row.orden ? 'text-gray-900 dark:text-night-text font-medium' : 'text-gray-400 dark:text-night-subtle italic'}>
            {row.orden?.codigo ?? 'SIN ORDEN'}
          </p>
          {row.constSite?.name && (
            <p className="text-xs text-gray-500 dark:text-night-muted truncate max-w-[160px]">{row.constSite.name}</p>
          )}
          {row.orden?.empresaVendedora && (
            <p
              className="text-xs text-blue-700 dark:text-blue-300"
              title={EMPRESA_VENDEDORA_LABELS[row.orden.empresaVendedora]}
            >
              Vende: {EMPRESA_VENDEDORA_CORTO[row.orden.empresaVendedora]}
            </p>
          )}
          {transportistaDe(row) && (
            <p className="text-xs text-gray-500 dark:text-night-muted truncate max-w-[160px]">
              Transp.: {transportistaDe(row)!.name}
            </p>
          )}
        </div>
      ),
    },
    {
      header: 'Registrado por',
      accessor: (row: VentaCantera) => row.user?.name ?? '—',
    },
    {
      header: 'Acciones',
      accessor: (row: VentaCantera) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25 border-none"
            icon={<Eye size={16} />}
            onClick={() => handleOpenDetail(row.id)}
            title="Ver detalle"
          />
          <Button
            size="sm"
            variant="outline"
            className="!bg-gray-100 dark:!bg-night-raised !text-gray-700 dark:!text-night-text hover:!bg-gray-200 dark:hover:!bg-night-hover border-none"
            icon={<FileText size={16} />}
            isLoading={pdfLoadingId === row.id}
            onClick={() => handleDownloadPdf(row.id)}
            title="Descargar PDF"
          />
        </div>
      ),
    },
  ];

  // ─── Fotos del detalle ─────────────────────────────────────────────────────

  const renderPhoto = (label: string, path: string | null | undefined) => {
    const url = resolveQrUrl(path);
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-600 dark:text-night-muted">{label}</p>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            <img
              src={url}
              alt={label}
              className="w-full h-32 object-cover rounded-lg border hover:opacity-90 transition"
            />
          </a>
        ) : (
          <div className="w-full h-32 rounded-lg border border-dashed flex items-center justify-center text-xs text-gray-400 dark:text-night-subtle">
            Sin foto
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-night-text">Venta de material</h1>
        <p className="text-sm text-gray-500 dark:text-night-muted mt-1">
          Despachos de material vendido desde las canteras. Solo salida: estos registros no
          tienen llegada ni emparejamiento.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25 border-none"
            icon={<Filter size={16} />}
            onClick={() => setShowFilters((valor) => !valor)}
          >
            {showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
          </Button>
          <Button
            variant="secondary"
            className="!bg-orange-200 dark:!bg-orange-500/20 !text-orange-800 dark:!text-orange-300 hover:!bg-orange-300 dark:hover:!bg-orange-500/25 border-none"
            icon={<QrCode size={16} />}
            onClick={() => setIsQrOpen(true)}
          >
            QR de venta
          </Button>
          <Button
            variant="secondary"
            className="!bg-emerald-200 dark:!bg-emerald-500/20 !text-emerald-800 dark:!text-emerald-300 hover:!bg-emerald-300 dark:hover:!bg-emerald-500/25 border-none"
            icon={<Package size={16} />}
            onClick={() => setIsStockOpen(true)}
          >
            Stock
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-sm text-gray-600 dark:text-night-muted">
            {ventasFiltradas.length} registro(s) · {formatNumber(totalM3)} m³
          </span>
          <Button
            variant="outline"
            className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25 border-none"
            icon={<Download size={16} />}
            onClick={handleDownloadExcel}
          >
            Exportar Excel
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white dark:bg-night-surface rounded-lg shadow p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Select
              label="Cantera"
              options={canteraOptions}
              value={filtroCantera}
              onChange={(e) => {
                setFiltroCantera(e.target.value);
                setCurrentPage(1);
              }}
            />
            <Select
              label="Material"
              options={materialOptions}
              value={filtroMaterial}
              onChange={(e) => {
                setFiltroMaterial(e.target.value);
                setCurrentPage(1);
              }}
            />
            <Select
              label="Tipo de vehículo"
              options={[
                { value: 'INTERNO', label: 'Interno' },
                { value: 'EXTERNO', label: 'Externo' },
                { value: 'SIN_RESOLVER', label: 'Sin vincular al catálogo' },
              ]}
              value={filtroTipo}
              onChange={(e) => {
                setFiltroTipo(e.target.value);
                setCurrentPage(1);
              }}
            />
            <Input
              label="Vehículo, placa o código"
              placeholder="Ej: VI-003 o VEN-00001"
              value={filtroVehiculo}
              onChange={(e) => {
                setFiltroVehiculo(e.target.value);
                setCurrentPage(1);
              }}
            />
            {/* Selector, no texto libre: ahora el comprador es un cliente
                concreto, así que buscar por nombre a mano ya no hace falta. */}
            <SearchableSelect
              label="Cliente (comprador)"
              placeholder="Todos"
              options={compradorOptions}
              value={filtroComprador}
              onChange={handleFiltroCompradorChange}
              emptyMessage="No hay clientes con ese nombre"
            />
            <SearchableSelect
              label="Orden"
              placeholder="Todas"
              options={ordenOptions}
              value={filtroOrden}
              onChange={(valor) => {
                setFiltroOrden(valor);
                setCurrentPage(1);
              }}
              emptyMessage="No hay órdenes que coincidan"
            />
            <Input
              label="Desde"
              type="date"
              value={filtroDesde}
              onChange={(e) => {
                setFiltroDesde(e.target.value);
                setCurrentPage(1);
              }}
            />
            <Input
              label="Hasta"
              type="date"
              value={filtroHasta}
              onChange={(e) => {
                setFiltroHasta(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-night-surface rounded-lg shadow">
        <Table
          data={paginadas}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No hay ventas de cantera registradas"
        />
        <Pagination
          className="px-4 pb-4"
          total={ventasFiltradas.length}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

          {/* Detalle. Sin "Alerta", "Reasignar vehículo/chofer" ni "Desemparejar":
          una venta no tiene llegada que emparejar ni desviación que alertar. */}
      <Modal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Detalle de la venta"
        size="lg"
      >
        {detailLoading && (
          <div className="flex justify-center items-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        )}

        {!detailLoading && detailVenta && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-base font-semibold text-gray-900 dark:text-night-text">
                  {detailVenta.codigo || `#${detailVenta.id}`}
                </p>
                <p className="text-xs text-gray-500 dark:text-night-muted">
                  Orden:{' '}
                  <span className="font-mono">
                    {detailVenta.orden?.codigo ?? 'Sin orden'}
                  </span>
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<FileText size={15} />}
                isLoading={pdfLoadingId === detailVenta.id}
                onClick={() => handleDownloadPdf(detailVenta.id)}
              >
                PDF
              </Button>
            </div>

            {vehiculoNoResuelto(detailVenta) && (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3 flex gap-2">
                <TriangleAlert size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-900 dark:text-amber-300">
                  El vehículo <strong>{detailVenta.vehicleIdText}</strong> no está
                  registrado en el catálogo. Cuando se registre, esta venta se vinculará
                  sola y tomará su ID.
                </p>
              </div>
            )}

            {/* Grid compacto de 2 columnas */}
            <div className="grid md:grid-cols-2 gap-3">
              <div className="bg-gray-50/90 dark:bg-night-raised p-3 rounded-lg border border-gray-100 dark:border-night-border space-y-0.5">
                <p className="text-[11px] font-bold text-gray-400 dark:text-night-subtle uppercase tracking-wider">Cantera</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-night-text">{detailVenta.cantera?.nombre ?? '—'}</p>
                <p className="text-xs text-gray-600 dark:text-night-muted truncate">
                  {detailVenta.cantera?.materialProvider?.razonsocial ?? ''}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-night-subtle font-mono">QR: {detailVenta.qrcode}</p>
              </div>

              <div className="bg-gray-50/90 dark:bg-night-raised p-3 rounded-lg border border-gray-100 dark:border-night-border space-y-0.5">
                <p className="text-[11px] font-bold text-gray-400 dark:text-night-subtle uppercase tracking-wider">Vehículo</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-night-text">
                  {idVehiculoVenta(detailVenta)} · {placaVehiculoVenta(detailVenta)}
                </p>
                <p className="text-xs text-gray-600 dark:text-night-muted">Tipo: {tipoVehiculo(detailVenta)}</p>
                <p className="text-[11px] text-gray-500 dark:text-night-muted">
                  Chofer: {detailVenta.driverName ?? 'Sin asignar'}
                </p>
              </div>

              <div className="bg-gray-50/90 dark:bg-night-raised p-3 rounded-lg border border-gray-100 dark:border-night-border space-y-0.5">
                <p className="text-[11px] font-bold text-gray-400 dark:text-night-subtle uppercase tracking-wider">Despacho</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-night-text">
                  {formatNumber(detailVenta.m3 ?? 0)} m³ · {materialLabel(detailVenta)}
                </p>
                <p className="text-xs text-gray-500 dark:text-night-muted">
                  {formatDateTime(detailVenta.capturedAt)}
                </p>
                {detailVenta.lat != null && detailVenta.lng != null && (
                  <p className="text-[10px] text-gray-400 dark:text-night-subtle font-mono">
                    Lat: {detailVenta.lat.toFixed(5)}, Long: {detailVenta.lng.toFixed(5)}
                  </p>
                )}
              </div>

              <div className="bg-gray-50/90 dark:bg-night-raised p-3 rounded-lg border border-gray-100 dark:border-night-border space-y-0.5">
                <p className="text-[11px] font-bold text-gray-400 dark:text-night-subtle uppercase tracking-wider">Comprador</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-night-text">{detailVenta.comprador ?? '—'}</p>
                <p className="text-xs text-gray-500 dark:text-night-muted">
                  Registrado por: {detailVenta.user?.name ?? '—'}
                </p>
              </div>

              <div className="bg-gray-50/90 dark:bg-night-raised p-3 rounded-lg border border-gray-100 dark:border-night-border space-y-0.5">
                <p className="text-[11px] font-bold text-gray-400 dark:text-night-subtle uppercase tracking-wider">Obra</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-night-text">
                  {detailVenta.constSite?.name ?? '—'}
                </p>
                <p className="text-[11px] font-bold text-gray-400 dark:text-night-subtle uppercase tracking-wider pt-1">Orden</p>
                <p
                  className={`text-sm font-semibold ${
                    detailVenta.orden ? 'text-gray-900 dark:text-night-text' : 'text-gray-400 dark:text-night-subtle italic'
                  }`}
                >
                  {detailVenta.orden?.codigo ?? 'SIN ORDEN'}
                </p>
              </div>
            </div>

            

            {/* Observación. Solo si la hay: es opcional en el registro. */}
            {detailVenta.observation && (
              <div className="bg-gray-50/90 dark:bg-night-raised p-3 rounded-lg border border-gray-100 dark:border-night-border">
                <p className="text-[11px] font-bold text-gray-400 dark:text-night-subtle uppercase tracking-wider mb-1">
                  Observación
                </p>
                <p className="text-xs text-gray-800 dark:text-night-text whitespace-pre-line">
                  {detailVenta.observation}
                </p>
              </div>
            )}

            {/* Acciones. Fuera del bloque de observación a propósito: estaban
                anidadas dentro y una venta sin observación —la mayoría— se
                quedaba sin forma de editarse ni eliminarse. */}
            <div className="flex justify-end gap-2 pb-2 border-b border-gray-100 dark:border-night-border">
              <Button
                className="!bg-blue-100 dark:!bg-blue-500/15 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-200 dark:hover:!bg-blue-500/25 border-none"
                size="sm"
                icon={<Pencil size={15} />}
                onClick={handleOpenEdit}
              >
                Editar
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="!bg-rose-100 dark:!bg-rose-500/15 !text-rose-800 dark:!text-rose-300 hover:!bg-rose-200 dark:hover:!bg-rose-500/25 border-none"
                icon={<Trash2 size={15} />}
                onClick={handleDelete}
                isLoading={isDeleting}
              >
                Eliminar
              </Button>
            </div>

            

            {/* Galería de fotos acotada */}
            <div className="pt-2 border-t border-gray-100 dark:border-night-border">
              <p className="text-xs font-semibold text-gray-700 dark:text-night-text uppercase tracking-wider mb-2">
                Fotos del despacho
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {renderPhoto('Placa', detailVenta.platePath)}
                {renderPhoto('Material', detailVenta.materialPath)}
                {renderPhoto('Conductor', detailVenta.driverPath)}
                {renderPhoto('Vehículo', detailVenta.vehiclePath)}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Editar venta"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSaveEdit} isLoading={isSaving}>
              Guardar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Esta venta descuenta el saldo de una orden: cambiar el m³ (o
              anularla) recalcula ese saldo al instante, porque nunca se
              guarda aparte — se suma en vivo desde las ventas. No es un paso
              extra a hacer en "Órdenes de venta": ya queda reflejado solo. */}
          {detailVenta?.orden && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3 flex gap-2">
              <TriangleAlert size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900 dark:text-amber-300">
                Esta venta pertenece a la orden <strong>{detailVenta.orden.codigo}</strong>
                {detailVenta.constSite?.name ? ` (${detailVenta.constSite.name})` : ''}. Cambiar
                el m³ modifica al instante el saldo disponible de esa orden.
              </p>
            </div>
          )}
          <Input
            label="m³ despachados"
            type="number"
            step="0.01"
            min="0"
            value={editM3}
            onChange={(e) => setEditM3(e.target.value)}
          />
          <SearchableSelect
            label="Comprador"
            placeholder="Seleccione el cliente"
            options={compradorOptions.filter((o) => o.value !== '')}
            value={editComprador}
            onChange={handleEditCompradorChange}
          />
          <SearchableSelect
            label="Material"
            placeholder={editComprador ? 'Elija el material' : 'Elija primero el comprador'}
            options={materialOptionsEdit.map((o) => ({ value: o.value, label: o.label }))}
            value={editMaterialSeleccion}
            onChange={setEditMaterialSeleccion}
          />
          <p className="text-xs text-gray-500 dark:text-night-muted -mt-2">
            Las opciones de arriba vinculan el despacho a esa línea de la orden abierta del
            comprador; "(sin orden)" lo deja como un material libre.
          </p>
          <Input
            label="Observación"
            value={editObservacion}
            onChange={(e) => setEditObservacion(e.target.value)}
          />
          <p className="text-xs text-gray-500 dark:text-night-muted">
            El vehículo, la cantera y la hora no se editan: son lo que ocurrió en el
            despacho.
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={isQrOpen}
        onClose={() => setIsQrOpen(false)}
        title="QR de venta por cantera"
        size="lg"
      >
        <VentaQrModal onClose={() => setIsQrOpen(false)} />
      </Modal>

      <Modal
        isOpen={isStockOpen}
        onClose={() => setIsStockOpen(false)}
        title="Stock de material por cantera"
        size="xl"
      >
        <VentaStockModal />
      </Modal>
    </div>
  );
};
