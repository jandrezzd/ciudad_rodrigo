import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanningDto } from './DTOs/create-planning.dto';
import { UpdatePlanningDto } from './DTOs/update-planning.dto';
import { VehicleCanteraDto } from './DTOs/vehicle-cantera.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PlanningsService {
  private readonly logger = new Logger(PlanningsService.name);
  private readonly uploadDir = path.join(
    __dirname,
    '..',
    '..',
    'uploads',
    'invoice',
  );

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
    const transports = await this.prisma.transportTrip.findMany({
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
          `El propietario del vehÃ­culo ${vehicle.plate} no estÃ¡ activo`,
        );
      }
    } else if (!vehicle.company) {
      throw new BadRequestException(
        `El vehÃ­culo ${vehicle.plate} no tiene propietario ni compaÃ±Ã­a responsable asignada`,
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

  /**
   * Resuelve con qué cantera despacha cada vehículo. Si la planificación tiene
   * una sola cantera, todos los vehículos la reciben por defecto y no hace
   * falta elegirla a mano.
   */
  private resolverCanterasDeVehiculos(
    vehicleIds: number[],
    canteraIds: number[],
    asignaciones?: VehicleCanteraDto[],
  ): Map<number, number | null> {
    const explicitas = new Map<number, number | null>(
      (asignaciones ?? []).map((a) => [a.vehicleId, a.canteraId ?? null]),
    );

    const canterasValidas = new Set(canteraIds);
    for (const [vehicleId, canteraId] of explicitas) {
      if (canteraId != null && !canterasValidas.has(canteraId)) {
        throw new BadRequestException(
          `La cantera ${canteraId} no pertenece a esta planificación (vehículo ${vehicleId})`,
        );
      }
    }

    const porDefecto = canteraIds.length === 1 ? canteraIds[0] : null;

    return new Map(
      vehicleIds.map((vehicleId) => [
        vehicleId,
        explicitas.has(vehicleId) ? explicitas.get(vehicleId)! : porDefecto,
      ]),
    );
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
    this.logger.log(`Nuevo cÃ³digo de planificaciÃ³n generado: ${planningCode}`);
    return planningCode;
  }

  async create(data: CreatePlanningDto, files?: any) {
    const client = await this.prisma.client.findUnique({
      where: { id: data.clientId },
    });
    if (!client || !client.isActive) {
      throw new BadRequestException('El cliente no existe o estÃ¡ inactivo');
    }

    const constSite = await this.prisma.constSite.findUnique({
      where: { id: data.constSiteId },
    });
    if (!constSite || !constSite.isActive) {
      throw new BadRequestException('La obra no existe o estÃ¡ inactivo');
    }

    if (!data.vehicleIds || data.vehicleIds.length === 0) {
      throw new BadRequestException('Se requiere al menos un vehÃ­culo');
    }

    for (const vehicleId of data.vehicleIds) {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId },
        include: { owner: true, qrcode: true, plannings: { include: { planning: true } }, driver: true },
      });

      if (!vehicle) {
        throw new BadRequestException(`El vehÃ­culo no existe`);
      }

      if (!vehicle.isActive) {
        throw new BadRequestException(`El vehÃ­culo ${vehicle.plate} no estÃ¡ activo`);
      }

      if (!vehicle.qrcodeId || !vehicle.qrcode) {
        throw new BadRequestException(
          `El vehÃ­culo ${vehicle.plate} no tiene un cÃ³digo QR asignado. No se puede agregar a una planificaciÃ³n`,
        );
      }

      this.validateVehicleOwnership(vehicle);

      const hasActivePlanning = vehicle.plannings.some(
        (pv) => pv.planning?.isActive !== false
          && !['COMPLETADO', 'CANCELADO'].includes(pv.planning?.status),
      );

      if (hasActivePlanning) {
        throw new BadRequestException(
          `El vehÃ­culo ${vehicle.plate} ya estÃ¡ asignado a otra planificaciÃ³n`,
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
        distanciaAproximadaKm: data.distanciaAproximadaKm,
        tiempoPromedioViajeMin: data.tiempoPromedioViajeMin,
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
            cantera: true,
          },
        },
      },
    });

    const canteraIds = data.canteraIds ?? [];

    if (canteraIds.length > 0) {
      for (const canteraId of canteraIds) {
        await this.prisma.planningCantera.create({
          data: {
            planningId: planning.id,
            canteraId,
          }
        });
      }
    }

    const canterasPorVehiculo = this.resolverCanterasDeVehiculos(
      data.vehicleIds,
      canteraIds,
      data.vehicleCanteras,
    );

    for (const vehicleId of data.vehicleIds) {
      await this.prisma.planningVehicle.create({
        data: {
          planningId: planning.id,
          vehicleId,
          canteraId: canterasPorVehiculo.get(vehicleId) ?? null,
        },
      });
    }

    // Si se proporciona numeroFactura, actualizar todos los transportes de esta planificaciÃ³n
    if (data.numeroFactura) {
      await this.prisma.transportTrip.updateMany({
        where: {
          planningId: planning.id,
        },
        data: {
          numeroFactura: data.numeroFactura,
        },
      });
      this.logger.log(`NÃºmero de factura ${data.numeroFactura} asignado a transportes de planificaciÃ³n ${planning.id}`);
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
            cantera: true,
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
            cantera: true,
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
      throw new NotFoundException('PlanificaciÃ³n no encontrada');
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
    if (data.distanciaAproximadaKm !== undefined) {
      updateData.distanciaAproximadaKm = data.distanciaAproximadaKm;
    }
    if (data.tiempoPromedioViajeMin !== undefined) {
      updateData.tiempoPromedioViajeMin = data.tiempoPromedioViajeMin;
    }

    // Procesar archivo PDF si existe
    if (files?.invoice?.[0]) {
      updateData.invoicePath = files.invoice[0].filename;
      this.logger.log(`Archivo de factura actualizado: ${updateData.invoicePath}`);
    }

    await this.prisma.$transaction(async (tx) => {
      // Las canteras de la planificación mandan sobre la asignación por vehículo:
      // si vienen en esta misma llamada, se usan esas; si no, las ya guardadas.
      const canteraIdsVigentes = data.canteraIds
        ?? (
          await tx.planningCantera.findMany({
            where: { planningId: id },
            select: { canteraId: true },
          })
        ).map((pc) => pc.canteraId);

      if (data.vehicleIds) {
        for (const vehicleId of data.vehicleIds) {
          const vehicle = await tx.vehicle.findUnique({
            where: { id: vehicleId },
            include: { owner: true, qrcode: true, plannings: { include: { planning: true } } },
          });

          if (!vehicle) {
            throw new BadRequestException(`El vehÃ­culo no existe`);
          }

          if (!vehicle.isActive) {
            throw new BadRequestException(`El vehÃ­culo ${vehicle.plate} no estÃ¡ activo`);
          }

          if (!vehicle.qrcodeId || !vehicle.qrcode) {
            throw new BadRequestException(
              `El vehÃ­culo ${vehicle.plate} no tiene un cÃ³digo QR asignado. No se puede agregar a una planificaciÃ³n`,
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
              `El vehÃ­culo ${vehicle.plate} ya estÃ¡ asignado a otra planificaciÃ³n`,
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

        const canterasPorVehiculo = this.resolverCanterasDeVehiculos(
          data.vehicleIds,
          canteraIdsVigentes,
          data.vehicleCanteras,
        );

        for (const vehicleId of data.vehicleIds) {
          const existingPlanningVehicle = await tx.planningVehicle.findFirst({
            where: {
              planningId: id,
              vehicleId,
            },
          });

          const canteraId = canterasPorVehiculo.get(vehicleId) ?? null;

          if (!existingPlanningVehicle) {
            await tx.planningVehicle.create({
              data: {
                planningId: id,
                vehicleId,
                canteraId,
              },
            });
          } else if (existingPlanningVehicle.canteraId !== canteraId) {
            await tx.planningVehicle.update({
              where: { id: existingPlanningVehicle.id },
              data: { canteraId },
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

        // Un vehículo no puede quedar apuntando a una cantera que ya no está
        // en la planificación.
        await tx.planningVehicle.updateMany({
          where: {
            planningId: id,
            canteraId: { notIn: data.canteraIds },
          },
          data: { canteraId: null },
        });

        // Si quedó una sola cantera, pasa a ser la de todos.
        if (data.canteraIds.length === 1) {
          await tx.planningVehicle.updateMany({
            where: { planningId: id, canteraId: null },
            data: { canteraId: data.canteraIds[0] },
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

    // Si se proporciona numeroFactura, actualizar todos los transportes de esta planificaciÃ³n
    if (data.numeroFactura) {
      await this.prisma.transportTrip.updateMany({
        where: {
          planningId: id,
        },
        data: {
          numeroFactura: data.numeroFactura,
        },
      });
      this.logger.log(`NÃºmero de factura ${data.numeroFactura} asignado a transportes de planificaciÃ³n ${id}`);
    }

    return this.findOne(id);
  }

  async remove(id: number) {
    const planning = await this.prisma.planning.findUnique({
      where: { id },
    });

    if (!planning) {
      throw new NotFoundException('PlanificaciÃ³n no encontrada');
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

  async addVehicle(planningId: number, vehicleId: number, canteraId?: number | null) {
    const planning = await this.prisma.planning.findUnique({
      where: { id: planningId },
      include: { canteras: { select: { canteraId: true } } },
    });

    if (!planning) {
      throw new NotFoundException('PlanificaciÃ³n no encontrada');
    }

    if (planning.isActive === false || ['COMPLETADO', 'CANCELADO'].includes(planning.status)) {
      throw new BadRequestException('No se puede agregar vehÃ­culos a una planificaciÃ³n finalizada o eliminada');
    }

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId },
      include: { owner: true, plannings: { include: { planning: true } }, driver: true },
    });

    if (!vehicle) {
      throw new BadRequestException('VehÃ­culo no encontrado');
    }

    if (!vehicle.isActive) {
      throw new BadRequestException('El vehÃ­culo no estÃ¡ activo');
    }

    this.validateVehicleOwnership(vehicle);

    const hasActivePlanning = vehicle.plannings.some(
      (pv) => pv.planning?.isActive !== false
        && !['COMPLETADO', 'CANCELADO'].includes(pv.planning?.status),
    );

    if (hasActivePlanning) {
      throw new BadRequestException('El vehÃ­culo ya estÃ¡ asignado a otra planificaciÃ³n');
    }

    const canteraIds = planning.canteras.map((pc) => pc.canteraId);
    const canteraAsignada = this.resolverCanterasDeVehiculos(
      [vehicleId],
      canteraIds,
      canteraId !== undefined ? [{ vehicleId, canteraId }] : undefined,
    ).get(vehicleId);

    return this.prisma.planningVehicle.create({
      data: {
        planningId,
        vehicleId,
        canteraId: canteraAsignada ?? null,
      },
      include: {
        vehicle: {
          include: { owner: true },
        },
        cantera: true,
      },
    });
  }

  /** Cambia la cantera desde la que despacha un vehículo ya asignado */
  async setVehicleCantera(
    planningId: number,
    vehicleId: number,
    canteraId: number | null,
  ) {
    const planningVehicle = await this.prisma.planningVehicle.findFirst({
      where: { planningId, vehicleId },
    });

    if (!planningVehicle) {
      throw new NotFoundException('El vehículo no está asignado a esta planificación');
    }

    if (canteraId != null) {
      const pertenece = await this.prisma.planningCantera.findFirst({
        where: { planningId, canteraId },
      });
      if (!pertenece) {
        throw new BadRequestException(
          'La cantera no pertenece a esta planificación',
        );
      }
    }

    return this.prisma.planningVehicle.update({
      where: { id: planningVehicle.id },
      data: { canteraId },
      include: {
        vehicle: { include: { owner: true } },
        cantera: true,
      },
    });
  }

  async removeVehicle(planningId: number, vehicleId: number) {
    const planning = await this.prisma.planning.findUnique({
      where: { id: planningId },
    });

    if (!planning) {
      throw new NotFoundException('PlanificaciÃ³n no encontrada');
    }

    return this.prisma.planningVehicle.deleteMany({
      where: {
        planningId,
        vehicleId,
      },
    });
  }

  /**
   * Consumo de material de esta planificación, agrupado por cantera y material.
   *
   * Cruza las dos puntas de la cadena: lo despachado por los viajes de esta
   * planificación contra el stock asignado a la cantera. `consumidoEnPlanificacion`
   * es solo de esta planificación; `consumidoTotal` incluye todas las que usan
   * la misma cantera, por eso el disponible puede ser menor de lo esperado.
   */
  async getConsumoMaterial(planningId: number) {
    const planning = await this.prisma.planning.findUnique({
      where: { id: planningId },
      select: { id: true, planningCode: true },
    });

    if (!planning) {
      throw new NotFoundException('Planificación no encontrada');
    }

    const canterasDelPlan = await this.prisma.planningCantera.findMany({
      where: { planningId },
      include: {
        cantera: {
          include: {
            materialProvider: {
              select: { id: true, ruc: true, razonsocial: true, nombreComercial: true },
            },
            materiales: {
              include: {
                material: true,
                movimientos: {
                  select: { m3: true, toneladas: true, trip: { select: { planningId: true } } },
                },
              },
            },
          },
        },
      },
    });

    const canteras = canterasDelPlan.map(({ cantera }) => {
      const materiales = cantera.materiales.map((cm) => {
        const consumidoTotalM3 = cm.movimientos.reduce((t, m) => t + (m.m3 ?? 0), 0);
        const consumidoTotalToneladas = cm.movimientos.reduce(
          (t, m) => t + (m.toneladas ?? 0),
          0,
        );

        const deEstePlan = cm.movimientos.filter(
          (m) => m.trip?.planningId === planningId,
        );
        const consumidoEnPlanificacionM3 = deEstePlan.reduce((t, m) => t + (m.m3 ?? 0), 0);
        const consumidoEnPlanificacionToneladas = deEstePlan.reduce(
          (t, m) => t + (m.toneladas ?? 0),
          0,
        );

        const asignadoM3 = cm.metrosCubicos ?? 0;
        const asignadoToneladas = cm.toneladas ?? 0;

        return {
          canteraMaterialId: cm.id,
          materialId: cm.materialId,
          material: cm.material,
          factor: cm.factor,
          asignadoM3,
          asignadoToneladas,
          consumidoEnPlanificacionM3,
          consumidoEnPlanificacionToneladas,
          consumidoTotalM3,
          consumidoTotalToneladas,
          disponibleM3: asignadoM3 - consumidoTotalM3,
          disponibleToneladas: asignadoToneladas - consumidoTotalToneladas,
          excedido: asignadoM3 - consumidoTotalM3 < 0,
          viajes: deEstePlan.length,
        };
      });

      return {
        canteraId: cantera.id,
        nombre: cantera.nombre,
        materialProvider: cantera.materialProvider,
        materiales,
      };
    });

    const totales = canteras
      .flatMap((c) => c.materiales)
      .reduce(
        (acc, m) => ({
          consumidoM3: acc.consumidoM3 + m.consumidoEnPlanificacionM3,
          consumidoToneladas: acc.consumidoToneladas + m.consumidoEnPlanificacionToneladas,
          viajes: acc.viajes + m.viajes,
        }),
        { consumidoM3: 0, consumidoToneladas: 0, viajes: 0 },
      );

    return { planningId: planning.id, planningCode: planning.planningCode, canteras, totales };
  }

  async getVehiclesByPlanning(planningId: number) {
    const planning = await this.prisma.planning.findUnique({
      where: { id: planningId },
    });

    if (!planning) {
      throw new NotFoundException('PlanificaciÃ³n no encontrada');
    }

    const planningVehicles = await this.prisma.planningVehicle.findMany({
      where: { planningId },
      include: {
        vehicle: {
          include: { owner: true },
        },
        cantera: true,
      },
    });

    if (planningVehicles.length > 0) {
      return planningVehicles;
    }

    return this.getHistoryVehiclesByPlanning(planningId);
  }
}
