import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  Download,
  Eye,
  Filter,
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
import { useVentas } from '../hooks/useVentas';
import { ventasService } from '../services/ventasService';
import { VentaCantera } from '../types';
import { VentaQrModal } from './VentaQrModal';
import { resolveQrUrl } from '../utils/qrZip';

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

  const [showFilters, setShowFilters] = useState(true);
  const [filtroCantera, setFiltroCantera] = useState('');
  const [filtroMaterial, setFiltroMaterial] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroVehiculo, setFiltroVehiculo] = useState('');
  const [filtroComprador, setFiltroComprador] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.DEFAULT_PAGE_SIZE);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVenta, setDetailVenta] = useState<VentaCantera | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [isQrOpen, setIsQrOpen] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editM3, setEditM3] = useState('');
  const [editComprador, setEditComprador] = useState('');
  const [editObservacion, setEditObservacion] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ─── Opciones de filtro, derivadas de lo que hay ───────────────────────────

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
        const enTexto = venta.vehicleIdText?.toLowerCase().includes(busqueda);
        const enPlaca = venta.plate?.toLowerCase().includes(busqueda);
        if (!enTexto && !enPlaca) return false;
      }

      if (filtroComprador) {
        const busqueda = filtroComprador.trim().toLowerCase();
        if (!venta.comprador?.toLowerCase().includes(busqueda)) return false;
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

  const handleOpenEdit = () => {
    if (!detailVenta) return;
    setEditM3(String(detailVenta.m3 ?? ''));
    setEditComprador(detailVenta.comprador ?? '');
    setEditObservacion(detailVenta.observation ?? '');
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!detailVenta) return;

    const m3 = Number(editM3);
    if (!Number.isFinite(m3) || m3 < 0) {
      toast.error('Los m³ deben ser un número válido');
      return;
    }

    try {
      setIsSaving(true);
      const actualizada = await ventasService.update(detailVenta.id, {
        m3,
        comprador: editComprador.trim() || null,
        observation: editObservacion.trim() || null,
      });
      setDetailVenta(actualizada);
      setIsEditOpen(false);
      toast.success('Venta actualizada');
      refetch();
    } catch (error) {
      console.error(error);
      toast.error('No se pudo actualizar la venta');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!detailVenta) return;

    const confirmado = window.confirm(
      `¿Eliminar la venta #${detailVenta.id}?\n\n` +
        'Dejará de aparecer en el listado y en los reportes. ' +
        'El registro se conserva en la base de datos.'
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

  const handleDownloadExcel = () => {
    if (!ventasFiltradas.length) {
      toast.error('No hay registros para exportar');
      return;
    }

    const exportData = ventasFiltradas.map((venta) => ({
      fecha: formatDateTime(venta.capturedAt) || '—',
      cantera: venta.cantera?.nombre ?? '—',
      proveedor: venta.cantera?.materialProvider?.razonsocial ?? '—',
      'id vehiculo': venta.vehicleIdText,
      placa: venta.plate ?? '—',
      tipo: tipoVehiculo(venta),
      chofer: venta.driverName ?? '—',
      material: materialLabel(venta),
      m3: venta.m3,
      comprador: venta.comprador ?? '—',
      observacion: venta.observation ?? '—',
      'registrado por': venta.user?.name ?? '—',
      'vehiculo vinculado': vehiculoNoResuelto(venta) ? 'NO' : 'SI',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas de cantera');
    XLSX.writeFile(
      workbook,
      `ventas_cantera_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  // ─── Columnas ──────────────────────────────────────────────────────────────

  const columns = [
    {
      header: 'Fecha',
      accessor: (row: VentaCantera) => formatDateTime(row.capturedAt) || '—',
    },
    {
      header: 'Cantera',
      accessor: (row: VentaCantera) => (
        <div className="text-sm">
          <p className="text-gray-900">{row.cantera?.nombre ?? '—'}</p>
          {row.cantera?.materialProvider?.razonsocial && (
            <p className="text-xs text-gray-500 truncate max-w-[180px]">
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
          <span>{row.vehicleIdText}</span>
          {vehiculoNoResuelto(row) && (
            <span
              title="No se encontró este vehículo en el catálogo al registrar la venta"
              className="text-amber-600"
            >
              <TriangleAlert size={14} />
            </span>
          )}
        </div>
      ),
    },
    { header: 'Placa', accessor: (row: VentaCantera) => row.plate ?? '—' },
    { header: 'Tipo', accessor: (row: VentaCantera) => tipoVehiculo(row) },
    { header: 'Chofer', accessor: (row: VentaCantera) => row.driverName ?? '—' },
    { header: 'Material', accessor: (row: VentaCantera) => materialLabel(row) },
    {
      header: 'm³',
      accessor: (row: VentaCantera) => (
        <span className="font-semibold text-gray-900">{formatNumber(row.m3 ?? 0)}</span>
      ),
    },
    { header: 'Comprador', accessor: (row: VentaCantera) => row.comprador ?? '—' },
    {
      header: 'Registrado por',
      accessor: (row: VentaCantera) => row.user?.name ?? '—',
    },
    {
      header: 'Acciones',
      accessor: (row: VentaCantera) => (
        <Button
          size="sm"
          variant="outline"
          className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
          icon={<Eye size={16} />}
          onClick={() => handleOpenDetail(row.id)}
        />
      ),
    },
  ];

  // ─── Fotos del detalle ─────────────────────────────────────────────────────

  const renderPhoto = (label: string, path: string | null | undefined) => {
    const url = resolveQrUrl(path);
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-600">{label}</p>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            <img
              src={url}
              alt={label}
              className="w-full h-32 object-cover rounded-lg border hover:opacity-90 transition"
            />
          </a>
        ) : (
          <div className="w-full h-32 rounded-lg border border-dashed flex items-center justify-center text-xs text-gray-400">
            Sin foto
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Venta de material</h1>
        <p className="text-sm text-gray-500 mt-1">
          Despachos de material vendido desde las canteras. Solo salida: estos registros no
          tienen llegada ni emparejamiento.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
            icon={<Filter size={16} />}
            onClick={() => setShowFilters((valor) => !valor)}
          >
            {showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
          </Button>
          <Button
            variant="secondary"
            className="!bg-orange-200 !text-orange-800 hover:!bg-orange-300 border-none"
            icon={<QrCode size={16} />}
            onClick={() => setIsQrOpen(true)}
          >
            QR de venta
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-sm text-gray-600">
            {ventasFiltradas.length} registro(s) · {formatNumber(totalM3)} m³
          </span>
          <Button
            variant="outline"
            className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
            icon={<Download size={16} />}
            onClick={handleDownloadExcel}
          >
            Exportar Excel
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white rounded-lg shadow p-4">
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
              label="Vehículo o placa"
              placeholder="Ej: VI-003"
              value={filtroVehiculo}
              onChange={(e) => {
                setFiltroVehiculo(e.target.value);
                setCurrentPage(1);
              }}
            />
            <Input
              label="Comprador"
              placeholder="Nombre del comprador"
              value={filtroComprador}
              onChange={(e) => {
                setFiltroComprador(e.target.value);
                setCurrentPage(1);
              }}
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

      <div className="bg-white rounded-lg shadow">
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
            {/* Acciones principales fijas con separación visual limpia */} 

            {vehiculoNoResuelto(detailVenta) && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                <TriangleAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-900">
                  El vehículo <strong>{detailVenta.vehicleIdText}</strong> no estaba en el
                  catálogo cuando se registró esta venta. El despacho quedó guardado con el
                  ID tal como se escribió.
                </p>
              </div>
            )}

            {/* Grid compacto de 2 columnas */}
            <div className="grid md:grid-cols-2 gap-3">
              <div className="bg-gray-50/90 p-3 rounded-lg border border-gray-100 space-y-0.5">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Cantera</p>
                <p className="text-sm font-semibold text-gray-900">{detailVenta.cantera?.nombre ?? '—'}</p>
                <p className="text-xs text-gray-600 truncate">
                  {detailVenta.cantera?.materialProvider?.razonsocial ?? ''}
                </p>
                <p className="text-[11px] text-gray-400 font-mono">QR: {detailVenta.qrcode}</p>
              </div>

              <div className="bg-gray-50/90 p-3 rounded-lg border border-gray-100 space-y-0.5">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Vehículo</p>
                <p className="text-sm font-semibold text-gray-900">
                  {detailVenta.vehicleIdText}
                  {detailVenta.plate ? ` · ${detailVenta.plate}` : ''}
                </p>
                <p className="text-xs text-gray-600">Tipo: {tipoVehiculo(detailVenta)}</p>
                <p className="text-[11px] text-gray-500">
                  Chofer: {detailVenta.driverName ?? 'Sin asignar'}
                </p>
              </div>

              <div className="bg-gray-50/90 p-3 rounded-lg border border-gray-100 space-y-0.5">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Despacho</p>
                <p className="text-sm font-semibold text-gray-900">
                  {formatNumber(detailVenta.m3 ?? 0)} m³ · {materialLabel(detailVenta)}
                </p>
                <p className="text-xs text-gray-500">
                  {formatDateTime(detailVenta.capturedAt)}
                </p>
                {detailVenta.lat != null && detailVenta.lng != null && (
                  <p className="text-[10px] text-gray-400 font-mono">
                    Lat: {detailVenta.lat.toFixed(5)}, Long: {detailVenta.lng.toFixed(5)}
                  </p>
                )}
              </div>

              <div className="bg-gray-50/90 p-3 rounded-lg border border-gray-100 space-y-0.5">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Comprador</p>
                <p className="text-sm font-semibold text-gray-900">{detailVenta.comprador ?? '—'}</p>
                <p className="text-xs text-gray-500">
                  Registrado por: {detailVenta.user?.name ?? '—'}
                </p>
              </div>
            </div>

            

            {/* Observación */}
            {detailVenta.observation && (
              <div className="grid md:grid-cols-2 gap-3">
                <div className="bg-gray-50/90 p-3 rounded-lg border border-gray-100">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    Observación
                  </p>
                  <p className="text-xs text-gray-800 whitespace-pre-line">{detailVenta.observation}</p>
                </div>

                <div className="flex justify-end gap-2 pb-2 border-b border-gray-100">
                    <Button
                      className="!bg-blue-100 !text-blue-800 hover:!bg-blue-200 border-none"
                      size="sm"
                      icon={<Pencil size={15} />}
                      onClick={handleOpenEdit}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="!bg-rose-100 !text-rose-800 hover:!bg-rose-200 border-none"
                      icon={<Trash2 size={15} />}
                      onClick={handleDelete}
                      isLoading={isDeleting}
                    >
                      Eliminar
                    </Button>
                  </div>  
              </div>
            )}

            

            {/* Galería de fotos acotada */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
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
          <Input
            label="m³ despachados"
            type="number"
            step="0.01"
            min="0"
            value={editM3}
            onChange={(e) => setEditM3(e.target.value)}
          />
          <Input
            label="Comprador"
            value={editComprador}
            onChange={(e) => setEditComprador(e.target.value)}
          />
          <Input
            label="Observación"
            value={editObservacion}
            onChange={(e) => setEditObservacion(e.target.value)}
          />
          <p className="text-xs text-gray-500">
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
    </div>
  );
};
