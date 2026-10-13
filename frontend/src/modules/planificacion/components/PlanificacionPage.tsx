import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, CheckCircle, FileText } from 'lucide-react';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { generatePlanificacionPdf } from '../utils/planificacionPdf';
import { usePlanificaciones } from '../hooks/usePlanificaciones';
import { planificacionService, getInvoiceUrl } from '../services/planificacionService';
import { Planificacion, PlanificacionFormData } from '../types';
import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Modal';
import { ConsumoMaterialPanel } from './ConsumoMaterialPanel';
import { Table } from '@/shared/components/Table';
import { PlanificacionForm } from './PlanificacionForm';
import { formatDate } from '@/shared/utils/format';
import toast from 'react-hot-toast';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { Input } from '@/shared/components/Input';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { useClientes } from '@/modules/clientes/hooks/useClientes';
import { useObras } from '@/modules/obras/hooks/useObras';
import { VEHICLE_COMPANY_LABELS, inferVehicleCompany, normalizeVehicleType } from '@/modules/vehicles/types';

const getTodayIsoDate = () => {
  const today = new Date();
  const tzOffset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - tzOffset).toISOString().split('T')[0];
};

const normalizeIsoDate = (value?: string) => (value ? value.split('T')[0] : '');

const getEffectiveStatus = (plan: Planificacion): Planificacion['status'] => {
  if (plan.status === 'COMPLETADO' || plan.status === 'CANCELADO') return plan.status;
  if (plan.status === 'RETRASADO') return 'RETRASADO';

  const today = getTodayIsoDate();
  const start = normalizeIsoDate(plan.startDate);
  const end = normalizeIsoDate(plan.endDate);

  if (end && end < today) return 'RETRASADO';
  if (start && start > today) return 'PENDIENTE';
  return 'EN_PROGRESO';
};

// Mapeo seguro y normalizado hacia las variantes admitidas por StatusBadge
const getBadgeStatus = (status: Planificacion['status']) => {
  switch (status) {
    case 'EN_PROGRESO':
      return 'en_progreso';
    case 'COMPLETADO':
      return 'completado';
    case 'CANCELADO':
      return 'cancelado';
    case 'RETRASADO':
      return 'retrasado';
    case 'PENDIENTE':
      return 'pendiente';
    default:
      return 'activo';
  }
};

export const PlanificacionPage = () => {
  const { planificaciones, isLoading, refetch } = usePlanificaciones();
  const { user } = useAuth();
  const { clientes } = useClientes();
  const { obras } = useObras();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedPlanificacion, setSelectedPlanificacion] = useState<Planificacion | undefined>();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState<string | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedConstSiteId, setSelectedConstSiteId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<Planificacion['status'] | ''>('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const handleCreate = () => {
    setSelectedPlanificacion(undefined);
    setIsModalOpen(true);
  };

  const handleEdit = (planificacion: Planificacion) => {
    setSelectedPlanificacion(planificacion);
    setIsModalOpen(true);
  };

  const handleView = (planificacion: Planificacion) => {
    setSelectedPlanificacion(planificacion);
    setIsViewModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar esta planificación?')) return;

    try {
      setIsDeleting(id);
      await planificacionService.delete(id);
      toast.success('Planificación eliminada exitosamente');
      refetch();
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message;
      const errorMessage = Array.isArray(backendMessage)
        ? backendMessage.join(', ')
        : backendMessage || 'Error al eliminar planificación';
      toast.error(errorMessage);
    } finally {
      setIsDeleting(null);
    }
  };

  const handleComplete = async (planificacion: Planificacion) => {
    const effectiveStatus = getEffectiveStatus(planificacion);
    if (effectiveStatus !== 'EN_PROGRESO' && effectiveStatus !== 'RETRASADO') return;
    if (!confirm('¿Finalizar esta planificación?')) return;

    try {
      setIsCompleting(planificacion.id);
      await planificacionService.update(planificacion.id, { status: 'COMPLETADO' });
      toast.success('Planificación marcada como finalizada');
      refetch();
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message;
      const errorMessage = Array.isArray(backendMessage)
        ? backendMessage.join(', ')
        : backendMessage || 'Error al completar planificación';
      toast.error(errorMessage);
    } finally {
      setIsCompleting(null);
    }
  };

  const handleSubmit = async (data: PlanificacionFormData) => {
    try {
      if (selectedPlanificacion) {
        await planificacionService.update(selectedPlanificacion.id, data);
        toast.success('Planificación actualizada exitosamente');
      } else {
        await planificacionService.create(data);
        toast.success('Planificación creada exitosamente');
      }
      setIsModalOpen(false);
      refetch();
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message;
      const errorMessage = Array.isArray(backendMessage)
        ? backendMessage.join(', ')
        : backendMessage || 'Error al guardar planificación';
      toast.error(errorMessage);
      throw error;
    }
  };

  const statusStyles: Record<Planificacion['status'], { label: string; className: string }> = {
    PENDIENTE: { label: 'Pendiente', className: 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-800 dark:text-yellow-300' },
    EN_PROGRESO: { label: 'En progreso', className: 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300' },
    RETRASADO: { label: 'Retrasado', className: 'bg-orange-100 dark:bg-orange-500/15 text-orange-800 dark:text-orange-300' },
    COMPLETADO: { label: 'Finalizado', className: 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300' },
    CANCELADO: { label: 'Cancelado', className: 'bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-300' },
  };

  const clienteOptions = [
    { value: '', label: 'Todos los clientes' },
    ...clientes
      .filter((cliente) => cliente.isActive)
      .map((cliente) => ({
        value: String(cliente.id),
        label: `${cliente.companyname || cliente.name}${cliente.ruc ? ` (${cliente.ruc})` : ''}`,
      })),
  ];

  const obraOptions = [
    { value: '', label: 'Todas las obras' },
    ...obras.map((obra) => ({
      value: String(obra.id),
      label: obra.name,
    })),
  ];

  const handleDownloadPdf = async (planificacion: Planificacion) => {
    setPdfLoadingId(planificacion.id);
    try {
      const [consumo, viajes] = await Promise.all([
        planificacionService.getConsumoMaterial(planificacion.id).catch(() => null),
        planificacionService.getViajes(planificacion.id),
      ]);
      const estado = getEffectiveStatus(planificacion);
      await generatePlanificacionPdf({
        planificacion,
        estado: statusStyles[estado]?.label || estado,
        consumo,
        viajes,
        generadoPor: user?.name,
      });
    } catch (error) {
      console.error(error);
      toast.error('No se pudo generar el PDF de la planificación');
    } finally {
      setPdfLoadingId(null);
    }
  };

  const statusOptions = [
    { value: '', label: 'Todos los estados' },
    ...Object.entries(statusStyles).map(([value, meta]) => ({
      value,
      label: meta.label,
    })),
  ];

  const filteredPlanificaciones = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return planificaciones.filter((plan) => {
      const matchesSearch =
        !term ||
        (plan.planningCode || '').toLowerCase().includes(term) ||
        (plan.description || '').toLowerCase().includes(term);
      const matchesClient = !selectedClientId || String(plan.clientId) === String(selectedClientId);
      const matchesObra = !selectedConstSiteId || String(plan.constSiteId) === String(selectedConstSiteId);
      const matchesStatus = !selectedStatus || getEffectiveStatus(plan) === selectedStatus;

      const planStartDate = plan.startDate ? normalizeIsoDate(plan.startDate) : '';
      const planEndDate = plan.endDate ? normalizeIsoDate(plan.endDate) : '';
      const matchesStartDate = !filterStartDate || (planStartDate && planStartDate >= filterStartDate);
      const matchesEndDate = !filterEndDate || (planEndDate && planEndDate <= filterEndDate);

      return matchesSearch && matchesClient && matchesObra && matchesStatus && matchesStartDate && matchesEndDate;
    });
  }, [planificaciones, searchTerm, selectedClientId, selectedConstSiteId, selectedStatus, filterStartDate, filterEndDate]);

  const columns = [
    {
      header: 'ID',
      className: 'whitespace-nowrap font-mono text-xs',
      accessor: (row: Planificacion) => row.planningCode || 'N/A',
    },
    {
      header: 'Obra',
      className: 'max-w-[170px] truncate',
      accessor: (row: Planificacion) => (
        <span title={row.constSite?.name || 'N/A'}>
          {row.constSite?.name || 'N/A'}
        </span>
      ),
    },
    {
      header: 'Clientes',
      className: 'max-w-[200px] truncate',
      accessor: (row: Planificacion) => {
        const name = row.client?.companyname || row.client?.name || '';
        const ruc = row.client?.ruc || '';
        if (!name && !ruc) return 'N/A';
        const label = `${name}${ruc ? ` (${ruc})` : ''}`;
        return <span title={label}>{label}</span>;
      },
    },
    {
      header: 'Fecha Inicio',
      className: 'whitespace-nowrap',
      accessor: (row: Planificacion) => formatDate(row.startDate),
    },
    {
      header: 'Fecha Fin',
      className: 'whitespace-nowrap',
      accessor: (row: Planificacion) => (row.endDate ? formatDate(row.endDate) : 'N/A'),
    },
    {
      header: 'Vehículos Internos',
      className: 'text-center whitespace-nowrap',
      accessor: (row: Planificacion) => {
        const internalCount = row.vehicleStats?.internalVehicles ?? row.vehicles?.filter((v) => v.type === 'INTERNO').length ?? 0;
        return <span className="font-medium text-blue-600 dark:text-blue-400">{internalCount}</span>;
      },
    },
    {
      header: 'Vehículos Externos',
      className: 'text-center whitespace-nowrap',
      accessor: (row: Planificacion) => {
        const externalCount = row.vehicleStats?.externalVehicles ?? row.vehicles?.filter((v) => v.type === 'EXTERNO').length ?? 0;
        return <span className="font-medium text-orange-600 dark:text-orange-400">{externalCount}</span>;
      },
    },
    {
      header: 'Total Vehículos',
      className: 'text-center whitespace-nowrap',
      accessor: (row: Planificacion) => {
        const totalCount = row.vehicleStats?.totalVehicles ?? row.vehicles?.length ?? row.vehicleIds?.length ?? 0;
        return <span className="font-bold">{totalCount}</span>;
      },
    },
    {
      header: 'Estado',
      className: 'whitespace-nowrap',
      accessor: (row: Planificacion) => {
        const effectiveStatus = getEffectiveStatus(row);
        return <StatusBadge status={getBadgeStatus(effectiveStatus)} />;
      },
    },
    {
      header: 'Acciones',
      className: 'whitespace-nowrap text-right',
      accessor: (row: Planificacion) => {
        const effectiveStatus = getEffectiveStatus(row);
        const isFinalized = effectiveStatus === 'COMPLETADO';

        return (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="!bg-blue-100 dark:!bg-blue-500/15 hover:!bg-blue-200 dark:hover:!bg-blue-500/25 !text-blue-800 dark:!text-blue-300 border-none !text-xs !py-1 !px-2.5"
              icon={<Eye size={15} />}
              onClick={() => handleView(row)}
            >
              Ver
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="!bg-blue-100 dark:!bg-blue-500/15 hover:!bg-blue-200 dark:hover:!bg-blue-500/25 !text-blue-800 dark:!text-blue-300 border-none !text-xs !py-1 !px-2.5"
              icon={<FileText size={15} />}
              onClick={() => handleDownloadPdf(row)}
              isLoading={pdfLoadingId === row.id}
            >
              PDF
            </Button>
            <Button
              size="sm"
              variant="success"
              className="!bg-green-100 dark:!bg-green-500/15 hover:!bg-green-200 dark:hover:!bg-green-500/25 !text-green-700 dark:!text-green-300 border-none !text-xs !py-1 !px-2.5"
              icon={<CheckCircle size={15} />}
              onClick={() => handleComplete(row)}
              disabled={!['EN_PROGRESO', 'RETRASADO'].includes(effectiveStatus)}
              isLoading={isCompleting === row.id}
            >
              Finalizar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="!bg-blue-100 dark:!bg-blue-500/15 hover:!bg-blue-200 dark:hover:!bg-blue-500/25 !text-blue-800 dark:!text-blue-300 border-none !text-xs !py-1 !px-2.5"
              icon={<Pencil size={15} />}
              onClick={() => handleEdit(row)}
              disabled={isFinalized}
            >
              Editar
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="!bg-red-100 dark:!bg-red-500/15 hover:!bg-red-200 dark:hover:!bg-red-500/25 !text-red-700 dark:!text-red-300 border-none !text-xs !py-1 !px-2.5"
              icon={<Trash2 size={15} />}
              onClick={() => handleDelete(row.id)}
              isLoading={isDeleting === row.id}
              disabled={isFinalized}
            >
              Eliminar
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-night-text tracking-tight">Planificación</h1>
          <p className="text-gray-500 dark:text-night-muted mt-0.5 text-xs">Gestión de planificaciones de obras</p>
        </div>
        <Button
          variant="primary"
          className="!text-xs !py-1.5"
          icon={<Plus size={16} />}
          onClick={handleCreate}
        >
          Nueva Planificación
        </Button>
      </div>

      {/* Tarjeta de Filtros con z-30 y overflow visible */}
      <div className="bg-white dark:bg-night-surface rounded-xl shadow-xs p-4 border border-stone-200/80 dark:border-night-border relative z-30 overflow-visible">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <Input
            label="Buscar"
            placeholder="Buscar por ID o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <SearchableSelect
            label="Cliente (Razón social)"
            options={clienteOptions}
            value={selectedClientId}
            onChange={setSelectedClientId}
          />
          <SearchableSelect
            label="Obra"
            options={obraOptions}
            value={selectedConstSiteId}
            onChange={setSelectedConstSiteId}
          />
          <SearchableSelect
            label="Estado"
            options={statusOptions}
            value={selectedStatus}
            onChange={(value) => setSelectedStatus(value as Planificacion['status'] | '')}
          />
          <Input
            type="date"
            label="Fecha Inicio"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
          />
          <Input
            type="date"
            label="Fecha Fin"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
          />
        </div>
      </div>

      {/* Tarjeta de Tabla independiente con z-10 y bordes redondeados */}
      <div className="bg-white dark:bg-night-surface rounded-xl shadow-xs border border-stone-200/80 dark:border-night-border relative z-10 overflow-hidden">
        <Table data={filteredPlanificaciones} columns={columns} isLoading={isLoading} />
      </div>

      {/* Modal Formulario Nueva / Editar Planificación */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedPlanificacion ? 'Editar Planificación' : 'Nueva Planificación'}
        size="xl"
      >
        <PlanificacionForm
          planificacion={selectedPlanificacion}
          onSubmit={handleSubmit}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>

      {/* Modal Detalle de Planificación */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Detalle de Planificación"
        size="lg"
      >
        {selectedPlanificacion && (
          <div className="space-y-6">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="!text-xs !py-1"
                icon={<FileText size={15} />}
                onClick={() => handleDownloadPdf(selectedPlanificacion)}
                isLoading={pdfLoadingId === selectedPlanificacion.id}
              >
                Descargar PDF
              </Button>
            </div>

            {/* 1. Datos Generales de la Planificación */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="bg-stone-50 dark:bg-night-raised p-3 rounded-xl border border-stone-200/60 dark:border-night-border">
                <p className="text-stone-500 dark:text-night-muted font-medium">ID</p>
                <p className="font-semibold font-mono text-gray-900 dark:text-night-text mt-0.5">{selectedPlanificacion.planningCode}</p>
              </div>
              <div className="bg-stone-50 dark:bg-night-raised p-3 rounded-xl border border-stone-200/60 dark:border-night-border">
                <p className="text-stone-500 dark:text-night-muted font-medium">Obra</p>
                <p className="font-semibold text-gray-900 dark:text-night-text mt-0.5">{selectedPlanificacion.constSite?.name || 'N/A'}</p>
              </div>
              <div className="bg-stone-50 dark:bg-night-raised p-3 rounded-xl border border-stone-200/60 dark:border-night-border">
                <p className="text-stone-500 dark:text-night-muted font-medium">Razón social</p>
                <p className="font-semibold text-gray-900 dark:text-night-text mt-0.5">
                  {(() => {
                    const name = selectedPlanificacion.client?.companyname || selectedPlanificacion.client?.name || '';
                    const ruc = selectedPlanificacion.client?.ruc || '';
                    if (!name && !ruc) return 'N/A';
                    return `${name}${ruc ? ` (${ruc})` : ''}`;
                  })()}
                </p>
              </div>
              <div className="bg-stone-50 dark:bg-night-raised p-3 rounded-xl border border-stone-200/60 dark:border-night-border">
                <p className="text-stone-500 dark:text-night-muted font-medium">Estado</p>
                <div className="mt-1">
                  <StatusBadge status={getBadgeStatus(getEffectiveStatus(selectedPlanificacion))} />
                </div>
              </div>
              <div className="bg-stone-50 dark:bg-night-raised p-3 rounded-xl border border-stone-200/60 dark:border-night-border">
                <p className="text-stone-500 dark:text-night-muted font-medium">Fecha Inicio</p>
                <p className="font-semibold text-gray-900 dark:text-night-text mt-0.5">{formatDate(selectedPlanificacion.startDate)}</p>
              </div>
              <div className="bg-stone-50 dark:bg-night-raised p-3 rounded-xl border border-stone-200/60 dark:border-night-border">
                <p className="text-stone-500 dark:text-night-muted font-medium">Fecha Fin</p>
                <p className="font-semibold text-gray-900 dark:text-night-text mt-0.5">
                  {selectedPlanificacion.endDate ? formatDate(selectedPlanificacion.endDate) : 'N/A'}
                </p>
              </div>
              {selectedPlanificacion.description && (
                <div className="col-span-2 bg-stone-50 dark:bg-night-raised p-3 rounded-xl border border-stone-200/60 dark:border-night-border">
                  <p className="text-stone-500 dark:text-night-muted font-medium">Descripción</p>
                  <p className="font-normal text-gray-800 dark:text-night-text mt-0.5 whitespace-pre-line">{selectedPlanificacion.description}</p>
                </div>
              )}
              {selectedPlanificacion.numeroFactura && (
                <div className="bg-stone-50 dark:bg-night-raised p-3 rounded-xl border border-stone-200/60 dark:border-night-border">
                  <p className="text-stone-500 dark:text-night-muted font-medium">N° Factura</p>
                  <p className="font-semibold font-mono text-gray-900 dark:text-night-text mt-0.5">{selectedPlanificacion.numeroFactura}</p>
                </div>
              )}
              {(selectedPlanificacion.invoicePath || selectedPlanificacion.facturaUrl) && (
                <div className="bg-stone-50 dark:bg-night-raised p-3 rounded-xl border border-stone-200/60 dark:border-night-border">
                  <p className="text-stone-500 dark:text-night-muted font-medium">PDF Factura</p>
                  <a
                    href={getInvoiceUrl(selectedPlanificacion.invoicePath) || selectedPlanificacion.facturaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline text-xs font-medium flex items-center gap-1 mt-0.5"
                  >
                    📄 Ver documento
                  </a>
                </div>
              )}
            </div>

            {/* 2. Consumo de Material */}
            <div className="pt-4 border-t border-stone-200/70 dark:border-night-border">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-night-muted mb-3">Consumo de Material</p>
              <ConsumoMaterialPanel planificacionId={selectedPlanificacion.id} />
            </div>

            {/* 3. Vehículos Asignados con Scroll interno */}
            <div className="pt-4 border-t border-stone-200/70 dark:border-night-border">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-night-muted">Vehículos Asignados</p>
                <span className="text-xs text-stone-400 dark:text-night-subtle font-mono">
                  {selectedPlanificacion.vehicles?.length || 0} registrados
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
                {selectedPlanificacion.vehicles && selectedPlanificacion.vehicles.length > 0 ? (
                  selectedPlanificacion.vehicles.map((vehicle) => (
                    <div key={vehicle.id} className="p-3 bg-stone-50 dark:bg-night-raised rounded-xl border border-stone-200/60 dark:border-night-border text-xs">
                      <p className="font-bold text-gray-900 dark:text-night-text">
                        {vehicle.plate}
                        {(() => {
                          const canteraId = selectedPlanificacion.vehicleCanteras?.find(
                            (vc) => vc.vehicleId === String(vehicle.id),
                          )?.canteraId;
                          const cantera = selectedPlanificacion.canteras?.find(
                            (pc: { canteraId: number }) => String(pc.canteraId) === canteraId,
                          );
                          if (!canteraId) return null;
                          return (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300">
                              {cantera?.cantera?.nombre || `Cantera #${canteraId}`}
                            </span>
                          );
                        })()}
                      </p>
                      <p className="text-stone-600 dark:text-night-muted mt-0.5">
                        {vehicle.driver?.name || 'Sin conductor'}
                        {vehicle.brand || vehicle.model
                          ? ` - ${vehicle.brand ?? ''} ${vehicle.model ?? ''}`
                          : ''}
                      </p>
                      <p className="text-stone-500 dark:text-night-muted mt-0.5">
                        Empresa: {(() => {
                          const resolvedCompany =
                            vehicle.company ??
                            inferVehicleCompany(`${vehicle.owner?.companyname ?? ''} ${vehicle.owner?.name ?? ''}`) ??
                            inferVehicleCompany(vehicle.vehicleid);
                          return resolvedCompany ? VEHICLE_COMPANY_LABELS[resolvedCompany] : (vehicle.owner?.companyname || 'Sin empresa');
                        })()} · Tipo: {normalizeVehicleType(vehicle.type) === 'INTERNO' ? 'Interno' : 'Externo'}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-stone-400 dark:text-night-subtle italic py-2">No hay vehículos asignados a esta planificación.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};