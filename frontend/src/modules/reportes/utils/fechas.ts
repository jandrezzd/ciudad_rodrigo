import toast from 'react-hot-toast';

/** Rango por defecto de los reportes: los últimos 30 días hasta hoy. */
export const DIAS_RANGO_DEFECTO = 30;

/** Fecha → "AAAA-MM-DD" en hora de Ecuador (valor de un input type="date"). */
export const formatDateInput = (value: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(value);

export const hoyInput = () => formatDateInput(new Date());

/** Inicio del rango por defecto (hoy menos 30 días). */
export const inicioRangoDefecto = () => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - DIAS_RANGO_DEFECTO);
  return formatDateInput(fecha);
};

/** "2026-09-01" → "01/09/2026", para los mensajes. */
export const fechaLegible = (valor: string) => valor.split('-').reverse().join('/');

/** Aviso cuando un reporte sale vacío: casi siempre es por el rango de fechas. */
export const avisoSinDatos = (desde?: string, hasta?: string) =>
  desde && hasta
    ? `No hay datos entre ${fechaLegible(desde)} y ${fechaLegible(hasta)}. Pruebe con un rango de fechas más amplio.`
    : 'No hay datos con los filtros seleccionados.';

/** Mensaje al generar: éxito con datos, o aviso con el rango si salió vacío. */
export const avisarResultado = (cantidad: number, desde?: string, hasta?: string) => {
  if (cantidad > 0) {
    toast.success(`Reporte generado: ${cantidad} registro(s)`);
  } else {
    toast(avisoSinDatos(desde, hasta), { icon: '⚠️', duration: 6000 });
  }
};
