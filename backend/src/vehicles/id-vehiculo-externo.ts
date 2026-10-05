import { Prisma } from '@prisma/client';

/**
 * TE-00001, TE-00002... La primera vez arranca desde el mayor vehicleid "TE-"
 * existente; desde ahí incrementa VehicleSequence. Se llama dentro de la
 * transacción que crea el vehículo, así un rollback no consume número.
 */
export async function siguienteIdVehiculoExterno(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const existe = await tx.vehicleSequence.findUnique({
    where: { prefix: 'TE' },
  });

  if (!existe) {
    const existentes = await tx.vehicle.findMany({
      where: { vehicleid: { startsWith: 'TE-' } },
      select: { vehicleid: true },
    });
    const maximo = existentes.reduce((max, v) => {
      const n = parseInt(v.vehicleid.slice('TE-'.length), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    // upsert: si otro proceso la creó en paralelo, no choca con el único.
    await tx.vehicleSequence.upsert({
      where: { prefix: 'TE' },
      create: { prefix: 'TE', last: maximo },
      update: {},
    });
  }

  const actualizada = await tx.vehicleSequence.update({
    where: { prefix: 'TE' },
    data: { last: { increment: 1 } },
  });
  return `TE-${String(actualizada.last).padStart(5, '0')}`;
}
