import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { asegurarProveedorPorRuc } from '../owners/proveedor-por-ruc';
import { asegurarObraDelCliente } from '../const-sites/obra-por-nombre';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Crea el cliente junto con su obra (nombre = razón social) y, si es
   * público, su proveedor de vehículos con el mismo RUC. Todo o nada: así la
   * orden de venta ya encuentra lista la obra y el proveedor del cliente.
   */
  async create(data: any) {
    const type = data.type ?? 'PRIVADO';
    try {
      return await this.prisma.$transaction(async (tx) => {
        const cliente = await tx.client.create({
          data: { ...data, name: data.name ?? '', type },
        });

        await asegurarObraDelCliente(tx, cliente.id, cliente.companyname);

        const proveedor =
          type === 'PUBLICO'
            ? await asegurarProveedorPorRuc(
                tx,
                cliente.ruc,
                cliente.companyname,
              )
            : null;

        const completo = await tx.client.findUnique({
          where: { id: cliente.id },
          include: { constSites: { include: { constSite: true } } },
        });
        return { ...completo, proveedor };
      });
    } catch (error) {
      this.traducirDuplicado(error);
      throw error;
    }
  }

  findAll() {
    return this.prisma.client.findMany();
  }

  /**
   * El tipo (público/privado) no se cambia después de creado: de él dependen
   * su proveedor y los vehículos de sus órdenes. Si se corrige el RUC, se
   * corrige también en su proveedor (los vehículos siguen con el mismo).
   */
  async update(id: number, data: any) {
    const { type: _tipoIgnorado, ...cambios } = data;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const actual = await tx.client.findUnique({
          where: { id },
          select: { ruc: true },
        });
        if (!actual) throw new NotFoundException('EL CLIENTE NO EXISTE');

        const rucNuevo =
          typeof cambios.ruc === 'string' ? cambios.ruc.trim() : undefined;
        if (rucNuevo && rucNuevo !== actual.ruc) {
          const proveedor = await tx.owner.findUnique({
            where: { ruc: actual.ruc },
            select: { id: true },
          });
          if (proveedor) {
            const ocupado = await tx.owner.findUnique({
              where: { ruc: rucNuevo },
              select: { id: true },
            });
            if (ocupado) {
              throw new ConflictException(
                'YA EXISTE OTRO PROVEEDOR CON ESE RUC',
              );
            }
            await tx.owner.update({
              where: { id: proveedor.id },
              data: { ruc: rucNuevo },
            });
          }
        }

        return tx.client.update({ where: { id }, data: cambios });
      });
    } catch (error) {
      this.traducirDuplicado(error);
      throw error;
    }
  }

  remove(id: number) {
    return this.prisma.client.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /** RUC y razón social son únicos: sin esto el choque sale como un 500 genérico. */
  private traducirDuplicado(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const campos = String(error.meta?.target ?? '');
      if (campos.includes('ruc')) {
        throw new ConflictException('YA EXISTE UN CLIENTE CON ESE RUC');
      }
      if (campos.includes('companyname')) {
        throw new ConflictException('YA EXISTE UN CLIENTE CON ESA RAZÓN SOCIAL');
      }
      throw new ConflictException('YA EXISTE UN REGISTRO CON ESOS DATOS');
    }
  }
}
