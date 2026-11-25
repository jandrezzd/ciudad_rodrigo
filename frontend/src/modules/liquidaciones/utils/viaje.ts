import {
  VEHICLE_COMPANY_LABELS,
  VehicleCompany,
  inferVehicleCompany,
} from '@/modules/vehicles/types';

/** Tiempo entre salida y llegada: "45m", "1h 20m" o "—". */
export const getDuration = (start?: string | null, end?: string | null) => {
  if (!start || !end) return '—';
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (isNaN(startTime) || isNaN(endTime)) return '—';
  const diffMs = endTime - startTime;
  if (diffMs < 0) return '—';
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (diffHours === 0) return `${diffMinutes}m`;
  return `${diffHours}h ${diffMinutes}m`;
};

/** Empresa del vehículo: la registrada o la que se deduce del dueño o del ID. */
export const etiquetaEmpresa = (datos: {
  company?: VehicleCompany | null;
  ownerCompany?: string | null;
  ownerName?: string | null;
  vehicleid?: string | null;
}) => {
  const empresa =
    datos.company ??
    inferVehicleCompany(`${datos.ownerCompany ?? ''} ${datos.ownerName ?? ''}`) ??
    inferVehicleCompany(datos.vehicleid);
  return empresa ? VEHICLE_COMPANY_LABELS[empresa] : '—';
};
