import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import { createCanvas } from 'canvas';

/**
 * QR de venta por cantera.
 *
 * Dos diferencias de fondo con el QR de vehículo:
 *
 * 1. El código se DERIVA del id de la cantera ("VC-003"), no de una secuencia.
 *    No hay lotes anónimos que repartir: el QR pertenece a una cantera concreta
 *    y no cambia nunca. Regenerar la imagen reescribe el mismo código, así que
 *    los QR ya impresos y pegados en la caseta siguen sirviendo.
 * 2. La existencia de la fila es lo que marca a la cantera como punto de venta.
 *    No hay bandera aparte que pueda quedar en contradicción con el QR.
 */
@Injectable()
export class VentasQrService {
  // Carpeta propia. `uploads/qr/`, la de los QR de vehículo, no se toca.
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'qr-ventas');
  private readonly logger = new Logger(VentasQrService.name);

  constructor(private prisma: PrismaService) {
    this.ensureUploadDirectory();
  }

  private ensureUploadDirectory() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /** "VC-003". Estable de por vida porque el id de la cantera lo es. */
  private codigoDeCantera(canteraId: number): string {
    return `VC-${String(canteraId).padStart(3, '0')}`;
  }

  /**
   * PNG con el QR y, debajo, el código y el nombre de la cantera en texto: quien
   * lo pega en la caseta necesita saber cuál es sin escanearlo.
   */
  private async renderQr(
    codigo: string,
    nombreCantera: string,
    qrPath: string,
  ): Promise<void> {
    const canvasWidth = 320;
    const canvasHeight = 390;
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const qrCanvas = createCanvas(300, 300);
    await QRCode.toCanvas(qrCanvas, codigo, {
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
    ctx.fillText(codigo, 10, canvasHeight - 40);

    ctx.font = '16px Arial';
    ctx.fillStyle = '#444444';
    // Recortado para que un nombre largo no se salga del lienzo.
    ctx.fillText((nombreCantera || '').slice(0, 32), 10, canvasHeight - 14);

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(qrPath, buffer);
  }

  /**
   * Genera o regenera el QR de las canteras indicadas. Devuelve las rutas para
   * que el navegador arme el ZIP, igual que hace con los QR de vehículo: en el
   * backend no hay librería de compresión y no hace falta agregarla.
   */
  async generar(canteraIds: number[]) {
    const unicos = [...new Set(canteraIds)];

    const canteras = await this.prisma.cantera.findMany({
      where: { id: { in: unicos } },
      select: { id: true, nombre: true },
    });

    if (canteras.length !== unicos.length) {
      const encontradas = new Set(canteras.map((c) => c.id));
      const faltantes = unicos.filter((id) => !encontradas.has(id));
      throw new NotFoundException(
        `No existen las canteras: ${faltantes.join(', ')}`,
      );
    }

    const qrUrls: string[] = [];

    for (const cantera of canteras) {
      const qrcode = this.codigoDeCantera(cantera.id);
      const qrPath = path.join(this.uploadDir, `${qrcode}.png`);
      const url = `uploads/qr-ventas/${qrcode}.png`;

      await this.renderQr(qrcode, cantera.nombre ?? '', qrPath);

      // Upsert: regenerar el QR de una cantera que ya lo tenía reescribe la
      // imagen y la reactiva, sin crear una segunda fila ni cambiar el código.
      await this.prisma.canteraVentaQr.upsert({
        where: { canteraId: cantera.id },
        create: { canteraId: cantera.id, qrcode, url, isActive: true },
        update: { url, isActive: true },
      });

      qrUrls.push(url);
      this.logger.log(
        `QR de venta generado | cantera ${cantera.id} (${cantera.nombre}) | ${qrcode}`,
      );
    }

    return { success: true, qrUrls };
  }

  /** Canteras que hoy son punto de venta, con su QR. */
  findAll() {
    return this.prisma.canteraVentaQr.findMany({
      where: { isActive: true },
      include: {
        cantera: {
          select: {
            id: true,
            nombre: true,
            provincia: true,
            canton: true,
            materialProvider: { select: { id: true, razonsocial: true } },
          },
        },
      },
      orderBy: { canteraId: 'asc' },
    });
  }

  /**
   * Baja lógica: la cantera deja de ser punto de venta. Las ventas ya
   * registradas se conservan — son hechos ocurridos, no configuración.
   */
  async desactivar(canteraId: number) {
    const qr = await this.prisma.canteraVentaQr.findUnique({
      where: { canteraId },
    });
    if (!qr) throw new NotFoundException('LA CANTERA NO ES PUNTO DE VENTA');

    return this.prisma.canteraVentaQr.update({
      where: { canteraId },
      data: { isActive: false },
    });
  }

  /**
   * Materiales que ofrece el formulario de venta.
   *
   * Si la cantera declara materiales en `CanteraMaterial` se usan esos, que es
   * información útil. Pero una cantera de venta normalmente NO los declara —
   * esa tabla existe para llevar el saldo asignado, y en el punto de venta no
   * hay saldo — así que sin este respaldo el selector saldría vacío y no se
   * podría registrar nada.
   */
  private async materialesDisponibles(canteraId: number) {
    const declarados = await this.prisma.canteraMaterial.findMany({
      where: { canteraId },
      select: { material: { select: { id: true, materialType: true } } },
    });

    if (declarados.length > 0) return declarados.map((m) => m.material);

    return this.prisma.material.findMany({
      select: { id: true, materialType: true },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Resuelve un QR escaneado a su cantera y los materiales que puede despachar,
   * que es lo que la app necesita para armar el formulario.
   */
  async scan(qrcode: string) {
    const registro = await this.prisma.canteraVentaQr.findUnique({
      where: { qrcode: (qrcode ?? '').trim().toUpperCase() },
      include: {
        cantera: {
          select: {
            id: true,
            nombre: true,
            provincia: true,
            canton: true,
            direccion: true,
          },
        },
      },
    });

    if (!registro || !registro.isActive) {
      throw new NotFoundException('QR DE VENTA NO ENCONTRADO O DESACTIVADO');
    }

    return {
      qrcode: registro.qrcode,
      cantera: registro.cantera,
      materiales: await this.materialesDisponibles(registro.canteraId),
    };
  }

  /**
   * Catálogo offline del flujo de ventas. Endpoint propio y no una extensión de
   * `transport/catalog`: tocar ese payload obligaría a versionar la caché de la
   * app y pondría en riesgo el catálogo del flujo que ya funciona.
   *
   * Los vehículos no viajan aquí — la app ya los tiene cacheados del catálogo de
   * transporte y son los mismos.
   */
  async catalog() {
    const registros = await this.findAll();

    const canteras = await Promise.all(
      registros.map(async (r) => ({
        id: r.cantera.id,
        nombre: r.cantera.nombre,
        materialIds: (await this.materialesDisponibles(r.canteraId))
          .map((m) => m.id)
          .join(','),
      })),
    );

    return {
      // Lo consume ServerClock para corregir el desfase del reloj del teléfono
      // al enviar, no al capturar.
      serverTime: new Date().toISOString(),
      qrIndex: Object.fromEntries(
        registros.map((r) => [r.qrcode, r.canteraId]),
      ),
      canteras,
    };
  }
}
