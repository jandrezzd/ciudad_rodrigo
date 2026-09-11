import { FormEvent, useState, useEffect } from 'react';
import { Input } from '@/shared/components/Input';
import { Select } from '@/shared/components/Select';
import { Button } from '@/shared/components/Button';
import { User, CreateUserData } from '../types';
import { isValidCedula, sanitizeNumeric } from '@/shared/utils/validation';

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

/**
 * Deja escribir el teléfono nacional de 10 dígitos y también el internacional
 * con prefijo (+593…). No se usa `sanitizeNumeric` de shared/ porque borra el
 * '+' y corta en 10 caracteres, y no se cambia allí porque la comparten los
 * formularios de clientes, choferes, proveedores y vehículos.
 */
const sanitizePhone = (value: string): string => {
  const llevaPrefijo = value.trimStart().startsWith('+');
  const digitos = value.replace(/\D/g, '');
  return llevaPrefijo ? `+${digitos.slice(0, 15)}` : digitos.slice(0, 10);
};

/** 10 dígitos si es nacional; entre 8 y 15 tras el '+' si es internacional. */
const esTelefonoValido = (phone: string): boolean =>
  phone.startsWith('+') ? /^\+\d{8,15}$/.test(phone) : /^\d{10}$/.test(phone);

/**
 * Devuelve '' ante cualquier valor que no sea OBRA o CANTERA. Antes devolvía el
 * valor tal cual, así que un roletype inesperado viajaba al backend y el
 * `@IsEnum(RoleType)` lo rechazaba con un 400.
 */
const normalizeRoleType = (value?: string): '' | 'OBRA' | 'CANTERA' => {
  if (!value) return '';
  const upperValue = value.toUpperCase();
  if (upperValue === 'OBRA' || upperValue === 'CANTERA') return upperValue;
  return '';
};

export const UserForm = ({ user, onSubmit, onCancel }: UserFormProps) => {
  const [formData, setFormData] = useState<UserFormData>({
    name: user?.name || '',
    document: sanitizeNumeric(user?.document || '', 10),
    email: user?.email || '',
    role: user?.role || ('' as any),
    password: '',
    // Tal cual está guardado, sin recortar: hay teléfonos con prefijo (+593…)
    // y sanitizarlos aquí los truncaba antes de que nadie tocara el campo.
    phone: user?.phone || '',
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
      // Tal cual está guardado, sin recortar: hay teléfonos con prefijo (+593…)
    // y sanitizarlos aquí los truncaba antes de que nadie tocara el campo.
    phone: user?.phone || '',
      company: user?.company || '',
      roletype: normalizeRoleType(user?.roletype),
      isActive: user ? user.isActive : true,
    });
  }, [user]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    document?: string;
    phone?: string;
    password?: string;
  }>({});

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
    // El teléfono solo se valida y se recorta si el usuario lo cambió. Los que
    // ya están guardados traen prefijo internacional (+593…) y pasarlos por
    // sanitizeNumeric(…, 10) los dejaba en los primeros diez dígitos: abrir la
    // ficha de alguien y guardar bastaba para destruirle el número.
    const phoneOriginal = (user?.phone ?? '').trim();
    const phoneActual = String(formData.phone ?? '').trim();

    let phoneAEnviar: string | undefined;
    if (phoneActual === phoneOriginal) {
      phoneAEnviar = phoneOriginal || undefined;
    } else {
      const limpio = sanitizePhone(phoneActual);
      if (limpio && !esTelefonoValido(limpio)) {
        setErrors({
          phone: 'Use 10 dígitos, o el formato internacional con prefijo (+593…).',
        });
        return;
      }
      phoneAEnviar = limpio || undefined;
    }

    setIsSubmitting(true);
    try {
      const submitData: any = {
        name: formData.name,
        document: formData.document,
        email: formData.email,
        role: formData.role,
        phone: phoneAEnviar,
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
      // En edición, una contraseña vacía significa "no la cambies", así que no
      // se manda. En alta el backend la exige con mínimo 6 caracteres: se
      // valida aquí para dar un mensaje claro en vez de enviar una cadena
      // vacía y recibir un 400.
      if (formData.password) {
        submitData.password = formData.password;
      } else if (!user) {
        setErrors({ password: 'La contraseña es obligatoria y debe tener al menos 6 caracteres.' });
        return;
      }

      if (formData.password && formData.password.length < 6) {
        setErrors({ password: 'La contraseña debe tener al menos 6 caracteres.' });
        return;
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
          onChange={(e) => handleChange('phone', sanitizePhone(e.target.value))}
          inputMode="tel"
          maxLength={16}
          error={errors.phone}
          helperText={!errors.phone ? '10 dígitos o con prefijo (+593…)' : undefined}
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
          error={errors.password}
          helperText={!errors.password ? 'Mínimo 6 caracteres' : undefined}
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
