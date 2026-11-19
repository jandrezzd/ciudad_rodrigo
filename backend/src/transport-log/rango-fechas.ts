import { Prisma } from '@prisma/client';
import { BusinessException } from '../common/business.exception';

/**
 * Límites de un rango de días de Ecuador (UTC-5), `YYYY-MM-DD` inclusive.
 * undefined = sin rango. Lanza 400 si "desde" es posterior a "hasta".
 */
export function limitesDia(
  desde?: string,
  hasta?: string,
): Prisma.DateTimeFilter | undefined {
  if (!desde && !hasta) return undefined;
  if (desde && hasta && desde > hasta) {
    throw new BusinessException(
      'VALIDATION_ERROR',
      'LA FECHA "DESDE" NO PUEDE SER POSTERIOR A LA FECHA "HASTA"',
      false,
      400,
    );
  }

  const limites: Prisma.DateTimeFilter = {};
  if (desde) limites.gte = new Date(`${desde}T00:00:00.000-05:00`);
  if (hasta) limites.lte = new Date(`${hasta}T23:59:59.999-05:00`);
  return limites;
}

/**
 * Viajes que salieron o llegaron dentro del rango, en días de Ecuador
 * (UTC-5): el mismo criterio que usa el filtro de fechas de la web.
 * undefined = sin rango.
 */
export function whereRangoFechas(
  desde?: string,
  hasta?: string,
): Prisma.TransportTripWhereInput | undefined {
  const limites = limitesDia(desde, hasta);
  if (!limites) return undefined;
  return { OR: [{ departureAt: limites }, { arrivalAt: limites }] };
}
