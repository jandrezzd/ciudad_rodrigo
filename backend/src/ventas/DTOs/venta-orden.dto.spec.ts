import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateVentaOrdenDto, UpdateVentaOrdenDto } from './venta-orden.dto';

/** Mismas opciones que el ValidationPipe global (main.ts). */
const validar = (cls: any, payload: Record<string, any>) =>
  validateSync(plainToInstance(cls, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

const ordenWeb = (extra: Record<string, any> = {}): Record<string, any> => ({
  clientId: 4,
  constSiteId: 20,
  empresaVendedora: 'CIUDAD_RODRIGO',
  items: [{ materialId: 5, m3Asignados: 100 }],
  ...extra,
});

describe('CreateVentaOrdenDto — empresa vendedora', () => {
  it.each(['CIUDAD_RODRIGO', 'DISTRASA', 'TRANSLOGPACIFIC'])(
    'acepta %s',
    (empresa) => {
      expect(
        validar(CreateVentaOrdenDto, ordenWeb({ empresaVendedora: empresa })),
      ).toHaveLength(0);
    },
  );

  it('es obligatoria: sin empresa la orden se rechaza (público o privado)', () => {
    const sinEmpresa = ordenWeb();
    delete sinEmpresa.empresaVendedora;
    const errores = validar(CreateVentaOrdenDto, sinEmpresa);
    expect(errores.map((e) => e.property)).toContain('empresaVendedora');
  });

  it('rechaza una empresa que no existe', () => {
    const errores = validar(
      CreateVentaOrdenDto,
      ordenWeb({ empresaVendedora: 'TRANSVELEZ' }),
    );
    expect(errores.map((e) => e.property)).toContain('empresaVendedora');
  });
});

describe('UpdateVentaOrdenDto — empresa vendedora', () => {
  it('es opcional al editar (órdenes anteriores al campo)', () => {
    expect(validar(UpdateVentaOrdenDto, { observacion: 'x' })).toHaveLength(0);
  });

  it('permite completarla al editar', () => {
    expect(
      validar(UpdateVentaOrdenDto, { empresaVendedora: 'DISTRASA' }),
    ).toHaveLength(0);
  });
});

describe('Transportista en la orden', () => {
  it('es opcional al crear', () => {
    expect(validar(CreateVentaOrdenDto, ordenWeb())).toHaveLength(0);
  });

  it('acepta un id al crear', () => {
    expect(
      validar(CreateVentaOrdenDto, ordenWeb({ transportistaId: 3 })),
    ).toHaveLength(0);
  });

  it('al editar acepta null para quitarlo', () => {
    expect(
      validar(UpdateVentaOrdenDto, { transportistaId: null }),
    ).toHaveLength(0);
  });

  it('rechaza un id que no es número', () => {
    const errores = validar(UpdateVentaOrdenDto, { transportistaId: 'abc' });
    expect(errores.map((e) => e.property)).toContain('transportistaId');
  });
});
