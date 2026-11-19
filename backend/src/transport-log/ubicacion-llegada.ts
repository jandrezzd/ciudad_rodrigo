/**
 * "Ubicación de llegada más precisa" de un viaje.
 *
 * Junta el GPS tomado al escanear el QR con el GPS que la cámara guardó en los
 * metadatos de cada foto, descarta las lecturas que no sirven, promedia
 * las demás con énfasis en la más precisa, y compara el resultado con la
 * "Ubicación de llegada por defecto" de la planificación.
 *
 * Función pura: sin Prisma ni Nest, para poder probarla sin mocks.
 */

export type FotoGpsClave = 'driver' | 'vehicle' | 'plate' | 'material';

export type TipoLecturaUbicacion =
  | 'ESCANEO'
  | 'FOTO_CONDUCTOR'
  | 'FOTO_VEHICULO'
  | 'FOTO_PLACA'
  | 'FOTO_MATERIAL';

export type MetodoUbicacion = 'UNICA' | 'PROMEDIO' | 'MAS_PRECISA';

export interface Punto {
  lat: number;
  lng: number;
}

/** GPS de una foto, tal como lo manda la app en `fotosGps`. */
export interface FotoGps extends Punto {
  foto: FotoGpsClave;
  precisionM: number | null;
  /** ISO 8601. Hora en que la cámara tomó la foto, si la trae. */
  tomadaEn: string | null;
}

export interface LecturaUbicacion extends Punto {
  tipo: TipoLecturaUbicacion;
  precisionM: number;
  usada: boolean;
  /** Por qué se descartó (null si se usó). */
  motivo: string | null;
  distanciaReferenciaM: number | null;
}

export interface ResultadoUbicacionLlegada extends Punto {
  precisionM: number;
  metodo: MetodoUbicacion;
  aviso: string | null;
  distanciaReferenciaM: number | null;
  dentroDelRadio: boolean | null;
  radioM: number | null;
  lecturas: LecturaUbicacion[];
}

export interface EntradaUbicacionLlegada {
  escaneo?: {
    lat: number | null;
    lng: number | null;
    precisionM?: number | null;
  } | null;
  fotos?: FotoGps[] | null;
  /** Hora de la llegada, para descartar fotos con GPS de otro momento. */
  capturedAt?: Date | null;
  referencia?: {
    lat: number | null;
    lng: number | null;
    radioM: number;
  } | null;
}

/** Precisión supuesta si la app no la manda (APK viejos). */
export const PRECISION_ESCANEO_DEFECTO_M = 50;
/** Precisión supuesta del GPS de una foto si no trae GPSHPositioningError. */
export const PRECISION_FOTO_DEFECTO_M = 30;
/** Piso: evita que una lectura de "1 m" se lleve todo el peso del promedio. */
export const PRECISION_MINIMA_M = 3;
/** Por encima de esto la precisión informada no es creíble y se ignora. */
export const PRECISION_MAXIMA_M = 5_000;
/** El GPS de la cámara puede quedar guardado de otro momento. */
export const MAX_DIFERENCIA_HORA_FOTO_MS = 2 * 60 * 60 * 1000;
/** Con 3 o más lecturas, nunca se descarta una a menos de esto del centro. */
export const DISTANCIA_MIN_DESCARTE_M = 200;
/** Con 2 lecturas, más allá de esto no se promedian. */
export const DISTANCIA_DESACUERDO_M = 500;
/** Máximo de entradas aceptadas en `fotosGps` (la llegada tiene 5 fotos). */
export const MAX_FOTOS_GPS = 5;

const CLAVES_FOTO: readonly FotoGpsClave[] = [
  'driver',
  'vehicle',
  'plate',
  'material',
];

const TIPO_POR_FOTO: Record<FotoGpsClave, TipoLecturaUbicacion> = {
  driver: 'FOTO_CONDUCTOR',
  vehicle: 'FOTO_VEHICULO',
  plate: 'FOTO_PLACA',
  material: 'FOTO_MATERIAL',
};

const RADIO_TIERRA_M = 6_371_000;
const rad = (grados: number) => (grados * Math.PI) / 180;

// Distancia en metros entre dos puntos (haversine)
export function distanciaM(a: Punto, b: Punto): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatearDistancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(1).replace('.', ',')} km`;
}

export function esCoordenadaValida(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  // 0,0: la app no consiguió señal
  return !(Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6);
}

const aNumero = (valor: unknown): number =>
  typeof valor === 'number'
    ? valor
    : typeof valor === 'string' && valor.trim() !== ''
      ? Number(valor)
      : NaN;

// Precisión en metros, o null si no viene o no es creíble
export function parsePrecisionM(valor: unknown): number | null {
  const n = aNumero(valor);
  return Number.isFinite(n) && n > 0 && n <= PRECISION_MAXIMA_M ? n : null;
}

//`fotosGps` tal como llega de la app (texto JSON) o de la base (JSON ya parseado). Tolerante: lo que no se entiende se ignora
export function parseFotosGps(valor: unknown): FotoGps[] {
  let lista: unknown = valor;
  if (typeof valor === 'string') {
    if (!valor.trim()) return [];
    try {
      lista = JSON.parse(valor);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(lista)) return [];

  const fotos: FotoGps[] = [];
  for (const item of lista.slice(0, MAX_FOTOS_GPS)) {
    if (!item || typeof item !== 'object') continue;
    const { foto, lat, lng, precisionM, tomadaEn } = item as Record<
      string,
      unknown
    >;
    const latN = aNumero(lat);
    const lngN = aNumero(lng);
    if (!CLAVES_FOTO.includes(foto as FotoGpsClave)) continue;
    if (!esCoordenadaValida(latN, lngN)) continue;

    const ms = typeof tomadaEn === 'string' ? Date.parse(tomadaEn) : NaN;
    fotos.push({
      foto: foto as FotoGpsClave,
      lat: latN,
      lng: lngN,
      precisionM: parsePrecisionM(precisionM),
      tomadaEn: Number.isNaN(ms) ? null : new Date(ms).toISOString(),
    });
  }
  return fotos;
}

const mediana = (valores: number[]): number => {
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2
    ? ordenados[medio]
    : (ordenados[medio - 1] + ordenados[medio]) / 2;
};

const redondearM = (metros: number) => Math.round(metros * 10) / 10;
const redondearCoord = (grado: number) => Math.round(grado * 1e7) / 1e7;

// La más precisa primero; a igual precisión, el escaneo antes que una foto
const porPrecision = (a: LecturaUbicacion, b: LecturaUbicacion) =>
  a.precisionM - b.precisionM ||
  Number(b.tipo === 'ESCANEO') - Number(a.tipo === 'ESCANEO');

// Devuelve null si no hay ninguna lectura de GPS válida
export function calcularUbicacionLlegada(
  entrada: EntradaUbicacionLlegada,
): ResultadoUbicacionLlegada | null {
  const lecturas: LecturaUbicacion[] = [];
  const nuevaLectura = (
    tipo: TipoLecturaUbicacion,
    punto: Punto,
    precisionM: number | null | undefined,
    precisionDefecto: number,
  ): LecturaUbicacion => ({
    tipo,
    lat: punto.lat,
    lng: punto.lng,
    precisionM: Math.max(PRECISION_MINIMA_M, precisionM ?? precisionDefecto),
    usada: true,
    motivo: null,
    distanciaReferenciaM: null,
  });

  // Lecturas
  const { escaneo } = entrada;
  if (escaneo && esCoordenadaValida(escaneo.lat, escaneo.lng)) {
    lecturas.push(
      nuevaLectura(
        'ESCANEO',
        { lat: escaneo.lat as number, lng: escaneo.lng as number },
        parsePrecisionM(escaneo.precisionM),
        PRECISION_ESCANEO_DEFECTO_M,
      ),
    );
  }
  for (const foto of entrada.fotos ?? []) {
    if (!esCoordenadaValida(foto.lat, foto.lng)) continue;
    const lectura = nuevaLectura(
      TIPO_POR_FOTO[foto.foto],
      foto,
      foto.precisionM,
      PRECISION_FOTO_DEFECTO_M,
    );
    if (foto.tomadaEn && entrada.capturedAt) {
      const diferencia = Math.abs(
        new Date(foto.tomadaEn).getTime() - entrada.capturedAt.getTime(),
      );
      if (diferencia > MAX_DIFERENCIA_HORA_FOTO_MS) {
        lectura.usada = false;
        lectura.motivo = 'La foto se tomó a más de 2 h de la llegada';
      }
    }
    lecturas.push(lectura);
  }

  let vigentes = lecturas.filter((l) => l.usada);
  if (vigentes.length === 0) return null;

  // 2a. Con 3 o más: quedan fuera las que se encuentran lejos del punto medio
  if (vigentes.length >= 3) {
    const centro = {
      lat: mediana(vigentes.map((l) => l.lat)),
      lng: mediana(vigentes.map((l) => l.lng)),
    };
    const distancias = vigentes.map((l) => distanciaM(l, centro));
    const limite = Math.max(DISTANCIA_MIN_DESCARTE_M, 3 * mediana(distancias));
    vigentes.forEach((l, i) => {
      if (distancias[i] > limite) {
        l.usada = false;
        l.motivo = `Lejos del resto de lecturas (${formatearDistancia(distancias[i])})`;
      }
    });
    vigentes = vigentes.filter((l) => l.usada);
  }

  let metodo: MetodoUbicacion;
  let aviso: string | null = null;
  let punto: Punto;
  let precisionM: number;

  if (
    vigentes.length === 2 &&
    distanciaM(vigentes[0], vigentes[1]) > DISTANCIA_DESACUERDO_M
  ) {
    // 2b. Dos lecturas que no coinciden: promediarlas daría un punto
    // intermedio donde no estuvo nadie. Se usa la más precisa y se avisa.
    const separacion = distanciaM(vigentes[0], vigentes[1]);
    const [mejor, otra] = [...vigentes].sort(porPrecision);
    otra.usada = false;
    otra.motivo = `No coincide con la lectura más precisa (${formatearDistancia(separacion)})`;
    metodo = 'MAS_PRECISA';
    aviso = `Las ubicaciones no coinciden (${formatearDistancia(separacion)} entre sí): se usó la más precisa`;
    punto = mejor;
    precisionM = mejor.precisionM;
  } else if (vigentes.length === 1) {
    metodo = 'UNICA';
    punto = vigentes[0];
    precisionM = vigentes[0].precisionM;
  } else {
    // 3. Promedio ponderado: peso = 1 / precisión².
    metodo = 'PROMEDIO';
    const pesos = vigentes.map((l) => 1 / l.precisionM ** 2);
    const suma = pesos.reduce((a, b) => a + b, 0);
    punto = {
      lat: vigentes.reduce((acc, l, i) => acc + l.lat * pesos[i], 0) / suma,
      lng: vigentes.reduce((acc, l, i) => acc + l.lng * pesos[i], 0) / suma,
    };
    // Si las lecturas están dispersas, la precisión no puede ser mejor que
    // esa dispersión aunque cada una diga ser muy precisa.
    const centro = punto;
    const dispersion = Math.sqrt(
      vigentes.reduce(
        (acc, l, i) => acc + pesos[i] * distanciaM(l, centro) ** 2,
        0,
      ) / suma,
    );
    precisionM = Math.max(Math.sqrt(1 / suma), dispersion);
  }

  // 4. Comparación con la "Ubicación de llegada por defecto".
  const ref = entrada.referencia;
  const refPunto =
    ref && esCoordenadaValida(ref.lat, ref.lng)
      ? { lat: ref.lat as number, lng: ref.lng as number }
      : null;
  const distanciaRef = refPunto ? distanciaM(punto, refPunto) : null;

  return {
    lat: redondearCoord(punto.lat),
    lng: redondearCoord(punto.lng),
    precisionM: redondearM(precisionM),
    metodo,
    aviso,
    distanciaReferenciaM:
      distanciaRef == null ? null : redondearM(distanciaRef),
    dentroDelRadio:
      distanciaRef == null || !ref ? null : distanciaRef <= ref.radioM,
    radioM: refPunto && ref ? ref.radioM : null,
    lecturas: lecturas.map((l) => ({
      ...l,
      lat: redondearCoord(l.lat),
      lng: redondearCoord(l.lng),
      precisionM: redondearM(l.precisionM),
      distanciaReferenciaM: refPunto
        ? redondearM(distanciaM(l, refPunto))
        : null,
    })),
  };
}
