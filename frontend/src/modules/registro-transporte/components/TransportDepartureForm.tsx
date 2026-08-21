import { FormEvent, useMemo, useState } from 'react';
import { Input } from '@/shared/components/Input';
import { Select } from '@/shared/components/Select';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { Button } from '@/shared/components/Button';
import { Vehicle } from '@/modules/vehicles/types';
import { Proveedor } from '@/modules/proveedores/types';
import { Cliente } from '@/modules/clientes/types';
import { Obra } from '@/modules/obras/types';
import { Planificacion } from '@/modules/planificacion/types';
import { Material } from '@/modules/materiales/types';
import { materialOptions as buildMaterialOptions } from '@/modules/materiales/utils/materialLabels';
import { TransportDepartureData } from '../types';

interface TransportDepartureFormProps {
  vehicles: Vehicle[];
  proveedores: Proveedor[];
  clientes: Cliente[];
  obras: Obra[];
  planificaciones: Planificacion[];
  materiales: Material[];
  onSubmit: (data: TransportDepartureData) => Promise<void>;
  onCancel: () => void;
}

export const TransportDepartureForm = ({
  vehicles,
  proveedores,
  clientes,
  obras,
  planificaciones,
  materiales,
  onSubmit,
  onCancel,
}: TransportDepartureFormProps) => {
  const [formData, setFormData] = useState({
    vehicleId: '',
    ownerId: '',
    clientId: '',
    constSiteId: '',
    planningId: '',
    materialId: '',
    departureM3: '',
    departureLat: '',
    departureLng: '',
    driverFile: null as File | null,
    vehicleFile: null as File | null,
    plateFile: null as File | null,
    materialFile: null as File | null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const vehicleOptions = useMemo(
    () => vehicles
      .filter((v) => v.isActive !== false)
      .map((v) => ({
        value: String(v.id),
        label: `${v.plate} - ${v.driver?.name || 'Sin conductor'}`,
      })),
    [vehicles]
  );

  const ownerOptions = useMemo(
    () => proveedores.map((o) => ({
      value: String(o.id),
      label: `${o.companyname} (${o.name})`,
    })),
    [proveedores]
  );

  const clientOptions = useMemo(
    () => clientes.map((c) => ({
      value: String(c.id),
      label: `${c.companyname} (${c.name})`,
    })),
    [clientes]
  );

  const obraOptions = useMemo(
    () => obras.map((o) => ({
      value: String(o.id),
      label: o.name,
    })),
    [obras]
  );

  const planningOptions = useMemo(
    () => planificaciones.map((p) => ({
      value: String(p.id),
      label: p.name,
    })),
    [planificaciones]
  );

  const materialOptions = useMemo(
    () => [{ value: '', label: 'Sin material' }, ...buildMaterialOptions(materiales)],
    [materiales]
  );

  const handleChange = (field: keyof typeof formData, value: string | File | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({
        vehicleId: formData.vehicleId ? Number(formData.vehicleId) : undefined,
        ownerId: formData.ownerId ? Number(formData.ownerId) : undefined,
        clientId: formData.clientId ? Number(formData.clientId) : undefined,
        constSiteId: formData.constSiteId ? Number(formData.constSiteId) : undefined,
        planningId: formData.planningId ? Number(formData.planningId) : undefined,
        materialId: formData.materialId ? Number(formData.materialId) : undefined,
        departureM3: formData.departureM3 ? Number(formData.departureM3) : undefined,
        departureLat: formData.departureLat ? Number(formData.departureLat) : undefined,
        departureLng: formData.departureLng ? Number(formData.departureLng) : undefined,
        driverFile: formData.driverFile || undefined,
        vehicleFile: formData.vehicleFile || undefined,
        plateFile: formData.plateFile || undefined,
        materialFile: formData.materialFile || undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Vehículo"
          value={formData.vehicleId}
          onChange={(e) => handleChange('vehicleId', e.target.value)}
          options={vehicleOptions}
          required
        />
        <Select
          label="Proveedor"
          value={formData.ownerId}
          onChange={(e) => handleChange('ownerId', e.target.value)}
          options={ownerOptions}
        />
        <Select
          label="Cliente"
          value={formData.clientId}
          onChange={(e) => handleChange('clientId', e.target.value)}
          options={clientOptions}
        />
        <Select
          label="Obra"
          value={formData.constSiteId}
          onChange={(e) => handleChange('constSiteId', e.target.value)}
          options={obraOptions}
        />
        <Select
          label="Planificación"
          value={formData.planningId}
          onChange={(e) => handleChange('planningId', e.target.value)}
          options={planningOptions}
        />
        <SearchableSelect
          label="Material"
          value={formData.materialId}
          onChange={(val) => handleChange('materialId', val)}
          options={materialOptions}
        />
        <Input
          label="Volumen de salida (m3)"
          type="number"
          step="0.01"
          value={formData.departureM3}
          onChange={(e) => handleChange('departureM3', e.target.value)}
          required
        />
        <Input
          label="Latitud de salida"
          type="number"
          step="0.000001"
          value={formData.departureLat}
          onChange={(e) => handleChange('departureLat', e.target.value)}
          required
        />
        <Input
          label="Longitud de salida"
          type="number"
          step="0.000001"
          value={formData.departureLng}
          onChange={(e) => handleChange('departureLng', e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Foto del conductor"
          type="file"
          accept="image/*"
          onChange={(e) => handleChange('driverFile', e.target.files?.[0] || null)}
          required
        />
        <Input
          label="Foto del vehículo"
          type="file"
          accept="image/*"
          onChange={(e) => handleChange('vehicleFile', e.target.files?.[0] || null)}
          required
        />
        <Input
          label="Foto de la placa"
          type="file"
          accept="image/*"
          onChange={(e) => handleChange('plateFile', e.target.files?.[0] || null)}
          required
        />
        <Input
          label="Foto del material"
          type="file"
          accept="image/*"
          onChange={(e) => handleChange('materialFile', e.target.files?.[0] || null)}
          required
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          Registrar salida
        </Button>
      </div>
    </form>
  );
};
