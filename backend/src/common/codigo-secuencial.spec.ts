import {
  anioEcuador,
  formatearCodigo,
  siguienteCodigoViaje,
} from './codigo-secuencial';

describe('codigo-secuencial', () => {
  it('formatea con prefijo, 5 dígitos y año', () => {
    expect(formatearCodigo('TRA', 7, 2026)).toBe('TRA-00007-2026');
    expect(formatearCodigo('VEN', 123456, 2026)).toBe('VEN-123456-2026');
  });

  // 01/01 03:00 UTC sigue siendo 31/12 en Ecuador (UTC-5).
  it('toma el año en hora de Ecuador, no en UTC', () => {
    expect(anioEcuador(new Date('2027-01-01T03:00:00.000Z'))).toBe(2026);
    expect(anioEcuador(new Date('2027-01-01T06:00:00.000Z'))).toBe(2027);
  });

  it('incrementa el contador del año del viaje dentro de la transacción', async () => {
    const tx: any = {
      transportTripSequence: {
        upsert: jest.fn().mockResolvedValue({ year: 2026, last: 42 }),
      },
    };

    const codigo = await siguienteCodigoViaje(
      tx,
      new Date('2026-09-30T13:20:00.000Z'),
    );

    expect(codigo).toBe('TRA-00042-2026');
    expect(tx.transportTripSequence.upsert).toHaveBeenCalledWith({
      where: { year: 2026 },
      create: { year: 2026, last: 1 },
      update: { last: { increment: 1 } },
    });
  });
});
