// Constantes de negocio del emparejamiento salida<->llegada por ventana de
// tiempo. No configurables por planificación todavía; candidatas a moverse a
// Planning si el negocio lo pide más adelante.

/** Un vehículo puede llegar hasta 10 min antes de la hora esperada. */
export const EARLY_TOLERANCE_MIN = 10;

/** Un vehículo puede llegar hasta 25 min después de la hora esperada. */
export const LATE_TOLERANCE_MIN = 25;

/** Duración fija del almuerzo, se resta del tiempo esperado cuando aplica. */
export const LUNCH_DURATION_MIN = 60;

/**
 * TransportArrivalPending sin match después de este tiempo se marca EXPIRADO
 * (solo informativo para la cola de revisión; sigue siendo emparejable a mano).
 */
export const PENDING_ARRIVAL_EXPIRATION_DAYS = 7;
