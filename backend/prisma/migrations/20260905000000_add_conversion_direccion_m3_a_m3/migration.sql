-- Nuevo modo de conversión para materiales de cantera: M3_A_M3 (esponjamiento
-- banco -> suelto, multiplica). Aislada en su propia migración: Postgres no
-- permite usar un valor de enum recién agregado en la misma transacción en que
-- se agrega.
ALTER TYPE "ConversionDireccion" ADD VALUE 'M3_A_M3';
