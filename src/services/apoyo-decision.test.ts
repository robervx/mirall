import { describe, expect, it } from 'vitest';
import { calcularSugerencias } from './apoyo-decision';
import type { PulsoDistrito, EscenarioActivo } from './pulso-escenarios';
import type { AvisoMeteo } from './avisos-meteo';

function escenario(overrides: Partial<EscenarioActivo>): EscenarioActivo {
  return {
    id: 'incidencia-sobre-trafico-denso',
    nivel: 'prioritario',
    modo: 'vivo',
    confirmado: true,
    anticipacionMin: null,
    motivo: 'Incidencia "Obra en calzada" en Carrer de Sant Vicent coincide con 3 tramos de tráfico denso en Ciutat Vella.',
    zonas: [],
    centroideAfectado: [-0.3763, 39.4699],
    tramosAfectados: [{ id: 't1', nombre: 'Carrer de Sant Vicent', estado: 'congestionado', puntoMedio: [-0.376, 39.47] }],
    ...overrides,
  };
}

function distrito(overrides: Partial<PulsoDistrito>): PulsoDistrito {
  return {
    distritoCodigo: '01',
    distritoNombre: 'Ciutat Vella',
    nivel: 'prioritario',
    monitorizacion: 'suficiente',
    tramosMonitorizados: 10,
    escenariosActivos: [],
    notaAire: null,
    observedAt: '2026-09-16T10:00:00.000Z',
    fetchedAt: '2026-09-16T10:00:00.000Z',
    source: 'vlc-monitor-pulso',
    ...overrides,
  };
}

const GENERADA_EN = '2026-09-16T10:00:05.000Z';

describe('calcularSugerencias', () => {
  it('genera una sugerencia por escenario vivo y confirmado', () => {
    const distritos = [distrito({ escenariosActivos: [escenario({})] })];
    const sugerencias = calcularSugerencias(distritos, GENERADA_EN);
    expect(sugerencias).toHaveLength(1);
    expect(sugerencias[0]!.id).toBe('01:incidencia-sobre-trafico-denso');
    expect(sugerencias[0]!.distrito).toBe('Ciutat Vella');
    expect(sugerencias[0]!.calle).toBe('Carrer de Sant Vicent');
    expect(sugerencias[0]!.severidad).toBe('prioritario');
    expect(sugerencias[0]!.generadaEn).toBe(GENERADA_EN);
    expect(sugerencias[0]!.centroide).toEqual([-0.3763, 39.4699]);
  });

  it('ignora escenarios en modo sombra (spec 010 §10.3)', () => {
    const distritos = [distrito({ escenariosActivos: [escenario({ modo: 'sombra' })] })];
    expect(calcularSugerencias(distritos, GENERADA_EN)).toEqual([]);
  });

  it('ignora escenarios sin confirmar', () => {
    const distritos = [distrito({ escenariosActivos: [escenario({ confirmado: false })] })];
    expect(calcularSugerencias(distritos, GENERADA_EN)).toEqual([]);
  });

  it('el texto de sugerencia siempre va en condicional, nunca en imperativo', () => {
    const distritos = [
      distrito({
        escenariosActivos: [
          escenario({ id: 'incidencia-sobre-trafico-denso' }),
          escenario({ id: 'fallas-y-trafico', zonaFallas: { nombre: 'Zona X', centroide: [-0.37, 39.47] } }),
          escenario({ id: 'lluvia-inminente-sobre-trafico-denso', nivel: 'seguimiento' }),
        ],
      }),
    ];
    const sugerencias = calcularSugerencias(distritos, GENERADA_EN);
    expect(sugerencias).toHaveLength(3);
    for (const s of sugerencias) {
      expect(s.sugerenciaTexto).toMatch(/^Podría convenir valorar/);
      expect(s.sugerenciaTexto.toLowerCase()).not.toMatch(/\b(enviar|cortar|despachar|ejecutar)\b/);
    }
  });

  it('usa el distrito como localización cuando no hay tramo afectado (sin calle inventada)', () => {
    const distritos = [
      distrito({
        escenariosActivos: [escenario({ id: 'fallas-y-trafico', tramosAfectados: [] })],
      }),
    ];
    const [sugerencia] = calcularSugerencias(distritos, GENERADA_EN);
    expect(sugerencia!.calle).toBeUndefined();
    expect(sugerencia!.distrito).toBe('Ciutat Vella');
    expect(sugerencia!.sugerenciaTexto).toContain('Ciutat Vella');
  });

  it('ordena prioritario antes que seguimiento', () => {
    const distritos = [
      distrito({
        distritoCodigo: '02',
        distritoNombre: 'Extramurs',
        escenariosActivos: [escenario({ id: 'lluvia-inminente-sobre-trafico-denso', nivel: 'seguimiento' })],
      }),
      distrito({
        distritoCodigo: '01',
        distritoNombre: 'Ciutat Vella',
        escenariosActivos: [escenario({ id: 'incidencia-sobre-trafico-denso', nivel: 'prioritario' })],
      }),
    ];
    const sugerencias = calcularSugerencias(distritos, GENERADA_EN);
    expect(sugerencias.map((s) => s.severidad)).toEqual(['prioritario', 'seguimiento']);
  });

  it('cada señal combinada y fuenteSpec es trazable al escenario de origen', () => {
    const distritos = [distrito({ escenariosActivos: [escenario({})] })];
    const [sugerencia] = calcularSugerencias(distritos, GENERADA_EN);
    expect(sugerencia!.señalesCombinadas).toEqual(['incidencia-via-publica', 'trafico-denso']);
    expect(sugerencia!.fuenteSpec).toEqual(['010', '004', '026']);
  });

  it('corte-cerca-equipamiento-critico (v5, spec 010): nombra el equipamiento real en el texto', () => {
    const distritos = [
      distrito({
        escenariosActivos: [
          escenario({
            id: 'corte-cerca-equipamiento-critico',
            motivo: 'Corte en Carrer de Sant Vicent a 80 m de Hospital Clínico Universitario (sanidad), podría afectar al acceso de emergencias.',
            equipamientoCritico: { id: 'eq-1', nombre: 'Hospital Clínico Universitario', categoria: 'sanidad', distanciaM: 80 },
          }),
        ],
      }),
    ];
    const [sugerencia] = calcularSugerencias(distritos, GENERADA_EN);
    expect(sugerencia!.sugerenciaTexto).toContain('Hospital Clínico Universitario');
    expect(sugerencia!.sugerenciaTexto).toMatch(/^Podría convenir valorar/);
    expect(sugerencia!.señalesCombinadas).toEqual(['corte-via', 'equipamiento-critico-cercano']);
    expect(sugerencia!.fuenteSpec).toEqual(['010', '004', '054']);
  });
});

// v2 (spec 041) — enriquecimiento con el aviso oficial de Emergencias GVA
// más severo, recomendación #2 del asesor de ciencia de datos (2026-10-01).
function aviso(overrides: Partial<AvisoMeteo>): AvisoMeteo {
  return {
    id: 'https://comunica.gva.es/es/detalle?id=1',
    nivel: 'naranja',
    titulo: 'Emergencias activa la alerta naranja',
    resumen: null,
    url: 'https://comunica.gva.es/es/detalle?id=1',
    publicadoEn: '2026-10-01T00:00:00.000Z',
    fetchedAt: GENERADA_EN,
    source: 'gva-emergencias-scraping',
    ...overrides,
  };
}

describe('calcularSugerencias — aviso oficial (v2, spec 041)', () => {
  it('sin avisos oficiales, el texto no cambia', () => {
    const distritos = [distrito({ escenariosActivos: [escenario({})] })];
    const [sugerencia] = calcularSugerencias(distritos, GENERADA_EN, []);
    expect(sugerencia!.sugerenciaTexto).not.toContain('aviso oficial');
    expect(sugerencia!.señalesCombinadas).toEqual(['incidencia-via-publica', 'trafico-denso']);
  });

  it('con un aviso oficial ROJO vigente, añade la cláusula y la señal trazable, sin tocar severidad', () => {
    const distritos = [distrito({ escenariosActivos: [escenario({ nivel: 'seguimiento' })] })];
    const [sugerencia] = calcularSugerencias(distritos, GENERADA_EN, [aviso({ nivel: 'rojo' })]);
    expect(sugerencia!.sugerenciaTexto).toContain('aviso oficial rojo');
    expect(sugerencia!.señalesCombinadas).toContain('aviso-oficial-rojo');
    expect(sugerencia!.fuenteSpec).toContain('001');
    expect(sugerencia!.severidad).toBe('seguimiento'); // nunca sube la severidad por sí solo
  });

  it('con un aviso AMARILLO vigente, no enriquece (solo rojo/naranja, mismo corte que insights.ts)', () => {
    const distritos = [distrito({ escenariosActivos: [escenario({})] })];
    const [sugerencia] = calcularSugerencias(distritos, GENERADA_EN, [aviso({ nivel: 'amarillo' })]);
    expect(sugerencia!.sugerenciaTexto).not.toContain('aviso oficial');
  });

  it('con rojo y naranja a la vez, usa el rojo (el más severo)', () => {
    const distritos = [distrito({ escenariosActivos: [escenario({})] })];
    const [sugerencia] = calcularSugerencias(distritos, GENERADA_EN, [aviso({ nivel: 'naranja' }), aviso({ nivel: 'rojo', id: '2' })]);
    expect(sugerencia!.sugerenciaTexto).toContain('aviso oficial rojo');
    expect(sugerencia!.señalesCombinadas).toContain('aviso-oficial-rojo');
    expect(sugerencia!.señalesCombinadas).not.toContain('aviso-oficial-naranja');
  });

  it('el texto sigue en condicional con el aviso añadido, nunca imperativo', () => {
    const distritos = [distrito({ escenariosActivos: [escenario({})] })];
    const [sugerencia] = calcularSugerencias(distritos, GENERADA_EN, [aviso({ nivel: 'rojo' })]);
    expect(sugerencia!.sugerenciaTexto).toMatch(/^Podría convenir valorar/);
    expect(sugerencia!.sugerenciaTexto.toLowerCase()).not.toMatch(/\b(enviar|cortar|despachar|ejecutar)\b/);
  });

  it('sin tercer argumento (llamadas antiguas), sigue funcionando igual que v1', () => {
    const distritos = [distrito({ escenariosActivos: [escenario({})] })];
    const [sugerencia] = calcularSugerencias(distritos, GENERADA_EN);
    expect(sugerencia!.sugerenciaTexto).not.toContain('aviso oficial');
  });
});
