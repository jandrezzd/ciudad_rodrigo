import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from '../dashboard/dashboard.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TransportLogService {
  private readonly logger = new Logger(TransportLogService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads/transport');

  constructor(
    private prisma: PrismaService,
    private dashboardService: DashboardService,
  ) {
    this.ensureUploadDirectory();
  }

  private ensureUploadDirectory() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Directorio de uploads creado: ${this.uploadDir}`);
    }
  }

  async getByQrCode(qrcodeValue: string, userId: number) {
    try {
      const qrcodeRecord = await this.prisma.vehicleQRCode.findUnique({
        where: { qrcode: qrcodeValue },
      });

      if (!qrcodeRecord) {
        throw new NotFoundException(`NO SE RECONOCE EL CÓDIGO ${qrcodeValue}`);
      }

      const vehicle = await this.prisma.vehicle.findUnique({ include: { driver: true, owner: true }, where: { qrcodeId: qrcodeRecord.id } });

      if (!vehicle) {
        throw new NotFoundException(
          `EL VEHICULO NO TRABAJA PARA LA COMPAÑÍA`,
        );
      }

      if (!vehicle.isActive) {
        throw new BadRequestException('EL VEHICULO ESTA INACTIVO');
      }

      const activeTransport = await this.prisma.transportLog.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: 'EN_PROGRESO' as any,
        },
        include: {
          vehicle: true,
          owner: true,
          client: true,
          constSite: true,
          planning: true,
          material: true,
        },
      });

      if (activeTransport) {
        return {
          action: 'CONTINUE_TO_ARRIVAL',
          transportId: activeTransport.id,
          data: activeTransport,
        };
      }

      return {
        action: 'CREATE_DEPARTURE',
        vehicle: {
          id: vehicle.id,
          vehicleid: vehicle.vehicleid,
          plate: vehicle.plate,
          type: vehicle.type,
          company: vehicle.company,
          brand: vehicle.brand,
          model: vehicle.model,
          driverId: vehicle.driverId,
          capacity: vehicle.capacity,
          owner: vehicle.owner,
          driver: vehicle.driver,
        },
      };
    } catch (error) {
      this.logger.error(`Error en getByQrCode: ${error.message}`);
      throw error;
    }
  }

  async createDeparture(userId: number, data: any, files: any) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException(`EL USUARIO NO EXISTE`);
      }

      if (user.role === 'SUPERVISOR' ) {
        throw new BadRequestException(
          'USTED NO ES UN SUPERVISOR',
        );
      }
      const userRoleType =
        user.role === 'ADMIN' ? 'ADMIN' : user.roletype || 'CANTERA';

      const vehicleId = parseInt(data.vehicleId);
      const departureLat = parseFloat(data.departureLat);
      const departureLng = parseFloat(data.departureLng);
      const departureM3 = parseFloat(data.departureM3);
      const planningId = data.planningId ? parseInt(data.planningId) : null;
      const materialId = data.materialId ? parseInt(data.materialId) : null;

      if (
        isNaN(vehicleId) ||
        isNaN(departureLat) ||
        isNaN(departureLng) ||
        isNaN(departureM3)
      ) {
        throw new BadRequestException('DATOS DE SALIDA INVÁLIDOS');
      }

      const vehicle = await this.prisma.vehicle.findUnique({ include: { qrcode: true }, where: { id: vehicleId } });

      if (!vehicle || !vehicle.isActive) {
        throw new BadRequestException('EL VEHICULO NO EXISTE O ESTA INACTIVO');
      }

      if (vehicle.ownerId) {
        const owner = await this.prisma.owner.findUnique({
          where: { id: vehicle.ownerId },
        });
        if (!owner || !owner.isActive) {
          throw new BadRequestException(
            'EL PROPIETARIO DEL VEHICULO ESTA INACTIVO',
          );
        }
      } else if (!vehicle.company) {
        throw new BadRequestException(
          'EL VEHICULO NO TIENE PROPIETARIO O COMPAÑÍA ASIGNADA',
        );
      }

      if (materialId) {
        const material = await this.prisma.material.findUnique({
          where: { id: materialId },
        });
        if (!material) {
          throw new NotFoundException(
            `EL MATERIAL NO EXISTE`,
          );
        }
      }

      let clientId: number;
      let constSiteId: number;
      let resolvedPlanningId = planningId;

      if (!resolvedPlanningId) {
        const pv = await this.prisma.planningVehicle.findFirst({
          where: { vehicleId },
        });
        if (pv) resolvedPlanningId = pv.planningId;
      }

      if (resolvedPlanningId) {
        const planning = await this.prisma.planning.findUnique({
          where: { id: resolvedPlanningId },
          include: { vehicles: true },
        });
        if (!planning) throw new NotFoundException('LA PLANIFICACIÓN NO EXISTE');

        clientId = planning.clientId;
        constSiteId = planning.constSiteId;
      } else {
        if (!data.clientId || !data.constSiteId) {
          throw new BadRequestException(
            'FALTA EL CLIENTE O LA OBRA',
          );
        }
        clientId = parseInt(data.clientId);
        constSiteId = parseInt(data.constSiteId);
      }

      if (!files?.material || files.material.length < 1) {
        throw new BadRequestException(
          'FALTA FOTO DEL MATERIAL DE SALIDA',
        );
      }

      const existing = await this.prisma.transportLog.findFirst({
        where: { vehicleId, status: 'EN_PROGRESO' as any },
      });
      if (existing) {
        throw new BadRequestException('EL VEHICULO YA TIENE UN VIAJE EN PROGRESO');
      }

      const photos: any = {
        departureMaterialPhoto1: files.material?.[0]
          ? this.getRelativePath(files.material[0].path)
          : null,
        departureMaterialPhoto2: files.material?.[1]
          ? this.getRelativePath(files.material[1].path)
          : null,
      };

      if (files.driver?.[0])
        photos.departureDriverPhoto = this.getRelativePath(
          files.driver[0].path,
        );
      if (files.vehicle?.[0])
        photos.departureVehiclePhoto = this.getRelativePath(
          files.vehicle[0].path,
        );
      if (files.plate?.[0])
        photos.departurePlatePhoto = this.getRelativePath(files.plate[0].path);

      const transport = await this.prisma.transportLog.create({
        data: {
          user: { connect: { id: userId } },
          vehicle: { connect: { id: vehicleId } },
          client: { connect: { id: clientId } },
          constSite: { connect: { id: constSiteId } },
          ...(vehicle.ownerId && {
            owner: { connect: { id: vehicle.ownerId } },
          }),
          ...(resolvedPlanningId && {
            planning: { connect: { id: resolvedPlanningId } },
          }),
          ...(materialId && { material: { connect: { id: materialId } } }), 
          departureM3,
          departureLat,
          departureLng,
          userRoleType: userRoleType as any,
          ...photos,
          status: 'EN_PROGRESO' as any,
        },
        include: {
          vehicle: true,
          owner: true,
          client: true,
          constSite: true,
          material: true, 
        },
      });

      if (vehicle.qrcode) {
        await this.prisma.vehicleQRCode.update({
          where: { id: vehicle.qrcode.id },
          data: { status: 'OCUPADO' as any },
        });
        this.logger.log(`QR ${vehicle.qrcode.qrcode} marcado como OCUPADO`);
      }

      await this.dashboardService.incrementDepartureCount();
      return { success: true, data: transport };
    } catch (error) {
      this.cleanupFiles(files);
      throw error;
    }
  }

  async registerArrival(
    id: number,
    data: any,
    files: any,
    userArrivalId: number,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userArrivalId },
      });
      if (!user) throw new NotFoundException('USUARIO NO ENCONTRADO');
    
      const userRoleType =
        user.role === 'ADMIN' ? 'ADMIN' : user.roletype || 'OBRA';
    
      if (!files?.material || files.material.length < 1) {
        throw new BadRequestException(
          'FALTA FOTO DEL MATERIAL DE LLEGADA',
        );
      }
    
      const photos: any = {
        arrivalMaterialPhoto1: files.material?.[0]
          ? this.getRelativePath(files.material[0].path)
          : null,
        arrivalMaterialPhoto2: files.material?.[1]
          ? this.getRelativePath(files.material[1].path)
          : null,
      };
    
      if (files.driver?.[0])
        photos.arrivalDriverPhoto = this.getRelativePath(files.driver[0].path);
      if (files.vehicle?.[0])
        photos.arrivalVehiclePhoto = this.getRelativePath(
          files.vehicle[0].path,
        );
      if (files.plate?.[0])
        photos.arrivalPlatePhoto = this.getRelativePath(files.plate[0].path);
    
      const arrivalLat = parseFloat(data.arrivalLat);
      const arrivalLng = parseFloat(data.arrivalLng);
      const arrivalM3 = parseFloat(data.arrivalM3);
  
      if (isNaN(arrivalLat) || isNaN(arrivalLng) || isNaN(arrivalM3)) {
        throw new BadRequestException('DATOS DE LLEGADA INVÁLIDOS');
      }
    
      const updated = await this.prisma.$transaction(async (prisma) => {
        const transport = await prisma.transportLog.findUnique({
          where: { id },
          include: { vehicle: { include: { qrcode: true } } },
        });
      
        if (!transport) {
          throw new BadRequestException('EL TRANSPORTE NO EXISTE');
        }
      
        if (transport.status !== 'EN_PROGRESO') {
          throw new BadRequestException(
            'EL TRANSPORTE NO EXISTE O YA FUE COMPLETADO',
          );
        }
      
        const departureM3Effective = data.departureM3Corrected
          ? parseFloat(data.departureM3Corrected)
          : transport.departureM3;
      
        const deviationM3 = arrivalM3 - departureM3Effective;
        const finalStatus =
          Math.abs(deviationM3) >= 1 ? 'ALERTA' : 'COMPLETADO';
      
        const updated = await prisma.transportLog.update({
          where: { id },
          data: {
            arrivalM3,
            arrivalM3Corrected: data.arrivalM3Corrected
              ? parseFloat(data.arrivalM3Corrected)
              : null,
            departureM3Corrected: data.departureM3Corrected
              ? parseFloat(data.departureM3Corrected)
              : null,
            arrivalLat,
            arrivalLng,
            abscisa: data.abscisa ? parseInt(data.abscisa) : null,
            deviationM3,
            userArrivalId,
            userRoleType: userRoleType as any,
            ...photos,
            arrivalAt: new Date(),
            status: finalStatus as any,
            initialStatus: finalStatus as any,
          },
          include: {
            vehicle: true,
            owner: true,
            client: true,
            constSite: true,
            material: true,
          },
        });
      
        if (transport.vehicle?.qrcode) {
          await prisma.vehicleQRCode.update({
            where: { id: transport.vehicle.qrcode.id },
            data: { status: 'DISPONIBLE' as any },
          });
          this.logger.log(
            `QR ${transport.vehicle.qrcode.qrcode} marcado como DISPONIBLE`,
          );
        }
      
        return updated;
      });
    
      await this.dashboardService.incrementArrivalCount();
    
      this.logger.log(
        `Llegada registrada con éxito | ID: ${updated.id} | Status: ${updated.status}`,
      );
    
      return { success: true, message: 'Llegada registrada', data: updated };
    } catch (error) {
      this.cleanupFiles(files);
      this.logger.error(`Error en registerArrival: ${error.message}`);
      throw error;
    }
  }

  async findAll(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`EL USUARIO NO EXISTE`);
    }

    if (user.role === 'ADMIN' || user.role === 'JEFE_DE_OBRA') {
      return this.prisma.transportLog.findMany({
        include: {
          vehicle: true,
          owner: true,
          client: true,
          constSite: true,
          material: true,
          user: { select: { id: true, name: true } },
          planning: {
            include: {
              canteras: {
                include: {
                  cantera: {
                    include: {
                      materialProvider: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
      });
    }

    return this.prisma.transportLog.findMany({
      where: {
        OR: [{ userId }, { userArrivalId: userId }],
      },
      include: {
        vehicle: true,
        owner: true,
        client: true,
        constSite: true,
        material: true,
        user: { select: { id: true, name: true } },
        planning: {
          include: {
            canteras: {
              include: {
                cantera: {
                  include: {
                    materialProvider: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async findAllByUserId(userId: number) {
    return this.prisma.transportLog.findMany({
      where: {
        OR: [{ userId }, { userArrivalId: userId }],
      },
      include: {
        vehicle: true,
        owner: true,
        client: true,
        constSite: true,
        material: true, 
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllByUserIdWithFilters(
    userId: number,
    vehicleId?: number,
    startDate?: string,
    endDate?: string,
  ) {
    const where: any = {
      OR: [{ userId }, { userArrivalId: userId }],
    };

    if (vehicleId) {
      where.vehicleId = vehicleId;
    }

    if (startDate || endDate) {
      where.departureAt = {};

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        where.departureAt.gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.departureAt.lte = end;
      }
    }

    return this.prisma.transportLog.findMany({
      where,
      include: {
        vehicle: true,
        owner: true,
        client: true,
        constSite: true,
        material: true,
        user: { select: { id: true, name: true } },
        planning: {
          include: {
            canteras: {
              include: {
                cantera: {
                  include: {
                    materialProvider: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUniqueVehiclesByUserId(userId: number) {
    const transports = await this.prisma.transportLog.findMany({
      where: {
        OR: [{ userId }, { userArrivalId: userId }],
      },
      include: { vehicle: true },
    });

    const uniqueVehicles = new Map();
    transports.forEach((transport) => {
      if (transport.vehicle && !uniqueVehicles.has(transport.vehicle.id)) {
        uniqueVehicles.set(transport.vehicle.id, transport.vehicle);
      }
    });

    return Array.from(uniqueVehicles.values());
  }

  async findOne(id: number) {
    const transport = await this.prisma.transportLog.findUnique({
      where: { id },
      include: {
        vehicle: true,
        owner: true,
        client: true,
        constSite: true,
        material: true,
        user: { select: { id: true, name: true } },
        planning: {
          include: {
            canteras: {
              include: {
                cantera: {
                  include: {
                    materialProvider: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!transport) throw new NotFoundException('EL REGISTRO NO EXISTE');
    return transport;
  }

  async correctMaterial(
    id: number,
    data: { departureM3Corrected?: number; arrivalM3Corrected?: number },
    userId: number,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user) throw new NotFoundException('EL USUARIO NO EXISTE');

      const transport = await this.prisma.transportLog.findUnique({
        where: { id },
      });
      if (!transport) throw new NotFoundException('EL REGISTRO NO EXISTE');

      // Solo JEFE_DE_OBRA tiene restricción de solo editar en ALERTA
      if (user.role === 'JEFE_DE_OBRA' && transport.status !== 'ALERTA') {
        throw new BadRequestException(
          `SOLO SE PUEDEN EDITAR LOS M3 CUANDO EL ESTADO ES ALERTA.`,
        );
      }

      const dM3 =
        data.departureM3Corrected ??
        (transport as any).departureM3Corrected ??
        transport.departureM3;
      const aM3 =
        data.arrivalM3Corrected ??
        (transport as any).arrivalM3Corrected ??
        (transport as any).arrivalM3;
      const deviationM3 = aM3 - dM3;

      // Determinar el estado según el rol del usuario
      const finalStatus = user.role === 'ADMIN' ? 'REVISADO' : 'VALIDADO';

      const updated = await this.prisma.transportLog.update({
        where: { id },
        data: {
          departureM3Corrected: data.departureM3Corrected,
          arrivalM3Corrected: data.arrivalM3Corrected,
          deviationM3,
          status: finalStatus as any,
        },
        include: {
          vehicle: true,
          owner: true,
          client: true,
          constSite: true,
          material: true, 
        },
      });

      return { success: true, data: updated };
    } catch (error) {
      throw error;
    }
  }

  async markAsAlert(id: number) {
    try {
      const transport = await this.prisma.transportLog.findUnique({
        where: { id },
      });
      if (!transport) throw new NotFoundException('EL REGISTRO NO EXISTE');

      const updated = await this.prisma.transportLog.update({
        where: { id },
        data: {
          status: 'ALERTA' as any,
          initialStatus: 'ALERTA' as any,
        },
        include: {
          vehicle: true,
          owner: true,
          client: true,
          constSite: true,
          material: true,
        },
      });

      this.logger.log(`Registro ${id} marcado como ALERTA con initialStatus actualizado`);
      return { success: true, data: updated };
    } catch (error) {
      throw error;
    }
  }

  async updateTransportStatus(
    id: number,
    newStatus: string,
  ) {
    try {
      const transport = await this.prisma.transportLog.findUnique({
        where: { id },
      });
      if (!transport) throw new NotFoundException('EL REGISTRO NO EXISTE');

      const allowedOrigins = ['COMPLETADO', 'VALIDADO', 'ALERTA'];
      if (newStatus === 'REVISADO' && !allowedOrigins.includes(transport.status as string)) {
        throw new BadRequestException(
          `NO SE PUEDE CAMBIAR A EL ESTADO REVISADO DESDE ${transport.status}.`,
        );
      }

      const updated = await this.prisma.transportLog.update({
        where: { id },
        data: {
          status: newStatus as any,
        },
        include: {
          vehicle: true,
          owner: true,
          client: true,
          constSite: true,
          material: true,
        },
      });

      this.logger.log(`Registro ${id} cambio de ${transport.status} a ${newStatus}`);
      return { success: true, data: updated };
    } catch (error) {
      throw error;
    }
  }

  private cleanupFiles(files: any) {
    if (!files) return;
    const fields = ['driver', 'vehicle', 'plate', 'material'];
    fields.forEach((f) => {
      if (Array.isArray(files[f])) {
        files[f].forEach((file) => {
          try {
            fs.unlinkSync(file.path);
          } catch (e) {}
        });
      }
    });
  }

  private getRelativePath(filePath: string): string {
    return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  }
}