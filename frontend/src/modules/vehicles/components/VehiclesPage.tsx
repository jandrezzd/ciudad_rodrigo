import { useState, useMemo, useEffect } from 'react';
import JSZip from 'jszip';
import { Plus, Pencil, QrCode, Search, CarFront } from 'lucide-react';
import { useVehicles } from '../hooks/useVehicles';
import { vehicleService } from '../services/vehicleService';
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
import { formatPlate, isValidPlate, normalizePlate } from '@/shared/utils/validation';
import { usePermissions } from '@/modules/auth';
import { useDrivers } from '@/modules/drivers/hooks/useDrivers';

// Valor del filtro de conductor para los vehículos que no tienen uno asignado.
const SIN_CONDUCTOR = 'none';

export const VehiclesPage = () => {
  const { vehicles, isLoading, refetch } = useVehicles();
  const { drivers } = useDrivers();
  const { canCreate, canEdit } = usePermissions('vehicles');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'BATCH' | 'SINGLE' | 'EDIT'>('BATCH');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | undefined>();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<VehicleType | ''>('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<VehicleCompany | ''>('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [qrConfirmVehicle, setQrConfirmVehicle] = useState<Vehicle | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // QR elegido en el buscador (id) y QR libres, que no vienen en la lista de vehículos.
  const [selectedQrId, setSelectedQrId] = useState('');
  const [freeQrCodes, setFreeQrCodes] = useState<VehicleQRCode[]>([]);

  const loadFreeQrCodes = async () => {
    try {
      setFreeQrCodes(await vehicleService.getAvailableQRCodes());
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    loadFreeQrCodes();
  }, []);

  const resolveQrUrl = (rawUrl?: string | null) => {
    if (!rawUrl) return null;
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
    const normalized = rawUrl.replace(/^\/+/, '');
    const baseUrl = axiosInstance.defaults.baseURL ?? window.location.origin;
    const baseOrigin = new URL(baseUrl, window.location.origin).origin;
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
      loadFreeQrCodes();
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
        // Externos: el ID lo asigna el backend, no se manda uno vacío.
        const { vehicleid, ...rest } = data;
        const payload = data.type === 'EXTERNO' ? rest : data;
        await vehicleService.create(payload as VehicleFormData);
        toast.success('Vehículo creado exitosamente');
      }
      await refetch();
      loadFreeQrCodes();
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      const message = resolveVehicleErrorMessage(error);
      toast.error(message);
    }
  };

  const validateVehicleForm = (data: VehicleFormData) => {
    // Los externos nuevos no traen ID: lo genera el backend (TE-00001...).
    const esExternoNuevo = modalMode !== 'EDIT' && data.type === 'EXTERNO';
    const trimmedVehicleId = data.vehicleid.trim();
    if (!esExternoNuevo && !trimmedVehicleId) return 'El ID del vehículo es obligatorio.';

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

    if (!esExternoNuevo && existingVehicles.some(v => (v.vehicleid || '').toUpperCase() === normalizedVehicleId)) {
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

  // Todos los QR: los asignados (con su placa) y los libres.
  const qrOptions = useMemo(() => {
    const assigned = vehicles
      .filter(v => v.qrcode)
      .map(v => ({
        value: String(v.qrcode!.id),
        code: v.qrcode!.qrcode,
        label: `${v.qrcode!.qrcode} · ${formatPlate(v.plate || '') || v.vehicleid}`,
      }));
    const assignedIds = new Set(assigned.map(o => o.value));
    const free = freeQrCodes
      .filter(qr => !assignedIds.has(String(qr.id)))
      .map(qr => ({
        value: String(qr.id),
        code: qr.qrcode,
        label: `${qr.qrcode} · Libre`,
      }));
    return [...assigned, ...free].sort((a, b) =>
      a.code.localeCompare(b.code, 'es', { numeric: true }),
    );
  }, [vehicles, freeQrCodes]);

  // Conductores registrados, ordenados por nombre; se busca por nombre o cédula.
  const driverOptions = useMemo(() => {
    return [...drivers]
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map(d => ({
        value: String(d.id),
        label: [
          d.name,
          d.document ? `· ${d.document}` : '',
          d.isActive === false ? '(inactivo)' : '',
        ].filter(Boolean).join(' '),
      }));
  }, [drivers]);

  // QR libre elegido: no tiene vehículo, se muestra aparte de la tabla.
  const selectedFreeQr = useMemo(
    () => freeQrCodes.find(qr => String(qr.id) === selectedQrId) ?? null,
    [freeQrCodes, selectedQrId],
  );

  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm ||
        v.vehicleid.toLowerCase().includes(term) ||
        (v.qrcode?.qrcode ?? '').toLowerCase().includes(term) ||
        v.plate.toLowerCase().includes(term) ||
        (v.brand ?? '').toLowerCase().includes(term) ||
        (v.model ?? '').toLowerCase().includes(term) ||
        String(v.year ?? '').includes(term) ||
        (v.driver?.name ?? '').toLowerCase().includes(term) ||
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

      const matchesDriver = !selectedDriverId
        || (selectedDriverId === SIN_CONDUCTOR
          ? v.driverId == null
          : String(v.driverId ?? '') === selectedDriverId);
      const matchesQrCode = !selectedQrId || String(v.qrcodeId ?? '') === selectedQrId;

      return matchesSearch && matchesType && matchesProvider && matchesCompany && matchesDriver && matchesQrCode;
    });
  }, [vehicles, searchTerm, selectedType, selectedProvider, selectedCompany, selectedDriverId, selectedQrId]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedType, selectedProvider, selectedCompany, selectedDriverId, selectedQrId]);

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
    { header: 'Marca', accessor: (row: Vehicle) => row.brand || '—' },
    { header: 'Modelo', accessor: (row: Vehicle) => row.model || '—' },
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
      header: 'QR',
      accessor: (row: Vehicle) => {
        const hasQr = row.qrcodeId !== null && row.qrcodeId !== undefined
          ? true
          : !!row.qrcode;
        const label = hasQr ? (row.qrcode?.qrcode || 'Sí') : 'Sin QR';
        const title = row.qrcode?.qrcode
          ? `QR: ${row.qrcode.qrcode}`
          : (hasQr ? 'QR asignado' : 'Sin QR');

        return (
          <span
            title={title}
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
              hasQr
                ? 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300'
                : 'bg-gray-100 dark:bg-night-raised text-gray-700 dark:text-night-text'
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
            className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25 border-none"
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-night-text">Vehículos</h1>
          <p className="text-gray-600 dark:text-night-muted mt-1">Gestión de vehículos de la constructora</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25 border-none"
            icon={<CarFront size={20} />}
            onClick={handleOpenSingle}
            disabled={!canCreate}
            title={!canCreate ? 'Tu cargo no tiene permiso para crear vehículos' : undefined}
          >
            Crear Vehículo
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={20} />}
            onClick={handleOpenBatch}
            disabled={!canCreate}
            title={!canCreate ? 'Tu cargo no tiene permiso para crear vehículos' : undefined}
          >
            Generar QR
          </Button>
        </div>
      </div>

      {/* Tarjeta de Filtros con z-30 y desbordamiento libre */}
      <div className="bg-white dark:bg-night-surface p-4 rounded-xl shadow-sm border border-gray-100 dark:border-night-border relative z-30 overflow-visible">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400 dark:text-night-subtle" />
            </div>
            <input
              type="text"
              placeholder="Buscar por placa, QR, marca, conductor..."
              className="pl-10 w-full px-3 py-2 border border-gray-300 dark:border-night-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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

          <div className="relative z-40 overflow-visible">
            <SearchableSelect
              options={[{ value: '', label: 'Todos los proveedores' }, ...providerOptions]}
              value={selectedProvider}
              onChange={setSelectedProvider}
            />
          </div>

          <div className="relative z-40 overflow-visible">
            <SearchableSelect
              placeholder="Buscar conductor..."
              options={[
                { value: '', label: 'Todos los conductores' },
                { value: SIN_CONDUCTOR, label: 'Sin conductor' },
                ...driverOptions,
              ]}
              value={selectedDriverId}
              onChange={setSelectedDriverId}
              emptyMessage="No hay conductores con ese nombre"
            />
          </div>

          <div className="relative z-40 overflow-visible">
            <SearchableSelect
              placeholder="Buscar QR por número..."
              options={[{ value: '', label: 'Todos los QR' }, ...qrOptions]}
              value={selectedQrId}
              onChange={setSelectedQrId}
              emptyMessage="No hay QR con ese código"
            />
          </div>
        </div>

        {selectedFreeQr && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3">
            <p className="text-sm text-amber-900 dark:text-amber-300">
              El QR <span className="font-mono font-semibold">{selectedFreeQr.qrcode}</span> está
              libre: no está asignado a ningún vehículo. Puedes asignarlo al editar un vehículo.
            </p>
            <Button
              size="sm"
              variant="primary"
              icon={<QrCode size={16} />}
              onClick={() => {
                const url = resolveQrUrl(selectedFreeQr.url);
                if (url) downloadQrImage(url, `QR_${selectedFreeQr.qrcode}.png`);
              }}
            >
              Descargar QR
            </Button>
          </div>
        )}
      </div>

      {/* Tarjeta de Tabla y Paginación aislada con z-10 */}
      <div className="bg-white dark:bg-night-surface rounded-xl shadow-sm border border-gray-100 dark:border-night-border p-4 relative z-10">
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
          <p className="text-gray-600 dark:text-night-muted font-medium">¿Deseas descargar el código QR para el vehículo <span className="font-bold text-gray-900 dark:text-night-text">{qrConfirmVehicle?.plate}</span>?</p>
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
            canSave={modalMode === 'EDIT' ? canEdit : canCreate}
          />
        )}
      </Modal>
    </div>
  );
};
