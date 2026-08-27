import { TransformFnParams } from 'class-transformer';

/**
 * Convierte '' a null antes de validar. Sin esto, un campo opcional con
 * @Length o @unique rechazaría '' (IsOptional solo se salta con null/undefined,
 * no con string vacío) y, al editar, dejar el campo en blanco no lo limpiaría
 * de verdad (undefined = "no tocar" para Prisma, null = "vaciar").
 */
export const emptyStringToNull = ({ value }: TransformFnParams) =>
  value === '' ? null : value;
