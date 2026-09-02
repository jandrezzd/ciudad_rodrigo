import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Input } from '@/shared/components/Input';
import { Button } from '@/shared/components/Button';
import { Select } from '@/shared/components/Select';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import {
  Driver,
  DriverCargo,
  DriverFormData,
  DriverTipo,
  DRIVER_CARGO_OPTIONS,
  DRIVER_TIPO_OPTIONS,
} from '../types';
import { useProveedores } from '@/modules/proveedores/hooks/useProveedores';
import { isValidPhone, sanitizeNumeric } from '@/shared/utils/validation';

interface DriverFormProps {
  driver?: Driver;
  onSubmit: (data: DriverFormData) => Promise<void>;
  onCancel: () => void;
}

const emptyForm = (driver?: Driver): DriverFormData => ({
  name: driver?.name || '',
  document: driver?.document || '',
  phone: driver?.phone || '',
  cargo: driver?.cargo || '',
  tipo: driver?.tipo || 'INTERNO',
  ownerId: driver?.ownerId ?? null,
});

export const DriverForm = ({ driver, onSubmit, onCancel }: DriverFormProps) => {
  const [formData, setFormData] = useState<DriverFormData>(emptyForm(driver));

  useEffect(() => {
    setFormData(emptyForm(driver));
  }, [driver]);

  // Solo hace falta la lista de proveedores cuando el chofer es externo, pero
  // el hook ya cachea por su cuenta y así el selector no parpadea al cambiar
  // de tipo con el modal abierto.
  const { proveedores, isLoading: isLoadingProveedores } = useProveedores();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string; ownerId?: string }>({});

  const proveedorOptions = useMemo(
    () =>
      proveedores.map((p) => ({
        value: String(p.id),
        label: `${p.companyname || p.name || `Proveedor ${p.id}`}${p.ruc ? ` (${p.ruc})` : ''}`,
      })),
    [proveedores],
  );

  const handleChange = (field: keyof DriverFormData, value: string | number | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  // Al volver a INTERNO se suelta el proveedor: el backend lo pondría en null
  // de todos modos, y dejarlo en el formulario haría creer que sigue vinculado.
  const handleTipoChange = (tipo: DriverTipo) => {
    setFormData((prev) => ({
      ...prev,
      tipo,
      ownerId: tipo === 'INTERNO' ? null : prev.ownerId,
    }));
    setErrors((prev) => ({ ...prev, ownerId: undefined }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const nextErrors: typeof errors = {};
    if (!formData.name.trim()) {
      nextErrors.name = 'El nombre es obligatorio.';
    }
    const trimmedPhone = formData.phone.trim();
    if (trimmedPhone && !isValidPhone(trimmedPhone)) {
      nextErrors.phone = 'El teléfono debe tener 10 dígitos.';
    }
    if (formData.tipo === 'EXTERNO' && !formData.ownerId) {
      nextErrors.ownerId = 'Un chofer externo debe pertenecer a un proveedor.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ ...formData, name: formData.name.trim() });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Input
            label="Nombre completo"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            error={errors.name}
            required
          />
        </div>

        <Select
          label="Tipo de chofer"
          value={formData.tipo}
          onChange={(e) => handleTipoChange(e.target.value as DriverTipo)}
          options={DRIVER_TIPO_OPTIONS}
          hideDefaultOption
          required
        />

        <Select
          label="Cargo"
          value={formData.cargo}
          onChange={(e) => handleChange('cargo', e.target.value as DriverCargo | '')}
          options={DRIVER_CARGO_OPTIONS}
        />

        {formData.tipo === 'EXTERNO' && (
          <div className="md:col-span-2">
            <SearchableSelect
              label="Proveedor"
              value={formData.ownerId ? String(formData.ownerId) : ''}
              onChange={(value) => handleChange('ownerId', value ? Number(value) : null)}
              options={proveedorOptions}
              placeholder={isLoadingProveedores ? 'Cargando proveedores...' : 'Buscar proveedor...'}
              emptyMessage="No hay proveedores registrados"
              error={errors.ownerId}
              required
            />
          </div>
        )}

        <Input
          label="Cédula / Documento"
          value={formData.document}
          onChange={(e) => handleChange('document', sanitizeNumeric(e.target.value, 13))}
          inputMode="numeric"
          maxLength={13}
        />
        <Input
          label="Teléfono"
          value={formData.phone}
          onChange={(e) => handleChange('phone', sanitizeNumeric(e.target.value, 10))}
          inputMode="numeric"
          maxLength={10}
          error={errors.phone}
          helperText={!errors.phone ? '10 dígitos' : undefined}
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="!bg-red-300 !text-red-800 hover:!bg-red-300 border-none">
          Cancelar
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting} className="!bg-blue-300 !text-blue-800 hover:!bg-blue-300 border-none">
          {driver ? 'Actualizar' : 'Crear'} Chofer
        </Button>
      </div>
    </form>
  );
};
