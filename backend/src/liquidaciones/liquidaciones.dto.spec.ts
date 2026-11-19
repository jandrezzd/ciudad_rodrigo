import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CrearLiquidacionDto } from './dto/crear-liquidacion.dto';
import { EditarLiquidacionDto } from './dto/editar-liquidacion.dto';
import { ListarViajesLiquidablesDto } from './dto/listar-viajes-liquidables.dto';

/** El mismo ValidationPipe que main.ts. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const validar = (metatype: any, value: unknown, type: 'body' | 'query' = 'body') =>
  pipe.transform(value, { type, metatype } as ArgumentMetadata);

const crearValido = () => ({
  constSiteId: 3,
  clientId: 5,
  viajes: [{ tripId: 101, precio: 45.5 }],
});

describe('DTOs de liquidaciones', () => {
  describe('CrearLiquidacionDto', () => {
    it('acepta un body válido', async () => {
      await expect(validar(CrearLiquidacionDto, crearValido())).resolves.toBeInstanceOf(
        CrearLiquidacionDto,
      );
    });

    it.each([
      ['precio 0', 0],
      ['precio negativo', -5],
      ['3 decimales', 1.005],
      ['más de 1.000.000', 1_000_001],
    ])('rechaza %s', async (_, precio) => {
      await expect(
        validar(CrearLiquidacionDto, { ...crearValido(), viajes: [{ tripId: 1, precio }] }),
      ).rejects.toThrow();
    });

    it('rechaza sin viajes y campos de más (montoTotal no se acepta del cliente)', async () => {
      await expect(validar(CrearLiquidacionDto, { ...crearValido(), viajes: [] })).rejects.toThrow();
      await expect(
        validar(CrearLiquidacionDto, { ...crearValido(), montoTotal: 1 }),
      ).rejects.toThrow();
    });

    it('rechaza una fecha mal formada', async () => {
      await expect(
        validar(CrearLiquidacionDto, { ...crearValido(), fecha: '20/11/2026' }),
      ).rejects.toThrow();
    });
  });

  describe('EditarLiquidacionDto', () => {
    it('el motivo es obligatorio y de al menos 5 caracteres', async () => {
      await expect(validar(EditarLiquidacionDto, { fecha: '2026-11-20' })).rejects.toThrow();
      await expect(
        validar(EditarLiquidacionDto, { motivo: '  abc  ', fecha: '2026-11-20' }),
      ).rejects.toThrow();
    });

    it('recorta el motivo y convierte la observación vacía en null', async () => {
      const dto = await validar(EditarLiquidacionDto, {
        motivo: '  Precio acordado  ',
        observacion: '   ',
      });
      expect(dto).toMatchObject({ motivo: 'Precio acordado', observacion: null });
    });

    it('no acepta una lista de viajes vacía', async () => {
      await expect(
        validar(EditarLiquidacionDto, { motivo: 'quitar todo', viajes: [] }),
      ).rejects.toThrow();
    });
  });

  describe('ListarViajesLiquidablesDto (query)', () => {
    it('convierte los ids de texto a número', async () => {
      const dto = await validar(
        ListarViajesLiquidablesDto,
        { constSiteId: '3', clientId: '5', desde: '2026-11-01' },
        'query',
      );
      expect(dto).toMatchObject({ constSiteId: 3, clientId: 5 });
    });

    it('rechaza un id que no es número', async () => {
      await expect(
        validar(ListarViajesLiquidablesDto, { constSiteId: 'abc' }, 'query'),
      ).rejects.toThrow();
    });
  });
});
