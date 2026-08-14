import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Vehicle,
  VehicleCompany,
  VehicleType,
  VEHICLE_COMPANY_LABELS,
  inferVehicleCompany,
  normalizeVehicleType,
} from '@/modules/vehicles/types';
import { Input } from '@/shared/components/Input';
import { Select } from '@/shared/components/Select';
import { Modal } from '@/shared/components/Modal';
import { Button } from '@/shared/components/Button';
import { Check, X } from 'lucide-react';
import { DriverSelector } from './DriverSelector';
import { CanteraSelector, CanteraOption } from './CanteraSelector';

interface VehicleSelectorProps {
  availableVehicles: Vehicle[];
  selectedVehicleIds: string[];
  onToggleVehicle: (vehicleId: string) => void;
  occupiedByVehicle: Record<string, { planningId: string; planningName: string; constSiteName: string }>;
  onDriverChanged?: () => void;
  /** Canteras de la planificación, para asignar una a cada vehículo */
  canteras?: CanteraOption[];
  canteraByVehicle?: Record<string, string | null>;
  onCanteraChange?: (vehicleId: string, canteraId: string | null) => void;
}

export const VehicleSelector = ({
  availableVehicles,
  selectedVehicleIds,
  onToggleVehicle,
  occupiedByVehicle,
  onDriverChanged,
  canteras = [],
  canteraByVehicle = {},
  onCanteraChange,
}: VehicleSelectorProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [idFilter, setIdFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<VehicleType | ''>('');
  const [companyFilter, setCompanyFilter] = useState<VehicleCompany | ''>('');
  const [providerFilter, setProviderFilter] = useState('');
  const [pendingVehicle, setPendingVehicle] = useState<Vehicle | null>(null);
  const [pendingOccupied, setPendingOccupied] = useState<{ planningName: string; constSiteName: string } | null>(null);
  const [visibleAvailableCount, setVisibleAvailableCount] = useState(60);
  const [visibleOccupiedCount, setVisibleOccupiedCount] = useState(30);

  const safeVehicles = Array.isArray(availableVehicles) ? availableVehicles : [];
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const normalizedSearch = deferredSearchTerm.toLowerCase();
  const normalizedIdFilter = idFilter.toLowerCase();
  const normalizedProviderFilter = providerFilter.toLowerCase();

  const toVehicleId = (id: number) => String(id);
  const getOccupiedInfo = (vehicle: Vehicle) => occupiedByVehicle[toVehicleId(vehicle.id)];
  const isSelected = (id: number) => selectedVehicleIds.includes(toVehicleId(id));
  const formatType = (type: Vehicle['type']) => (normalizeVehicleType(type) === 'INTERNO' ? 'Interno' : 'Externo');
  const getCompanyLabel = (vehicle: Vehicle) => {
    const resolvedCompany =
      vehicle.company ??
      inferVehicleCompany(`${vehicle.owner?.companyname ?? ''} ${vehicle.owner?.name ?? ''}`) ??
      inferVehicleCompany(vehicle.vehicleid);

    if (resolvedCompany) return VEHICLE_COMPANY_LABELS[resolvedCompany];
    return vehicle.owner?.companyname || 'Sin empresa';
  };
  const getProviderLabel = (vehicle: Vehicle) => vehicle.owner?.companyname || 'Sin proveedor';
  const hasQR = (vehicle: Vehicle) => Boolean(vehicle.qrcodeId || vehicle.qrcode?.qrcode || vehicle.qrcode?.url);
  const getOrgLabel = (vehicle: Vehicle) => (normalizeVehicleType(vehicle.type) === 'INTERNO' ? 'Empresa' : 'Proveedor');
  const getOrgValue = (vehicle: Vehicle) => (normalizeVehicleType(vehicle.type) === 'INTERNO'
    ? getCompanyLabel(vehicle)
    : getProviderLabel(vehicle)
  );

  const matchesSearch = (vehicle: Vehicle) =>
    (vehicle.plate ?? '').toLowerCase().includes(normalizedSearch) ||
    (vehicle.brand ?? '').toLowerCase().includes(normalizedSearch) ||
    (vehicle.model ?? '').toLowerCase().includes(normalizedSearch) ||
    (vehicle.owner?.companyname ?? '').toLowerCase().includes(normalizedSearch) ||
    (vehicle.vehicleid ?? '').toLowerCase().includes(normalizedSearch);

  const matchesId = (vehicle: Vehicle) =>
    !normalizedIdFilter || (vehicle.vehicleid ?? '').toLowerCase().includes(normalizedIdFilter);

  const matchesType = (vehicle: Vehicle) =>
    !typeFilter || normalizeVehicleType(vehicle.type) === typeFilter;

  const matchesCompany = (vehicle: Vehicle) => {
    if (!companyFilter) return true;
    if (normalizeVehicleType(vehicle.type) !== 'INTERNO') return false;
    const resolvedCompany =
      vehicle.company ??
      inferVehicleCompany(vehicle.owner?.companyname) ??
      inferVehicleCompany(vehicle.vehicleid);
    return resolvedCompany === companyFilter;
  };

  const matchesProvider = (vehicle: Vehicle) => {
    if (!normalizedProviderFilter) return true;
    if (normalizeVehicleType(vehicle.type) !== 'EXTERNO') return false;
    return getProviderLabel(vehicle).toLowerCase().includes(normalizedProviderFilter);
  };

  const filteredVehicles = useMemo(
    () => safeVehicles
      .filter((v) => v.isActive !== false)
      .filter((vehicle) =>
        matchesSearch(vehicle)
        && matchesId(vehicle)
        && matchesType(vehicle)
        && matchesCompany(vehicle)
        && matchesProvider(vehicle)
      ),
    [safeVehicles, normalizedSearch, normalizedIdFilter, typeFilter, companyFilter, normalizedProviderFilter]
  );

  const availableVehiclesList = useMemo(
    () => filteredVehicles.filter((vehicle) => !occupiedByVehicle[toVehicleId(vehicle.id)]),
    [filteredVehicles, occupiedByVehicle]
  );

  const occupiedVehiclesList = useMemo(
    () => filteredVehicles.filter((vehicle) => Boolean(occupiedByVehicle[toVehicleId(vehicle.id)])),
    [filteredVehicles, occupiedByVehicle]
  );

  const visibleAvailableVehicles = useMemo(
    () => availableVehiclesList.slice(0, visibleAvailableCount),
    [availableVehiclesList, visibleAvailableCount]
  );

  const visibleOccupiedVehicles = useMemo(
    () => occupiedVehiclesList.slice(0, visibleOccupiedCount),
    [occupiedVehiclesList, visibleOccupiedCount]
  );

  useEffect(() => {
    setVisibleAvailableCount(60);
    setVisibleOccupiedCount(30);
  }, [normalizedSearch, normalizedIdFilter, typeFilter, companyFilter, normalizedProviderFilter]);

  const typeOptions = [
    { value: '', label: 'Todos los tipos' },
    { value: 'INTERNO', label: 'Interno' },
    { value: 'EXTERNO', label: 'Externo' },
  ];

  const companyOptions = Object.entries(VEHICLE_COMPANY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const providerOptions = useMemo(
    () => Array.from(
      new Set(
        safeVehicles
          .filter((vehicle) => normalizeVehicleType(vehicle.type) === 'EXTERNO')
          .map((vehicle) => getProviderLabel(vehicle))
          .filter((value) => value && value !== 'Sin proveedor')
      )
    ).map((value) => ({ value, label: value })),
    [safeVehicles]
  );

  const companySelectOptions = [{ value: '', label: 'Todas las empresas' }, ...companyOptions];
  const providerSelectOptions = [{ value: '', label: 'Todos los proveedores' }, ...providerOptions];

  const handleSelectVehicle = (vehicle: Vehicle) => {
    const vehicleId = toVehicleId(vehicle.id);
    const currentlySelected = selectedVehicleIds.includes(vehicleId);
    if (currentlySelected) {
      onToggleVehicle(vehicleId);
      return;
    }

    const occupied = getOccupiedInfo(vehicle);
    if (occupied) {
      setPendingVehicle(vehicle);
      setPendingOccupied({
        planningName: occupied.planningName,
        constSiteName: occupied.constSiteName,
      });
      return;
    }

    onToggleVehicle(vehicleId);
  };

  const handleCancelOccupied = () => {
    setPendingVehicle(null);
    setPendingOccupied(null);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2 items-end">
        <div className="sm:max-w-xs xl:max-w-[220px]">
          <Input
            placeholder="Buscar por placa, marca o modelo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="py-1.5 text-sm"
          />
        </div>
        <div className="sm:max-w-[150px] xl:max-w-[140px]">
          <Input
            placeholder="Buscar ID"
            value={idFilter}
            onChange={(e) => setIdFilter(e.target.value)}
            className="py-1.5 text-sm"
          />
        </div>
        <div className="sm:max-w-[150px] xl:max-w-[140px]">
          <Select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as VehicleType | '');
              setCompanyFilter('');
              setProviderFilter('');
            }}
            options={typeOptions}
            hideDefaultOption
          />
        </div>
        <div className="sm:max-w-[190px] xl:max-w-[180px]">
          <Select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value as VehicleCompany | '')}
            options={companySelectOptions}
            hideDefaultOption
            disabled={typeFilter === 'EXTERNO'}
          />
        </div>
        <div className="sm:max-w-[190px] xl:max-w-[180px]">
          <Select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            options={providerSelectOptions}
            hideDefaultOption
            disabled={typeFilter === 'INTERNO'}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2 text-sm text-blue-900">
        <span><strong>{availableVehiclesList.length}</strong> disponibles</span>
        <span className="text-blue-300">•</span>
        <span><strong>{occupiedVehiclesList.length}</strong> ocupados</span>
        <span className="text-blue-300">•</span>
        <span><strong>{selectedVehicleIds.length}</strong> seleccionados</span>
      </div>

      <div className="max-h-96 overflow-y-auto space-y-4">
        {visibleAvailableVehicles.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-green-700 mb-2">Vehículos disponibles</h4>
            <div className="space-y-2">
              {visibleAvailableVehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  onClick={() => handleSelectVehicle(vehicle)}
                  className={`
                    p-3 rounded-lg border-2 cursor-pointer transition-all
                    ${isSelected(vehicle.id)
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-green-300 hover:bg-gray-50'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">
                            {vehicle.plate} <span className="text-gray-500">·</span> {vehicle.brand || 'Sin marca'}
                          </span>
                          <span className="text-sm px-2 py-0.5 bg-green-100 text-green-800 rounded">
                            Activo
                          </span>
                          {getOccupiedInfo(vehicle) && (
                            <span className="text-sm px-2 py-0.5 bg-orange-100 text-orange-800 rounded">
                              Ocupado
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">QR: {hasQR(vehicle) ? 'Asignado' : 'No asignado'}</span>
                      </div>

                      {getOccupiedInfo(vehicle) && (
                        <p className="text-xs text-orange-700 mt-2">
                          Ocupado en: <strong>{getOccupiedInfo(vehicle)?.planningName}</strong> — {getOccupiedInfo(vehicle)?.constSiteName}
                        </p>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-2 text-xs text-gray-700">
                        <div>
                          <span className="font-semibold">ID:</span> {vehicle.vehicleid}
                        </div>
                        <div>
                          <span className="font-semibold">Tipo:</span> {formatType(vehicle.type)}
                        </div>
                        <div className="md:col-span-2">
                          <span className="font-semibold">{getOrgLabel(vehicle)}:</span> {getOrgValue(vehicle)}
                        </div>
                        <div>
                          <span className="font-semibold">Modelo:</span> {vehicle.model || 'Sin modelo'}
                        </div>
                        <div>
                          <span className="font-semibold">Capacidad:</span> {vehicle.capacity} M³
                        </div>
                      </div>

                      {isSelected(vehicle.id) && (
                        <div className="mt-3 pt-3 border-t border-dashed border-green-300" onClick={(e) => e.stopPropagation()}>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <DriverSelector
                              vehicle={vehicle}
                              allVehicles={safeVehicles}
                              onDriverChanged={onDriverChanged}
                            />
                            {onCanteraChange && (
                              <CanteraSelector
                                canteras={canteras}
                                value={canteraByVehicle[toVehicleId(vehicle.id)] ?? null}
                                onChange={(canteraId) =>
                                  onCanteraChange(toVehicleId(vehicle.id), canteraId)
                                }
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    {isSelected(vehicle.id) && (
                      <div className="ml-3 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <Check size={16} className="text-white" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {availableVehiclesList.length > visibleAvailableCount && (
              <div className="mt-3 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setVisibleAvailableCount((prev) => prev + 60)}
                >
                  Mostrar más disponibles ({availableVehiclesList.length - visibleAvailableCount} restantes)
                </Button>
              </div>
            )}
          </div>
        )}

        {visibleOccupiedVehicles.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-orange-700 mb-2">Vehículos ocupados</h4>
            <div className="space-y-2">
              {visibleOccupiedVehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  onClick={() => handleSelectVehicle(vehicle)}
                  className={`
                    p-3 rounded-lg border-2 cursor-pointer transition-all
                    ${isSelected(vehicle.id)
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-orange-300 hover:bg-gray-50'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">
                            {vehicle.plate} <span className="text-gray-500">·</span> {vehicle.brand || 'Sin marca'}
                          </span>
                          <span className="text-sm px-2 py-0.5 bg-orange-100 text-orange-800 rounded">
                            Ocupado
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">QR: {hasQR(vehicle) ? 'Asignado' : 'No asignado'}</span>
                      </div>

                      {getOccupiedInfo(vehicle) && (
                        <p className="text-xs text-orange-700 mt-2">
                          Ocupado en: <strong>{getOccupiedInfo(vehicle)?.planningName}</strong> — {getOccupiedInfo(vehicle)?.constSiteName}
                        </p>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-2 text-xs text-gray-700">
                        <div>
                          <span className="font-semibold">ID:</span> {vehicle.vehicleid}
                        </div>
                        <div>
                          <span className="font-semibold">Tipo:</span> {formatType(vehicle.type)}
                        </div>
                        <div className="md:col-span-2">
                          <span className="font-semibold">{getOrgLabel(vehicle)}:</span> {getOrgValue(vehicle)}
                        </div>
                        <div>
                          <span className="font-semibold">Modelo:</span> {vehicle.model || 'Sin modelo'}
                        </div>
                        <div>
                          <span className="font-semibold">Capacidad:</span> {vehicle.capacity} M³
                        </div>
                      </div>

                      {isSelected(vehicle.id) && (
                        <div className="mt-3 pt-3 border-t border-dashed border-green-300" onClick={(e) => e.stopPropagation()}>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <DriverSelector
                              vehicle={vehicle}
                              allVehicles={safeVehicles}
                              onDriverChanged={onDriverChanged}
                            />
                            {onCanteraChange && (
                              <CanteraSelector
                                canteras={canteras}
                                value={canteraByVehicle[toVehicleId(vehicle.id)] ?? null}
                                onChange={(canteraId) =>
                                  onCanteraChange(toVehicleId(vehicle.id), canteraId)
                                }
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    {isSelected(vehicle.id) && (
                      <div className="ml-3 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <Check size={16} className="text-white" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {occupiedVehiclesList.length > visibleOccupiedCount && (
              <div className="mt-3 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setVisibleOccupiedCount((prev) => prev + 30)}
                >
                  Mostrar más ocupados ({occupiedVehiclesList.length - visibleOccupiedCount} restantes)
                </Button>
              </div>
            )}
          </div>
        )}
        {filteredVehicles.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            No se encontraron vehículos
          </p>
        )}
      </div>

      {selectedVehicleIds.length > 0 && (
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <strong>{selectedVehicleIds.length}</strong> {selectedVehicleIds.length === 1 ? 'vehículo seleccionado' : 'vehículos seleccionados'}.
          {' '}Puedes cambiar o mantener su conductor directamente en la misma tarjeta.
        </div>
      )}

      <Modal
        isOpen={!!pendingVehicle && !!pendingOccupied}
        onClose={handleCancelOccupied}
        title="Vehículo ocupado"
        size="sm"
        footer={(
          <>
            <Button variant="primary" onClick={handleCancelOccupied}>
              Entendido
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          <p className="text-gray-700">
            Este vehículo ya está asignado a otra planificación y no puede
            ser agregado a dos obras al mismo tiempo.
          </p>
          <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
            <p>
              <strong>Planificación:</strong> {pendingOccupied?.planningName}
            </p>
            <p>
              <strong>Obra:</strong> {pendingOccupied?.constSiteName}
            </p>
          </div>
          <p className="text-sm text-gray-600">
            Si deseas usarlo aquí, primero quítalo de la otra planificación.
          </p>
        </div>
      </Modal>
    </div>
  );
};
