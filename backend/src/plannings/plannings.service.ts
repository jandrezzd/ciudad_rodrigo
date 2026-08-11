import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanningDto } from './DTOs/create-planning.dto';
import { UpdatePlanningDto } from './DTOs/update-planning.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PlanningsService {
  private readonly logger = new Logger(PlanningsService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads/invoice');

  constructor(private prisma: PrismaService) {
    this.ensureUploadDirectory();
  }

  private ensureUploadDirectory() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Directorio de uploads creado: ${this.uploadDir}`);
    }
  }

  private async getHistoryVehiclesByPlanning(planningId: number) {
    const transports = await this.prisma.transportLog.findMany({
      where: { planningId },
      include: {
        vehicle: {
          include: { owner: true },
        },
      },
    });

    const uniqueVehicles = new Map<number, any>();
    transports.forEach((transport) => {
      if (transport.vehicle) {
        uniqueVehicles.set(transport.vehicle.id, transport.vehicle);
      }
    });

    return Array.from(uniqueVehicles.values()).map((vehicle) => ({
      planningId,
      vehicleId: vehicle.id,
      vehicle,
    }));
  }

  private validateVehicleOwnership(vehicle: any): void {
    if (vehicle.ownerId) {
      if (!vehicle.owner || !vehicle.owner.isActive) {
        throw new BadRequestException(
          `El propietario del vehículo ${vehicle.plate} no está activo`,
        );
      }
    } else if (!vehicle.company) {
      throw new BadRequestException(
        `El vehículo ${vehicle.plate} no tiene propietario ni compañía responsable asignada`,
      );
    }
  }

  private calculateVehicleStats(planning: any): {
    totalVehicles: number;
    internalVehicles: number;
    externalVehicles: number;
  } {
    const vehicles = planning.vehicles?.map((pv: any) => pv.vehicle) || [];
    const internalVehicles = vehicles.filter((v: any) => v?.type === 'INTERNO').length;
    const externalVehicles = vehicles.filter((v: any) => v?.type === 'EXTERNO').length;
    return {
      totalVehicles: vehicles.length,
      internalVehicles,
      externalVehicles,
    };
  }

  private getProveedorIdFromPlanning(planning: any): number | undefined {
    if (!planning?.canteras?.length) return undefined;

    const providerIds = planning.canteras
      .map((planningCantera: any) => planningCantera?.cantera?.materialProviderId)
      .filter((id: any) => id != null);

    if (!providerIds.length) return undefined;
    return providerIds.every((id: any) => id === providerIds[0]) ? providerIds[0] : undefined;
  }

  private formatPlanningResponse(planning: any): any {
    const stats = this.calculateVehicleStats(planning);
    return {
      ...planning,
      proveedorId: this.getProveedorIdFromPlanning(planning),
      vehicleStats: stats,
    };
  }

  private async generatePlanningCode(): Promise<string> {
    const currentYear = new Date().getFullYear();

    let sequence = await this.prisma.planningSequence.findUnique({
      where: { year: currentYear },
    });

    if (!sequence) {
      sequence = await this.prisma.planningSequence.create({
        data: { year: currentYear, last: 0 },
      });
    }

    const updated = await this.prisma.planningSequence.update({
      where: { year: currentYear },
      data: { last: { increment: 1 } },
    });

    const planningCode = `PLAN-${String(updated.last).padStart(4, '0')}-${currentYear}`;
    this.logger.log(`Nuevo código de planificación generado: ${planningCode}`);
    return planningCode;
  }

  async create(data: CreatePlanningDto, files?: any) {
    const client = await this.prisma.client.findUnique({
      where: { id: data.clientId },
    });
    if (!client || !client.isActive) {
      throw new BadRequestException('El cliente no existe o está inactivo');
    }

    const constSite = await this.prisma.constSite.findUnique({
      where: { id: data.constSiteId },
    });
    if (!constSite || !constSite.isActive) {
      throw new BadRequestException('La obra no existe o está inactivo');
    }

    if (!data.vehicleIds || data.vehicleIds.length === 0) {
      throw new BadRequestException('Se requiere al menos un vehículo');
    }

    for (const vehicleId of data.vehicleIds) {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId },
        include: { owner: true, qrcode: true, plannings: { include: { planning: true } }, driver: true },
      });

      if (!vehicle) {
        throw new BadRequestException(`El vehículo no existe`);
      }

      if (!vehicle.isActive) {
        throw new BadRequestException(`El vehículo ${vehicle.plate} no está activo`);
      }

      if (!vehicle.qrcodeId || !vehicle.qrcode) {
        throw new BadRequestException(
          `El vehículo ${vehicle.plate} no tiene un código QR asignado. No se puede agregar a una planificación`,
        );
      }

      this.validateVehicleOwnership(vehicle);

      const hasActivePlanning = vehicle.plannings.some(
        (pv) => pv.planning?.isActive !== false
          && !['COMPLETADO', 'CANCELADO'].includes(pv.planning?.status),
      );

      if (hasActivePlanning) {
        throw new BadRequestException(
          `El vehículo ${vehicle.plate} ya está asignado a otra planificación`,
        );
      }
    }

    const planningCode = await this.generatePlanningCode();

    let invoicePath: string | null = null;

    // Procesar archivo PDF si existe
    if (files?.invoice?.[0]) {
      invoicePath = files.invoice[0].filename;
      this.logger.log(`Archivo de factura guardado: ${invoicePath}`);
    }

    const planning = await this.prisma.planning.create({
      data: {
        planningCode,
        description: data.description,
        numeroFactura: data.numeroFactura,
        invoicePath,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        clientId: data.clientId,
        constSiteId: data.constSiteId,
      },
      include: {
        client: true,
        constSite: true,
        canteras: {
          include: { cantera: true }
        },
        vehicles: {
          include: {
            vehicle: {
              include: { owner: true },
            },
          },
        },
      },
    });

    if (data.canteraIds && data.canteraIds.length > 0) {
      for (const canteraId of data.canteraIds) {
        await this.prisma.planningCantera.create({
          data: {
            planningId: planning.id,
            canteraId,
          }
        });
      }
    }

    for (const vehicleId of data.vehicleIds) {
      await this.prisma.planningVehicle.create({
        data: {
          planningId: planning.id,
          vehicleId,
        },
      });
    }

    // Si se proporciona numeroFactura, actualizar todos los transportes de esta planificación
    if (data.numeroFactura) {
      await this.prisma.transportLog.updateMany({
        where: {
          planningId: planning.id,
        },
        data: {
          numeroFactura: data.numeroFactura,
        },
      });
      this.logger.log(`Número de factura ${data.numeroFactura} asignado a transportes de planificación ${planning.id}`);
    }

    return this.findOne(planning.id);
  }

  async findAll() {
    const plannings = await this.prisma.planning.findMany({
      include: {
        client: true,
        constSite: true,
        canteras: {
          include: { cantera: true }
        },
        vehicles: {
          include: {
            vehicle: {
              include: { owner: true },
            },
          },
        },
      },
    });

    return Promise.all(
      plannings.map(async (planning) => {
        let formattedPlanning = planning;
        if (!planning.vehicles?.length) {
          const historyVehicles = await this.getHistoryVehiclesByPlanning(planning.id);
          formattedPlanning = {
            ...planning,
            vehicles: historyVehicles as any,
          };
        }
        return this.formatPlanningResponse(formattedPlanning);
      }),
    );
  }

  async findOne(id: number) {
    const planning = await this.prisma.planning.findUnique({
      where: { id },
      include: {
        client: true,
        constSite: true,
        canteras: {
          include: { cantera: true }
        },
        vehicles: {
          include: {
            vehicle: {
              include: { owner: true },
            },
          },
        },
      },
    });

    if (!planning) {
      throw new NotFoundException('Planning no encontrado');
    }

    let formattedPlanning = planning;
    if (!planning.vehicles?.length) {
      const historyVehicles = await this.getHistoryVehiclesByPlanning(id);
      formattedPlanning = {
        ...planning,
        vehicles: historyVehicles as any,
      };
    }

    return this.formatPlanningResponse(formattedPlanning);
  }

  async update(id: number, data: UpdatePlanningDto, files?: any) {
    const planning = await this.prisma.planning.findUnique({
      where: { id },
      include: { vehicles: true },
    });

    if (!planning) {
      throw new NotFoundException('Planificación no encontrada');
    }

    const shouldReleaseVehicles = (data.status && ['COMPLETADO', 'CANCELADO'].includes(data.status))
      || data.isActive === false;

    const updateData: any = {};
    if (data.description !== undefined) updateData.description = data.description;
    if (data.numeroFactura !== undefined) updateData.numeroFactura = data.numeroFactura;
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;
    if (data.status) updateData.status = data.status;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    // Procesar archivo PDF si existe
    if (files?.invoice?.[0]) {
      updateData.invoicePath = files.invoice[0].filename;
      this.logger.log(`Archivo de factura actualizado: ${updateData.invoicePath}`);
    }

    await this.prisma.$transaction(async (tx) => {
      if (data.vehicleIds) {
        for (const vehicleId of data.vehicleIds) {
          const vehicle = await tx.vehicle.findUnique({
            where: { id: vehicleId },
            include: { owner: true, qrcode: true, plannings: { include: { planning: true } } },
          });

          if (!vehicle) {
            throw new BadRequestException(`El vehículo no existe`);
          }

          if (!vehicle.isActive) {
            throw new BadRequestException(`El vehículo ${vehicle.plate} no está activo`);
          }

          if (!vehicle.qrcodeId || !vehicle.qrcode) {
            throw new BadRequestException(
              `El vehículo ${vehicle.plate} no tiene un código QR asignado. No se puede agregar a una planificación`,
            );
          }

          this.validateVehicleOwnership(vehicle);

          const isAssignedToOtherPlanning = vehicle.plannings.some(
            (pv) => pv.planningId !== id
              && pv.planning?.isActive !== false
              && !['COMPLETADO', 'CANCELADO'].includes(pv.planning?.status),
          );
          if (isAssignedToOtherPlanning) {
            throw new BadRequestException(
              `El vehículo ${vehicle.plate} ya está asignado a otra planificación`,
            );
          }
        }

        await tx.planningVehicle.deleteMany({
          where: {
            planningId: id,
            vehicleId: {
              notIn: data.vehicleIds,
            },
          },
        });

        for (const vehicleId of data.vehicleIds) {
          const existingPlanningVehicle = await tx.planningVehicle.findFirst({
            where: {
              planningId: id,
              vehicleId,
            },
          });

          if (!existingPlanningVehicle) {
            await tx.planningVehicle.create({
              data: {
                planningId: id,
                vehicleId,
              },
            });
          }
        }
      }

      if (data.canteraIds !== undefined) {
        await tx.planningCantera.deleteMany({
          where: { planningId: id },
        });

        for (const canteraId of data.canteraIds) {
          await tx.planningCantera.create({
            data: {
              planningId: id,
              canteraId,
            }
          });
        }
      }

      await tx.planning.update({
        where: { id },
        data: updateData,
      });

      if (shouldReleaseVehicles) {
        await tx.planningVehicle.deleteMany({
          where: { planningId: id },
        });
      }
    });

    // Si se proporciona numeroFactura, actualizar todos los transportes de esta planificación
    if (data.numeroFactura) {
      await this.prisma.transportLog.updateMany({
        where: {
          planningId: id,
        },
        data: {
          numeroFactura: data.numeroFactura,
        },
      });
      this.logger.log(`Número de factura ${data.numeroFactura} asignado a transportes de planificación ${id}`);
    }

    return this.findOne(id);
  }

  async remove(id: number) {
    const planning = await this.prisma.planning.findUnique({
      where: { id },
    });

    if (!planning) {
      throw new NotFoundException('Planificación no encontrada');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.planning.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.planningVehicle.deleteMany({
        where: { planningId: id },
      });
    });

    return this.findOne(id);
  }

  async addVehicle(planningId: number, vehicleId: number) {
    const planning = await this.prisma.planning.findUnique({
      where: { id: planningId },
    });

    if (!planning) {
      throw new NotFoundException('Planificación no encontrada');
    }

    if (planning.isActive === false || ['COMPLETADO', 'CANCELADO'].includes(planning.status)) {
      throw new BadRequestException('No se puede agregar vehículos a una planificación finalizada o eliminada');
    }

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId },
      include: { owner: true, plannings: { include: { planning: true } }, driver: true },
    });

    if (!vehicle) {
      throw new BadRequestException('Vehículo no encontrado');
    }

    if (!vehicle.isActive) {
      throw new BadRequestException('El vehículo no está activo');
    }

    this.validateVehicleOwnership(vehicle);

    const hasActivePlanning = vehicle.plannings.some(
      (pv) => pv.planning?.isActive !== false
        && !['COMPLETADO', 'CANCELADO'].includes(pv.planning?.status),
    );

    if (hasActivePlanning) {
      throw new BadRequestException('El vehículo ya está asignado a otra planificación');
    }

    return this.prisma.planningVehicle.create({
      data: {
        planningId,
        vehicleId,
      },
      include: {
        vehicle: {
          include: { owner: true },
        },
      },
    });
  }

  async removeVehicle(planningId: number, vehicleId: number) {
    const planning = await this.prisma.planning.findUnique({
      where: { id: planningId },
    });

    if (!planning) {
      throw new NotFoundException('Planificación no encontrada');
    }

    return this.prisma.planningVehicle.deleteMany({
      where: {
        planningId,
        vehicleId,
      },
    });
  }

  async getVehiclesByPlanning(planningId: number) {
    const planning = await this.prisma.planning.findUnique({
      where: { id: planningId },
    });

    if (!planning) {
      throw new NotFoundException('Planificación no encontrada');
    }

    const planningVehicles = await this.prisma.planningVehicle.findMany({
      where: { planningId },
      include: {
        vehicle: {
          include: { owner: true },
        },
      },
    });

    if (planningVehicles.length > 0) {
      return planningVehicles;
    }

    return this.getHistoryVehiclesByPlanning(planningId);
  }
}