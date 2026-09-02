import { FormEvent, useState, useEffect } from 'react';
import { Input } from '@/shared/components/Input';
import { Select } from '@/shared/components/Select';
import { Button } from '@/shared/components/Button';
import { User, CreateUserData, UpdateUserData } from '../types';
import { isValidCedula, isValidPhone, sanitizeNumeric } from '@/shared/utils/validation';

interface UserFormProps {
  user?: User;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}

type UserFormData = Omit<CreateUserData, 'roletype'> & {
  roletype?: '' | 'OBRA' | 'CANTERA';
};

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'ADMIN' },
  { value: 'SUPERVISOR', label: 'SUPERVISOR' },
  { value: 'JEFE_DE_OBRA', label: 'JEFE DE OBRA' },
];

const COMPANY_OPTIONS = [
  { value: 'CIUDAD_RODRIGO', label: 'CIUDAD RODRIGO' },
  { value: 'TRANSVELEZ', label: 'TRANSVELEZ' },
  { value: 'PAXOS', label: 'PAXOS' },
  { value: 'DISMECTRA', label: 'DISMECTRA' },
  { value: 'PETROVELCA', label: 'PETROVELCA' },
];

const SUPERVISOR_ROLE_OPTIONS = [
  { value: 'OBRA', label: 'Obra' },
  { value: 'CANTERA', label: 'Cantera' },
];

const normalizeRoleType = (value?: string) => {
  if (!value) return '';
  const upperValue = value.toUpperCase();
  if (upperValue === 'OBRA' || upperValue === 'CANTERA') return upperValue;
  return value;
};

export const UserForm = ({ user, onSubmit, onCancel }: UserFormProps) => {
  const [formData, setFormData] = useState<UserFormData>({
    name: user?.name || '',
    document: sanitizeNumeric(user?.document || '', 10),
    email: user?.email || '',
    role: user?.role || ('' as any),
    password: '',
    phone: sanitizeNumeric(user?.phone || '', 10),
    company: user?.company || '',
    roletype: normalizeRoleType(user?.roletype),
    isActive: user ? user.isActive : true,
  });

  useEffect(() => {
    setFormData({
      name: user?.name || '',
      document: sanitizeNumeric(user?.document || '', 10),
      email: user?.email || '',
      role: user?.role || ('' as any),
      password: '',
      phone: sanitizeNumeric(user?.phone || '', 10),
      company: user?.company || '',
      roletype: normalizeRoleType(user?.roletype),
      isActive: user ? user.isActive : true,
    });
  }, [user]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ document?: string; phone?: string }>({});

  const handleChange = (field: keyof UserFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'document' && errors.document) {
      setErrors((prev) => ({ ...prev, document: undefined }));
    }
    if (field === 'phone' && errors.phone) {
      setErrors((prev) => ({ ...prev, phone: undefined }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedDocument = formData.document.trim();
    if (trimmedDocument && !isValidCedula(trimmedDocument)) {
      setErrors({ document: 'La cédula debe tener 10 dígitos.' });
      return;
    }
    const trimmedPhone = sanitizeNumeric(String(formData.phone ?? ''), 10).trim();
    if (trimmedPhone && !isValidPhone(trimmedPhone)) {
      setErrors({ phone: 'El teléfono debe tener 10 dígitos.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const submitData: any = {
        name: formData.name,
        document: formData.document,
        email: formData.email,
        role: formData.role,
        phone: trimmedPhone || undefined,
        isActive: formData.isActive,
      };

      if (formData.role === 'SUPERVISOR') {
        if (formData.company) submitData.company = formData.company;
        if (formData.roletype) {
          submitData.roletype = normalizeRoleType(formData.roletype);
        }
      } else {
        submitData.company = null; // Clear if not SUPERVISOR
        submitData.roletype = null;
      }
      if (formData.password) {
        submitData.password = formData.password;
      } else if (!user) {
        // Enforce password on creation but not handled strictly here if backend validates,
        // but we can pass it anyway.
        submitData.password = '';
      }

      await onSubmit(submitData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Input
            label="Nombres Completos"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            required
          />
        </div>
        <Input
          label="Cédula"
          value={formData.document}
          onChange={(e) => handleChange('document', sanitizeNumeric(e.target.value, 10))}
          inputMode="numeric"
          maxLength={10}
          error={errors.document}
          helperText={!errors.document ? '10 dígitos' : undefined}
        />
        <Input
          label="Correo Electrónico"
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          required
        />
        <Select
          label="Cargo "
          value={formData.role}
          onChange={(e) => {
            handleChange('role', e.target.value);
            if (e.target.value !== 'SUPERVISOR') {
              handleChange('company', ''); // reset company
              handleChange('roletype', ''); // reset supervisor role
            }
          }}
          options={ROLE_OPTIONS}
          required
        />
        {formData.role === 'SUPERVISOR' && (
          <>
            <Select
              label="Empresa "
              value={formData.company || ''}
              onChange={(e) => handleChange('company', e.target.value)}
              options={COMPANY_OPTIONS}
              required
            />
            <Select
              label="Rol del Supervisor "
              value={formData.roletype || ''}
              onChange={(e) => handleChange('roletype', e.target.value)}
              options={SUPERVISOR_ROLE_OPTIONS}
              required
            />
          </>
        )}
        <Input
          label="Teléfono"
          value={formData.phone || ''}
          onChange={(e) => handleChange('phone', sanitizeNumeric(e.target.value, 10))}
          inputMode="numeric"
          maxLength={10}
          error={errors.phone}
          helperText={!errors.phone ? '10 dígitos' : undefined}
          autoComplete="new-password"
        />
        <Select
          label="Estado "
          value={formData.isActive ? 'true' : 'false'}
          onChange={(e) => handleChange('isActive', e.target.value === 'true')}
          options={[
            { value: 'true', label: 'Activo' },
            { value: 'false', label: 'Inactivo' },
          ]}
          required
        />
        <Input
          label={user ? 'Contraseña (Dejar en blanco para no cambiar)' : 'Contraseña'}
          type="password"
          value={formData.password}
          onChange={(e) => handleChange('password', e.target.value)}
          required={!user}
          autoComplete="new-password"
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="!bg-red-300 !text-red-800 hover:!bg-red-300 border-none">
          Cancelar
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting} className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none">
          {user ? 'Actualizar' : 'Crear'} Usuario
        </Button>
      </div>
    </form>
  );
};
