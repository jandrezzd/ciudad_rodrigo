import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import { createCanvas } from 'canvas';

@Injectable()
export class VehiclesService {
  private readonly uploadDir = path.join(
    __dirname,
    '..',
    '..',
    'uploads',
    'qr',
  );
  private readonly logger = new Logger(VehiclesService.name);

  constructor(private prisma: PrismaService) {
    this.ensureUploadDirectory();
  }

  private ensureUploadDirectory() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async create(data: any) {
    if (data.ownerId) {
      const owner = await this.prisma.owner.findUnique({
        where: { id: data.ownerId },
      });

      if (!owner) {
        throw new NotFoundException('Owner no existe');
      }
    }

    if (data.qrcodeId) {
      const qrcode = await this.prisma.vehicleQRCode.findUnique({
        where: { id: data.qrcodeId },
      });

      if (!qrcode) {
        throw new NotFoundException('QRCode no existe');
      }

      if (qrcode.status !== 'DISPONIBLE') {
        throw new BadRequestException('QRCode no está disponible');
      }
    }

    const vehicle = await this.prisma.vehicle.create({
      data,
      include: {
        qrcode: true,
      },
    });

    if (vehicle.qrcodeId) {
      await this.prisma.vehicleQRCode.update({
        where: { id: vehicle.qrcodeId },
        data: { status: 'OCUPADO' },
      });
      this.logger.log(`QR ${vehicle.qrcode?.qrcode} marcado como OCUPADO (vehículo creado)`);
    }

    return vehicle;
  }

  findAll() { return this.prisma.vehicle.findMany({ include: { driver: true, owner: true, qrcode:true}});}

  async update(id: number, data: any) {
    const vehicle = await this.prisma.vehicle.findUnique({ include: { qrcode: true }, where: { id }});

    if (!vehicle) {
      throw new NotFoundException(`Vehículo con ID ${id} no existe`);
    }

    if (data.qrcodeId !== undefined && data.qrcodeId !== vehicle.qrcodeId) {
      if (vehicle.qrcodeId) {
        await this.prisma.vehicleQRCode.update({
          where: { id: vehicle.qrcodeId },
          data: { status: 'DISPONIBLE' },
        });
        this.logger.log(`QR ${vehicle.qrcode?.qrcode} marcado como DISPONIBLE (desasignado)`);
      }

      if (data.qrcodeId !== null) {
        const newQRCode = await this.prisma.vehicleQRCode.findUnique({
          where: { id: data.qrcodeId },
        });

        if (!newQRCode) {
          throw new NotFoundException('QRCode no existe');
        }

        if (newQRCode.status !== 'DISPONIBLE') {
          throw new BadRequestException('QRCode no está disponible');
        }

        await this.prisma.vehicleQRCode.update({
          where: { id: data.qrcodeId },
          data: { status: 'OCUPADO' },
        });
        this.logger.log(`QR ${newQRCode.qrcode} marcado como OCUPADO (asignado a vehículo)`);
      }
    }

    if (data.isActive === false && vehicle.isActive !== false) {
      await this.prisma.planningVehicle.deleteMany({
        where: { vehicleId: id },
      });
    }

    const updated = await this.prisma.vehicle.update({
      where: { id },
      data,
      include: {
        qrcode: true,
      },
    });

    return updated;
  }

  remove(id: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.planningVehicle.deleteMany({
        where: { vehicleId: id },
      });

      return tx.vehicle.update({
        where: { id },
        data: { isActive: false },
      });
    });
  }

  private async generateQRWithText(
    vehicleId: string,
    qrPath: string,
  ): Promise<void> {
    const canvasWidth = 320;
    const canvasHeight = 360;
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const qrCanvas = createCanvas(300, 300);
    await QRCode.toCanvas(qrCanvas, vehicleId, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    const qrImage = qrCanvas.getContext('2d').getImageData(0, 0, 300, 300);
    ctx.putImageData(qrImage, 10, 10);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(vehicleId, 10, canvasHeight - 10);

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(qrPath, buffer);
  }

  async generateBatch(internalCount: number = 0, externalCount: number = 0) {
    if (internalCount <= 0 && externalCount <= 0) {
      throw new BadRequestException(
        'Debes especificar al menos internalCount o externalCount mayor a 0',
      );
    }

    const qrUrls: string[] = [];

    const generate = async (
      prefix: 'VI' | 'VE',
      count: number,
    ) => {
      if (count <= 0) return;

      let sequence = await this.prisma.vehicleSequence.findUnique({
        where: { prefix },
      });

      if (!sequence) {
        sequence = await this.prisma.vehicleSequence.create({
          data: { prefix, last: 0 },
        });
      }

      const updated = await this.prisma.vehicleSequence.update({
        where: { prefix },
        data: {
          last: { increment: count },
        },
      });

      const start = updated.last - count + 1;
      const end = updated.last;

      for (let i = start; i <= end; i++) {
        const vehicleId = `${prefix}-${String(i).padStart(3, '0')}`;
        const qrPath = path.join(this.uploadDir, `${vehicleId}.png`);

        await this.generateQRWithText(vehicleId, qrPath);

        const qrcodeUrl = `uploads/qr/${vehicleId}.png`;

        await this.prisma.vehicleQRCode.create({
          data: {
            qrcode: vehicleId,
            url: qrcodeUrl,
            status: 'DISPONIBLE',
          },
        });

        qrUrls.push(qrcodeUrl);
      }
    };

    await generate('VI', internalCount);
    await generate('VE', externalCount);

    return {
      success: true,
      qrUrls: qrUrls,
    };
  }

  async getAvailableQRCodes() {
    return this.prisma.vehicleQRCode.findMany({
      where: { status: 'DISPONIBLE' },
      select: {
        id: true,
        qrcode: true,
        url: true,
        status: true,
      },
    });
  }

  async getQRCodeByVehicleId(vehicleId: number) {
    const vehicle = await this.prisma.vehicle.findUnique({ include: { qrcode: true }, where: { id: vehicleId }});

    if (!vehicle) {
      throw new NotFoundException(`Vehicle con ID ${vehicleId} no existe`);
    }

    if (!vehicle.qrcode) {
      return {
        message: 'El vehículo no tiene un código QR asignado',
        url: null,
      };
    }

    return {
      vehicleId: vehicle.id,
      qrcodeId: vehicle.qrcode.id,
      qrcode: vehicle.qrcode.qrcode,
      url: vehicle.qrcode.url,
      status: vehicle.qrcode.status,
    };
  }

  async generateNewQRForVehicle(vehicleId: number) {
    const vehicle = await this.prisma.vehicle.findUnique({ include: { qrcode: true }, where: { id: vehicleId }});

    if (!vehicle) {
      throw new NotFoundException(`Vehicle con ID ${vehicleId} no existe`);
    }

    let prefix: 'VI' | 'VE' = 'VI';
    const previousQRCode = vehicle.qrcode?.qrcode || null;

    if (previousQRCode) {
      const previousPrefix = previousQRCode.split('-')[0];
      prefix = (previousPrefix === 'VE' ? 'VE' : 'VI') as 'VI' | 'VE';
    } else if (vehicle.type === 'EXTERNO') {
      prefix = 'VE';
    }

    let sequence = await this.prisma.vehicleSequence.findUnique({
      where: { prefix },
    });

    if (!sequence) {
      sequence = await this.prisma.vehicleSequence.create({
        data: { prefix, last: 0 },
      });
    }

    const updated = await this.prisma.vehicleSequence.update({
      where: { prefix },
      data: { last: { increment: 1 } },
    });

    const newVehicleId = `${prefix}-${String(updated.last).padStart(3, '0')}`;
    const qrPath = path.join(this.uploadDir, `${newVehicleId}.png`);

    await this.generateQRWithText(newVehicleId, qrPath);

    const qrcodeUrl = `uploads/qr/${newVehicleId}.png`;

    await this.prisma.$transaction(async (tx) => {
      const newQRCode = await tx.vehicleQRCode.create({
        data: {
          qrcode: newVehicleId,
          url: qrcodeUrl,
          status: 'OCUPADO',
        },
      });

      if (vehicle.qrcodeId) {
        await tx.vehicleQRCode.update({
          where: { id: vehicle.qrcodeId },
          data: { status: 'DISPONIBLE' },
        });
      }

      await tx.vehicle.update({
        where: { id: vehicleId },
        data: {
          qrcodeId: newQRCode.id,
        },
      });
    });

    if (previousQRCode) {
      const oldQrPath = path.join(this.uploadDir, `${previousQRCode}.png`);
      if (fs.existsSync(oldQrPath)) {
        fs.unlinkSync(oldQrPath);
      }
    }

    const updatedVehicle = await this.prisma.vehicle.findUnique({ include: { qrcode: true }, where: { id: vehicleId }});

    if (!updatedVehicle?.qrcode) {
      throw new BadRequestException('Error al asignar el nuevo código QR');
    }

    this.logger.log(`Nuevo QR ${newVehicleId} generado para vehículo ${vehicleId}`);

    return {
      success: true,
      message: 'Nuevo código QR generado y asignado correctamente',
      vehicleId: updatedVehicle.id,
      qrcodeId: updatedVehicle.qrcode.id,
      qrcode: updatedVehicle.qrcode.qrcode,
      url: updatedVehicle.qrcode.url,
      previousQRCode: previousQRCode,
    };
  }

  async detachQRCode(vehicleId: number) {
    const vehicle = await this.prisma.vehicle.findUnique({ include: { qrcode: true }, where: { id: vehicleId }});

    if (!vehicle) {
      throw new NotFoundException(`Vehículo con ID ${vehicleId} no existe`);
    }

    if (!vehicle.qrcodeId) {
      throw new BadRequestException('El vehículo no tiene un código QR asignado');
    }

    const oldQRCodeId = vehicle.qrcodeId;
    const oldQRCode = vehicle.qrcode?.qrcode;

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { qrcodeId: null },
      });

      await tx.vehicleQRCode.update({
        where: { id: oldQRCodeId },
        data: { status: 'DISPONIBLE' },
      });
    });

    this.logger.log(`QR ${oldQRCode} desasociado del vehículo ${vehicleId} y marcado como DISPONIBLE`);

    return {
      success: true,
      message: 'Código QR desasociado correctamente y marcado como disponible',
      vehicleId: vehicleId,
      qrcodeId: oldQRCodeId,
      qrcode: oldQRCode,
    };
  }
}