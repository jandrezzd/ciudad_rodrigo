import { FormEvent, useState, useEffect } from 'react';
import { Input } from '@/shared/components/Input';
import { Select } from '@/shared/components/Select';
import { Button } from '@/shared/components/Button';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { ECUADOR_LOCATIONS } from '@/shared/constants/ecuador-locations';
import { Cliente, ClienteFormData } from '../types';
import { isValidPhone, isValidRuc, sanitizeNumeric } from '@/shared/utils/validation';

interface ClienteFormProps {
  cliente?: Cliente;
  onSubmit: (data: ClienteFormData) => Promise<void>;
  onCancel: () => void;
}

export const ClienteForm = ({ cliente, onSubmit, onCancel }: ClienteFormProps) => {
  const [formData, setFormData] = useState<ClienteFormData>({
    name: cliente?.name || '',
    ruc: cliente?.ruc || '',
    companyname: cliente?.companyname || '',
    province: cliente?.province || '',
    canton: cliente?.canton || '',
    address: cliente?.address || '',
    type: cliente?.type || 'PRIVADO',
    email: cliente?.email || '',
    phone: cliente?.phone || '',
    isActive: cliente ? (cliente.isActive === true || String(cliente.isActive) === 'true' || Number(cliente.isActive) === 1) : true,
  });

  useEffect(() => {
    setFormData({
      name: cliente?.name || '',
      ruc: cliente?.ruc || '',
      companyname: cliente?.companyname || '',
      province: cliente?.province || '',
      canton: cliente?.canton || '',
      address: cliente?.address || '',
      type: cliente?.type || 'PRIVADO',
      email: cliente?.email || '',
      phone: cliente?.phone || '',
      isActive: cliente ? (cliente.isActive === true || String(cliente.isActive) === 'true' || Number(cliente.isActive) === 1) : true,
    });
  }, [cliente]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ ruc?: string; phone?: string }>({});

  const handleChange = (field: keyof ClienteFormData, value: string | boolean) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'province') {
        next.canton = '';
      }
      return next;
    });
    if (field === 'ruc' && errors.ruc) {
      setErrors((prev) => ({ ...prev, ruc: undefined }));
    }
    if (field === 'phone' && errors.phone) {
      setErrors((prev) => ({ ...prev, phone: undefined }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedRuc = formData.ruc.trim();
    if (trimmedRuc && !isValidRuc(trimmedRuc)) {
      setErrors({ ruc: 'El RUC debe tener 13 dígitos.' });
      return;
    }
    const trimmedPhone = String(formData.phone ?? '').trim();
    if (trimmedPhone && !isValidPhone(trimmedPhone)) {
      setErrors({ phone: 'El teléfono debe tener 10 dígitos.' });
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="RUC"
          value={formData.ruc}
          onChange={(e) => handleChange('ruc', sanitizeNumeric(e.target.value, 13))}
          inputMode="numeric"
          maxLength={13}
          error={errors.ruc}
          helperText={!errors.ruc ? '13 dígitos' : undefined}
          required
        />
        <Input
          label="Razón Social"
          value={formData.companyname}
          onChange={(e) => handleChange('companyname', e.target.value)}
          required
        />
        <Select
          label="Tipo de Cliente"
          value={formData.type}
          onChange={(e) => handleChange('type', e.target.value)}
          options={[
            { value: 'PRIVADO', label: 'PRIVADO' },
            { value: 'PUBLICO', label: 'PÚBLICO' },
          ]}
          required
        />
        <Input
          label="Contacto del Cliente"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
        />
        <SearchableSelect
          label="Provincia"
          options={Object.keys(ECUADOR_LOCATIONS).map((p) => ({ value: p, label: p }))}
          value={formData.province}
          onChange={(val) => handleChange('province', val)}
        />
        <SearchableSelect
          label="Cantón"
          options={
            formData.province
              ? ECUADOR_LOCATIONS[formData.province as keyof typeof ECUADOR_LOCATIONS].map((c) => ({
                  value: c,
                  label: c,
                }))
              : []
          }
          value={formData.canton}
          onChange={(val) => handleChange('canton', val)}
        />
        <div className="md:col-span-2">
          <Input
            label="Dirección Completa"
            value={formData.address}
            onChange={(e) => handleChange('address', e.target.value)}
          />
        </div>
        <Input
          label="Email"
          type="email"
          value={formData.email || ''}
          onChange={(e) => handleChange('email', e.target.value)}
        />
        <Input
          label="Teléfono"
          value={formData.phone || ''}
          onChange={(e) => handleChange('phone', sanitizeNumeric(e.target.value, 10))}
          inputMode="numeric"
          maxLength={10}
          error={errors.phone}
          helperText={!errors.phone ? '10 dígitos' : undefined}
        />
        <div className="md:col-span-2">
          <div className="w-full md:w-1/2 md:pr-2">
            <Select
              label="Estado"
              value={formData.isActive ? 'true' : 'false'}
              onChange={(e) => handleChange('isActive', e.target.value === 'true')}
              options={[
                { value: 'true', label: 'Activo' },
                { value: 'false', label: 'Inactivo' },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          {cliente ? 'Actualizar' : 'Crear'} Cliente
        </Button>
      </div>
    </form>
  );
};
