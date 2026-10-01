import { describe, expect, it } from 'vitest';
import { calcularInsights } from './insights';
import type { EstadoMeteo } from './estado-meteo';
import type { CalidadAire } from './calidad-aire';
import type { PulsoDistrito, EscenarioActivo } from './pulso-escenarios';
import type { PrediccionCortoPlazo } from './prediccion-corto-plazo';
import type { TramoTrafico } from './trafico';
import type { DatosFallas } from './fallas';

const METEO_NEUTRA: EstadoMeteo = {
  id: 'valencia',
  lat: 39.4699,
  lon: -0.3763,
  temperatura: 22,
  sensacionTermica: 22,
  humedad: 50,
  precipitacion: 0,
  weatherCode: 0,
  descripcion: 'Cielo despejado',
  vientoVelocidad: 10,
  vientoDireccion: 90,
  vientoRachas: 15,
  presion: 1015,
  uvIndex: 3,
  observedAt: '2026-08-18T10:00:00.000Z',
  fetchedAt: '2026-08-18T10:01:00.000Z',
  source: 'open-meteo',
};

const AIRE_BUENA: CalidadAire = {
  id: 'valencia',
  lat: 39.4699,
  lon: -0.3763,
  pm10: 15,
  pm25: 8,
  monoxidoCarbono: 200,
  dioxidoNitrogeno: 10,
  dioxidoAzufre: 2,
  ozono: 40,
  indiceEuropeo: 15,
  indiceUS: 20,
  categoria: 'Buena',
  observedAt: '2026-08-18T10:00:00.000Z',
  fetchedAt: '2026-08-18T10:01:00.000Z',
  source: 'open-meteo',
};

const PREDICCION_SIN_LLUVIA: PrediccionCortoPlazo = {
  id: 'valencia',
  ventanaHoras: 2,
  predicciones: [
    {
      horaObjetivo: '2026-08-18T11:00:00.000Z',
      temperatura: 23,
      probabilidadPrecipitacion: 0,
      precipitacion: 0,
      weatherCode: 0,
      descripcion: 'Cielo despejado',
    },
  ],
  observedAt: '2026-08-18T11:00:00.000Z',
  fetchedAt: '2026-08-18T10:01:00.000Z',
  source: 'open-meteo',
};

const DISTRITO_TRANQUILO: PulsoDistrito = {
  distritoCodigo: '01',
  distritoNombre: 'Ciutat Vella',
  nivel: 'sin-senal',
  monitorizacion: 'suficiente',
  tramosMonitorizados: 10,
  escenariosActivos: [],
  notaAire: null,
  observedAt: '2026-08-18T10:00:00.000Z',
  fetchedAt: '2026-08-18T10:01:00.000Z',
  source: 'vlc-monitor-pulso',
};

function escenarioActivo(over: Partial<EscenarioActivo> = {}): EscenarioActivo {
  return {
    id: 'incidencia-sobre-trafico-denso',
    nivel: 'prioritario',
    modo: 'vivo',
    confirmado: true,
    anticipacionMin: null,
    motivo: 'Incidencia en Extramurs con tráfico denso.',
    zonas: [],
    centroideAfectado: [-0.38, 39.47],
    tramosAfectados: [],
    ...over,
  };
}

function tramo(id: string, distrito: string | null, estado: TramoTrafico['estado']): TramoTrafico {
  return {
    id,
    nombre: `Calle ${id}`,
    geometry: { type: 'LineString', coordinates: [[-0.38, 39.47]] },
    estadoCodigo: 0,
    estado,
    esPasoInferior: false,
    distrito,
    observedAt: '2026-08-18T10:00:00.000Z',
    fetchedAt: '2026-08-18T10:01:00.000Z',
    source: 'ajuntament-valencia-geoportal',
  };
}

const FALLAS_SIN_ZONAS: DatosFallas = { monumentos: [], carpas: [], zonasMovilidadReducida: [] };

function fallasConZona(distrito: string): DatosFallas {
  return {
    monumentos: [],
    carpas: [],
    zonasMovilidadReducida: [
      {
        id: 'z1',
        descripcion: 'Mascletà',
        geometry: { type: 'Polygon', coordinates: [[[-0.38, 39.47], [-0.381, 39.471], [-0.38, 39.47]]] },
        distrito,
        observedAt: '2026-08-18T10:00:00.000Z',
        fetchedAt: '2026-08-18T10:01:00.000Z',
        source: 'ajuntament-valencia-geoportal',
      },
    ],
  };
}

describe('calcularInsights', () => {
  it('no genera ningún insight cuando todo está dentro de los umbrales normales', () => {
    const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, [DISTRITO_TRANQUILO], PREDICCION_SIN_LLUVIA);
    expect(resultado.insights).toHaveLength(0);
    expect(resultado.source).toBe('vlc-monitor-insights');
  });

  it('genera calor-extremo cuando la temperatura alcanza el umbral (38°C)', () => {
    const resultado = calcularInsights(
      { ...METEO_NEUTRA, temperatura: 38, sensacionTermica: 39 },
      AIRE_BUENA,
      null,
      null,
    );
    expect(resultado.insights).toHaveLength(1);
    expect(resultado.insights[0]?.tipo).toBe('calor-extremo');
    expect(resultado.insights[0]?.severidad).toBe('urgente');
    expect(resultado.insights[0]?.protocoloSugerido.cuerpo).not.toMatch(/@/); // sin destinatarios/emails
  });

  it('calor entre 35 y 38 es aviso, no urgente (banda de aviso, v4b)', () => {
    const resultado = calcularInsights(
      { ...METEO_NEUTRA, temperatura: 37.9, sensacionTermica: 37.9 },
      AIRE_BUENA,
      null,
      null,
    );
    const calor = resultado.insights.filter((i) => i.tipo === 'calor-extremo');
    expect(calor).toHaveLength(1);
    expect(calor[0]?.severidad).toBe('aviso');
  });

  it('genera frio-extremo cuando la temperatura llega a 0°C', () => {
    const resultado = calcularInsights({ ...METEO_NEUTRA, temperatura: 0 }, AIRE_BUENA, null, null);
    expect(resultado.insights.map((i) => i.tipo)).toContain('frio-extremo');
    expect(resultado.insights.find((i) => i.tipo === 'frio-extremo')?.severidad).toBe('aviso');
  });

  it('genera aire-mala-calidad con severidad urgente si la categoría es Muy mala', () => {
    const resultado = calcularInsights(METEO_NEUTRA, { ...AIRE_BUENA, categoria: 'Muy mala', indiceEuropeo: 95 }, null, null);
    const insight = resultado.insights.find((i) => i.tipo === 'aire-mala-calidad');
    expect(insight?.severidad).toBe('urgente');
  });

  it('genera aire-mala-calidad con severidad aviso si la categoría es Mala', () => {
    const resultado = calcularInsights(METEO_NEUTRA, { ...AIRE_BUENA, categoria: 'Mala', indiceEuropeo: 65 }, null, null);
    const insight = resultado.insights.find((i) => i.tipo === 'aire-mala-calidad');
    expect(insight?.severidad).toBe('aviso');
  });

  it('genera lluvia-intensa-prevista por cada tramo con precipitación >= 5mm', () => {
    const prediccion: PrediccionCortoPlazo = {
      ...PREDICCION_SIN_LLUVIA,
      predicciones: [
        { ...PREDICCION_SIN_LLUVIA.predicciones[0]!, precipitacion: 6, horaObjetivo: '2026-08-18T11:00:00.000Z' },
        { ...PREDICCION_SIN_LLUVIA.predicciones[0]!, precipitacion: 1, horaObjetivo: '2026-08-18T12:00:00.000Z' },
      ],
    };
    const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, prediccion);
    const lluvia = resultado.insights.filter((i) => i.tipo === 'lluvia-intensa-prevista');
    expect(lluvia).toHaveLength(1);
    expect(lluvia[0]?.detectedAt).toBe('2026-08-18T11:00:00.000Z');
  });

  it('genera pulso-distrito solo para distritos con un escenario vivo+confirmado (spec 010 v4)', () => {
    const distritos: PulsoDistrito[] = [
      DISTRITO_TRANQUILO,
      {
        ...DISTRITO_TRANQUILO,
        distritoCodigo: '05',
        distritoNombre: 'Extramurs',
        nivel: 'prioritario',
        escenariosActivos: [escenarioActivo()],
      },
    ];
    const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, distritos, null);
    expect(resultado.insights).toHaveLength(1);
    expect(resultado.insights[0]?.tipo).toBe('pulso-distrito');
    expect(resultado.insights[0]?.distritoCodigo).toBe('05');
    expect(resultado.insights[0]?.severidad).toBe('urgente');
  });

  it('no genera pulso-distrito para un escenario detectado pero no confirmado (cold start)', () => {
    const distritos: PulsoDistrito[] = [
      { ...DISTRITO_TRANQUILO, distritoCodigo: '05', escenariosActivos: [escenarioActivo({ confirmado: false })] },
    ];
    const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, distritos, null);
    expect(resultado.insights.filter((i) => i.tipo === 'pulso-distrito')).toHaveLength(0);
  });

  it('no genera pulso-distrito para un escenario en modo sombra, aunque esté confirmado', () => {
    const distritos: PulsoDistrito[] = [
      {
        ...DISTRITO_TRANQUILO,
        distritoCodigo: '05',
        escenariosActivos: [escenarioActivo({ id: 'lluvia-inminente-sobre-trafico-denso', modo: 'sombra' })],
      },
    ];
    const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, distritos, null);
    expect(resultado.insights.filter((i) => i.tipo === 'pulso-distrito')).toHaveLength(0);
  });

  it('genera viento-fuerte con severidad aviso a partir de 50 km/h de racha', () => {
    const resultado = calcularInsights({ ...METEO_NEUTRA, vientoRachas: 50 }, AIRE_BUENA, null, null);
    const insight = resultado.insights.find((i) => i.tipo === 'viento-fuerte');
    expect(insight?.severidad).toBe('aviso');
  });

  it('no genera viento-fuerte un km/h por debajo del umbral', () => {
    const resultado = calcularInsights({ ...METEO_NEUTRA, vientoRachas: 49 }, AIRE_BUENA, null, null);
    expect(resultado.insights.filter((i) => i.tipo === 'viento-fuerte')).toHaveLength(0);
  });

  it('genera viento-fuerte con severidad urgente a partir de 70 km/h de racha', () => {
    const resultado = calcularInsights({ ...METEO_NEUTRA, vientoRachas: 75 }, AIRE_BUENA, null, null);
    const insight = resultado.insights.find((i) => i.tipo === 'viento-fuerte');
    expect(insight?.severidad).toBe('urgente');
  });

  it('no revienta si distritos o predicción no están disponibles (null)', () => {
    const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, null);
    expect(resultado.insights).toHaveLength(0);
  });

  it('todos los insights de spec 013 emiten fuenteSpec como array', () => {
    const resultado = calcularInsights(
      { ...METEO_NEUTRA, temperatura: 38, sensacionTermica: 39 },
      { ...AIRE_BUENA, categoria: 'Muy mala', indiceEuropeo: 95 },
      [{ ...DISTRITO_TRANQUILO, distritoCodigo: '05', nivel: 'prioritario', escenariosActivos: [escenarioActivo()] }],
      { ...PREDICCION_SIN_LLUVIA, predicciones: [{ ...PREDICCION_SIN_LLUVIA.predicciones[0]!, precipitacion: 6 }] },
    );
    expect(resultado.insights.length).toBeGreaterThan(0);
    for (const insight of resultado.insights) {
      expect(Array.isArray(insight.fuenteSpec)).toBe(true);
    }
  });

  describe('spec 024 — correlación tráfico/Fallas/lluvia', () => {
    it('no genera trafico-concentrado-distrito con menos de 3 tramos densos en el mismo distrito', () => {
      const tramos = [tramo('1', '05', 'congestionado'), tramo('2', '05', 'congestionado'), tramo('3', '05', 'fluido')];
      const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, null, tramos, FALLAS_SIN_ZONAS);
      expect(resultado.insights.filter((i) => i.tipo === 'trafico-concentrado-distrito')).toHaveLength(0);
    });

    it('genera trafico-concentrado-distrito con severidad aviso a partir de 3 tramos densos', () => {
      const tramos = [
        tramo('1', '05', 'congestionado'),
        tramo('2', '05', 'congestionado'),
        tramo('3', '05', 'cortado'),
        tramo('4', '05', 'fluido'),
      ];
      const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, null, tramos, FALLAS_SIN_ZONAS);
      const insight = resultado.insights.find((i) => i.tipo === 'trafico-concentrado-distrito');
      expect(insight?.severidad).toBe('aviso');
      expect(insight?.distritoCodigo).toBe('05');
      expect(insight?.fuenteSpec).toEqual(['004']);
    });

    it('sube trafico-concentrado-distrito a urgente a partir de 6 tramos densos', () => {
      const tramos = Array.from({ length: 6 }, (_, i) => tramo(String(i), '05', 'cortado'));
      const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, null, tramos, FALLAS_SIN_ZONAS);
      const insight = resultado.insights.find((i) => i.tipo === 'trafico-concentrado-distrito');
      expect(insight?.severidad).toBe('urgente');
    });

    it('no genera trafico-en-zona-fallas si no hay zonas de movilidad reducida activas', () => {
      const tramos = [tramo('1', '05', 'cortado')];
      const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, null, tramos, FALLAS_SIN_ZONAS);
      expect(resultado.insights.filter((i) => i.tipo === 'trafico-en-zona-fallas')).toHaveLength(0);
    });

    it('no genera trafico-en-zona-fallas si el tráfico denso está en un distrito distinto al de la zona', () => {
      const tramos = [tramo('1', '05', 'cortado')];
      const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, null, tramos, fallasConZona('01'));
      expect(resultado.insights.filter((i) => i.tipo === 'trafico-en-zona-fallas')).toHaveLength(0);
    });

    it('genera trafico-en-zona-fallas cuando coincide distrito de tráfico denso y zona de Fallas activa', () => {
      const tramos = [tramo('1', '05', 'cortado')];
      const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, null, tramos, fallasConZona('05'));
      const insight = resultado.insights.find((i) => i.tipo === 'trafico-en-zona-fallas');
      expect(insight?.severidad).toBe('urgente');
      expect(insight?.fuenteSpec).toEqual(['004', '008']);
    });

    it('no genera lluvia-mas-trafico-denso si no hay lluvia intensa prevista', () => {
      const tramos = [tramo('1', '05', 'cortado')];
      const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, PREDICCION_SIN_LLUVIA, tramos, FALLAS_SIN_ZONAS);
      expect(resultado.insights.filter((i) => i.tipo === 'lluvia-mas-trafico-denso')).toHaveLength(0);
    });

    it('no genera lluvia-mas-trafico-denso si hay lluvia pero no tráfico denso', () => {
      const prediccion: PrediccionCortoPlazo = {
        ...PREDICCION_SIN_LLUVIA,
        predicciones: [{ ...PREDICCION_SIN_LLUVIA.predicciones[0]!, precipitacion: 6 }],
      };
      const tramos = [tramo('1', '05', 'fluido')];
      const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, prediccion, tramos, FALLAS_SIN_ZONAS);
      expect(resultado.insights.filter((i) => i.tipo === 'lluvia-mas-trafico-denso')).toHaveLength(0);
    });

    it('genera lluvia-mas-trafico-denso cuando coinciden lluvia intensa prevista y tráfico denso', () => {
      const prediccion: PrediccionCortoPlazo = {
        ...PREDICCION_SIN_LLUVIA,
        predicciones: [{ ...PREDICCION_SIN_LLUVIA.predicciones[0]!, precipitacion: 6 }],
      };
      const tramos = [tramo('1', '05', 'congestionado')];
      const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, prediccion, tramos, FALLAS_SIN_ZONAS);
      const insight = resultado.insights.find((i) => i.tipo === 'lluvia-mas-trafico-denso');
      expect(insight?.severidad).toBe('urgente');
      expect(insight?.fuenteSpec).toEqual(['016', '004']);
    });

    it('no revienta si tramosTrafico/datosFallas no están disponibles (null, valor por defecto)', () => {
      const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, null);
      expect(resultado.insights.filter((i) => i.tipo.startsWith('trafico-') || i.tipo === 'lluvia-mas-trafico-denso')).toHaveLength(0);
    });
  });

  describe('v4b — disparadores nuevos', () => {
    it('calor: banda de aviso a 35 °C (no urgente hasta 38)', () => {
      const r = calcularInsights({ ...METEO_NEUTRA, temperatura: 36, sensacionTermica: 36 }, AIRE_BUENA, null, null);
      const calor = r.insights.find((i) => i.tipo === 'calor-extremo');
      expect(calor?.severidad).toBe('aviso');
      expect(calor?.titulo).toContain('Aviso de calor');
    });

    it('calor: sigue siendo urgente a 38 °C', () => {
      const r = calcularInsights({ ...METEO_NEUTRA, temperatura: 38, sensacionTermica: 38 }, AIRE_BUENA, null, null);
      expect(r.insights.find((i) => i.tipo === 'calor-extremo')?.severidad).toBe('urgente');
    });

    it('calor: nada por debajo de 35 °C', () => {
      const r = calcularInsights({ ...METEO_NEUTRA, temperatura: 34.9, sensacionTermica: 34.9 }, AIRE_BUENA, null, null);
      expect(r.insights.some((i) => i.tipo === 'calor-extremo')).toBe(false);
    });

    it('lluvia-prevista: dispara con probabilidad >= 60 % aunque la precipitación sea baja', () => {
      const prediccion: PrediccionCortoPlazo = {
        ...PREDICCION_SIN_LLUVIA,
        predicciones: [
          { ...PREDICCION_SIN_LLUVIA.predicciones[0]!, probabilidadPrecipitacion: 70, precipitacion: 1, weatherCode: 61 },
        ],
      };
      const r = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, prediccion);
      const lluvia = r.insights.find((i) => i.tipo === 'lluvia-prevista');
      expect(lluvia?.severidad).toBe('aviso');
      expect(lluvia?.fuenteSpec).toEqual(['016']);
    });

    it('lluvia-prevista: el título/descripción muestran una hora legible, no el ISO crudo (bug real corregido 2026-10-01)', () => {
      const prediccion: PrediccionCortoPlazo = {
        ...PREDICCION_SIN_LLUVIA,
        predicciones: [
          { ...PREDICCION_SIN_LLUVIA.predicciones[0]!, probabilidadPrecipitacion: 70, precipitacion: 1, weatherCode: 61, horaObjetivo: '2026-10-01T17:00:00.000Z' },
        ],
      };
      const r = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, prediccion);
      const lluvia = r.insights.find((i) => i.tipo === 'lluvia-prevista');
      expect(lluvia?.titulo).not.toContain('T17:00:00.000Z');
      expect(lluvia?.descripcion).not.toContain('T17:00:00.000Z');
    });

    it('lluvia-prevista: no duplica cuando ya hay lluvia intensa (>= 5 mm)', () => {
      const prediccion: PrediccionCortoPlazo = {
        ...PREDICCION_SIN_LLUVIA,
        predicciones: [
          { ...PREDICCION_SIN_LLUVIA.predicciones[0]!, probabilidadPrecipitacion: 90, precipitacion: 8, weatherCode: 65 },
        ],
      };
      const r = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, prediccion);
      expect(r.insights.filter((i) => i.tipo === 'lluvia-prevista')).toHaveLength(0);
      expect(r.insights.filter((i) => i.tipo === 'lluvia-intensa-prevista')).toHaveLength(1);
    });

    it('trafico-empeora: sin estado previo no dispara nada', () => {
      const actual = [tramo('1', '05', 'congestionado')];
      const r = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, null, actual, FALLAS_SIN_ZONAS, null);
      expect(r.insights.some((i) => i.tipo === 'trafico-empeora')).toBe(false);
    });

    it('trafico-empeora: un tramo que sube de fluido a congestionado → urgente, agrupado por distrito', () => {
      const previo = [tramo('1', '05', 'fluido'), tramo('2', '05', 'fluido')];
      const actual = [tramo('1', '05', 'congestionado'), tramo('2', '05', 'fluido')];
      const r = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, null, actual, FALLAS_SIN_ZONAS, previo);
      const e = r.insights.find((i) => i.tipo === 'trafico-empeora');
      expect(e?.severidad).toBe('urgente');
      expect(e?.distritoCodigo).toBe('05');
      expect(e?.fuenteSpec).toEqual(['004']);
      // v5: el título nombra la calle, no solo el distrito.
      expect(e?.titulo).toContain('Calle 1');
    });

    it('trafico-empeora: con varios tramos, el título nombra el más severo y cuenta el resto', () => {
      const previo = [tramo('1', '05', 'fluido'), tramo('2', '05', 'fluido'), tramo('3', '05', 'fluido')];
      const actual = [tramo('1', '05', 'denso'), tramo('2', '05', 'cortado'), tramo('3', '05', 'denso')];
      const r = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, null, actual, FALLAS_SIN_ZONAS, previo);
      const e = r.insights.find((i) => i.tipo === 'trafico-empeora');
      expect(e?.titulo).toContain('Calle 2'); // el que llega a "cortado", el más severo
      expect(e?.titulo).toContain('2 más');
    });

    it('trafico-empeora: fluido → denso es solo aviso; una mejora no dispara', () => {
      const previo = [tramo('1', '05', 'fluido'), tramo('2', '05', 'congestionado')];
      const actual = [tramo('1', '05', 'denso'), tramo('2', '05', 'fluido')];
      const r = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, null, actual, FALLAS_SIN_ZONAS, previo);
      const empeora = r.insights.filter((i) => i.tipo === 'trafico-empeora');
      expect(empeora).toHaveLength(1);
      expect(empeora[0]!.severidad).toBe('aviso');
    });
  });
});
