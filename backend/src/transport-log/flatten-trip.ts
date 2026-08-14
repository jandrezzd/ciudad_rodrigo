export const TRIP_FULL_INCLUDE = {
  departure: true,
  arrival: true,
  vehicle: true,
  owner: true,
  client: true,
  constSite: true,
  material: true,
  cantera: { include: { materialProvider: true } },
  planning: {
    include: {
      vehicles: true,
      canteras: { include: { cantera: { include: { materialProvider: true } } } }
    }
  },
  user: { select: { id: true, name: true } },
  userArrival: { select: { id: true, name: true } },
} as const;

export function flattenTrip(t: any) {
  if (!t) return t;

  return {
    ...t,
    // Compatibilidad para TransportLog.departureM3...
    departureM3: t.departure?.m3,
    departureM3Corrected: t.departure?.m3Corrected,
    departureLat: t.departure?.lat,
    departureLng: t.departure?.lng,
    departureDriverPhoto: t.departure?.driverPhoto,
    departureVehiclePhoto: t.departure?.vehiclePhoto,
    departurePlatePhoto: t.departure?.platePhoto,
    departureMaterialPhoto1: t.departure?.materialPhoto1,
    departureMaterialPhoto2: t.departure?.materialPhoto2,

    // Compatibilidad para TransportLog.arrivalM3...
    arrivalM3: t.arrival?.m3,
    arrivalM3Corrected: t.arrival?.m3Corrected,
    arrivalLat: t.arrival?.lat,
    arrivalLng: t.arrival?.lng,
    abscisa: t.arrival?.abscisa,
    arrivalDriverPhoto: t.arrival?.driverPhoto,
    arrivalVehiclePhoto: t.arrival?.vehiclePhoto,
    arrivalPlatePhoto: t.arrival?.platePhoto,
    arrivalMaterialPhoto1: t.arrival?.materialPhoto1,
    arrivalMaterialPhoto2: t.arrival?.materialPhoto2,
    
    // Metadatos adicionales offline
    departureSource: t.departure?.source,
    departureCapturedAt: t.departure?.capturedAt,
    arrivalSource: t.arrival?.source,
    arrivalCapturedAt: t.arrival?.capturedAt,
  };
}

export const flattenTrips = (rows: any[]) => rows.map(flattenTrip);
