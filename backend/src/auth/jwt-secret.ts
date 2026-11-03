/**
 * Llave con que se firman y validan los tokens. Firma (AuthModule) y validación
 * (JwtStrategy) leen de aquí para que nunca queden con llaves distintas.
 *
 * Se lee en tiempo de ejecución, no al importar el módulo: main.ts carga el
 * .env después de los imports, así que un `process.env.JWT_SECRET` evaluado en
 * el decorador de AuthModule saldría siempre vacío.
 *
 * Sin JWT_SECRET se usa la llave de siempre, para que local siga funcionando
 * sin configurar nada. En producción se define en el .env.
 */
export const jwtSecret = (): string =>
  process.env.JWT_SECRET || 'super_secret_key';
