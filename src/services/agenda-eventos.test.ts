import { describe, expect, it, beforeAll } from 'vitest';
import distritosGeoJSON from '../../data/distritos-valencia.json' with { type: 'json' };
import { setLoadedDistricts, type Distrito } from './district-geometry';
import { resetTablaPatronesGeolocalizacion } from './geolocalizacion-texto';
import {
  parsearRangoFechaListado,
  parsearRangoFechaFicha,
  construirResumen,
  detectarEstructuraSospechosa,
  construirEventoAgenda,
  eventoVigente,
  eventosVigentes,
  type EventoAgenda,
} from './agenda-eventos';

interface DistritoFeature {
  type: 'Feature';
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: Omit<Distrito, 'geometry'>;
}

beforeAll(() => {
  const distritos: Distrito[] = (distritosGeoJSON.features as unknown as DistritoFeature[]).map((feature) => ({
    ...feature.properties,
    geometry: feature.geometry,
  }));
  setLoadedDistricts(distritos);
  resetTablaPatronesGeolocalizacion();
});

describe('parsearRangoFechaListado', () => {
  it('parsea "DD/MM/YYYY - DD/MM/YYYY" a ISO 8601', () => {
    const r = parsearRangoFechaListado('23/09/2026 - 27/09/2026');
    expect(r).toEqual({ inicio: '2026-09-23T00:00:00.000Z', fin: '2026-09-27T00:00:00.000Z' });
  });

  it('null si el texto no tiene el formato esperado', () => {
    expect(parsearRangoFechaListado('sin fecha')).toBeNull();
    expect(parsearRangoFechaListado('')).toBeNull();
  });
});

describe('parsearRangoFechaFicha', () => {
  it('parsea "FECHA: DD mmm YYYY - DD mmm YYYY" (mes abreviado ES) a ISO 8601', () => {
    const r = parsearRangoFechaFicha('FECHA: \n\n 23 sep 2026 \n - \n 27 sep 2026');
    expect(r).toEqual({ inicio: '2026-09-23T00:00:00.000Z', fin: '2026-09-27T00:00:00.000Z' });
  });

  it('funciona con día de un solo dígito', () => {
    const r = parsearRangoFechaFicha('FECHA: 3 ene 2027 - 5 ene 2027');
    expect(r).toEqual({ inicio: '2027-01-03T00:00:00.000Z', fin: '2027-01-05T00:00:00.000Z' });
  });

  it('null si el mes no se reconoce (indicio de estructura cambiada)', () => {
    expect(parsearRangoFechaFicha('FECHA: 23 xyz 2026 - 27 xyz 2026')).toBeNull();
  });
});

describe('construirResumen', () => {
  it('une párrafos no vacíos con un espacio', () => {
    expect(construirResumen(['Primera frase.', '', 'Segunda frase.'])).toBe('Primera frase. Segunda frase.');
  });

  it('null si no hay texto', () => {
    expect(construirResumen([])).toBeNull();
    expect(construirResumen(['', '  '])).toBeNull();
  });

  it('recorta a ~300 caracteres con puntos suspensivos', () => {
    const largo = 'x'.repeat(400);
    const resumen = construirResumen([largo]);
    expect(resumen!.length).toBeLessThanOrEqual(301);
    expect(resumen!.endsWith('…')).toBe(true);
  });

  it('no recorta si ya cabe en el límite', () => {
    const corto = 'Un resumen corto.';
    expect(construirResumen([corto])).toBe(corto);
  });
});

function evento(id: string): EventoAgenda {
  return {
    id,
    titulo: 'test',
    categoria: 'EXPOSICIONES',
    fechaInicio: '2026-09-16T00:00:00.000Z',
    fechaFin: '2026-09-17T00:00:00.000Z',
    resumen: null,
    url: `https://www.valencia.es/cas/agenda-de-la-ciudad/-/content/${id}`,
    distritosMencionados: [],
    fetchedAt: '2026-09-16T10:00:00.000Z',
    source: 'ajuntament-valencia-scraping',
  };
}

describe('detectarEstructuraSospechosa', () => {
  it('true si 0 eventos nuevos pero había eventos antes', () => {
    expect(detectarEstructuraSospechosa([], [evento('a')])).toBe(true);
  });

  it('false si 0 eventos nuevos y tampoco había antes (agenda genuinamente vacía)', () => {
    expect(detectarEstructuraSospechosa([], [])).toBe(false);
  });

  it('false si hay eventos nuevos', () => {
    expect(detectarEstructuraSospechosa([evento('a')], [evento('b')])).toBe(false);
  });
});

describe('construirEventoAgenda', () => {
  it('ensambla el contrato final a partir del listado + la ficha', () => {
    const r = construirEventoAgenda(
      {
        id: 'rutas-tematizadas-lengua-signos',
        titulo: 'Rutas tematizadas con intérprete de lengua de signos',
        categoria: 'VISITAS GUIADAS',
        rangoFechaTexto: '23/09/2026 - 27/09/2026',
        url: 'https://www.valencia.es/cas/agenda-de-la-ciudad/-/content/rutas-tematizadas-lengua-signos',
      },
      { parrafos: ['', 'Ruta por el centro histórico de Ciutat Vella.'] },
      '2026-09-16T10:00:00.000Z',
    );
    expect(r).toMatchObject({
      id: 'rutas-tematizadas-lengua-signos',
      fechaInicio: '2026-09-23T00:00:00.000Z',
      resumen: 'Ruta por el centro histórico de Ciutat Vella.',
    });
    expect(r!.distritosMencionados.length).toBeGreaterThan(0);
  });

  it('null si el rango de fechas no se puede parsear (estructura cambiada)', () => {
    const r = construirEventoAgenda(
      { id: 'x', titulo: 'x', categoria: 'x', rangoFechaTexto: 'fecha rara', url: 'https://x' },
      null,
      '2026-09-16T10:00:00.000Z',
    );
    expect(r).toBeNull();
  });

  it('resumen null si no hay ficha', () => {
    const r = construirEventoAgenda(
      {
        id: 'x',
        titulo: 'x',
        categoria: 'x',
        rangoFechaTexto: '23/09/2026 - 27/09/2026',
        url: 'https://x',
      },
      null,
      '2026-09-16T10:00:00.000Z',
    );
    expect(r!.resumen).toBeNull();
  });
});

describe('eventoVigente / eventosVigentes', () => {
  // fechaFin siempre es medianoche UTC del último día (ver parsearRangoFecha*).
  const FECHA_FIN = '2026-10-01T00:00:00.000Z'; // evento que termina el 1 de octubre

  it('vigente mientras dure el día de fechaFin (antes de las 00:00 del día siguiente)', () => {
    const justoAntesDeMedianoche = new Date('2026-10-01T23:59:00.000Z').getTime();
    expect(eventoVigente({ fechaFin: FECHA_FIN }, justoAntesDeMedianoche)).toBe(true);
  });

  it('vigente el mismo día de fechaFin aunque ya sea tarde', () => {
    const mediodiaDelMismoDia = new Date('2026-10-01T18:00:00.000Z').getTime();
    expect(eventoVigente({ fechaFin: FECHA_FIN }, mediodiaDelMismoDia)).toBe(true);
  });

  it('deja de ser vigente en cuanto pasan las 00:00 del día siguiente a fechaFin', () => {
    const justoDespuesDeMedianoche = new Date('2026-10-02T00:00:01.000Z').getTime();
    expect(eventoVigente({ fechaFin: FECHA_FIN }, justoDespuesDeMedianoche)).toBe(false);
  });

  it('eventosVigentes filtra solo los pasados, conserva el resto', () => {
    const eventos = [
      { id: 'pasado', fechaFin: '2026-09-28T00:00:00.000Z' },
      { id: 'hoy', fechaFin: '2026-10-01T00:00:00.000Z' },
      { id: 'futuro', fechaFin: '2026-10-05T00:00:00.000Z' },
    ];
    const ahoraMs = new Date('2026-10-01T12:00:00.000Z').getTime();
    const resultado = eventosVigentes(eventos, ahoraMs);
    expect(resultado.map((e) => e.id)).toEqual(['hoy', 'futuro']);
  });
});
