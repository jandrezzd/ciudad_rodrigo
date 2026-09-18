import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Eye, Filter, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Modal';
import { Table } from '@/shared/components/Table';
import { Pagination } from '@/shared/components/Pagination';
import { Input } from '@/shared/components/Input';
import { Select } from '@/shared/components/Select';
import { formatDateTime, formatNumber } from '@/shared/utils/format';
import { formatMaterialType } from '@/modules/materiales/utils/materialLabels';
import { useClientes } from '@/modules/clientes/hooks/useClientes';
import { useObras } from '@/modules/obras/hooks/useObras';
import { PAGINATION } from '@/config/constants';
import { useVentaOrdenes } from '../hooks/useVentaOrdenes';
import { ventaOrdenesService } from '../services/ventaOrdenesService';
import { VentaOrden, VentaOrdenEstado, VentaOrdenFormData } from '../types';
import { VentaOrdenForm } from './VentaOrdenForm';

const ESTADO_LABELS: Record<VentaOrdenEstado, string> = {
  ABIERTA: 'Abierta',
  COMPLETADA: 'Completada',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

const ESTADO_STYLES: Record<VentaOrdenEstado, string> = {
  ABIERTA: 'bg-green-100 text-green-700',
  COMPLETADA: 'bg-blue-100 text-blue-700',
  CERRADA: 'bg-gray-100 text-gray-600',
  CANCELADA: 'bg-red-100 text-red-700',
};

const EstadoBadge = ({ estado }: { estado: VentaOrdenEstado }) => (
  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ESTADO_STYLES[estado]}`}>
    {ESTADO_LABELS[estado]}
  </span>
);

const TipoBadge = ({ type }: { type: string }) => {
  const esExterna = type === 'PUBLICO' || type === 'PUBLIC';
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
        esExterna ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
      }`}
    >
      {esExterna ? 'Externa' : 'Interna'}
    </span>
  );
};

const formatCantidad = (valor?: number | null) =>
  valor == null ? '—' : String(Number(valor.toFixed(3)));

/**
 * Administración de órdenes de venta: cliente → obra → orden → N materiales
 * con su saldo. Página propia (no un modal de VentasPage) porque es su propio
 * flujo de administración, con alta, edición, cierre y baja — no una consulta
 * puntual como QR o Stock.
 */
export const VentaOrdenesPage = () => {
  const { clientes } = useClientes();
  const { obras } = useObras();

  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroObra, setFiltroObra] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [showFilters, setShowFilters] = useState(true);

  const filtros = useMemo(
    () => ({
      clientId: filtroCliente ? Number(filtroCliente) : undefined,
      constSiteId: filtroObra ? Number(filtroObra) : undefined,
      estado: (filtroEstado || undefined) as VentaOrdenEstado | undefined,
    }),
    [filtroCliente, filtroObra, filtroEstado]
  );

  const { ordenes, isLoading, refetch } = useVentaOrdenes(filtros);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.DEFAULT_PAGE_SIZE);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOrden, setEditingOrden] = useState<VentaOrden | undefined>(undefined);
  const [isSavingOrden, setIsSavingOrden] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailOrden, setDetailOrden] = useState<VentaOrden | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [motivoCierre, setMotivoCierre] = useState('');
  const [mostrandoCierre, setMostrandoCierre] = useState(false);
  const [isCerrando, setIsCerrando] = useState(false);
  const [isEliminando, setIsEliminando] = useState(false);

  // ─── Opciones de filtro ────────────────────────────────────────────────────

  const clienteOptions = useMemo(
    () => [
      { value: '', label: 'Todos' },
      ...clientes
        .filter((c) => c.isActive)
        .map((c) => ({ value: String(c.id), label: c.companyname || c.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [clientes]
  );

  const obraOptions = useMemo(() => {
    const disponibles = filtroCliente
      ? obras.filter((obra) =>
          obra.clients?.some((rel) => String(rel.clientId) === filtroCliente)
        )
      : obras;
    return [
      { value: '', label: 'Todas' },
      ...disponibles
        .map((obra) => ({ value: String(obra.id), label: obra.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [obras, filtroCliente]);

  const estadoOptions = [
    { value: '', label: 'Todos' },
    ...(Object.keys(ESTADO_LABELS) as VentaOrdenEstado[]).map((estado) => ({
      value: estado,
      label: ESTADO_LABELS[estado],
    })),
  ];

  const paginadas = useMemo(() => {
    const inicio = (currentPage - 1) * pageSize;
    return ordenes.slice(inicio, inicio + pageSize);
  }, [ordenes, currentPage, pageSize]);

  const handlePageSizeChange = (nuevo: number) => {
    setPageSize(nuevo);
    setCurrentPage(1);
  };

  // ─── Alta / edición ────────────────────────────────────────────────────────

  const handleNuevaOrden = () => {
    setEditingOrden(undefined);
    setIsFormOpen(true);
  };

  const handleEditarOrden = () => {
    if (!detailOrden) return;
    setEditingOrden(detailOrden);
    setDetailOpen(false);
    setIsFormOpen(true);
  };

  const handleGuardarOrden = async (data: VentaOrdenFormData) => {
    try {
      setIsSavingOrden(true);
      if (editingOrden) {
        await ventaOrdenesService.update(editingOrden.id, {
          observacion: data.observacion,
          items: data.items,
        });
        toast.success('Orden actualizada');
      } else {
        await ventaOrdenesService.create(data);
        toast.success('Orden creada');
      }
      setIsFormOpen(false);
      refetch();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo guardar la orden');
    } finally {
      setIsSavingOrden(false);
    }
  };

  // ─── Detalle ───────────────────────────────────────────────────────────────

  const handleOpenDetail = async (id: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setMostrandoCierre(false);
    setMotivoCierre('');
    try {
      setDetailOrden(await ventaOrdenesService.getById(id));
    } catch (error) {
      console.error(error);
      toast.error('No se pudo cargar el detalle de la orden');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const puedeCerrarse = (orden: VentaOrden) =>
    orden.estado !== 'CERRADA' && orden.estado !== 'CANCELADA';

  const tieneDespachos = (orden: VentaOrden) => orden.items.some((i) => i.despachadoM3 > 0);

  const handleCerrarOrden = async () => {
    if (!detailOrden) return;
    if (motivoCierre.trim().length < 3) {
      toast.error('El motivo debe tener al menos 3 caracteres');
      return;
    }
    try {
      setIsCerrando(true);
      const actualizada = await ventaOrdenesService.cerrar(detailOrden.id, motivoCierre.trim());
      setDetailOrden(actualizada);
      setMostrandoCierre(false);
      setMotivoCierre('');
      toast.success('Orden cerrada');
      refetch();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo cerrar la orden');
    } finally {
      setIsCerrando(false);
    }
  };

  const handleEliminarOrden = async () => {
    if (!detailOrden) return;
    if (
      !window.confirm(
        `¿Eliminar la orden ${detailOrden.codigo}?\n\nDejará de aparecer en el listado. El registro se conserva en la base de datos.`
      )
    ) {
      return;
    }
    try {
      setIsEliminando(true);
      await ventaOrdenesService.remove(detailOrden.id);
      toast.success('Orden eliminada');
      setDetailOpen(false);
      refetch();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo eliminar la orden');
    } finally {
      setIsEliminando(false);
    }
  };

  // ─── Columnas ──────────────────────────────────────────────────────────────

  const columns = [
    {
      header: 'Código',
      accessor: (row: VentaOrden) => (
        <span className="font-mono font-semibold text-gray-900">{row.codigo}</span>
      ),
    },
    {
      header: 'Cliente',
      accessor: (row: VentaOrden) => (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-900">{row.client.companyname}</span>
          <TipoBadge type={row.client.type} />
        </div>
      ),
    },
    { header: 'Obra', accessor: (row: VentaOrden) => row.constSite.name },
    { header: 'Estado', accessor: (row: VentaOrden) => <EstadoBadge estado={row.estado} /> },
    {
      header: 'Asignado m³',
      accessor: (row: VentaOrden) => formatNumber(row.totales.asignadoM3),
    },
    {
      header: 'Despachado m³',
      accessor: (row: VentaOrden) => (
        <span
          className={
            row.totales.disponibleM3 < 0 ? 'text-red-600 font-semibold' : 'text-blue-600'
          }
        >
          {formatNumber(row.totales.despachadoM3)}
        </span>
      ),
    },
    {
      header: 'Disponible m³',
      accessor: (row: VentaOrden) => (
        <span
          className={`font-semibold ${
            row.totales.disponibleM3 < 0 ? 'text-red-600' : 'text-green-700'
          }`}
        >
          {formatNumber(row.totales.disponibleM3)}
        </span>
      ),
    },
    {
      header: 'Apertura',
      accessor: (row: VentaOrden) => formatDateTime(row.fechaApertura) || '—',
    },
    {
      header: 'Acciones',
      accessor: (row: VentaOrden) => (
        <Button
          size="sm"
          variant="outline"
          icon={<Eye size={16} />}
          onClick={() => handleOpenDetail(row.id)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Órdenes de venta</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pedidos de un cliente para una de sus obras, con sus materiales y saldo.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            icon={<Filter size={16} />}
            onClick={() => setShowFilters((v) => !v)}
          >
            {showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
          </Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={handleNuevaOrden}>
            Nueva orden
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Cliente"
              options={clienteOptions}
              value={filtroCliente}
              hideDefaultOption
              onChange={(e) => {
                setFiltroCliente(e.target.value);
                setFiltroObra('');
                setCurrentPage(1);
              }}
            />
            <Select
              label="Obra"
              options={obraOptions}
              value={filtroObra}
              hideDefaultOption
              onChange={(e) => {
                setFiltroObra(e.target.value);
                setCurrentPage(1);
              }}
            />
            <Select
              label="Estado"
              options={estadoOptions}
              value={filtroEstado}
              hideDefaultOption
              onChange={(e) => {
                setFiltroEstado(e.target.value);
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
          emptyMessage="No hay órdenes de venta registradas"
        />
        <Pagination
          className="px-4 pb-4"
          total={ordenes.length}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      {/* Alta / edición */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingOrden ? `Editar orden ${editingOrden.codigo}` : 'Nueva orden de venta'}
        size="xl"
      >
        <VentaOrdenForm
          orden={editingOrden}
          onSubmit={handleGuardarOrden}
          onCancel={() => setIsFormOpen(false)}
        />
        {isSavingOrden && <p className="text-xs text-gray-500 mt-2">Guardando...</p>}
      </Modal>

      {/* Detalle */}
      <Modal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detailOrden ? `Orden ${detailOrden.codigo}` : 'Detalle de la orden'}
        size="lg"
      >
        {detailLoading && (
          <div className="flex justify-center items-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        )}

        {!detailLoading && detailOrden && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1.5">
            <div className="flex items-center justify-between">
              <EstadoBadge estado={detailOrden.estado} />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Pencil size={15} />}
                  onClick={handleEditarOrden}
                >
                  Editar
                </Button>
                {puedeCerrarse(detailOrden) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<XCircle size={15} />}
                    onClick={() => setMostrandoCierre((v) => !v)}
                  >
                    Cerrar orden
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 size={15} />}
                  onClick={handleEliminarOrden}
                  isLoading={isEliminando}
                  disabled={tieneDespachos(detailOrden)}
                  title={
                    tieneDespachos(detailOrden)
                      ? 'No se puede eliminar: ya tiene despachos'
                      : undefined
                  }
                >
                  Eliminar
                </Button>
              </div>
            </div>

            {mostrandoCierre && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <Input
                  label="Motivo del cierre"
                  value={motivoCierre}
                  onChange={(e) => setMotivoCierre(e.target.value)}
                  placeholder="Ej: El cliente ya no necesita el resto del pedido"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setMostrandoCierre(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" variant="primary" onClick={handleCerrarOrden} isLoading={isCerrando}>
                    Confirmar cierre
                  </Button>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3">
              <div className="bg-gray-50/90 p-3 rounded-lg border border-gray-100 space-y-0.5">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Cliente
                </p>
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  {detailOrden.client.companyname}
                  <TipoBadge type={detailOrden.client.type} />
                </p>
              </div>
              <div className="bg-gray-50/90 p-3 rounded-lg border border-gray-100 space-y-0.5">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Obra</p>
                <p className="text-sm font-semibold text-gray-900">{detailOrden.constSite.name}</p>
              </div>
            </div>

            {detailOrden.observacion && (
              <div className="bg-gray-50/90 p-3 rounded-lg border border-gray-100">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Observación
                </p>
                <p className="text-xs text-gray-800 whitespace-pre-line">
                  {detailOrden.observacion}
                </p>
              </div>
            )}

            {detailOrden.motivoCierre && (
              <div className="bg-gray-50/90 p-3 rounded-lg border border-gray-100">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Motivo del cierre
                </p>
                <p className="text-xs text-gray-800">{detailOrden.motivoCierre}</p>
              </div>
            )}

            <div>
              <p className="text-sm font-semibold text-gray-900 mb-2">Materiales</p>
              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs uppercase text-gray-500">
                      <th className="py-2 px-3">Material</th>
                      <th className="py-2 px-3 text-right">Asignado m³</th>
                      <th className="py-2 px-3 text-right">Despachado m³</th>
                      <th className="py-2 px-3 text-right">Disponible m³</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detailOrden.items.map((item) => (
                      <tr key={item.id} className={item.excedido ? 'bg-red-50' : undefined}>
                        <td className="py-2 px-3 text-gray-900">
                          {item.material ? formatMaterialType(item.material.materialType) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600 tabular-nums">
                          {formatCantidad(item.m3Asignados)}
                        </td>
                        <td className="py-2 px-3 text-right text-blue-600 tabular-nums">
                          {formatCantidad(item.despachadoM3)}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-semibold tabular-nums ${
                            item.disponibleM3 < 0 ? 'text-red-600' : 'text-green-700'
                          }`}
                        >
                          {formatCantidad(item.disponibleM3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
