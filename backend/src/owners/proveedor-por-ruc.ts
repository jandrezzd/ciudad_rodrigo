import { Prisma } from '@prisma/client';

/**
 * Proveedor de vehículos (Owner) de un cliente público. El vínculo es el RUC:
 * si ya hay un proveedor con ese RUC se reutiliza (un cliente puede haber sido
 * proveedor antes), si no se crea con la razón social del cliente.
 */
export async function asegurarProveedorPorRuc(
  tx: Prisma.TransactionClient,
  ruc: string,
  razonSocial: string,
) {
  const rucLimpio = ruc.trim();
  const existente = await tx.owner.findUnique({ where: { ruc: rucLimpio } });
  if (existente) return existente;

  return tx.owner.create({
    data: { ruc: rucLimpio, companyname: razonSocial.trim() },
  });
}
