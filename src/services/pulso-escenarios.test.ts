import { describe, expect, it } from 'vitest';
import { calcularPulsoEscenarios, type EstadoHisteresisPulso } from './pulso-escenarios';
import type { TramoTrafico, EstadoTramo } from './trafico';
import type { IncidenciaViaPublica } from './via-publica';
import type { ZonaMovilidadReducida } from './fallas';
import type { PrediccionCortoPlazo } from './prediccion-corto-plazo';
import type { CalidadAire } from './calidad-aire';
import type { EquipamientoCritico } from './equipamientos-criticos';

const AHORA = '2026-09-16T10:00:00.000Z';

const DISTRITOS = [
  { codigo: '01', nombre: 'Ciutat Vella' },
  { codigo: '02', nombre: "L'Eixample" },
];

function tramo(id: string, distrito: string, estado: EstadoTramo): TramoTrafico {
  return {
    id,
    nombre: `Calle ${id}`,
    geometry: { type: 'LineString', coordinates: [[-0.38, 39.47], [-0.381, 39.471]] },
    estadoCodigo: 0,
    estado,
    esPasoInferior: false,
    distrito,
    observedAt: AHORA,
    fetchedAt: AHORA,
    source: 'ajuntament-valencia-geoportal',
  };
}

/** 4 tramos monitorizados en el distrito, `nProblematicos` de ellos cortados. */
function tramosDistrito(distrito: string, nProblematicos: number, total = 4): TramoTrafico[] {
  return Array.from({ length: total }, (_, i) =>
    tramo(`${distrito}-${i}`, distrito, i < nProblematicos ? 'cortado' : 'fluido'),
  );
}

function incidencia(over: Partial<IncidenciaViaPublica> = {}): IncidenciaViaPublica {
  return {
    id: 'inc-1',
    descripcion: 'Corte por avería',
    tipo: 'incidencias',
    calle: 'Carrer de la Pau',
    afectacion: 'corte total',
    lat: 39.4738,
    lon: -0.3775,
    distritoCodigo: '01',
    vigenciaDesde: '2026-09-14T00:00:00.000Z', // 2 días antes de AHORA
    vigenciaHasta: '2026-09-30T00:00:00.000Z',
    fetchedAt: AHORA,
    source: 'ajuntament-valencia-geoportal',
    ...over,
  };
}

function zonaFallas(over: Partial<ZonaMovilidadReducida> = {}): ZonaMovilidadReducida {
  return {
    id: 'zona-1',
    descripcion: 'Zona de movilidad reducida — Falla Ajuntament',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-0.377, 39.47],
          [-0.376, 39.47],
          [-0.376, 39.471],
          [-0.377, 39.471],
          [-0.377, 39.47],
        ],
      ],
    },
    distrito: '01',
    observedAt: AHORA,
    fetchedAt: AHORA,
    source: 'ajuntament-valencia-geoportal',
    ...over,
  };
}

function prediccion(over: Partial<PrediccionCortoPlazo> = {}): PrediccionCortoPlazo {
  return {
    id: 'valencia',
    ventanaHoras: 4,
    predicciones: [
      {
        horaObjetivo: '2026-09-16T11:00:00.000Z', // +60 min
        temperatura: 20,
        probabilidadPrecipitacion: 80,
        precipitacion: 3,
        weatherCode: 61,
        descripcion: 'Lluvia',
      },
    ],
    observedAt: AHORA,
    fetchedAt: AHORA,
    source: 'open-meteo',
    ...over,
  };
}

// El tramo fixture `tramo()` siempre usa esta geometría — [-0.3805, 39.4705]
// está prácticamente encima de la línea (~0 m), [-0.40, 39.50] está a varios km.
function equipamiento(over: Partial<EquipamientoCritico> = {}): EquipamientoCritico {
  return {
    id: 'eq-1',
    nombre: 'Hospital Clínico Universitario',
    categoria: 'sanidad',
    lat: 39.4705,
    lon: -0.3805,
    telefono: null,
    fetchedAt: AHORA,
    source: 'geoportal-valencia-equipamientos',
    ...over,
  };
}

const AIRE_MALA: CalidadAire = {
  id: 'valencia',
  lat: 39.4699,
  lon: -0.3763,
  pm10: 60,
  pm25: 40,
  monoxidoCarbono: 300,
  dioxidoNitrogeno: 50,
  dioxidoAzufre: 10,
  ozono: 80,
  indiceEuropeo: 85,
  indiceUS: 100,
  categoria: 'Mala',
  observedAt: AHORA,
  fetchedAt: AHORA,
  source: 'open-meteo',
};

function entradaBase(over: Partial<Parameters<typeof calcularPulsoEscenarios>[0]> = {}) {
  return {
    distritos: DISTRITOS,
    tramos: [],
    incidencias: [],
    zonasFallas: [],
    prediccion: null,
    aire: null,
    tramosPrevios: null,
    equipamientosCriticos: [],
    ahora: AHORA,
    ...over,
  };
}

describe('calcularPulsoEscenarios — sin señales', () => {
  it('todos los distritos en sin-senal, sin escenarios activos', () => {
    const r = calcularPulsoEscenarios(entradaBase({ tramos: tramosDistrito('01', 0) }), {});
    expect(r.distritos.every((d) => d.nivel === 'sin-senal')).toBe(true);
    expect(r.distritos.every((d) => d.escenariosActivos.length === 0)).toBe(true);
  });

  it('monitorizacion insuficiente si tramosMonitorizados < 3', () => {
    const r = calcularPulsoEscenarios(entradaBase({ tramos: tramosDistrito('01', 0, 2) }), {});
    const d01 = r.distritos.find((d) => d.distritoCodigo === '01')!;
    expect(d01.monitorizacion).toBe('insuficiente');
    expect(d01.tramosMonitorizados).toBe(2);
  });
});

describe('calcularPulsoEscenarios — incidencia-sobre-trafico-denso', () => {
  it('umbral dual: 3 de 4 tramos (75%) + incidencia elegible → se detecta (cold start, sin confirmar)', () => {
    const r = calcularPulsoEscenarios(
      entradaBase({ tramos: tramosDistrito('01', 3), incidencias: [incidencia()] }),
      {},
    );
    const d01 = r.distritos.find((d) => d.distritoCodigo === '01')!;
    expect(d01.nivel).toBe('sin-senal'); // cold start: detectado pero no confirmado
    const esc = d01.escenariosActivos.find((e) => e.id === 'incidencia-sobre-trafico-denso');
    expect(esc).toBeDefined();
    expect(esc?.confirmado).toBe(false);
    expect(esc?.modo).toBe('vivo');
  });

  it('2ª evaluación consecutiva confirma → nivel prioritario', () => {
    const entrada = entradaBase({ tramos: tramosDistrito('01', 3), incidencias: [incidencia()] });
    const primera = calcularPulsoEscenarios(entrada, {});
    const segunda = calcularPulsoEscenarios({ ...entrada, ahora: '2026-09-16T10:03:00.000Z' }, primera.estadoHisteresis);
    const d01 = segunda.distritos.find((d) => d.distritoCodigo === '01')!;
    expect(d01.nivel).toBe('prioritario');
    expect(d01.escenariosActivos[0]?.confirmado).toBe(true);
  });

  it('no se detecta si el tráfico no llega al umbral (2 de 8, no alcanza el 25%)', () => {
    const r = calcularPulsoEscenarios(
      entradaBase({ tramos: tramosDistrito('01', 2, 8), incidencias: [incidencia()] }),
      {},
    );
    const d01 = r.distritos.find((d) => d.distritoCodigo === '01')!;
    expect(d01.escenariosActivos).toHaveLength(0);
  });

  it('obras sin "calzada" en la afectación no cuenta', () => {
    const r = calcularPulsoEscenarios(
      entradaBase({
        tramos: tramosDistrito('01', 3),
        incidencias: [incidencia({ tipo: 'obras', afectacion: 'acera' })],
      }),
      {},
    );
    expect(r.distritos.find((d) => d.distritoCodigo === '01')!.escenariosActivos).toHaveLength(0);
  });

  it('obras con "calzada" en la afectación sí cuenta', () => {
    const r = calcularPulsoEscenarios(
      entradaBase({
        tramos: tramosDistrito('01', 3),
        incidencias: [incidencia({ tipo: 'obras', afectacion: 'corte de calzada' })],
      }),
      {},
    );
    expect(r.distritos.find((d) => d.distritoCodigo === '01')!.escenariosActivos).toHaveLength(1);
  });

  it('incidencia con vigenciaDesde de hace más de 7 días no cuenta', () => {
    const r = calcularPulsoEscenarios(
      entradaBase({
        tramos: tramosDistrito('01', 3),
        incidencias: [incidencia({ vigenciaDesde: '2026-08-01T00:00:00.000Z' })],
      }),
      {},
    );
    expect(r.distritos.find((d) => d.distritoCodigo === '01')!.escenariosActivos).toHaveLength(0);
  });
});

describe('calcularPulsoEscenarios — fallas-y-trafico', () => {
  it('zona de movilidad reducida + al menos 1 tramo congestionado/cortado en el mismo distrito → se detecta', () => {
    const r = calcularPulsoEscenarios(
      entradaBase({ tramos: tramosDistrito('01', 1), zonasFallas: [zonaFallas()] }),
      {},
    );
    const esc = r.distritos.find((d) => d.distritoCodigo === '01')!.escenariosActivos[0];
    expect(esc?.id).toBe('fallas-y-trafico');
    expect(esc?.zonaFallas?.nombre).toContain('Falla');
  });

  it('sin tráfico denso en el distrito, no se detecta aunque haya zona activa', () => {
    const r = calcularPulsoEscenarios(
      entradaBase({ tramos: tramosDistrito('01', 0), zonasFallas: [zonaFallas()] }),
      {},
    );
    expect(r.distritos.find((d) => d.distritoCodigo === '01')!.escenariosActivos).toHaveLength(0);
  });
});

describe('calcularPulsoEscenarios — lluvia-inminente-sobre-trafico-denso (modo sombra)', () => {
  it('se detecta con probabilidad de lluvia alta + ≥6 tramos densos, pero el nivel del distrito no sube (modo sombra)', () => {
    const entrada = entradaBase({ tramos: tramosDistrito('01', 6, 10), prediccion: prediccion() });
    const primera = calcularPulsoEscenarios(entrada, {});
    const segunda = calcularPulsoEscenarios({ ...entrada, ahora: '2026-09-16T10:03:00.000Z' }, primera.estadoHisteresis);
    const d01 = segunda.distritos.find((d) => d.distritoCodigo === '01')!;
    const esc = d01.escenariosActivos.find((e) => e.id === 'lluvia-inminente-sobre-trafico-denso');
    expect(esc?.confirmado).toBe(true);
    expect(esc?.modo).toBe('sombra');
    expect(esc?.nivel).toBe('seguimiento');
    // aunque esté confirmado, el nivel del distrito se queda en sin-senal — 'sombra' nunca pinta.
    expect(d01.nivel).toBe('sin-senal');
  });

  it('no se detecta si la lluvia está fuera de la ventana de 2h', () => {
    const lejos = prediccion({
      predicciones: [
        {
          horaObjetivo: '2026-09-16T14:00:00.000Z', // +4h, fuera de la ventana de 2h
          temperatura: 20,
          probabilidadPrecipitacion: 90,
          precipitacion: 5,
          weatherCode: 61,
          descripcion: 'Lluvia',
        },
      ],
    });
    const r = calcularPulsoEscenarios(entradaBase({ tramos: tramosDistrito('01', 6, 10), prediccion: lejos }), {});
    expect(r.distritos.find((d) => d.distritoCodigo === '01')!.escenariosActivos).toHaveLength(0);
  });

  it('con solo 3 tramos densos (bajo el umbral de 6) no se detecta, salvo que haya tráfico-empeora', () => {
    const entrada = entradaBase({ tramos: tramosDistrito('01', 3, 10), prediccion: prediccion() });
    const r = calcularPulsoEscenarios(entrada, {});
    expect(r.distritos.find((d) => d.distritoCodigo === '01')!.escenariosActivos).toHaveLength(0);
  });

  it('trafico-empeora (respecto al estado previo) activa el escenario aunque haya menos de 6 tramos densos', () => {
    const previos = [tramo('01-0', '01', 'fluido')];
    const actuales = [tramo('01-0', '01', 'cortado'), ...tramosDistrito('01', 0, 3).slice(1)];
    const r = calcularPulsoEscenarios(
      entradaBase({ tramos: actuales, tramosPrevios: previos, prediccion: prediccion() }),
      {},
    );
    expect(r.distritos.find((d) => d.distritoCodigo === '01')!.escenariosActivos).toHaveLength(1);
  });
});

describe('calcularPulsoEscenarios — histéresis (permanencia)', () => {
  it('sigue mostrándose confirmado hasta 20 min después de dejar de detectarse', () => {
    const entradaConSenal = entradaBase({ tramos: tramosDistrito('01', 3), incidencias: [incidencia()] });
    const primera = calcularPulsoEscenarios(entradaConSenal, {});
    const segunda = calcularPulsoEscenarios(
      { ...entradaConSenal, ahora: '2026-09-16T10:03:00.000Z' },
      primera.estadoHisteresis,
    );
    // deja de detectarse (tráfico se despeja), 10 min después
    const tercera = calcularPulsoEscenarios(
      entradaBase({ tramos: tramosDistrito('01', 0), ahora: '2026-09-16T10:13:00.000Z' }),
      segunda.estadoHisteresis,
    );
    const d01 = tercera.distritos.find((d) => d.distritoCodigo === '01')!;
    expect(d01.nivel).toBe('prioritario'); // sigue confirmado, dentro de la ventana de 20 min
  });

  it('deja de mostrarse pasados los 20 min de permanencia', () => {
    const entradaConSenal = entradaBase({ tramos: tramosDistrito('01', 3), incidencias: [incidencia()] });
    const primera = calcularPulsoEscenarios(entradaConSenal, {});
    const segunda = calcularPulsoEscenarios(
      { ...entradaConSenal, ahora: '2026-09-16T10:03:00.000Z' },
      primera.estadoHisteresis,
    );
    const tercera = calcularPulsoEscenarios(
      entradaBase({ tramos: tramosDistrito('01', 0), ahora: '2026-09-16T10:25:00.000Z' }), // +22 min desde la última detección
      segunda.estadoHisteresis,
    );
    const d01 = tercera.distritos.find((d) => d.distritoCodigo === '01')!;
    expect(d01.nivel).toBe('sin-senal');
    expect(d01.escenariosActivos).toHaveLength(0);
  });

  it('un escenario nunca confirmado (cold start) no "permanece" al dejar de detectarse', () => {
    const primera = calcularPulsoEscenarios(
      entradaBase({ tramos: tramosDistrito('01', 3), incidencias: [incidencia()] }),
      {},
    ); // cold start: detectado, no confirmado
    const segunda = calcularPulsoEscenarios(
      entradaBase({ tramos: tramosDistrito('01', 0), ahora: '2026-09-16T10:02:00.000Z' }),
      primera.estadoHisteresis,
    );
    expect(segunda.distritos.find((d) => d.distritoCodigo === '01')!.escenariosActivos).toHaveLength(0);
  });
});

describe('calcularPulsoEscenarios — notaAire', () => {
  it('null si el distrito está en sin-senal, aunque el aire sea malo', () => {
    const r = calcularPulsoEscenarios(entradaBase({ tramos: tramosDistrito('01', 0), aire: AIRE_MALA }), {});
    expect(r.distritos.find((d) => d.distritoCodigo === '01')!.notaAire).toBeNull();
  });

  it('con nivel activo y aire Mala/Muy mala, se añade la nota', () => {
    const entrada = entradaBase({ tramos: tramosDistrito('01', 3), incidencias: [incidencia()], aire: AIRE_MALA });
    const primera = calcularPulsoEscenarios(entrada, {});
    const segunda = calcularPulsoEscenarios({ ...entrada, ahora: '2026-09-16T10:03:00.000Z' }, primera.estadoHisteresis);
    const d01 = segunda.distritos.find((d) => d.distritoCodigo === '01')!;
    expect(d01.nivel).toBe('prioritario');
    expect(d01.notaAire).toContain('mala');
  });
});

describe('calcularPulsoEscenarios — corte-cerca-equipamiento-critico (v5)', () => {
  it('tramo cortado a ~0 m de un hospital → se detecta (cold start, sin confirmar)', () => {
    const r = calcularPulsoEscenarios(
      entradaBase({ tramos: tramosDistrito('01', 1), equipamientosCriticos: [equipamiento()] }),
      {},
    );
    const d01 = r.distritos.find((d) => d.distritoCodigo === '01')!;
    const esc = d01.escenariosActivos.find((e) => e.id === 'corte-cerca-equipamiento-critico');
    expect(esc).toBeDefined();
    expect(esc?.modo).toBe('vivo');
    expect(esc?.equipamientoCritico?.nombre).toBe('Hospital Clínico Universitario');
    expect(esc?.equipamientoCritico?.distanciaM).toBeLessThan(250);
  });

  it('2ª evaluación consecutiva confirma → nivel prioritario', () => {
    const entrada = entradaBase({ tramos: tramosDistrito('01', 1), equipamientosCriticos: [equipamiento()] });
    const primera = calcularPulsoEscenarios(entrada, {});
    const segunda = calcularPulsoEscenarios({ ...entrada, ahora: '2026-09-16T10:03:00.000Z' }, primera.estadoHisteresis);
    const d01 = segunda.distritos.find((d) => d.distritoCodigo === '01')!;
    expect(d01.nivel).toBe('prioritario');
  });

  it('solo congestionado (no cortado) no dispara, aunque esté muy cerca', () => {
    const tramoCongestionado = tramo('01-cong', '01', 'congestionado');
    const r = calcularPulsoEscenarios(
      entradaBase({ tramos: [tramoCongestionado, ...tramosDistrito('01', 0, 3)], equipamientosCriticos: [equipamiento()] }),
      {},
    );
    expect(r.distritos.find((d) => d.distritoCodigo === '01')!.escenariosActivos).toHaveLength(0);
  });

  it('fuera del radio (equipamiento a varios km) no dispara', () => {
    const r = calcularPulsoEscenarios(
      entradaBase({
        tramos: tramosDistrito('01', 1),
        equipamientosCriticos: [equipamiento({ lat: 39.5, lon: -0.4 })],
      }),
      {},
    );
    expect(r.distritos.find((d) => d.distritoCodigo === '01')!.escenariosActivos).toHaveLength(0);
  });

  it('categoría policia no dispara (exclusión deliberada, CLAUDE.md §4)', () => {
    const r = calcularPulsoEscenarios(
      entradaBase({
        tramos: tramosDistrito('01', 1),
        equipamientosCriticos: [equipamiento({ categoria: 'policia' })],
      }),
      {},
    );
    expect(r.distritos.find((d) => d.distritoCodigo === '01')!.escenariosActivos).toHaveLength(0);
  });

  it('categoría bomberos sí dispara, igual que sanidad', () => {
    const r = calcularPulsoEscenarios(
      entradaBase({
        tramos: tramosDistrito('01', 1),
        equipamientosCriticos: [equipamiento({ categoria: 'bomberos', nombre: 'Parque de Bomberos Centro' })],
      }),
      {},
    );
    const esc = r.distritos.find((d) => d.distritoCodigo === '01')!.escenariosActivos[0];
    expect(esc?.equipamientoCritico?.categoria).toBe('bomberos');
  });

  it('sin equipamientos críticos en la entrada, no dispara (degradación)', () => {
    const r = calcularPulsoEscenarios(entradaBase({ tramos: tramosDistrito('01', 1) }), {});
    expect(r.distritos.find((d) => d.distritoCodigo === '01')!.escenariosActivos).toHaveLength(0);
  });

  it('con varios tramos cortados a distinta distancia del mismo equipamiento, se queda con el más cercano (dedup por distrito)', () => {
    const cercano = tramo('01-cercano', '01', 'cortado'); // geometría por defecto, ~0 m del equipamiento
    const lejano: TramoTrafico = {
      ...tramo('01-lejano', '01', 'cortado'),
      // Desplazado ~130 m en longitud — sigue dentro del radio de 250 m, pero más lejos que `cercano`.
      geometry: {
        type: 'LineString',
        coordinates: [
          [-0.38 - 0.0015, 39.47],
          [-0.381 - 0.0015, 39.471],
        ],
      },
    };
    const r = calcularPulsoEscenarios(
      entradaBase({
        tramos: [lejano, cercano, ...tramosDistrito('01', 0, 2)], // `lejano` primero a propósito — el orden de entrada no debe importar
        equipamientosCriticos: [equipamiento()],
      }),
      {},
    );
    const esc = r.distritos.find((d) => d.distritoCodigo === '01')!.escenariosActivos[0];
    expect(esc?.tramosAfectados[0]?.id).toBe('01-cercano');
  });
});

describe('calcularPulsoEscenarios — degradación por fuente caída', () => {
  it('sin incidencias, sin escenario 1; sin zonas, sin escenario 2; sin predicción, sin escenario 3', () => {
    const r = calcularPulsoEscenarios(
      entradaBase({ tramos: [...tramosDistrito('01', 6, 10)] }),
      {},
    );
    const d01 = r.distritos.find((d) => d.distritoCodigo === '01')!;
    expect(d01.escenariosActivos).toHaveLength(0);
  });
});
