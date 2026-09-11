import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateVentaDto } from './create-venta.dto';

/**
 * Contrato con la app.
 *
 * El ValidationPipe global corre con `whitelist` y `forbidNonWhitelisted`, así
 * que un campo mal tipado o no declarado hace fallar el request entero con 400
 * — y el worker de la app, al no recibir `retryable`, lo reintentaría 72 horas
 * antes de marcarlo FAILED. Un error acá no se ve hasta que el supervisor ya
 * perdió el registro, por eso se prueba el payload exacto que manda el teléfono.
 */

/** Lo que construye VentaSyncWorker: todo viaja como string en el multipart.
 *  El tipo es abierto a propósito: varios casos prueban qué pasa al omitir un
 *  campo opcional, y con el tipo inferido del literal no se podría. */
const payloadDeLaApp = (extra: Record<string, any> = {}): Record<string, any> => ({
  uuid: '11111111-2222-4333-8444-555555555555',
  capturedAt: '2026-09-09T20:47:38Z',
  qrcode: 'VC-002',
  vehicleIdText: 'VI-003',
  materialId: '5',
  m3: '12.5',
  comprador: 'Constructora XYZ',
  observation: 'sin novedad',
  lat: '-2.1894',
  lng: '-79.889',
  ...extra,
});

const validar = (payload: Record<string, any>) =>
  validateSync(plainToInstance(CreateVentaDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('CreateVentaDto', () => {
  it('acepta el payload exacto que envía la app', () => {
    expect(validar(payloadDeLaApp())).toHaveLength(0);
  });

  it('acepta coordenadas NEGATIVAS: Ecuador está en latitud y longitud negativas', () => {
    // Si @IsNumberString rechazara el signo, TODAS las ventas fallarían con 400.
    const errores = validar(payloadDeLaApp({ lat: '-2.1894', lng: '-79.889' }));
    expect(errores).toHaveLength(0);
  });

  it('acepta m3 decimal', () => {
    expect(validar(payloadDeLaApp({ m3: '0.5' }))).toHaveLength(0);
  });

  it('acepta capturedAt con y sin milisegundos', () => {
    expect(validar(payloadDeLaApp({ capturedAt: '2026-09-09T20:47:38Z' }))).toHaveLength(0);
    expect(
      validar(payloadDeLaApp({ capturedAt: '2026-09-09T20:47:38.123Z' })),
    ).toHaveLength(0);
  });

  it('acepta que falten comprador y observación: son opcionales', () => {
    const payload = payloadDeLaApp();
    delete payload.comprador;
    delete payload.observation;
    expect(validar(payload)).toHaveLength(0);
  });

  it('convierte comprador vacío en null, para no guardar cadenas en blanco', () => {
    const dto = plainToInstance(CreateVentaDto, payloadDeLaApp({ comprador: '' }));
    expect(dto.comprador).toBeNull();
  });

  it('acepta que falten lat y lng: el GPS puede no haber fijado posición', () => {
    const payload = payloadDeLaApp();
    delete payload.lat;
    delete payload.lng;
    expect(validar(payload)).toHaveLength(0);
  });

  it('rechaza un uuid que no sea v4', () => {
    expect(validar(payloadDeLaApp({ uuid: 'no-es-uuid' })).length).toBeGreaterThan(0);
  });

  it('rechaza m3 no numérico', () => {
    expect(validar(payloadDeLaApp({ m3: 'doce' })).length).toBeGreaterThan(0);
  });

  it('exige el ID de vehículo tecleado', () => {
    expect(validar(payloadDeLaApp({ vehicleIdText: '' })).length).toBeGreaterThan(0);
  });

  it('rechaza campos no declarados: forbidNonWhitelisted está activo en producción', () => {
    const dto = plainToInstance(CreateVentaDto, payloadDeLaApp({ precio: '100' }));
    const errores = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errores.length).toBeGreaterThan(0);
  });
});
