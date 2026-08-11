import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Input } from '@/shared/components/Input';
import { Select } from '@/shared/components/Select';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { MultiSelect } from '@/shared/components/MultiSelect';
import { Button } from '@/shared/components/Button';
import { FacturaUploader } from './FacturaUploader';
import { Planificacion, PlanificacionFormData } from '../types';
import { sanitizeNumeric } from '@/shared/utils/validation';
import { useObras } from '@/modules/obras/hooks/useObras';
import { useVehicles } from '@/modules/vehicles/hooks/useVehicles';
import { useClientes } from '@/modules/clientes/hooks/useClientes';
import { useProveedoresMateriales } from '@/modules/proveedores-materiales/hooks/useProveedoresMateriales';
import { usePlanificaciones } from '../hooks/usePlanificaciones';
import { VehicleSelector } from './VehicleSelector';
import { PlanningStatus } from '../types';
import { getInvoiceUrl } from '../services/planificacionService';
import toast from 'react-hot-toast';

interface PlanificacionFormProps {
  planificacion?: Planificacion;
  onSubmit: (data: PlanificacionFormData) => Promise<void>;
  onCancel: () => void;
}

export const PlanificacionForm = ({ planificacion, onSubmit, onCancel }: PlanificacionFormProps) => {
  const { obras, isLoading: isLoadingObras } = useObras();
  const { clientes } = useClientes();
  const { vehicles, refetch: refetchVehicles } = useVehicles();
  const { proveedores, isLoading: isLoadingProveedores } = useProveedoresMateriales();
  const { allPlanificaciones } = usePlanificaciones();
  const getTodayIsoDate = () => {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    return new Date(today.getTime() - tzOffset).toISOString().split('T')[0];
  };
  const normalizeIsoDate = (value?: string) => (value ? value.split('T')[0] : '');
  const getDerivedStatus = (startDate: string, endDate?: string): PlanningStatus => {
    const today = getTodayIsoDate();
    const start = normalizeIsoDate(startDate);
    const end = normalizeIsoDate(endDate);
    if (end && end < today) return 'RETRASADO';
    if (start && start > today) return 'PENDIENTE';
    return 'EN_PROGRESO';
  };
  const inferredProveedorIdFromCanteras = useMemo(() => {
    if (!planificacion?.canteras?.length) return undefined;

    const providerIds = planificacion.canteras
      .map((planningCantera: any) => planningCantera?.cantera?.materialProviderId)
      .filter((id: any) => id != null);

    if (!providerIds.length) return undefined;
    return providerIds.every((id: any) => id === providerIds[0])
      ? String(providerIds[0])
      : undefined;
  }, [planificacion?.canteras]);

  const buildFormData = (current?: Planificacion): PlanificacionFormData => ({
    description: current?.description || '',
    clientId: current?.clientId || '',
    constSiteId: current?.constSiteId || '',
    proveedorId: current?.proveedorId || inferredProveedorIdFromCanteras || '',
    canteraIds: current?.canteraIds || (current?.canteras ? current.canteras.map((c: any) => String(c.canteraId)) : []),
    numeroFactura: current?.numeroFactura || '',
    facturaFile: null,
    startDate: current?.startDate?.split('T')[0] || getTodayIsoDate(),
    endDate: current?.endDate?.split('T')[0] || '',
    status: current?.status || 'EN_PROGRESO',
    vehicleIds: current?.vehicleIds || [],
  });
  const isEditing = Boolean(planificacion?.id);
  const occupiedByVehicle = allPlanificaciones
    .filter((planning) => planning?.isActive !== false)
    .filter((planning) => !['COMPLETADO', 'CANCELADO'].includes(planning.status))
    .reduce<Record<string, { planningId: string; planningName: string; constSiteName: string }>>(
      (acc, planning) => {
        if (planificacion?.id && planning.id === planificacion.id) return acc;
        const siteName = planning.constSite?.name || 'Obra sin nombre';
        const name = planning.planningCode || 'Planificación sin código';
        planning.vehicleIds?.forEach((vehicleId) => {
          acc[vehicleId] = {
            planningId: planning.id,
            planningName: name,
            constSiteName: siteName,
          };
        });
        return acc;
      },
      {}
    );

  const [formData, setFormData] = useState<PlanificacionFormData>(() => buildFormData(planificacion));
  useEffect(() => {
    setFormData(buildFormData(planificacion));
  }, [planificacion]);

  const derivedStatus = getDerivedStatus(formData.startDate, formData.endDate);

  const activeClientes = useMemo(
    () => clientes.filter((cliente) => cliente.isActive),
    [clientes],
  );

  const filteredObras = useMemo(() => {
    if (!formData.clientId) return [];
    return obras.filter((obra) => String(obra.clientId) === String(formData.clientId));
  }, [obras, formData.clientId]);

  const selectedProveedor = useMemo(() => {
    if (!formData.proveedorId) return null;
    return proveedores.find((prov) => String(prov.id) === String(formData.proveedorId));
  }, [proveedores, formData.proveedorId]);

  const canterasOptions = useMemo(() => {
    if (!selectedProveedor) return [];
    return selectedProveedor.canteras?.map((cantera) => ({
      value: String(cantera.id || cantera.nombre),
      label: cantera.nombre,
    })) || [];
  }, [selectedProveedor]);

  useEffect(() => {
    if (!formData.constSiteId) return;
    if (isLoadingObras || obras.length === 0) return;
    const existsInFilteredList = filteredObras.some((obra) => String(obra.id) === String(formData.constSiteId));
    if (existsInFilteredList) return;

    setFormData((prev) => ({
      ...prev,
      constSiteId: '',
    }));
  }, [filteredObras, formData.constSiteId, isLoadingObras, obras.length]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field: keyof PlanificacionFormData, value: any) => {
    if (field === 'clientId' && typeof value === 'string') {
      setFormData((prev) => ({
        ...prev,
        clientId: value,
        constSiteId: prev.clientId === value ? prev.constSiteId : '',
      }));
      return;
    }

    if (field === 'proveedorId' && typeof value === 'string') {
      setFormData((prev) => ({
        ...prev,
        proveedorId: value,
        canteraIds: prev.proveedorId === value ? prev.canteraIds : [],
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggleVehicle = (vehicleId: string) => {
    setFormData((prev) => ({
      ...prev,
      vehicleIds: prev.vehicleIds.includes(vehicleId)
        ? prev.vehicleIds.filter((id) => id !== vehicleId)
        : [...prev.vehicleIds, vehicleId],
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!formData.clientId) {
      toast.error('Selecciona un cliente (razón social).');
      return;
    }

    if (!formData.constSiteId) {
      toast.error('Selecciona una obra para continuar.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const clienteOptions = activeClientes.map((cliente) => ({
    value: String(cliente.id),
    label: `${cliente.companyname || cliente.name}${cliente.ruc ? ` (${cliente.ruc})` : ''}`,
  }));

  const proveedorOptions = proveedores.map((prov) => ({
    value: String(prov.id),
    label: `${prov.ruc} - ${prov.razonsocial}`,
  }));

  const obraOptions = filteredObras.map((obra) => ({
    value: String(obra.id),
    label: obra.name,
  }));

  const statusLabels: Record<PlanningStatus, string> = {
    PENDIENTE: 'Pendiente',
    EN_PROGRESO: 'En progreso',
    RETRASADO: 'Retrasado',
    COMPLETADO: 'Finalizado',
    CANCELADO: 'Cancelado',
  };

  const statusOptions: { value: PlanningStatus; label: string }[] = [
    { value: 'PENDIENTE', label: statusLabels.PENDIENTE },
    { value: 'EN_PROGRESO', label: statusLabels.EN_PROGRESO },
    { value: 'RETRASADO', label: statusLabels.RETRASADO },
    { value: 'COMPLETADO', label: statusLabels.COMPLETADO },
    { value: 'CANCELADO', label: statusLabels.CANCELADO },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="ID de Planificación"
          value={planificacion?.planningCode || ' PLAN-0001-2026'}
          readOnly
          disabled
          helperText="El sistema lo genera automáticamente con el formato PLAN-0001-AÑO."
        />

        <Select
          label="Cliente (Razón social)"
          value={formData.clientId}
          onChange={(e) => handleChange('clientId', e.target.value)}
          options={clienteOptions}
          required
        />

        <Select
          label="Obra"
          value={formData.constSiteId}
          onChange={(e) => handleChange('constSiteId', e.target.value)}
          options={obraOptions}
          required
          disabled={!formData.clientId}
          helperText={formData.clientId ? 'Solo se muestran obras del cliente seleccionado.' : 'Primero selecciona un cliente.'}
        />

        <div className="w-full">
          <SearchableSelect
            label="RUC (Proveedor de Material)"
            value={formData.proveedorId || ''}
            onChange={(val) => handleChange('proveedorId', val)}
            options={proveedorOptions}
            disabled={isLoadingProveedores}
            placeholder={isLoadingProveedores ? "Cargando..." : "Seleccionar o buscar RUC..."}
            emptyMessage="No se encontraron proveedores"
          />
          <p className="mt-1 text-sm text-gray-500">Selecciona el RUC del proveedor para cargar sus canteras.</p>
        </div>

        <div className="w-full">
          <MultiSelect
            label="Nombres de canteras"
            values={formData.canteraIds || []}
            onChange={(vals) => handleChange('canteraIds', vals)}
            options={canterasOptions}
            disabled={!formData.proveedorId}
            placeholder={!formData.proveedorId ? "Primero selecciona un RUC..." : "Seleccionar canteras..."}
            allowSelectAll={true}
            selectAllLabel="Todas las canteras"
          />
          <p className="mt-1 text-sm text-gray-500">{formData.proveedorId ? 'Canteras del proveedor seleccionado.' : 'Primero selecciona un RUC.'}</p>
        </div>

        {isEditing ? (
          <Select
            label="Estado"
            value={formData.status}
            onChange={(e) => handleChange('status', e.target.value)}
            options={statusOptions}
            required
          />
        ) : (
          <Select
            label="Estado"
            value={derivedStatus}
            options={[{ value: derivedStatus, label: statusLabels[derivedStatus] }]}
            disabled
            hideDefaultOption
            helperText="Se calcula automáticamente según las fechas."
          />
        )}

        {isEditing && (
          <>
            <Input
              label="Número de Factura"
              value={formData.numeroFactura || ''}
              onChange={(e) => handleChange('numeroFactura', sanitizeNumeric(e.target.value, 50))}
              placeholder="Ej. 001001000000123"
              inputMode="numeric"
              helperText="Solo se permiten números."
            />
            <div className="w-full">
              <FacturaUploader
                file={formData.facturaFile || null}
                currentFileUrl={getInvoiceUrl(planificacion?.invoicePath) || planificacion?.facturaUrl}
                onChange={(file) => handleChange('facturaFile', file)}
              />
            </div>
          </>
        )}

        <Input
          label="Fecha de Inicio"
          type="date"
          value={formData.startDate}
          onChange={(e) => handleChange('startDate', e.target.value)}
          required
        />

        <Input
          label="Fecha de Finalización"
          type="date"
          value={formData.endDate}
          onChange={(e) => handleChange('endDate', e.target.value)}
        />

        <Input
          label="Descripción (opcional)"
          value={formData.description}
          onChange={(e) => handleChange('description', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Vehículos Asignados <span className="text-red-500">*</span>
        </label>
        <VehicleSelector
          availableVehicles={vehicles}
          selectedVehicleIds={formData.vehicleIds}
          onToggleVehicle={handleToggleVehicle}
          occupiedByVehicle={occupiedByVehicle}
          onDriverChanged={refetchVehicles}
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="submit"
          variant="primary"
          isLoading={isSubmitting}
          disabled={formData.vehicleIds.length === 0 || !formData.clientId || !formData.constSiteId}
        >
          {planificacion ? 'Actualizar' : 'Crear'} Planificación
        </Button>
      </div>
    </form>
  );
};
