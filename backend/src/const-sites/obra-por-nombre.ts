import { Prisma } from '@prisma/client';

/**
 * Obra con ese nombre (sin distinguir mayúsculas ni espacios de los extremos),
 * o null. Las obras no se duplican: si ya existe una con el mismo nombre se
 * usa esa. Se prefiere una activa.
 */
export async function buscarObraPorNombre(
  tx: Prisma.TransactionClient,
  nombre: string,
) {
  const limpio = nombre.trim();
  if (!limpio) return null;
  return tx.constSite.findFirst({
    where: { name: { equals: limpio, mode: 'insensitive' } },
    orderBy: [{ isActive: 'desc' }, { id: 'asc' }],
  });
}

/** Vincula cliente y obra si todavía no lo están. */
export async function vincularClienteObra(
  tx: Prisma.TransactionClient,
  clientId: number,
  constSiteId: number,
) {
  await tx.clientConstSite.upsert({
    where: { clientId_constSiteId: { clientId, constSiteId } },
    create: { clientId, constSiteId },
    update: {},
  });
}

/** Obra del cliente con su razón social: reutiliza la que ya exista con ese nombre. */
export async function asegurarObraDelCliente(
  tx: Prisma.TransactionClient,
  clientId: number,
  razonSocial: string,
) {
  const obra =
    (await buscarObraPorNombre(tx, razonSocial)) ??
    (await tx.constSite.create({ data: { name: razonSocial.trim() } }));
  await vincularClienteObra(tx, clientId, obra.id);
  return obra;
}
