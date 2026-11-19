import {
  calcularUbicacionLlegada,
  distanciaM,
  parseFotosGps,
  Punto,
} from './ubicacion-llegada';

/** Punto de referencia: la llegada del 17/11/2026 (TVL-01-58). */
const A: Punto = { lat: -0.9996084, lng: -79.7662313 };
/** Un punto a `m` metros al norte de `p`. */
const norte = (p: Punto, m: number): Punto => ({
  lat: p.lat + m / 111_195,
  lng: p.lng,
});
const LLEGADA = new Date('2026-11-17T19:23:29-05:00');

describe('distanciaM', () => {
  it('0,001° de latitud son unos 111 m', () => {
    expect(distanciaM(A, { lat: A.lat + 0.001, lng: A.lng })).toBeCloseTo(
      111.2,
      0,
    );
  });
});

describe('calcularUbicacionLlegada', () => {
  it('solo con el escaneo usa ese punto', () => {
    const r = calcularUbicacionLlegada({ escaneo: { ...A, precisionM: 12 } })!;
    expect(r.metodo).toBe('UNICA');
    expect(r).toMatchObject({ lat: A.lat, lng: A.lng, precisionM: 12 });
  });

  it('sin precisión del escaneo (APK viejo) supone 50 m', () => {
    const r = calcularUbicacionLlegada({ escaneo: { ...A } })!;
    expect(r.precisionM).toBe(50);
  });

  it('escaneo y foto que coinciden: promedio cargado hacia la más precisa', () => {
    const foto = norte(A, 20);
    const r = calcularUbicacionLlegada({
      escaneo: { ...A, precisionM: 20 },
      fotos: [{ foto: 'plate', ...foto, precisionM: 10, tomadaEn: null }],
      capturedAt: LLEGADA,
    })!;
    expect(r.metodo).toBe('PROMEDIO');
    expect(distanciaM(r, foto)).toBeLessThan(distanciaM(r, A));
    expect(distanciaM(r, A)).toBeCloseTo(16, 0);
  });

  it('con tres lecturas descarta la que queda lejos', () => {
    const r = calcularUbicacionLlegada({
      escaneo: { ...A, precisionM: 10 },
      fotos: [
        { foto: 'plate', ...norte(A, 10), precisionM: 10, tomadaEn: null },
        { foto: 'material', ...norte(A, 2000), precisionM: 10, tomadaEn: null },
      ],
    })!;
    const lejana = r.lecturas.find((l) => l.tipo === 'FOTO_MATERIAL')!;
    expect(lejana.usada).toBe(false);
    expect(lejana.motivo).toContain('Lejos del resto');
    expect(r.metodo).toBe('PROMEDIO');
    expect(distanciaM(r, A)).toBeLessThan(10);
  });

  it('dos lecturas que no coinciden: usa la más precisa y avisa', () => {
    const r = calcularUbicacionLlegada({
      escaneo: { ...A, precisionM: 40 },
      fotos: [
        { foto: 'vehicle', ...norte(A, 1000), precisionM: 8, tomadaEn: null },
      ],
    })!;
    expect(r.metodo).toBe('MAS_PRECISA');
    expect(r.aviso).toContain('no coinciden');
    expect(distanciaM(r, norte(A, 1000))).toBeLessThan(1);
    expect(r.lecturas.find((l) => l.tipo === 'ESCANEO')!.usada).toBe(false);
  });

  it('ignora el escaneo en 0,0 (sin señal)', () => {
    const r = calcularUbicacionLlegada({
      escaneo: { lat: 0, lng: 0 },
      fotos: [{ foto: 'driver', ...A, precisionM: 15, tomadaEn: null }],
    })!;
    expect(r.metodo).toBe('UNICA');
    expect(r.lecturas).toHaveLength(1);
    expect(r.lecturas[0].tipo).toBe('FOTO_CONDUCTOR');
  });

  it('descarta la foto tomada a más de 2 h de la llegada', () => {
    const r = calcularUbicacionLlegada({
      escaneo: { ...A, precisionM: 10 },
      fotos: [
        {
          foto: 'plate',
          ...norte(A, 30),
          precisionM: 5,
          tomadaEn: new Date(LLEGADA.getTime() - 3 * 3600_000).toISOString(),
        },
      ],
      capturedAt: LLEGADA,
    })!;
    expect(r.metodo).toBe('UNICA');
    expect(r.lecturas[1]).toMatchObject({ usada: false });
    expect(r.lecturas[1].motivo).toContain('2 h');
  });

  it('dentro del radio de la planificación', () => {
    const r = calcularUbicacionLlegada({
      escaneo: { ...A, precisionM: 10 },
      referencia: { ...norte(A, 100), radioM: 300 },
    })!;
    expect(r.dentroDelRadio).toBe(true);
    expect(r.distanciaReferenciaM).toBeCloseTo(100, 0);
    expect(r.radioM).toBe(300);
    expect(r.lecturas[0].distanciaReferenciaM).toBeCloseTo(100, 0);
  });

  it('fuera del radio de la planificación', () => {
    const r = calcularUbicacionLlegada({
      escaneo: { ...A, precisionM: 10 },
      referencia: { ...norte(A, 1000), radioM: 300 },
    })!;
    expect(r.dentroDelRadio).toBe(false);
  });

  it('sin punto por defecto no compara', () => {
    const r = calcularUbicacionLlegada({
      escaneo: { ...A, precisionM: 10 },
      referencia: { lat: null, lng: null, radioM: 300 },
    })!;
    expect(r).toMatchObject({
      distanciaReferenciaM: null,
      dentroDelRadio: null,
      radioM: null,
    });
  });

  it('sin ninguna lectura válida devuelve null', () => {
    expect(calcularUbicacionLlegada({ escaneo: { lat: 0, lng: 0 } })).toBeNull();
    expect(calcularUbicacionLlegada({})).toBeNull();
  });
});

describe('parseFotosGps', () => {
  it('JSON mal formado: lista vacía', () => {
    expect(parseFotosGps('{no')).toEqual([]);
    expect(parseFotosGps('')).toEqual([]);
    expect(parseFotosGps(null)).toEqual([]);
  });

  it('filtra entradas inválidas y acepta números como texto', () => {
    const fotos = parseFotosGps(
      JSON.stringify([
        {
          foto: 'plate',
          lat: '-0.99',
          lng: '-79.76',
          tomadaEn: '2026-11-17T19:20:00-05:00',
        },
        { foto: 'plate', lat: 0, lng: 0 },
        { foto: 'selfie', lat: -0.99, lng: -79.76 },
        { foto: 'driver', lat: 120, lng: -79.76 },
        { foto: 'vehicle', lat: -0.99, lng: -79.76, precisionM: 99999 },
      ]),
    );
    expect(fotos).toEqual([
      {
        foto: 'plate',
        lat: -0.99,
        lng: -79.76,
        precisionM: null,
        tomadaEn: '2026-11-18T00:20:00.000Z',
      },
      {
        foto: 'vehicle',
        lat: -0.99,
        lng: -79.76,
        precisionM: null,
        tomadaEn: null,
      },
    ]);
  });

  it('acepta como máximo 5 entradas', () => {
    const muchas = Array.from({ length: 8 }, () => ({
      foto: 'material',
      lat: -0.99,
      lng: -79.76,
    }));
    expect(parseFotosGps(muchas)).toHaveLength(5);
  });
});
