import { FormEvent, useEffect, useState } from 'react';
import { Input } from '@/shared/components/Input';
import { Button } from '@/shared/components/Button';
import { Driver, DriverFormData } from '../types';
import { isValidPhone, sanitizeNumeric } from '@/shared/utils/validation';

interface DriverFormProps {
  driver?: Driver;
  onSubmit: (data: DriverFormData) => Promise<void>;
  onCancel: () => void;
}

export const DriverForm = ({ driver, onSubmit, onCancel }: DriverFormProps) => {
  const [formData, setFormData] = useState<DriverFormData>({
    name: driver?.name || '',
    document: driver?.document || '',
    phone: driver?.phone || '',
  });

  useEffect(() => {
    setFormData({
      name: driver?.name || '',
      document: driver?.document || '',
      phone: driver?.phone || '',
    });
  }, [driver]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState<string | undefined>();

  const handleChange = (field: keyof DriverFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'phone' && phoneError) setPhoneError(undefined);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const trimmedPhone = formData.phone.trim();
    if (trimmedPhone && !isValidPhone(trimmedPhone)) {
      setPhoneError('El teléfono debe tener 10 dígitos.');
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
        <div className="md:col-span-2">
          <Input
            label="Nombre completo"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
          />
        </div>
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
          error={phoneError}
          helperText={!phoneError ? '10 dígitos' : undefined}
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
