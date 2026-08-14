import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, CheckCircle } from 'lucide-react';
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

export const PlanificacionPage = () => {
  const { planificaciones, isLoading, refetch } = usePlanificaciones();
  const { clientes } = useClientes();
  const { obras } = useObras();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedPlanificacion, setSelectedPlanificacion] = useState<Planificacion | undefined>();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState<string | null>(null);
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
    PENDIENTE: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
    EN_PROGRESO: { label: 'En progreso', className: 'bg-blue-100 text-blue-800' },
    RETRASADO: { label: 'Retrasado', className: 'bg-orange-100 text-orange-800' },
    COMPLETADO: { label: 'Finalizado', className: 'bg-green-100 text-green-800' },
    CANCELADO: { label: 'Cancelado', className: 'bg-red-100 text-red-800' },
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
      
      // Filtros de fecha
      const planStartDate = plan.startDate ? normalizeIsoDate(plan.startDate) : '';
      const planEndDate = plan.endDate ? normalizeIsoDate(plan.endDate) : '';
      const matchesStartDate = !filterStartDate || (planStartDate && planStartDate >= filterStartDate);
      const matchesEndDate = !filterEndDate || (planEndDate && planEndDate <= filterEndDate);
      
      return matchesSearch && matchesClient && matchesObra && matchesStatus && matchesStartDate && matchesEndDate;
    });
  }, [planificaciones, searchTerm, selectedClientId, selectedConstSiteId, selectedStatus, filterStartDate, filterEndDate]);

  const columns = [
    { header: 'ID', accessor: (row: Planificacion) => row.planningCode || 'N/A' },
    { header: 'Obra', accessor: (row: Planificacion) => row.constSite?.name || 'N/A' },
    {
      header: 'Clientes',
      accessor: (row: Planificacion) => {
        const name = row.client?.companyname || row.client?.name || '';
        const ruc = row.client?.ruc || '';
        if (!name && !ruc) return 'N/A';
        return `${name}${ruc ? ` (${ruc})` : ''}`;
      },
    },
    { header: 'Fecha Inicio', accessor: (row: Planificacion) => formatDate(row.startDate) },
    { header: 'Fecha Fin', accessor: (row: Planificacion) => (row.endDate ? formatDate(row.endDate) : 'N/A') },
    {
      header: 'Vehículos Internos',
      accessor: (row: Planificacion) => {
        const internalCount = row.vehicleStats?.internalVehicles ?? row.vehicles?.filter(v => v.type === 'INTERNO').length ?? 0;
        return <span className="font-medium text-blue-600">{internalCount}</span>;
      },
    },
    {
      header: 'Vehículos Externos',
      accessor: (row: Planificacion) => {
        const externalCount = row.vehicleStats?.externalVehicles ?? row.vehicles?.filter(v => v.type === 'EXTERNO').length ?? 0;
        return <span className="font-medium text-orange-600">{externalCount}</span>;
      },
    },
    {
      header: 'Total Vehículos',
      accessor: (row: Planificacion) => {
        const totalCount = row.vehicleStats?.totalVehicles ?? row.vehicles?.length ?? row.vehicleIds?.length ?? 0;
        return <span className="font-bold">{totalCount}</span>;
      },
    },
    {
      header: 'Estado',
      accessor: (row: Planificacion) => {
        const effectiveStatus = getEffectiveStatus(row);
        return (
          <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusStyles[effectiveStatus]?.className || 'bg-gray-100 text-gray-800'}`}>
            {statusStyles[effectiveStatus]?.label || effectiveStatus}
          </span>
        );
      },
    },
    {
      header: 'Acciones',
      accessor: (row: Planificacion) => {
        const effectiveStatus = getEffectiveStatus(row);
        const isFinalized = effectiveStatus === 'COMPLETADO';

        return (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={<Eye size={16} />}
              onClick={() => handleView(row)}
            >
              Ver
            </Button>
            <Button
              size="sm"
              variant="success"
              icon={<CheckCircle size={16} />}
              onClick={() => handleComplete(row)}
              disabled={!['EN_PROGRESO', 'RETRASADO'].includes(effectiveStatus)}
              isLoading={isCompleting === row.id}
            >
              Finalizar
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<Pencil size={16} />}
              onClick={() => handleEdit(row)}
              disabled={isFinalized}
            >
              Editar
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 size={16} />}
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Planificación</h1>
          <p className="text-gray-600 mt-1">Gestión de planificaciones de obras</p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={20} />}
          onClick={handleCreate}
        >
          Nueva Planificación
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
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
        <Table data={filteredPlanificaciones} columns={columns} isLoading={isLoading} />
      </div>

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

      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Detalle de Planificación"
        size="lg"
      >
        {selectedPlanificacion && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">ID</p>
                <p className="font-semibold">{selectedPlanificacion.planningCode}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Obra</p>
                <p className="font-semibold">{selectedPlanificacion.constSite?.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Razón social</p>
                <p className="font-semibold">
                  {(() => {
                    const name = selectedPlanificacion.client?.companyname || selectedPlanificacion.client?.name || '';
                    const ruc = selectedPlanificacion.client?.ruc || '';
                    if (!name && !ruc) return 'N/A';
                    return `${name}${ruc ? ` (${ruc})` : ''}`;
                  })()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Fecha Inicio</p>
                <p className="font-semibold">{formatDate(selectedPlanificacion.startDate)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Fecha Fin</p>
                <p className="font-semibold">
                  {selectedPlanificacion.endDate ? formatDate(selectedPlanificacion.endDate) : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Estado</p>
                <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusStyles[getEffectiveStatus(selectedPlanificacion)]?.className || 'bg-gray-100 text-gray-800'}`}>
                  {statusStyles[getEffectiveStatus(selectedPlanificacion)]?.label || getEffectiveStatus(selectedPlanificacion)}
                </span>
              </div>
              {selectedPlanificacion.description && (
                <div className="col-span-2">
                  <p className="text-sm text-gray-500">Descripción</p>
                  <p className="font-semibold">{selectedPlanificacion.description}</p>
                </div>
              )}
              {selectedPlanificacion.numeroFactura && (
                <div>
                  <p className="text-sm text-gray-500">N° Factura</p>
                  <p className="font-semibold font-mono">{selectedPlanificacion.numeroFactura}</p>
                </div>
              )}
              {(selectedPlanificacion.invoicePath || selectedPlanificacion.facturaUrl) && (
                <div>
                  <p className="text-sm text-gray-500">PDF Factura</p>
                  <a
                    href={getInvoiceUrl(selectedPlanificacion.invoicePath) || selectedPlanificacion.facturaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline text-sm font-medium flex items-center gap-1"
                  >
                    📄 Ver documento
                  </a>
                </div>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-2">Vehículos Asignados</p>
              <div className="space-y-2">
                {selectedPlanificacion.vehicles?.map((vehicle) => (
                  <div key={vehicle.id} className="p-3 bg-gray-50 rounded-lg">
                    <p className="font-semibold">
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
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">
                            {cantera?.cantera?.nombre || `Cantera #${canteraId}`}
                          </span>
                        );
                      })()}
                    </p>
                    <p className="text-sm text-gray-600">
                      {vehicle.driver?.name || 'Sin conductor'} - {vehicle.brand} {vehicle.model}
                    </p>
                    <p className="text-xs text-gray-500">
                      Empresa: {(() => {
                        const resolvedCompany =
                          vehicle.company ??
                          inferVehicleCompany(`${vehicle.owner?.companyname ?? ''} ${vehicle.owner?.name ?? ''}`) ??
                          inferVehicleCompany(vehicle.vehicleid);
                        return resolvedCompany ? VEHICLE_COMPANY_LABELS[resolvedCompany] : (vehicle.owner?.companyname || 'Sin empresa');
                      })()} · Tipo: {normalizeVehicleType(vehicle.type) === 'INTERNO' ? 'Interno' : 'Externo'}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500 mb-3">Consumo de Material</p>
              <ConsumoMaterialPanel planificacionId={selectedPlanificacion.id} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
