// Constantes de negocio del emparejamiento salida<->llegada.
//
// Se leen de entorno con un default razonable: son valores que hay que calibrar
// con datos reales de producción (ver
// backend/prisma/scripts/calibracion-emparejamiento.sql) y conviene poder
// ajustarlos sin volver a desplegar.

const numeroDeEntorno = (nombre: string, porDefecto: number): number => {
  const crudo = process.env[nombre];
  if (!crudo) return porDefecto;
  const valor = Number(crudo);
  return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
};

/**
 * Qué algoritmo usa el emparejamiento automático.
 *
 * - `window` — criterio viejo (ventana derivada de tiempoPromedioViajeMin).
 *   Interruptor de emergencia: vuelve al comportamiento previo sin desplegar.
 * - `shadow` — DEFAULT al desplegar. Empareja de verdad con el criterio viejo
 *   (riesgo cero, comportamiento idéntico al de hoy) y además calcula el nuevo
 *   en SOLO LECTURA, registrando cada divergencia en el log. Sirve para medir
 *   el cambio contra la operación real antes de activarlo.
 * - `gap` — criterio nuevo (menor diferencia de tiempo) activo.
 *
 * Cambiar de `shadow` a `gap` (o volver a `window`) es cambiar esta variable y
 * reiniciar. Cambiar el algoritmo de emparejamiento de todo el sistema de golpe
 * y sin vuelta atrás sería la forma más cara de descubrir un error.
 */
export type ReconciliationMode = 'window' | 'shadow' | 'gap';

export const RECONCILIATION_MODE: ReconciliationMode = (() => {
  const crudo = (process.env.RECONCILIATION_MODE || '').toLowerCase();
  if (crudo === 'window' || crudo === 'shadow' || crudo === 'gap') return crudo;
  return 'shadow';
})();

/**
 * Gap "prácticamente idéntico" entre el mejor y el segundo mejor candidato: no
 * se auto-resuelve, se deja para el siguiente barrido o para revisión manual.
 *
 * Calibrar con la consulta 2 del script: debe quedar por DEBAJO del percentil 1
 * de la separación real entre salidas consecutivas del mismo vehículo. Si dos
 * salidas legítimas nunca se acercan a menos de N minutos, un margen menor a N
 * no puede bloquear un emparejamiento válido.
 */
export const TIE_MARGIN_MIN = numeroDeEntorno('RECONCILIATION_TIE_MARGIN_MIN', 3);

/**
 * Separación máxima entre una salida y una llegada para que el sistema las
 * empareje SOLO. Más allá de esto no adivina: la llegada queda en la cola de
 * conciliación y decide un ADMIN.
 *
 * Sin este techo, el motor tomaba la salida abierta anterior más cercana sin
 * importar cuán lejos estuviera. El 07/09/2026 eso emparejó llegadas de ese día
 * con salidas del 04/09 que habían quedado abiertas: tres días de separación,
 * imposible para un viaje cantera->obra que dura horas. Como esas salidas
 * viejas eran las únicas candidatas del vehículo, el motor las eligió.
 *
 * Se mide entre `capturedAt` de la llegada y `departureAt` de la salida — las
 * horas REALES de los eventos, no las de sincronización. Una llegada que
 * sincroniza tres días tarde por haber estado sin señal se sigue emparejando
 * bien: lo que cuenta es cuándo ocurrió, no cuándo llegó al servidor.
 */
export const MAX_MATCH_GAP_HOURS = numeroDeEntorno(
  'RECONCILIATION_MAX_MATCH_GAP_HOURS',
  12,
);

/**
 * Salida sin llegada por más de este tiempo: se marca PENDIENTE_EMPAREJAMIENTO.
 * Es solo una señal de atención para el administrador, NO es terminal — el
 * emparejamiento la sigue intentando igual.
 *
 * Calibrar con la consulta 1 del script: el percentil 99 del gap real
 * salida→llegada, redondeado hacia arriba.
 */
export const OPEN_TRIP_ATTENTION_HOURS = numeroDeEntorno(
  'RECONCILIATION_OPEN_TRIP_ATTENTION_HOURS',
  24,
);

/**
 * TransportArrivalPending sin match después de este tiempo se marca EXPIRADO
 * (solo informativo para la cola de revisión; sigue siendo emparejable a mano).
 */
export const PENDING_ARRIVAL_EXPIRATION_DAYS = numeroDeEntorno(
  'RECONCILIATION_PENDING_EXPIRATION_DAYS',
  7,
);

/**
 * Dos registros del mismo vehículo y del mismo tipo separados por menos de este
 * tiempo son el mismo evento cargado dos veces, no dos vueltas distintas.
 *
 * Deliberadamente NO se rechaza "una segunda salida con viaje abierto" en
 * general: varias vueltas simultáneas del mismo vehículo trabajando offline son
 * legítimas y el algoritmo por menor gap depende de que lo sigan siendo. El
 * duplicado real tiene firma temporal, no de estado.
 *
 * Validar con la consulta 2b del script antes de confiar en el valor: si en la
 * operación real hay salidas legítimas separadas por menos de 10 min, hay que
 * bajarlo.
 */
export const DUPLICATE_GUARD_MIN = numeroDeEntorno('TRANSPORT_DUPLICATE_GUARD_MIN', 10);

// --- Solo para el modo `window` y la comparación en `shadow` ---
// Se conservan mientras exista el modo sombra; se eliminan junto con
// computeExpectedWindow cuando el modo `gap` quede fijo.

/** Un vehículo puede llegar hasta 10 min antes de la hora esperada. */
export const EARLY_TOLERANCE_MIN = 10;

/** Un vehículo puede llegar hasta 25 min después de la hora esperada. */
export const LATE_TOLERANCE_MIN = 25;

/** Duración fija del almuerzo, se resta del tiempo esperado cuando aplica. */
export const LUNCH_DURATION_MIN = 60;
