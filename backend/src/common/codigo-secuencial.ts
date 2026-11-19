import { Prisma } from '@prisma/client';

/** Año de la fecha en hora de Ecuador: un viaje del 31/12 a las 22:00 es de ese año. */
export function anioEcuador(fecha: Date): number {
  return Number(
    fecha.toLocaleString('en-US', {
      timeZone: 'America/Guayaquil',
      year: 'numeric',
    }),
  );
}

export function formatearCodigo(
  prefijo: string,
  numero: number,
  anio: number,
): string {
  return `${prefijo}-${String(numero).padStart(5, '0')}-${anio}`;
}

// Upsert + increment dentro de la transacción del llamador: si la transacción
// se revierte, el número no se consume.

export async function siguienteCodigoViaje(
  tx: Prisma.TransactionClient,
  fecha: Date,
): Promise<string> {
  const year = anioEcuador(fecha);
  const secuencia = await tx.transportTripSequence.upsert({
    where: { year },
    create: { year, last: 1 },
    update: { last: { increment: 1 } },
  });
  return formatearCodigo('TRA', secuencia.last, year);
}

/** LIQ-0001-2026: 4 dígitos, como los códigos de planificación. */
export async function siguienteCodigoLiquidacion(
  tx: Prisma.TransactionClient,
  fecha: Date,
): Promise<string> {
  const year = anioEcuador(fecha);
  const secuencia = await tx.liquidacionSequence.upsert({
    where: { year },
    create: { year, last: 1 },
    update: { last: { increment: 1 } },
  });
  return `LIQ-${String(secuencia.last).padStart(4, '0')}-${year}`;
}

export async function siguienteCodigoVenta(
  tx: Prisma.TransactionClient,
  fecha: Date,
): Promise<string> {
  const year = anioEcuador(fecha);
  const secuencia = await tx.ventaCanteraSequence.upsert({
    where: { year },
    create: { year, last: 1 },
    update: { last: { increment: 1 } },
  });
  return formatearCodigo('VEN', secuencia.last, year);
}
