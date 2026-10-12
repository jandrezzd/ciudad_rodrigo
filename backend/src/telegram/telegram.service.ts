import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface TgResponse<T> {
  ok: boolean;
  result: T;
  error_code?: number;
  description?: string;
}

interface TgMessage {
  message_id: number;
  from?: { id: number; first_name?: string };
  chat: { id: number; type: string };
  text?: string;
  contact?: { phone_number: string; user_id?: number };
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

class TelegramApiError extends Error {
  constructor(
    readonly code: number | undefined,
    description: string | undefined,
  ) {
    super(`Telegram ${code ?? '?'}: ${description ?? 'sin descripción'}`);
  }
}

/** Lo mínimo de una orden que hace falta para el aviso. */
/** Nombre legal de cada empresa vendedora, para el aviso de una orden. */
const EMPRESA_VENDEDORA_NOMBRE: Record<string, string> = {
  CIUDAD_RODRIGO: 'Ciudad Rodrigo',
  DISTRASA: 'DISTRASA S.A.',
  TRANSLOGPACIFIC: 'TRANSPORTE Y LOGISTICA DEL PACIFICO TRANSLOGPACIFIC S.A.',
};

export interface OrdenParaAviso {
  codigo: string;
  /** Null solo en órdenes anteriores al campo. */
  empresaVendedora?: string | null;
  transportista?: { name: string } | null;
  observacion: string | null;
  placas: string[];
  /** Vehículos asignados; `placas` queda para órdenes viejas. */
  vehiculos?: { vehicle: { plate: string; capacity: number } }[];
  client: { name: string; companyname: string | null };
  constSite: { name: string };
  items: { m3Asignados: number; material: { materialType: string } }[];
}

/** Lo mínimo para el aviso de "este material ya casi se acaba". */
export interface MaterialBajoParaAviso {
  codigo: string;
  obra: string;
  materialType: string;
  disponibleM3: number;
}

const BOTON_COMPARTIR = 'Compartir mi número';
const ESPERA_REINTENTO_MS = 5000;

const escaparHtml = (texto: string) =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Últimos 9 dígitos: 0987654321, +593987654321 y 593987654321 coinciden. */
const ultimos9 = (telefono: string) => telefono.replace(/\D/g, '').slice(-9);

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Bot de avisos de órdenes de venta (t.me/cr_ordenes_bot).
 *
 * Un bot no puede escribirle a nadie por número de teléfono: el usuario tiene
 * que abrir el bot y compartir su contacto; ahí se guarda su chat en
 * User.telegramChatId, cruzando el número con User.phone.
 *
 * Los mensajes del bot se leen por long polling solo si TELEGRAM_POLLING=true:
 * Telegram rechaza dos getUpdates simultáneos con el mismo token, así que
 * debe estar activo en un único servidor.
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token = process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
  private polling = false;
  private offset = 0;
  private abort?: AbortController;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    if (!this.token) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN no definido: avisos por Telegram desactivados',
      );
      return;
    }
    if (process.env.TELEGRAM_POLLING === 'true') {
      this.polling = true;
      void this.bucleDePolling();
    }
  }

  onModuleDestroy() {
    this.polling = false;
    this.abort?.abort();
  }

  // ─── Avisos a los supervisores de cantera ───────────────────────────────────

  /** Manda `texto` a todos los supervisores de cantera vinculados. Devuelve
   *  cuántos lo recibieron, para que quien llamó (ej. un botón manual) pueda
   *  informar "enviado a 2" o "nadie vinculado todavía". */
  private async enviarATodosCanteraSupervisor(texto: string): Promise<number> {
    if (!this.token) return 0;

    const destinatarios = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roletype: 'CANTERA',
        roleRef: { name: 'SUPERVISOR' },
        telegramChatId: { not: null },
      },
      select: { id: true, telegramChatId: true },
    });
    if (destinatarios.length === 0) return 0;

    const resultados = await Promise.allSettled(
      destinatarios.map((d) => this.sendMessage(d.telegramChatId!, texto)),
    );

    let enviados = 0;
    resultados.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        enviados++;
      } else {
        this.logger.warn(
          `No se pudo avisar al usuario ${destinatarios[i].id}: ${r.reason}`,
        );
      }
    });
    return enviados;
  }

  async notifyNuevaOrden(orden: OrdenParaAviso): Promise<number> {
    return this.enviarATodosCanteraSupervisor(
      this.armarMensajeOrden('🆕 Nueva orden de venta', orden),
    );
  }

  /** Botón "Enviar a Telegram" del formulario de edición: mismo formato que la
   *  orden nueva, pero avisando que es una modificación de una ya existente. */
  async notifyOrdenModificada(orden: OrdenParaAviso): Promise<number> {
    return this.enviarATodosCanteraSupervisor(
      this.armarMensajeOrden('🔄 Orden de venta modificada', orden),
    );
  }

  /** A una línea de material de una orden le quedan pocos m³ disponibles. */
  async notifyMaterialBajo(info: MaterialBajoParaAviso): Promise<number> {
    const material = info.materialType.replace(/_/g, ' ');
    const disponible = info.disponibleM3.toLocaleString('es-EC', {
      maximumFractionDigits: 2,
    });
    const texto = [
      '<b>⚠️ Material por agotarse</b>',
      `<b>Código:</b> ${escaparHtml(info.codigo)}`,
      `<b>Obra:</b> ${escaparHtml(info.obra)}`,
      `<b>Material:</b> ${escaparHtml(material)}`,
      `Quedan <b>${disponible} m³</b> disponibles de esta línea.`,
    ].join('\n');
    return this.enviarATodosCanteraSupervisor(texto);
  }

  private armarMensajeOrden(titulo: string, orden: OrdenParaAviso): string {
    const cliente = orden.client.companyname || orden.client.name;
    const materiales = orden.items
      .map((i) => {
        const nombre = i.material.materialType.replace(/_/g, ' ');
        const m3 = i.m3Asignados.toLocaleString('es-EC', {
          maximumFractionDigits: 2,
        });
        return `  • ${escaparHtml(nombre)} — ${m3} m³`;
      })
      .join('\n');

    const lineas = [
      `<b>${titulo}</b>`,
      `<b>Código:</b> ${escaparHtml(orden.codigo)}`,
      `<b>Obra:</b> ${escaparHtml(orden.constSite.name)}`,
      `<b>Cliente:</b> ${escaparHtml(cliente)}`,
    ];
    if (orden.empresaVendedora) {
      lineas.push(
        `<b>Empresa vendedora:</b> ${escaparHtml(EMPRESA_VENDEDORA_NOMBRE[orden.empresaVendedora] ?? orden.empresaVendedora)}`,
      );
    }
    if (orden.transportista) {
      lineas.push(
        `<b>Transportista:</b> ${escaparHtml(orden.transportista.name)}`,
      );
    }
    lineas.push('<b>Materiales:</b>', materiales);
    if (orden.vehiculos?.length) {
      const vehiculos = orden.vehiculos
        .map(({ vehicle }) => `${vehicle.plate} (${vehicle.capacity} m³)`)
        .join(', ');
      lineas.push(`<b>Vehículos:</b> ${escaparHtml(vehiculos)}`);
    } else if (orden.placas.length > 0) {
      lineas.push(`<b>Placas:</b> ${escaparHtml(orden.placas.join(', '))}`);
    }
    if (orden.observacion) {
      lineas.push(`<b>Observación:</b> ${escaparHtml(orden.observacion)}`);
    }
    return lineas.join('\n');
  }

  // ─── API de Telegram ────────────────────────────────────────────────────────

  private async llamar<T>(
    metodo: string,
    cuerpo: object,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await fetch(
      `https://api.telegram.org/bot${this.token}/${metodo}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal,
      },
    );
    const json = (await res.json()) as TgResponse<T>;
    if (!json.ok) throw new TelegramApiError(json.error_code, json.description);
    return json.result;
  }

  private async sendMessage(
    chatId: string,
    texto: string,
    replyMarkup?: object,
  ): Promise<void> {
    try {
      await this.llamar('sendMessage', {
        chat_id: chatId,
        text: texto,
        parse_mode: 'HTML',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    } catch (e) {
      // 403: el usuario bloqueó el bot. Se desvincula para no reintentar siempre.
      if (e instanceof TelegramApiError && e.code === 403) {
        await this.prisma.user.updateMany({
          where: { telegramChatId: chatId },
          data: { telegramChatId: null },
        });
      }
      throw e;
    }
  }

  // ─── Vinculación (polling) ──────────────────────────────────────────────────

  private async bucleDePolling() {
    this.logger.log('Polling de Telegram iniciado');
    while (this.polling) {
      try {
        this.abort = new AbortController();
        const updates = await this.llamar<TgUpdate[]>(
          'getUpdates',
          { offset: this.offset, timeout: 25, allowed_updates: ['message'] },
          this.abort.signal,
        );
        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.procesarUpdate(update).catch((e) =>
            this.logger.error(`Error procesando mensaje de Telegram: ${e}`),
          );
        }
      } catch (e) {
        if (!this.polling) break;
        this.logger.warn(`getUpdates falló, reintentando: ${e}`);
        await dormir(ESPERA_REINTENTO_MS);
      }
    }
  }

  private async procesarUpdate(update: TgUpdate) {
    const msg = update.message;
    if (!msg || msg.chat.type !== 'private') return;
    const chatId = String(msg.chat.id);

    if (msg.contact) {
      await this.vincular(msg, chatId);
      return;
    }

    if ((msg.text ?? '').trim().startsWith('/stop')) {
      await this.prisma.user.updateMany({
        where: { telegramChatId: chatId },
        data: { telegramChatId: null },
      });
      await this.sendMessage(
        chatId,
        'Listo, ya no recibirá avisos de órdenes. Escriba /start para volver a activarlos.',
        { remove_keyboard: true },
      );
      return;
    }

    await this.sendMessage(
      chatId,
      'Hola 👋 Este bot avisa las órdenes de venta nuevas de Ciudad Rodrigo.\n' +
        `Para activarlo, toque <b>${BOTON_COMPARTIR}</b>: el número debe ser el mismo registrado en su usuario del sistema.`,
      {
        keyboard: [[{ text: BOTON_COMPARTIR, request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    );
  }

  private async vincular(msg: TgMessage, chatId: string) {
    // Solo su propio número: compartir el contacto de otro no lo vincula.
    if (!msg.from || msg.contact!.user_id !== msg.from.id) {
      await this.sendMessage(
        chatId,
        `Comparta su propio número con el botón <b>${BOTON_COMPARTIR}</b>.`,
      );
      return;
    }

    const digitos = ultimos9(msg.contact!.phone_number);
    const candidatos =
      digitos.length === 9
        ? await this.prisma.user.findMany({
            where: { isActive: true, phone: { not: null } },
            select: {
              id: true,
              name: true,
              phone: true,
              roletype: true,
              roleRef: { select: { name: true } },
            },
          })
        : [];
    const usuario = candidatos.find((u) => ultimos9(u.phone!) === digitos);

    if (!usuario) {
      await this.sendMessage(
        chatId,
        'Ese número no está registrado en ningún usuario activo del sistema. Pida al administrador que lo cargue en su usuario y vuelva a intentarlo.',
        { remove_keyboard: true },
      );
      return;
    }

    // telegramChatId es único: si este chat estaba en otro usuario, se libera.
    await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { telegramChatId: chatId, NOT: { id: usuario.id } },
        data: { telegramChatId: null },
      }),
      this.prisma.user.update({
        where: { id: usuario.id },
        data: { telegramChatId: chatId },
      }),
    ]);

    const recibeAvisos =
      usuario.roletype === 'CANTERA' && usuario.roleRef.name === 'SUPERVISOR';
    await this.sendMessage(
      chatId,
      recibeAvisos
        ? `Listo, ${escaparHtml(usuario.name)}. Desde ahora recibirá aquí las órdenes de venta nuevas.`
        : `Listo, ${escaparHtml(usuario.name)}. Su cuenta quedó vinculada, pero los avisos solo llegan a supervisores de cantera.`,
      { remove_keyboard: true },
    );
    this.logger.log(`Telegram vinculado al usuario ${usuario.id}`);
  }
}
