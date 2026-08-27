import { FormEvent, useState } from 'react';
import { Input } from '@/shared/components/Input';
import { Button } from '@/shared/components/Button';
import { Proveedor, ProveedorFormData } from '../types';
import { isValidCedula, isValidPhone, isValidRuc, sanitizeAlphanumeric, sanitizeNumeric } from '@/shared/utils/validation';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { ECUADOR_LOCATIONS } from '@/shared/constants/ecuador-locations';

interface ProveedorFormProps {
  proveedor?: Proveedor;
  onSubmit: (data: ProveedorFormData) => Promise<void>;
  onCancel: () => void;
}

export const ProveedorForm = ({ proveedor, onSubmit, onCancel }: ProveedorFormProps) => {
  const [formData, setFormData] = useState<ProveedorFormData>({
    ruc: proveedor?.ruc || '',
    companyname: proveedor?.companyname || '',
    name: proveedor?.name || '',
    document: proveedor?.document || '',
    province: proveedor?.province || '',
    canton: proveedor?.canton || '',
    address: proveedor?.address || '',
    email: proveedor?.email || '',
    phone: proveedor?.phone || '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ document?: string; ruc?: string; phone?: string }>({});

  const handleChange = (field: keyof ProveedorFormData, value: string) => {
    setFormData((prev) => {
      const newData = { ...prev, [field]: value };
      // Reset canton if province changes
      if (field === 'province') {
        newData.canton = '';
      }
      return newData;
    });
    if (field === 'document' && errors.document) {
      setErrors((prev) => ({ ...prev, document: undefined }));
    }
    if (field === 'ruc' && errors.ruc) {
      setErrors((prev) => ({ ...prev, ruc: undefined }));
    }
    if (field === 'phone' && errors.phone) {
      setErrors((prev) => ({ ...prev, phone: undefined }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedDocument = formData.document.trim();
    if (trimmedDocument && /^\d+$/.test(trimmedDocument) && !isValidCedula(trimmedDocument)) {
      setErrors({ document: 'La cédula debe tener 10 dígitos.' });
      return;
    }
    const trimmedRuc = formData.ruc.trim();
    if (trimmedRuc && !isValidRuc(trimmedRuc)) {
      setErrors({ ruc: 'El RUC debe tener 13 dígitos.' });
      return;
    }
    const trimmedPhone = formData.phone.trim();
    if (trimmedPhone && !isValidPhone(trimmedPhone)) {
      setErrors({ phone: 'El teléfono debe tener 10 dígitos.' });
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({ ...formData, document: trimmedDocument });
    } catch (error) {
      console.error(error);
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
        />
        <Input
          label="Razón Social"
          value={formData.companyname}
          onChange={(e) => handleChange('companyname', e.target.value)}
        />
        <Input
          label="Nombre del Contacto"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
        />
        <Input
          label="Cédula / Documento"
          value={formData.document}
          onChange={(e) => handleChange('document', sanitizeAlphanumeric(e.target.value, 10).toUpperCase())}
          maxLength={10}
          error={errors.document}
          helperText={!errors.document ? 'Hasta 10 caracteres (letras y números)' : undefined}
        />
        <Input
          label="Email"
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
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
        <SearchableSelect
          label="Provincia"
          options={Object.keys(ECUADOR_LOCATIONS).map(p => ({ value: p, label: p }))}
          value={formData.province}
          onChange={(val) => handleChange('province', val)}
        />
        <SearchableSelect
          label="Cantón"
          options={formData.province ? ECUADOR_LOCATIONS[formData.province as keyof typeof ECUADOR_LOCATIONS].map(c => ({ value: c, label: c })) : []}
          value={formData.canton}
          onChange={(val) => handleChange('canton', val)}
        />
        <div className="md:col-span-2">
          <Input
            label="Dirección"
            value={formData.address}
            onChange={(e) => handleChange('address', e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          {proveedor ? 'Actualizar' : 'Crear'} Proveedor
        </Button>
      </div>
    </form>
  );
};
