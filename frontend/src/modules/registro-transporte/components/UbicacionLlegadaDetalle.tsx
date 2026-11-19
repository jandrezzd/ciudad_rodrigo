import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import {
  formatCoordenadas,
  formatearDistancia,
  urlGoogleMaps,
} from '@/shared/utils/coordenadas';
import {
  LecturaUbicacionLlegada,
  TipoLecturaUbicacion,
  UbicacionLlegada,
} from '../types';

const ETIQUETAS_LECTURA: Record<TipoLecturaUbicacion, string> = {
  ESCANEO: 'GPS del escaneo',
  FOTO_CONDUCTOR: 'Foto del conductor',
  FOTO_VEHICULO: 'Foto del vehículo',
  FOTO_PLACA: 'Foto de la placa',
  FOTO_MATERIAL: 'Foto del material',
};

/** "escaneo + 2 fotos" */
const resumenFuentes = (lecturas: LecturaUbicacionLlegada[]) => {
  const usadas = lecturas.filter((l) => l.usada);
  const fotos = usadas.filter((l) => l.tipo !== 'ESCANEO').length;
  const partes: string[] = [];
  if (usadas.some((l) => l.tipo === 'ESCANEO')) partes.push('escaneo');
  if (fotos > 0) partes.push(`${fotos} foto${fotos === 1 ? '' : 's'}`);
  return partes.join(' + ') || '—';
};

const EnlaceMapa = ({ lat, lng }: { lat: number; lng: number }) => (
  <a
    href={urlGoogleMaps(lat, lng)}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
  >
    <MapPin className="h-3.5 w-3.5" />
    Ver en mapa
  </a>
);

interface UbicacionLlegadaDetalleProps {
  ubicacion?: UbicacionLlegada | null;
}

/**
 * "Ubicación de llegada más precisa" dentro de la tarjeta Llegada del detalle
 * del viaje. No calcula nada: muestra lo que guardó el servidor.
 */
export const UbicacionLlegadaDetalle = ({ ubicacion }: UbicacionLlegadaDetalleProps) => {
  const [verLecturas, setVerLecturas] = useState(false);

  // Viaje sin completar, o completado antes de esta función y aún sin calcular.
  if (!ubicacion) return null;

  const titulo = (
    <p className="font-semibold text-gray-700 dark:text-night-text">
      Ubicación de llegada más precisa
    </p>
  );

  if (ubicacion.lat == null || ubicacion.lng == null) {
    return (
      <div className="mt-3 border-t border-gray-200 pt-3 text-sm dark:border-white/10">
        {titulo}
        <p className="text-gray-500 dark:text-night-muted">
          Sin lecturas de GPS válidas para calcularla.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-1.5 border-t border-gray-200 pt-3 text-sm dark:border-white/10">
      {titulo}

      <p className="text-gray-600 dark:text-night-muted">
        {formatCoordenadas(ubicacion.lat, ubicacion.lng)}
        {ubicacion.precisionM != null && ` (± ${Math.round(ubicacion.precisionM)} m)`}{' '}
        · <EnlaceMapa lat={ubicacion.lat} lng={ubicacion.lng} />
      </p>

      <p className="text-gray-500 dark:text-night-muted">
        Calculada con: {resumenFuentes(ubicacion.lecturas)}
      </p>

      {ubicacion.referencia == null ? (
        <p className="text-gray-500 dark:text-night-muted">
          La planificación no tiene ubicación de llegada por defecto.
        </p>
      ) : ubicacion.distanciaReferenciaM != null ? (
        <p
          className={
            ubicacion.dentroDelRadio
              ? 'rounded-md bg-green-50 px-2 py-1 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : 'rounded-md bg-amber-50 px-2 py-1 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
          }
        >
          {ubicacion.dentroDelRadio ? 'Dentro' : 'Fuera'} del radio de {ubicacion.radioM} m · a{' '}
          {formatearDistancia(ubicacion.distanciaReferenciaM)} del punto de vaciado (
          <EnlaceMapa lat={ubicacion.referencia.lat} lng={ubicacion.referencia.lng} />)
        </p>
      ) : null}

      {ubicacion.aviso && (
        <p className="flex items-start gap-1 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {ubicacion.aviso}
        </p>
      )}

      {ubicacion.lecturas.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setVerLecturas((v) => !v)}
            className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
          >
            {verLecturas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {verLecturas ? 'Ocultar lecturas' : `Ver lecturas (${ubicacion.lecturas.length})`}
          </button>

          {verLecturas && (
            <ul className="mt-1 space-y-1">
              {ubicacion.lecturas.map((lectura, i) => (
                <li
                  key={`${lectura.tipo}-${i}`}
                  className={
                    lectura.usada
                      ? 'text-gray-600 dark:text-night-muted'
                      : 'text-gray-400 opacity-70 dark:text-night-muted'
                  }
                >
                  <span className={lectura.usada ? 'font-medium' : 'font-medium line-through'}>
                    {ETIQUETAS_LECTURA[lectura.tipo] ?? lectura.tipo}
                  </span>
                  : {formatCoordenadas(lectura.lat, lectura.lng, 5)} (± {Math.round(lectura.precisionM)} m)
                  {lectura.distanciaReferenciaM != null &&
                    ` · a ${formatearDistancia(lectura.distanciaReferenciaM)} del punto`}
                  {lectura.motivo && (
                    <span className="block pl-3 text-xs italic">Descartada: {lectura.motivo}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
