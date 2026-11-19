export const TRIP_FULL_INCLUDE = {
  departure: true,
  // Planificación elegida en obra; puede diferir de la del viaje.
  arrival: {
    include: {
      planning: {
        select: {
          id: true,
          planningCode: true,
          constSite: { select: { name: true } },
          ubicacionLlegadaLat: true,
          ubicacionLlegadaM: true,
          radioLlegadaM: true,
        },
      },
    },
  },
  vehicle: true,
  owner: true,
  client: true,
  constSite: true,
  material: true,
  cantera: { include: { materialProvider: true } },
  driver: true,
  planning: {
    include: {
      vehicles: true,
      canteras: {
        include: { cantera: { include: { materialProvider: true } } },
      },
    },
  },
  user: { select: { id: true, name: true } },
  userArrival: { select: { id: true, name: true } },
  // Auditoría: quién emparejó a mano (null = lo hizo el barrido automático) y
  // quién corrigió el material por última vez.
  matchedBy: { select: { id: true, name: true } },
  materialCorregidoPor: { select: { id: true, name: true } },
} as const;

// "Ubicación de llegada más precisa" ya calculada y guardada en la llegada
function armarUbicacionLlegada(arrival: any, planificacion: any) {
  if (!arrival?.ubicacionCalculadaEn) return null;
  const detalle = (arrival.ubicacionDetalle ?? {}) as Record<string, any>;
  const tieneReferencia =
    planificacion?.ubicacionLlegadaLat != null &&
    planificacion?.ubicacionLlegadaLng != null;

  return {
    lat: arrival.ubicacionLat ?? null,
    lng: arrival.ubicacionLng ?? null,
    precisionM: arrival.ubicacionPrecisionM ?? null,
    distanciaReferenciaM: arrival.ubicacionDistanciaRefM ?? null,
    dentroDelRadio: arrival.ubicacionDentroRadio ?? null,
    metodo: detalle.metodo ?? null,
    aviso: detalle.aviso ?? null,
    radioM: detalle.radioM ?? null,
    lecturas: Array.isArray(detalle.lecturas) ? detalle.lecturas : [],
    referencia: tieneReferencia
      ? {
          lat: planificacion.ubicacionLlegadaLat,
          lng: planificacion.ubicacionLlegadaLng,
        }
      : null,
    calculadaEn: arrival.ubicacionCalculadaEn,
  };
}

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
    // Observación del supervisor de cantera, capturada al registrar la salida.
    departureObservation: t.departure?.observation,

    // Compatibilidad para TransportLog.arrivalM3...
    arrivalM3: t.arrival?.m3,
    arrivalM3Corrected: t.arrival?.m3Corrected,
    arrivalLat: t.arrival?.lat,
    arrivalLng: t.arrival?.lng,
    arrivalGpsPrecisionM: t.arrival?.gpsPrecisionM ?? null,
    // Referencia a la ubicación elegida en obra, si no hay, la del viaje
    ubicacionLlegada: armarUbicacionLlegada(
      t.arrival,
      t.arrival?.planning ?? t.planning,
    ),
    abscisa: t.arrival?.abscisa,
    arrivalDriverPhoto: t.arrival?.driverPhoto,
    arrivalVehiclePhoto: t.arrival?.vehiclePhoto,
    arrivalPlatePhoto: t.arrival?.platePhoto,
    arrivalMaterialPhoto1: t.arrival?.materialPhoto1,
    arrivalMaterialPhoto2: t.arrival?.materialPhoto2,
    // Observación del supervisor de obra, capturada al registrar la llegada.
    arrivalObservation: t.arrival?.observation,

    // Metadatos adicionales offline
    departureSource: t.departure?.source,
    departureCapturedAt: t.departure?.capturedAt,
    arrivalSource: t.arrival?.source,
    arrivalCapturedAt: t.arrival?.capturedAt,
  };
}

export const flattenTrips = (rows: any[]) => rows.map(flattenTrip);
