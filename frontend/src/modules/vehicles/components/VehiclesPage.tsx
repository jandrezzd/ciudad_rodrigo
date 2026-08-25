import { useState, useMemo, useEffect } from 'react';
import JSZip from 'jszip';
import { Plus, Pencil, QrCode, Search, CarFront } from 'lucide-react';
import { useVehicles } from '../hooks/useVehicles';
import { vehicleService } from '../services/vehicleService';
import {
  Vehicle,
  VehicleCompany,
  VehicleFormData,
  VehicleType,
  VEHICLE_COMPANY_LABELS,
  inferVehicleCompany,
  normalizeVehicleType,
} from '../types';
import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Modal';
import { Table } from '@/shared/components/Table';
import { Pagination } from '@/shared/components/Pagination';
import { VehicleForm } from './VehicleForm';
import { VehicleBatchForm, VehicleBatchData } from './VehicleBatchForm';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { Select } from '@/shared/components/Select';
import toast from 'react-hot-toast';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { Status } from '@/shared/types/common';
import axiosInstance from '@/config/axios';
import { formatPlate, isValidPhone, isValidPlate, normalizePlate } from '@/shared/utils/validation';

export const VehiclesPage = () => {
  const { vehicles, isLoading, refetch } = useVehicles();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'BATCH' | 'SINGLE' | 'EDIT'>('BATCH');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | undefined>();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<VehicleType | ''>('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<VehicleCompany | ''>('');
  const [selectedQrStatus, setSelectedQrStatus] = useState<'assigned' | 'unassigned' | ''>('');
  const [qrConfirmVehicle, setQrConfirmVehicle] = useState<Vehicle | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const resolveQrUrl = (rawUrl?: string | null) => {
    if (!rawUrl) return null;
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
    const normalized = rawUrl.replace(/^\/+/, '').replace(/^uploads\//, '');
    const baseUrl = axiosInstance.defaults.baseURL ?? '';
    const baseOrigin = baseUrl.replace(/\/api\/?$/i, '');
    return `${baseOrigin}/${normalized}`;
  };

  const downloadQrZip = async (qrUrls: string[], zipName: string) => {
    if (!qrUrls.length) {
      toast.error('No hay QRs para descargar');
      return;
    }

    const zip = new JSZip();

    for (const rawUrl of qrUrls) {
      const resolvedUrl = resolveQrUrl(rawUrl);
      if (!resolvedUrl) continue;

      try {
        const response = await axiosInstance.get<ArrayBuffer>(resolvedUrl, {
          responseType: 'arraybuffer',
        });

        const filename = resolvedUrl.split('/').pop() || `qr_${Date.now()}.png`;
        zip.file(filename, response.data);
      } catch (error) {
        console.error(error);
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const blobUrl = window.URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = zipName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  const downloadQrImage = async (qrUrl: string, filename: string) => {
    try {
      const response = await axiosInstance.get<Blob>(qrUrl, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      toast.success('QR descargado correctamente');
    } catch (error) {
      console.error(error);
      toast.error('No se pudo descargar el QR');
    }
  };

  const handleConfirmDownloadQr = async () => {
    if (!qrConfirmVehicle) return;
    try {
      const data = await vehicleService.getQRCodeByVehicleId(qrConfirmVehicle.id);
      if (!data.url) {
        toast.error('Este vehículo no tiene un QR asignado');
        return;
      }

      const qrUrl = resolveQrUrl(data.url);
      if (!qrUrl) {
        toast.error('No se pudo resolver la URL del QR');
        return;
      }

      const safePlate = (qrConfirmVehicle.plate || 'vehiculo').replace(/[^a-z0-9-_]/gi, '_');
      await downloadQrImage(qrUrl, `QR_${safePlate}.png`);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo obtener el QR');
    } finally {
      setQrConfirmVehicle(null);
    }
  };

  const handleOpenBatch = () => {
    setModalMode('BATCH');
    setSelectedVehicle(undefined);
    setIsModalOpen(true);
  };

  const handleOpenSingle = () => {
    setModalMode('SINGLE');
    setSelectedVehicle(undefined);
    setIsModalOpen(true);
  };

  const handleEdit = (vehicle: Vehicle) => {
    setModalMode('EDIT');
    setSelectedVehicle(vehicle);
    setIsModalOpen(true);
  };

  const handleBatchSubmit = async (data: VehicleBatchData) => {
    try {
      const { ownedCount, rentedCount } = data;
      const result = await vehicleService.generateBatch(
        Number(ownedCount) || 0,
        Number(rentedCount) || 0
      );

      if (!result.qrUrls.length) {
        toast.error('No se generaron QRs');
        return;
      }

      await downloadQrZip(result.qrUrls, 'qrs_vehiculos.zip');
      toast.success(`QRs generados y descargados: ${result.qrUrls.length}`);
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Error al generar QRs');
    }
  };

  const handleSingleSubmit = async (data: VehicleFormData) => {
    try {
      const validationError = validateVehicleForm(data);
      if (validationError) {
        toast.error(validationError);
        return;
      }

      if (modalMode === 'EDIT' && selectedVehicle) {
        await vehicleService.update(selectedVehicle.id, data);
        toast.success('Vehículo actualizado exitosamente');
      } else {
        await vehicleService.create(data);
        toast.success('Vehículo creado exitosamente');
      }
      await refetch();
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      const message = resolveVehicleErrorMessage(error);
      toast.error(message);
    }
  };

  const validateVehicleForm = (data: VehicleFormData) => {
    const trimmedVehicleId = data.vehicleid.trim();
    if (!trimmedVehicleId) return 'El ID del vehículo es obligatorio.';

    const plate = formatPlate(data.plate || '').trim();
    if (!plate) return 'La placa del vehículo es obligatoria.';

    const isSamePlateOnEdit = modalMode === 'EDIT'
      && !!selectedVehicle
      && normalizePlate(selectedVehicle.plate || '').trim().toUpperCase() === normalizePlate(data.plate || '').trim().toUpperCase();

    if (!isValidPlate(plate) && !isSamePlateOnEdit) {
      return 'La placa debe tener el formato ABC1234 (3 letras y 4 números).';
    }

    const capacityRaw = String(data.capacity ?? '').trim();
    if (!capacityRaw) return 'La capacidad es obligatoria.';
    const capacity = Number(capacityRaw);
    if (!Number.isFinite(capacity) || capacity < 0) {
      return 'La capacidad no puede ser un número negativo.';
    }

    const normalizedVehicleId = trimmedVehicleId.toUpperCase();
    const normalizedPlate = plate.toUpperCase();

    const existingVehicles = vehicles.filter(v => v.id !== selectedVehicle?.id);

    if (existingVehicles.some(v => (v.vehicleid || '').toUpperCase() === normalizedVehicleId)) {
      return 'El ID del vehículo ya existe. Usa uno diferente.';
    }

    if (existingVehicles.some(v => formatPlate(v.plate || '').toUpperCase() === normalizedPlate)) {
      return 'La placa ya está registrada. Usa una placa diferente.';
    }

    if (data.driverId && existingVehicles.some(v => v.driverId === data.driverId)) {
      return 'El conductor seleccionado ya está asignado a otro vehículo.';
    }

    if (data.qrcodeId && existingVehicles.some(v => v.qrcodeId === data.qrcodeId)) {
      return 'El código QR seleccionado ya está asignado a otro vehículo.';
    }

    return null;
  };

  const resolveVehicleErrorMessage = (error: unknown) => {
    const fallback = 'Error al guardar vehículo';
    if (!error || typeof error !== 'object') return fallback;

    const response = (error as { response?: { data?: unknown } }).response;
    const data = response?.data;

    if (typeof data === 'string') {
      return toFriendlyVehicleError(data);
    }

    if (data && typeof data === 'object') {
      const maybeMessage = (data as { message?: unknown; error?: unknown }).message;
      const maybeError = (data as { error?: unknown }).error;

      if (Array.isArray(maybeMessage)) {
        const combined = maybeMessage.filter(Boolean).join(' ');
        return toFriendlyVehicleError(combined || fallback);
      }

      if (typeof maybeMessage === 'string') {
        return toFriendlyVehicleError(maybeMessage);
      }

      if (typeof maybeError === 'string') {
        return toFriendlyVehicleError(maybeError);
      }
    }

    const fallbackMessage = (error as { message?: string }).message;
    if (fallbackMessage) return toFriendlyVehicleError(fallbackMessage);

    return fallback;
  };

  const toFriendlyVehicleError = (message: string) => {
    const normalized = message.toLowerCase();

    if (normalized.includes('unique') || normalized.includes('p2002')) {
      if (normalized.includes('plate') || normalized.includes('placa')) {
        return 'La placa ya está registrada. Usa una placa diferente.';
      }
      if (normalized.includes('vehicleid') || normalized.includes('id')) {
        return 'El ID del vehículo ya existe. Usa uno diferente.';
      }
      if (normalized.includes('driver') || normalized.includes('conductor')) {
        return 'El conductor ya está asignado a otro vehículo.';
      }
      if (normalized.includes('phone') || normalized.includes('telefono')) {
        return 'El teléfono del chofer ya está registrado.';
      }
      if (normalized.includes('qrcode') || normalized.includes('qrcodeid')) {
        return 'El código QR ya está asignado a otro vehículo.';
      }
      return 'Ya existe un registro con datos duplicados.';
    }

    if (normalized.includes('foreign key') || normalized.includes('constraint')) {
      if (normalized.includes('ownerid')) {
        return 'El proveedor seleccionado no es válido o fue eliminado.';
      }
      if (normalized.includes('qrcodeid')) {
        return 'El código QR seleccionado no es válido.';
      }
    }

    if (normalized.includes('required') || normalized.includes('missing')) {
      return 'Faltan campos obligatorios. Revisa el formulario.';
    }

    return message || 'Error al guardar vehículo';
  };

  const normalizeProviderName = (value: string) => (
    value
      .trim()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toUpperCase()
  );

  const getCompanyLabel = (row: Vehicle) => {
    const normalizedType = normalizeVehicleType(row.type);
    if (normalizedType === 'EXTERNO') return '—';

    const resolvedCompany =
      row.company ??
      inferVehicleCompany(`${row.owner?.companyname ?? ''} ${row.owner?.name ?? ''}`) ??
      inferVehicleCompany(row.vehicleid);

    if (resolvedCompany) return VEHICLE_COMPANY_LABELS[resolvedCompany];
    return '—';
  };

  const getProviderLabel = (row: Vehicle) => {
    const normalizedType = normalizeVehicleType(row.type);
    if (normalizedType === 'INTERNO') {
      return '—';
    }
    return row.owner?.companyname || '—';
  };

  const providerOptions = useMemo(() => {
    const providerMap = new Map<string, string>();

    vehicles.forEach(vehicle => {
      const label = getProviderLabel(vehicle);
      if (!label || label === '—') return;
      const normalized = normalizeProviderName(label);
      if (!providerMap.has(normalized)) {
        providerMap.set(normalized, label);
      }
    });

    return Array.from(providerMap.values()).map(label => ({ value: label, label }));
  }, [vehicles, getProviderLabel, normalizeProviderName]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm ||
        v.vehicleid.toLowerCase().includes(term) ||
        v.plate.toLowerCase().includes(term) ||
        v.brand.toLowerCase().includes(term) ||
        v.model.toLowerCase().includes(term) ||
        v.year.toString().includes(term) ||
        getCompanyLabel(v).toLowerCase().includes(term);

      const normalizedType = normalizeVehicleType(v.type);
      const matchesType = !selectedType || normalizedType === selectedType;
      const matchesProvider = !selectedProvider ||
        normalizeProviderName(getProviderLabel(v)) === normalizeProviderName(selectedProvider);
      const resolvedCompany = normalizedType === 'EXTERNO'
        ? null
        : (v.company ??
          inferVehicleCompany(v.owner?.companyname) ??
          inferVehicleCompany(v.vehicleid));
      const matchesCompany = !selectedCompany || resolvedCompany === selectedCompany;

      const hasQr = v.qrcodeId !== null && v.qrcodeId !== undefined
        ? true
        : !!v.qrcode;
      const matchesQr = !selectedQrStatus
        || (selectedQrStatus === 'assigned' && hasQr)
        || (selectedQrStatus === 'unassigned' && !hasQr);

      return matchesSearch && matchesType && matchesProvider && matchesCompany && matchesQr;
    });
  }, [vehicles, searchTerm, selectedType, selectedProvider, selectedCompany, selectedQrStatus]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedType, selectedProvider, selectedCompany, selectedQrStatus]);

  const totalVehicles = filteredVehicles.length;
  const totalPages = Math.max(1, Math.ceil(totalVehicles / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedVehicles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredVehicles.slice(start, start + pageSize);
  }, [filteredVehicles, currentPage, pageSize]);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const columns = [
    {
      header: 'ID',
      accessor: (row: Vehicle) => row.vehicleid || row.plate || '—',
    },
    {
      header: 'Placa',
      accessor: (row: Vehicle) => {
        const label = formatPlate(row.plate || '').trim();
        return label || '—';
      },
    },
    {
      header: 'Tipo',
      accessor: (row: Vehicle) => {
        const normalizedType = normalizeVehicleType(row.type);
        return normalizedType === 'INTERNO' ? 'Interno' : normalizedType === 'EXTERNO' ? 'Externo' : '—';
      },
    },
    { header: 'Marca', accessor: 'brand' as keyof Vehicle },
    { header: 'Modelo', accessor: 'model' as keyof Vehicle },
    {
      header: 'Empresa',
      accessor: (row: Vehicle) => getCompanyLabel(row),
    },
    {
      header: 'Proveedor',
      accessor: (row: Vehicle) => getProviderLabel(row),
    },
    {
      header: 'Conductor',
      accessor: (row: Vehicle) => row.driver?.name || 'Sin conductor',
    },
    {
      header: 'Capacidad',
      accessor: (row: Vehicle) => `${row.capacity ?? '—'} M³`,
    },
    {
      header: 'QR asignado',
      accessor: (row: Vehicle) => {
        const hasQr = row.qrcodeId !== null && row.qrcodeId !== undefined
          ? true
          : !!row.qrcode;
        const label = hasQr ? 'Sí' : 'No';
        const title = row.qrcode?.qrcode
          ? `QR: ${row.qrcode.qrcode}`
          : (hasQr ? 'QR asignado' : 'Sin QR');

        return (
          <span
            title={title}
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
              hasQr
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {label}
          </span>
        );
      },
    },
    {
      header: 'Estado',
      accessor: (row: Vehicle) => (
        <StatusBadge status={row.isActive !== false ? 'activo' as Status : 'inactivo' as Status} />
      ),
    },
    {
      header: 'Acciones',
      accessor: (row: Vehicle) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={<Pencil size={16} />}
            onClick={() => handleEdit(row)}
          >
            Editar
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<QrCode size={16} />}
            onClick={() => setQrConfirmVehicle(row)}
          >
            Descargar QR
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Vehículos</h1>
          <p className="text-gray-600 mt-1">Gestión de vehículos de la constructora</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            icon={<CarFront size={20} />}
            onClick={handleOpenSingle}
          >
            Crear Vehículo
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={20} />}
            onClick={handleOpenBatch}
          >
            Generar QR
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por placa, marca, modelo..."
              className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Select
            options={[
              { value: '', label: 'Todos los tipos' },
              { value: 'INTERNO', label: 'Interno' },
              { value: 'EXTERNO', label: 'Externo' },
            ]}
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as VehicleType | '')}
            hideDefaultOption
          />

          <Select
            options={[
              { value: '', label: 'Todas las empresas' },
              ...Object.entries(VEHICLE_COMPANY_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value as VehicleCompany | '')}
            hideDefaultOption
          />

          <SearchableSelect
            options={[{ value: '', label: 'Todos los proveedores' }, ...providerOptions]}
            value={selectedProvider}
            onChange={setSelectedProvider}
          />

          <Select
            options={[
              { value: '', label: 'QR asignado: todos' },
              { value: 'assigned', label: 'QR asignado' },
              { value: 'unassigned', label: 'QR no asignado' },
            ]}
            value={selectedQrStatus}
            onChange={(e) => setSelectedQrStatus(e.target.value as 'assigned' | 'unassigned' | '')}
            hideDefaultOption
          />
        </div>

        <Table data={paginatedVehicles} columns={columns} isLoading={isLoading} />
        <Pagination
          className="mt-4"
          total={totalVehicles}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      <Modal
        isOpen={!!qrConfirmVehicle}
        onClose={() => setQrConfirmVehicle(null)}
        title="Confirmar Descarga de QR"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600 font-medium">¿Deseas descargar el código QR para el vehículo <span className="font-bold text-gray-900">{qrConfirmVehicle?.plate}</span>?</p>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setQrConfirmVehicle(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmDownloadQr}
            >
              Confirmar y Descargar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          modalMode === 'BATCH' ? 'Generar Lote de QRs' :
          modalMode === 'EDIT' ? 'Editar Vehículo' : 'Registrar Nuevo Vehículo'
        }
        size="lg"
      >
        {modalMode === 'BATCH' ? (
          <VehicleBatchForm
            onSubmit={handleBatchSubmit}
            onCancel={() => setIsModalOpen(false)}
          />
        ) : (
          <VehicleForm
            vehicle={selectedVehicle}
            onSubmit={handleSingleSubmit}
            onCancel={() => setIsModalOpen(false)}
          />
        )}
      </Modal>
    </div>
  );
};
