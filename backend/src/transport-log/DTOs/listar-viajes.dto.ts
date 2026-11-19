import { IsOptional, Matches } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Filtros de GET /transport. Con `desde` y/o `hasta` se devuelven TODOS los
 * viajes del rango (sin el tope de los más recientes); sin fechas, la lista
 * sigue limitada a los más recientes para que cargue rápido.
 */
export class ListarViajesDto {
  /** Día de inicio (AAAA-MM-DD), hora de Ecuador. */
  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener el formato AAAA-MM-DD' })
  desde?: string;

  /** Día de fin (AAAA-MM-DD), incluido completo, hora de Ecuador. */
  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener el formato AAAA-MM-DD' })
  hasta?: string;
}
