import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Input } from '@/shared/components/Input';
import { Select } from '@/shared/components/Select';
import { Button } from '@/shared/components/Button';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { useVehicles } from '@/modules/vehicles/hooks/useVehicles';
import { usePlanificaciones } from '@/modules/planificacion/hooks/usePlanificaciones';
import { useTransportLogs } from '@/modules/registro-transporte/hooks/useTransportLogs';
import { useMateriales } from '@/modules/materiales/hooks/useMateriales';
import { materialOptions } from '@/modules/materiales/utils/materialLabels';
import { VehicleSelector } from '@/modules/planificacion/components/VehicleSelector';
import { useImageCompressor } from '@/shared/utils/useImageCompressor';
import toast from 'react-hot-toast';

interface TransportePlanFormProps {
  onSubmit?: (data: {
    registroType: 'SALIDA' | 'LLEGADA';
    departureM3?: number;
    materialType?: string;
    arrivalM3?: number;
    abscisa?: string;
    materialPhoto?: File | null;
    planningId: string;
    vehicleIds: string[];
  }) => Promise<void> | void;
  onCancel: () => void;
}

/** Mini-componente para mostrar info de compresión */
const CompressionBadge = ({
  originalKB,
  compressedKB,
  savings,
  wasCompressed,
}: {
  originalKB: number;
  compressedKB: number;
  savings: number;
  wasCompressed: boolean;
}) => {
  if (!wasCompressed) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded px-2 py-0.5">
        ✓ {compressedKB} KB · ya optimizada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5">
      ✓ Comprimida: {originalKB} KB → {compressedKB} KB
      <strong className="text-green-800">({savings}% menos)</strong>
    </span>
  );
};

export const TransportePlanForm = ({ onSubmit, onCancel }: TransportePlanFormProps) => {
  const { vehicles } = useVehicles();
  const { allPlanificaciones } = usePlanificaciones();
  const { transportLogs } = useTransportLogs();
  const { materiales } = useMateriales();
  const { compress, isCompressing } = useImageCompressor();

  // Estados del formulario
  const [registroType, setRegistroType] = useState<'SALIDA' | 'LLEGADA'>('SALIDA');
  const [departureM3, setDepartureM3] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [arrivalM3, setArrivalM3] = useState('');
  const [abscisa, setAbscisa] = useState('');
  const [materialPhoto, setMaterialPhoto] = useState<File | null>(null);
  const [materialPhotoInfo, setMaterialPhotoInfo] = useState<{
    originalKB: number;
    compressedKB: number;
    savings: number;
    wasCompressed: boolean;
    preview: string;
  } | null>(null);
  const [planningId, setPlanningId] = useState('');
  const [vehicleIds, setVehicleIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const occupiedByVehicle = useMemo(() => {
    return allPlanificaciones
      .filter((planning) => planning?.isActive !== false)
      .filter((planning) => !['COMPLETADO', 'CANCELADO'].includes(planning.status))
      .filter((planning) => String(planning.id) !== String(planningId))
      .reduce<Record<string, { planningId: string; planningName: string; constSiteName: string }>>(
        (acc, planning) => {
          const siteName = planning.constSite?.name || 'Obra sin nombre';
          const name = planning.planningCode || 'Planificación sin código';
          planning.vehicleIds?.forEach((vehicleId) => {
            acc[String(vehicleId)] = { planningId: planning.id, planningName: name, constSiteName: siteName };
          });
          return acc;
        },
        {}
      );
  }, [allPlanificaciones, planningId]);

  const planificacionOptions = useMemo(() =>
    allPlanificaciones.map((planning) => ({
      value: planning.id,
      label: `${planning.planningCode} - ${planning.constSite?.name || 'Sin Obra'} (${planning.description || 'Sin descripción'})`,
    })),
    [allPlanificaciones]
  );

  const assignedVehicles = useMemo(() => {
    if (!planningId) return [];
    if (registroType === 'SALIDA') {
      const selectedPlanning = allPlanificaciones.find((p) => String(p.id) === String(planningId));
      if (!selectedPlanning) return [];
      const assignedIds = (selectedPlanning.vehicleIds || []).map(String);
      return vehicles.filter((v) => assignedIds.includes(String(v.id)));
    } else {
      const activeLogs = transportLogs.filter(
        (log) =>
          String(log.planningId) === String(planningId) &&
          (log.status === 'IN_PROGRESS' || log.status === 'EN_PROGRESO')
      );
      const activeVehicleIds = activeLogs.map((log) => String(log.vehicleId));
      return vehicles.filter((v) => activeVehicleIds.includes(String(v.id)));
    }
  }, [registroType, planningId, allPlanificaciones, transportLogs, vehicles]);

  /** Comprime automáticamente la foto al seleccionarla */
  const handlePhotoChange = async (file: File | undefined) => {
    if (!file) {
      setMaterialPhoto(null);
      setMaterialPhotoInfo(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten archivos de imagen (JPEG, PNG, WebP, etc.).');
      return;
    }

    try {
      const result = await compress(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.82,
        maxSizeBytes: 800 * 1024,
      });

      if (!result) {
        toast.error('No se pudo comprimir la imagen, se usará el original.');
        setMaterialPhoto(file);
        setMaterialPhotoInfo(null);
        return;
      }

      const preview = URL.createObjectURL(result.file);
      setMaterialPhoto(result.file);
      setMaterialPhotoInfo({
        originalKB: result.originalSizeKB,
        compressedKB: result.compressedSizeKB,
        savings: result.savingsPercent,
        wasCompressed: result.wasCompressed,
        preview,
      });
    } catch (e) {
       toast.error('Error procesando imagen.');
    } 
  };

  // Escuchar el evento de pegar (Ctrl+C / Ctrl+V) a nivel de ventana para imágenes
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isCompressing) return;
      
      const pastedFiles = e.clipboardData?.files;
      if (pastedFiles && pastedFiles.length > 0) {
        const pastedFile = pastedFiles[0];
        if (pastedFile.type.startsWith('image/')) {
          handlePhotoChange(pastedFile);
        } else {
          toast.error('El archivo pegado no es una imagen válida.');
        }
      }
    };

    window.addEventListener('paste', handlePaste as EventListener);
    return () => {
      window.removeEventListener('paste', handlePaste as EventListener);
    };
  }, [isCompressing]);

  /**
   * Cuando el usuario cambia los M³ de salida, desmarcar automáticamente
   * cualquier vehículo ya seleccionado cuya capacidad sea insuficiente.
   */
  useEffect(() => {
    if (registroType !== 'SALIDA' || !departureM3) return;
    const volume = Number(departureM3);
    if (!volume || volume <= 0) return;

    const overCapacityIds = vehicleIds.filter((vid) => {
      const v = vehicles.find((veh) => String(veh.id) === vid);
      return v && (v.capacity ?? 0) < volume;
    });

    if (overCapacityIds.length > 0) {
      const plates = overCapacityIds
        .map((vid) => vehicles.find((veh) => String(veh.id) === vid)?.plate)
        .filter(Boolean)
        .join(', ');
      toast.error(
        `Se deseleccionó automáticamente: ${plates} — capacidad insuficiente para ${volume} m³.`,
        { duration: 4000 }
      );
      setVehicleIds((prev) => prev.filter((id) => !overCapacityIds.includes(id)));
    }
  }, [departureM3, registroType]);

  const handleToggleVehicle = (vehicleId: string) => {
    // Si ya está seleccionado, deseleccionar
    if (vehicleIds.includes(vehicleId)) {
      setVehicleIds([]);
      return;
    }

    // Validar antes de seleccionar
    const vehicle = vehicles.find((v) => String(v.id) === vehicleId);

    // SALIDA: validar capacidad
    if (registroType === 'SALIDA' && vehicle) {
      const volume = Number(departureM3);
      if (volume > 0 && (vehicle.capacity ?? 0) < volume) {
        toast.error(
          `El vehículo ${vehicle.plate} tiene capacidad de ${vehicle.capacity ?? 0} m³ — insuficiente para ${volume} m³.`,
          { duration: 4000 }
        );
        return;
      }
    }

    // LLEGADA: validar volumen vs salida registrada
    if (registroType === 'LLEGADA' && arrivalM3) {
      const volume = Number(arrivalM3);
      const activeLog = transportLogs.find(
        (log) =>
          String(log.planningId) === String(planningId) &&
          String(log.vehicleId) === String(vehicleId) &&
          (log.status === 'IN_PROGRESS' || log.status === 'EN_PROGRESO')
      );
      if (activeLog && activeLog.departureM3 < volume) {
        toast.error(`El volumen de llegada (${volume} m³) no puede superar el volumen de salida (${activeLog.departureM3} m³) del vehículo ${activeLog.vehicle?.plate || activeLog.vehicleId}.`);
        return;
      }
    }

    // Selección única: reemplaza cualquier selección anterior
    setVehicleIds([vehicleId]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (registroType === 'SALIDA') {
      if (!departureM3) { toast.error('Especifica la cantidad de metros cúbicos de salida.'); return; }
      if (!materialType) { toast.error('Selecciona el tipo de material.'); return; }
      const volume = Number(departureM3);
      for (const vehicleId of vehicleIds) {
        const vehicle = vehicles.find((v) => String(v.id) === vehicleId);
        if (vehicle && (vehicle.capacity ?? 0) < volume) {
          toast.error(`El vehículo con placa ${vehicle.plate} no tiene suficiente capacidad (${vehicle.capacity ?? 0} m³) para cargar ${volume} m³.`);
          return;
        }
      }
    } else {
      if (!arrivalM3) { toast.error('Especifica los metros cúbicos recibidos.'); return; }
      if (!abscisa) { toast.error('Especifica la abscisa de descarga.'); return; }
      const volume = Number(arrivalM3);
      for (const vehicleId of vehicleIds) {
        const activeLog = transportLogs.find(
          (log) =>
            String(log.planningId) === String(planningId) &&
            String(log.vehicleId) === String(vehicleId) &&
            (log.status === 'IN_PROGRESS' || log.status === 'EN_PROGRESO')
        );
        if (activeLog && activeLog.departureM3 < volume) {
          toast.error(`El volumen de llegada (${volume} m³) no puede superar el volumen de salida (${activeLog.departureM3} m³) registrado para el vehículo ${activeLog.vehicle?.plate || activeLog.vehicleId}.`);
          return;
        }
      }
    }

    if (!planningId) { toast.error('Por favor, selecciona una planificación.'); return; }
    if (!materialPhoto) { toast.error('Por favor, selecciona una foto del material.'); return; }
    if (vehicleIds.length === 0) { toast.error('Selecciona al menos un vehículo.'); return; }

    setIsSubmitting(true);
    try {
      if (onSubmit) {
        await onSubmit({
          registroType,
          departureM3: registroType === 'SALIDA' ? Number(departureM3) : undefined,
          materialType: registroType === 'SALIDA' ? materialType : undefined,
          arrivalM3: registroType === 'LLEGADA' ? Number(arrivalM3) : undefined,
          abscisa: registroType === 'LLEGADA' ? abscisa : undefined,
          materialPhoto,
          planningId,
          vehicleIds,
        });
      }
    } catch (err) {
      // El error ya es manejado por el callback onSubmit del padre
    } finally {
      setIsSubmitting(false);
    }
  };

  const materialTypeOptions = useMemo(() => materialOptions(materiales), [materiales]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Registro de Transporte *"
          value={registroType}
          onChange={(e) => {
            setRegistroType(e.target.value as 'SALIDA' | 'LLEGADA');
            setVehicleIds([]);
          }}
          options={[
            { value: 'SALIDA', label: 'REGISTRO DE SALIDA' },
            { value: 'LLEGADA', label: 'REGISTRO DE LLEGADA' },
          ]}
          hideDefaultOption
          required
        />

        <SearchableSelect
          label="Planificación *"
          placeholder="Buscar o seleccionar planificación..."
          value={planningId}
          onChange={(val) => {
            setPlanningId(val);
            setVehicleIds([]);
          }}
          options={planificacionOptions}
          required
          emptyMessage="No se encontraron planificaciones con ese nombre o código"
        />

        {registroType === 'SALIDA' ? (
          <>
            <Input
              label="M³ de Salida (Cantidad) *"
              type="number"
              min="0"
              step="0.01"
              value={departureM3}
              onChange={(e) => setDepartureM3(e.target.value)}
              required
              helperText="Cantidad de metros cúbicos cargados a la salida."
            />
            <Select
              label="Tipo de Material *"
              value={materialType}
              onChange={(e) => setMaterialType(e.target.value)}
              options={materialTypeOptions}
              required
            />
          </>
        ) : (
          <>
            <Input
              label="M³ Recibidos (Llegada) *"
              type="number"
              min="0"
              step="0.01"
              value={arrivalM3}
              onChange={(e) => setArrivalM3(e.target.value)}
              required
              helperText="Cantidad de metros cúbicos recibidos a la llegada."
            />
            <Input
              label="Abscisa de Descarga *"
              placeholder="Ej. km 12+300"
              value={abscisa}
              onChange={(e) => setAbscisa(e.target.value)}
              required
              helperText="Ubicación o abscisa donde se descarga el material."
            />
          </>
        )}

        {/* Foto del Material con compresión automática */}
        <div className="md:col-span-2">
          <Input
            label="Foto del Material *"
            type="file"
            accept="image/*"
            onChange={(e) => handlePhotoChange(e.target.files?.[0])}
            required
            helperText="Selecciona un archivo o pega una imagen directamente con Ctrl+V. Se comprimirá automáticamente."
            disabled={isCompressing}
          />

          {/* Spinner de compresión */}
          {isCompressing && (
            <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
              <svg
                className="animate-spin h-4 w-4 text-blue-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Comprimiendo imagen…
            </div>
          )}

          {/* Preview + métricas */}
          {!isCompressing && materialPhoto && materialPhotoInfo && (
            <div className="mt-2 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <img
                src={materialPhotoInfo.preview}
                alt="Preview material"
                className="w-16 h-16 object-cover rounded-lg border border-gray-200 shadow-sm flex-shrink-0"
              />
              <div className="flex flex-col gap-1">
                <p className="text-xs text-gray-500 font-medium truncate max-w-xs">{materialPhoto.name}</p>
                <CompressionBadge
                  originalKB={materialPhotoInfo.originalKB}
                  compressedKB={materialPhotoInfo.compressedKB}
                  savings={materialPhotoInfo.savings}
                  wasCompressed={materialPhotoInfo.wasCompressed}
                />
              </div>
            </div>
          )}

          {/* Fallback: foto seleccionada sin métricas */}
          {!isCompressing && materialPhoto && !materialPhotoInfo && (
            <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
              ✓ Foto seleccionada: {materialPhoto.name}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Vehículos Asignados <span className="text-red-500">*</span>
        </label>
        {planningId ? (
          assignedVehicles.length > 0 ? (
            <VehicleSelector
              availableVehicles={assignedVehicles}
              selectedVehicleIds={vehicleIds}
              onToggleVehicle={handleToggleVehicle}
              occupiedByVehicle={occupiedByVehicle}
            />
          ) : (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-700 text-center">
              ℹ️ No hay vehículos disponibles en este momento para la opción seleccionada.
              {registroType === 'LLEGADA' && ' (No hay viajes en progreso para esta planificación)'}
            </div>
          )
        ) : (
          <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-4 text-sm text-yellow-700 text-center animate-pulse">
            ⚠️ Por favor, selecciona una <strong>Planificación</strong> primero para ver los vehículos disponibles.
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="submit"
          variant="primary"
          isLoading={isSubmitting || isCompressing}
          disabled={vehicleIds.length === 0 || isCompressing}
        >
          Crear Registro
        </Button>
      </div>
    </form>
  );
};
