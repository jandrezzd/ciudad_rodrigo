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
  compradorId: '4',
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

  it('acepta que falte la observación: es opcional', () => {
    const payload = payloadDeLaApp();
    delete payload.observation;
    expect(validar(payload)).toHaveLength(0);
  });

  it('exige el comprador: una venta sin constancia de a quién se le vendió no sirve', () => {
    const payload = payloadDeLaApp();
    delete payload.compradorId;
    expect(validar(payload).length).toBeGreaterThan(0);
  });

  it('rechaza un comprador que no sea un id', () => {
    expect(
      validar(payloadDeLaApp({ compradorId: 'Constructora XYZ' })).length,
    ).toBeGreaterThan(0);
  });

  it('rechaza el nombre del comprador: solo viaja el id, el nombre lo pone el servidor', () => {
    expect(
      validar(payloadDeLaApp({ comprador: 'Constructora XYZ' })).length,
    ).toBeGreaterThan(0);
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

  it('acepta ordenItemId: la app todavía no lo manda siempre, pero cuando lo hace debe validar', () => {
    expect(validar(payloadDeLaApp({ ordenItemId: '7' }))).toHaveLength(0);
  });

  it('acepta que falte materialId cuando se manda ordenItemId: el material se deriva de la línea', () => {
    const payload = payloadDeLaApp({ ordenItemId: '7' });
    delete payload.materialId;
    expect(validar(payload)).toHaveLength(0);
  });

  it('rechaza un ordenItemId que no sea un id', () => {
    expect(
      validar(payloadDeLaApp({ ordenItemId: 'orden-1' })).length,
    ).toBeGreaterThan(0);
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
