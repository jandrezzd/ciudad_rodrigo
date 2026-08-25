import { FormEvent, useState, useEffect, useCallback } from 'react';
import { Input } from '@/shared/components/Input';
import { Button } from '@/shared/components/Button';
import { Select } from '@/shared/components/Select';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import {
  Vehicle,
  VehicleCompany,
  VehicleFormData,
  VehicleQRCode,
  VehicleType,
  VEHICLE_COMPANY_LABELS,
  inferVehicleCompany,
  normalizeVehicleType,
} from '../types';
import axiosInstance from '@/config/axios';
import { vehicleService } from '../services/vehicleService';
import { formatPlate, normalizePlate } from '@/shared/utils/validation';

interface Owner {
  id: number;
  name: string;
  companyname: string;
  ruc: string;
  company?: VehicleCompany;
}

interface InternalCompanyOption {
  value: VehicleCompany;
  label: string;
}

interface Driver {
  id: number;
  name: string | null;
  document: string | null;
  phone: string | null;
}

interface VehicleFormProps {
  vehicle?: Vehicle; // Optional for creation, present for edition
  onSubmit: (data: VehicleFormData) => Promise<void>;
  onCancel: () => void;
}

export const VehicleForm = ({ vehicle, onSubmit, onCancel }: VehicleFormProps) => {
  const initialType = normalizeVehicleType(vehicle?.type) || 'INTERNO';
  const initialCompany = vehicle?.company ?? inferVehicleCompany(vehicle?.owner?.companyname) ?? undefined;

  const [formData, setFormData] = useState<VehicleFormData>({
    vehicleid: vehicle?.vehicleid || '',
    plate: normalizePlate(vehicle?.plate || ''),
    brand: vehicle?.brand || '',
    model: vehicle?.model || '',
    year: vehicle?.year || String(new Date().getFullYear()),
    qrcodeId: vehicle?.qrcodeId || null,
    type: initialType,
    capacity: vehicle?.capacity != null ? String(vehicle.capacity) : '',
    company: initialType === 'INTERNO' ? initialCompany : undefined,
    driverId: vehicle?.driverId || null,
    observation: vehicle?.observation || '',
    ownerId: vehicle?.ownerId || 0,
    isActive: vehicle ? (vehicle.isActive ?? true) : true,
  });

  const [owners, setOwners] = useState<Owner[]>([]);
  const [internalCompanies, setInternalCompanies] = useState<InternalCompanyOption[]>([]);
  const [externalOwners, setExternalOwners] = useState<Owner[]>([]);
  const [availableQRCodes, setAvailableQRCodes] = useState<VehicleQRCode[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ driverdoc?: string }>({});
  const [assignedQRCode, setAssignedQRCode] = useState<string | null>(vehicle?.qrcode?.qrcode ?? null);
  const [assignedQRCodeId, setAssignedQRCodeId] = useState<number | null>(vehicle?.qrcodeId ?? null);
  const [occupiedQRCodeIds, setOccupiedQRCodeIds] = useState<number[]>([]);

  const companyOptions: InternalCompanyOption[] = internalCompanies.length
    ? internalCompanies
    : (Object.entries(VEHICLE_COMPANY_LABELS).map(([value, label]) => ({
        value: value as VehicleCompany,
        label: label.toUpperCase(),
      })) as InternalCompanyOption[]);


  // Cargar datos iniciales (dueños, empresas, conductores)
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [ownersRes, internalRes, driversRes] = await Promise.all([
          axiosInstance.get<Owner[]>('/owners'),
          axiosInstance.get<InternalCompanyOption[]>('/owners/internal'),
          axiosInstance.get<Driver[]>('/drivers'), // Nuevo endpoint
        ]);

        // Procesar dueños y empresas
        const allOwners = Array.isArray(ownersRes?.data) ? ownersRes.data : [];
        const internalFromApi = Array.isArray(internalRes?.data) ? internalRes.data : [];
        const internalOptions: InternalCompanyOption[] = internalFromApi
          .map((item) => ({
            value: String(item?.value ?? '').toUpperCase() as VehicleCompany,
            label: String(item?.label ?? item?.value ?? '').toUpperCase(),
          }))
          .filter((opt) => opt.value)
          .filter((opt, index, self) => self.findIndex((o) => o.value === opt.value) === index);
        const external = allOwners.filter((o) => !inferVehicleCompany(`${o.companyname ?? ''} ${o.name ?? ''}`));
        
        setOwners(allOwners);
        setInternalCompanies(internalOptions);
        setExternalOwners(external);

        // Procesar conductores
        if (driversRes.data && Array.isArray(driversRes.data)) {
          setDrivers(driversRes.data);
        }

      } catch (error) {
        console.error('Error cargando datos iniciales:', error);
      }
    };

    fetchInitialData();
  }, []);

  // Cargar QRs disponibles
  useEffect(() => {
    vehicleService.getAvailableQRCodes()
      .then(res => {
        const data = Array.isArray(res) ? res : [];
        setAvailableQRCodes(data);
      })
      .catch(err => console.error('Error cargando QRs disponibles:', err));
  }, []);

  // Cargar QRs ocupados
  useEffect(() => {
    let isMounted = true;
    vehicleService.getAll()
      .then((res) => {
        if (!isMounted) return;
        const data = Array.isArray(res) ? res : [];
        const ids = data
          .map((item) => item.qrcodeId)
          .filter((id): id is number => typeof id === 'number' && id > 0);
        setOccupiedQRCodeIds(ids);
      })
      .catch((err) => console.warn('No se pudo cargar QRs ocupados:', err));
    return () => { isMounted = false; };
  }, []);

  // Cargar QR asignado al vehículo en edición
  useEffect(() => {
    if (!vehicle?.id) return;
    let isMounted = true;
    vehicleService.getQRCodeByVehicleId(vehicle.id)
      .then((data) => {
        if (!isMounted) return;
        setAssignedQRCode(data.qrcode ?? null);
        setAssignedQRCodeId(data.qrcodeId ?? null);
        setFormData((prev) => ({
          ...prev,
          qrcodeId: data.qrcodeId ?? null,
        }));
      })
      .catch((err) => {
        console.warn('No se pudo cargar el QR asignado del vehículo:', err);
        if (!isMounted) return;
        setAssignedQRCode(null);
        setAssignedQRCodeId(null);
      });
    return () => { isMounted = false; };
  }, [vehicle?.id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFieldChange = (field: keyof VehicleFormData, value: string | number | boolean | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePlateChange = (value: string) => {
    handleFieldChange('plate', formatPlate(value));
  };

  const resolveCompanyFromOwnerId = (ownerId: number): VehicleCompany | undefined => {
    const owner = owners.find(o => o.id === ownerId);
    if (owner?.company) return owner.company;
    const combined = `${owner?.companyname ?? ''} ${owner?.name ?? ''}`.trim();
    return inferVehicleCompany(combined) ?? undefined;
  };

  const resolveOwnerIdByCompany = useCallback((company?: VehicleCompany): number => {
    if (!company) return 0;
    const match = owners.find(o =>
      inferVehicleCompany(`${o.companyname ?? ''} ${o.name ?? ''}`) === company
    );
    return match?.id ?? 0;
  }, [owners]);

  useEffect(() => {
    if (formData.type !== 'INTERNO' || !formData.company) return;
    const nextOwnerId = resolveOwnerIdByCompany(formData.company);
    if (nextOwnerId > 0 && nextOwnerId !== formData.ownerId) {
      setFormData(prev => ({ ...prev, ownerId: nextOwnerId }));
    }
  }, [owners, formData.type, formData.company, formData.ownerId, resolveOwnerIdByCompany]);


  const getInitialsByCompany = (company: VehicleCompany | undefined, type: VehicleType | ''): string => {
    if (type === 'EXTERNO') return 'TE-';
    if (type !== 'INTERNO') return '';
    if (company === 'CIUDAD_RODRIGO') return 'TCR-';
    if (company === 'TRANSVELEZ') return 'TVL-';
    return '';
  };

  const inferTypeAndCompanyFromVehicleId = (value: string) => {
    const normalized = value.trim().toUpperCase();
    if (normalized.startsWith('TCR-')) {
      return { type: 'INTERNO' as VehicleType, company: 'CIUDAD_RODRIGO' as VehicleCompany };
    }
    if (normalized.startsWith('TVL-')) {
      return { type: 'INTERNO' as VehicleType, company: 'TRANSVELEZ' as VehicleCompany };
    }
    if (normalized.startsWith('TE-')) {
      return { type: 'EXTERNO' as VehicleType, company: null as VehicleCompany | null };
    }
    return null;
  };

  const handleCompanyChange = (ownerId: number) => {
    const inferredCompany = resolveCompanyFromOwnerId(ownerId);
    const nextCompany = formData.type === 'INTERNO'
      ? inferredCompany
      : undefined;
    const newPrefix = getInitialsByCompany(nextCompany, formData.type);

    // Solo actualizar vehicleid si es INTERNO (cambia entre empresas)
    // Para EXTERNO (TE-), el prefijo no cambia al cambiar de proveedor
    const shouldUpdateVehicleId = formData.type === 'INTERNO' || formData.vehicleid === '';

    setFormData(prev => ({
      ...prev,
      ownerId,
      company: nextCompany ?? null,
      vehicleid: shouldUpdateVehicleId ? newPrefix : prev.vehicleid,
    }));
  };

  const handleInternalCompanyChange = (company: VehicleCompany) => {
    const newPrefix = getInitialsByCompany(company, 'INTERNO');
    const shouldUpdateVehicleId = formData.type === 'INTERNO' || formData.vehicleid === '';
    const nextOwnerId = resolveOwnerIdByCompany(company);

    setFormData(prev => ({
      ...prev,
      company,
      ownerId: nextOwnerId || 0,
      vehicleid: shouldUpdateVehicleId ? newPrefix : prev.vehicleid,
    }));
  };

  const handleTypeChange = (type: VehicleType) => {
    setFormData(prev => {
      const inferredCompany = resolveCompanyFromOwnerId(prev.ownerId);
      const nextCompany = type === 'INTERNO'
        ? (prev.company ?? inferredCompany)
        : undefined;
      const vehicleInitials = getInitialsByCompany(nextCompany, type);
      const nextOwnerId = type === 'INTERNO'
        ? resolveOwnerIdByCompany(nextCompany)
        : (prev.ownerId || 0);
      return {
        ...prev,
        type,
        company: nextCompany ?? null,
        ownerId: nextOwnerId,
        vehicleid: vehicleInitials,
        qrcodeId: null,
      };
    });
  };

  const filteredQRCodes = availableQRCodes
    .filter((qr) => {
      const code = (qr.qrcode || '').toUpperCase();
      if (formData.type === 'INTERNO') return code.startsWith('VI-');
      if (formData.type === 'EXTERNO') return code.startsWith('VE-');
      return true;
    })
    .filter((qr) => {
      if (assignedQRCodeId && qr.id === assignedQRCodeId) return true;
      return !occupiedQRCodeIds.includes(qr.id);
    });

  const assignedQrOption = assignedQRCodeId
    ? {
        value: String(assignedQRCodeId),
        label: assignedQRCode ? `${assignedQRCode} (Actual)` : `QR ${assignedQRCodeId} (Actual)`,
      }
    : null;

  const qrOptions = [
    ...(assignedQrOption && !filteredQRCodes.some((qr) => qr.id === assignedQRCodeId)
      ? [assignedQrOption]
      : []),
    ...filteredQRCodes.map((qr) => ({
      value: String(qr.id),
      label: `${qr.qrcode} (${qr.status})`,
    })),
  ];

  useEffect(() => {
    if (!formData.qrcodeId) return;
    const exists = filteredQRCodes.some((qr) => qr.id === formData.qrcodeId);
    const isAssigned = assignedQRCodeId === formData.qrcodeId;
    if (!exists) {
      const isAssignedOnEdit = !!vehicle && (
        vehicle.qrcodeId === formData.qrcodeId ||
        isAssigned
      );
      if (!isAssignedOnEdit) {
        setFormData((prev) => ({ ...prev, qrcodeId: null }));
      }
    }
  }, [filteredQRCodes, formData.qrcodeId, vehicle, assignedQRCodeId]);

  const handleVehicleIdChange = (value: string) => {
    const inference = inferTypeAndCompanyFromVehicleId(value);
    const nextType = inference?.type ?? (formData.type as VehicleType | '');
    const nextCompany = inference
      ? (inference.type === 'INTERNO' ? inference.company : null)
      : (formData.company ?? null);

    const prefix = getInitialsByCompany(nextCompany ?? undefined, nextType);
    if (!prefix) {
      setFormData(prev => ({ ...prev, vehicleid: value }));
      return;
    }

    const numericPart = value.replace(/\D/g, '');
    const maxDigits = nextType === 'INTERNO' ? 7 : 7;
    const trimmed = numericPart.slice(0, maxDigits);

    if (nextType === 'INTERNO') {
      const first = trimmed.slice(0, 2);
      const rest = trimmed.slice(2, 7);
      const formatted = trimmed.length <= 2
        ? `${prefix}${first}`
        : `${prefix}${first}-${rest}`;

      const nextOwnerId = resolveOwnerIdByCompany(nextCompany ?? undefined);
      setFormData(prev => ({
        ...prev,
        type: nextType,
        company: nextCompany ?? null,
        ownerId: nextOwnerId || 0,
        vehicleid: formatted,
        qrcodeId: inference && inference.type !== prev.type ? null : prev.qrcodeId,
      }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      type: nextType,
      company: nextCompany ?? null,
      ownerId: inference && inference.type !== prev.type ? 0 : prev.ownerId,
      vehicleid: prefix + trimmed,
      qrcodeId: inference && inference.type !== prev.type ? null : prev.qrcodeId,
    }));
  };

  const externalCompanies = externalOwners.length
    ? externalOwners
    : owners.filter(o => !inferVehicleCompany(`${o.companyname ?? ''} ${o.name ?? ''}`));

  const driverOptions = [
    { value: '', label: 'Sin conductor asignado' },
    ...drivers.map(driver => ({
      value: String(driver.id),
      label: `${driver.name || 'Sin nombre'} (${driver.document || 'Sin cédula'})`,
    }))
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-b pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Tipo de Vehículo"
            value={formData.type}
            onChange={(e) => handleTypeChange(e.target.value as VehicleType)}
            disabled={!!vehicle}
            options={[
              { value: 'INTERNO', label: 'Interno' },
              { value: 'EXTERNO', label: 'Externo' },
            ]}
          />

          {formData.type === 'INTERNO' ? (
            <Select
              label="Empresa"
              value={formData.company ?? ''}
              onChange={(e) => handleInternalCompanyChange(e.target.value as VehicleCompany)}
              options={companyOptions.map((o) => ({
                value: o.value,
                label: (o.label || VEHICLE_COMPANY_LABELS[o.value] || 'SIN EMPRESA').toUpperCase(),
              }))}
            />
          ) : (
            <SearchableSelect
              label="Proveedor"
              value={String(formData.ownerId || '')}
              onChange={(value) => handleCompanyChange(Number(value))}
              options={externalCompanies.map((o) => ({
                value: String(o.id),
                label: `${o.companyname || 'Sin nombre'} (${o.ruc || 'sin RUC'})`,
              }))}
              placeholder="Buscar proveedor..."
            />
          )}

          <Input
            label="ID Vehículo"
            value={formData.vehicleid}
            onChange={(e) => handleVehicleIdChange(e.target.value)}
            placeholder={formData.type === 'INTERNO'
              ? (formData.company
                ? (getInitialsByCompany(formData.company ?? undefined, formData.type as VehicleType | '') + '12-34567')
                : 'Selecciona empresa primero')
              : (formData.ownerId
                ? (getInitialsByCompany(formData.company ?? undefined, formData.type as VehicleType | '') + '123...')
                : 'Selecciona proveedor primero')}
            required
          />

          <Select
            label="Código QR disponible"
            value={formData.qrcodeId ? String(formData.qrcodeId) : ''}
            onChange={(e) => handleFieldChange('qrcodeId', e.target.value ? Number(e.target.value) : null)}
            options={qrOptions}
          />

          <Input
            label="Marca"
            value={formData.brand}
            onChange={(e) => handleFieldChange('brand', e.target.value)}
          />
          <Input
            label="Modelo"
            value={formData.model}
            onChange={(e) => handleFieldChange('model', e.target.value)}
          />

          <Input
            label="Año"
            value={formData.year}
            onChange={(e) => handleFieldChange('year', e.target.value)}
          />

          <Input
            label="Capacidad (M³)"
            type="number"
            min="0"
            step="0.01"
            value={formData.capacity}
            onChange={(e) => handleFieldChange('capacity', e.target.value.replace('-', ''))}
            helperText="No se permiten valores negativos"
            required
          />

          <div className="md:col-span-2">
            <Input
              label="Placa del Vehículo"
              value={formData.plate}
              onChange={(e) => handlePlateChange(e.target.value)}
              maxLength={7}
              helperText="Formato: ABC1234 (3 letras y 4 números)"
              required
            />
          </div>

          <div className="md:col-span-2">
            <Input
              label="Observación (opcional)"
              value={formData.observation || ''}
              onChange={(e) => handleFieldChange('observation', e.target.value)}
              placeholder="Notas adicionales..."
            />
          </div>
        </div>
      </div>

      <div className="border-b pb-6">
        <h3 className="text-sm font-semibold text-gray-700">Datos del Chofer</h3>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <SearchableSelect
              label="Conductor Asignado"
              value={formData.driverId ? String(formData.driverId) : ''}
              onChange={(value) => handleFieldChange('driverId', value ? Number(value) : null)}
              options={driverOptions}
              placeholder="Buscar y seleccionar un conductor..."
            />
          </div>
        </div>
      </div>

      {/* BOTONES FINALES */}
      <div className="flex justify-end gap-3 pt-6 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          {vehicle ? 'Actualizar Vehículo' : 'Crear Vehículo'}
        </Button>
      </div>
    </form>
  );
};
