import { describe, expect, it } from 'vitest';
import {
  valorIdw,
  rejillaInterpolada,
  celdaCuadradaInterpolada,
  featureCollectionInterpolada,
  type EstacionInterpolable,
  type CeldaInterpolada,
} from './interpolacion-meteo';

describe('valorIdw', () => {
  it('devuelve el valor exacto de la estación cuando el punto coincide con ella', () => {
    const estaciones: EstacionInterpolable[] = [{ lat: 39.47, lon: -0.37, valor: 25 }];
    const r = valorIdw(estaciones, 39.47, -0.37);
    expect(r.valor).toBe(25);
    expect(r.distanciaMasCercanaM).toBe(0);
  });

  it('en el punto medio entre dos estaciones equidistantes de distinto valor, devuelve su media', () => {
    // Dos estaciones a la misma latitud, separadas en longitud — el punto
    // medio exacto está a la misma distancia de ambas.
    const estaciones: EstacionInterpolable[] = [
      { lat: 39.47, lon: -0.38, valor: 20 },
      { lat: 39.47, lon: -0.36, valor: 30 },
    ];
    const r = valorIdw(estaciones, 39.47, -0.37);
    expect(r.valor).toBeCloseTo(25, 1);
  });

  it('pondera más la estación más cercana (el valor está más cerca del suyo que del lejano)', () => {
    const estaciones: EstacionInterpolable[] = [
      { lat: 39.47, lon: -0.37, valor: 10 }, // muy cerca del punto de consulta
      { lat: 39.5, lon: -0.3, valor: 40 }, // lejos
    ];
    const r = valorIdw(estaciones, 39.471, -0.371);
    expect(r.valor).toBeLessThan(25); // más cerca de 10 que de 40
    expect(r.valor).toBeGreaterThan(10);
  });

  it('con cero estaciones devuelve valor 0 y distancia infinita, no lanza', () => {
    const r = valorIdw([], 39.47, -0.37);
    expect(r.valor).toBe(0);
    expect(r.distanciaMasCercanaM).toBe(Infinity);
  });
});

describe('rejillaInterpolada', () => {
  it('con cero estaciones devuelve rejilla vacía', () => {
    expect(rejillaInterpolada([], { pasoLat: 0.01, pasoLon: 0.01, distanciaMaximaM: 1000 })).toEqual([]);
  });

  it('genera al menos una celda cerca de una estación aislada', () => {
    const estaciones: EstacionInterpolable[] = [{ lat: 39.47, lon: -0.37, valor: 22 }];
    const rejilla = rejillaInterpolada(estaciones, { pasoLat: 0.005, pasoLon: 0.005, distanciaMaximaM: 1000 });
    expect(rejilla.length).toBeGreaterThan(0);
    // La celda más cercana a la propia estación debe tener un valor muy próximo a 22.
    const masCercana = rejilla.reduce((a, b) => (a.distanciaEstacionMasCercanaM < b.distanciaEstacionMasCercanaM ? a : b));
    expect(masCercana.valor).toBeCloseTo(22, 0);
  });

  it('descarta celdas más allá de distanciaMaximaM de cualquier estación (no extrapola)', () => {
    const estaciones: EstacionInterpolable[] = [{ lat: 39.47, lon: -0.37, valor: 22 }];
    const rejilla = rejillaInterpolada(estaciones, { pasoLat: 0.005, pasoLon: 0.005, distanciaMaximaM: 1000 });
    for (const celda of rejilla) {
      expect(celda.distanciaEstacionMasCercanaM).toBeLessThanOrEqual(1000);
    }
  });

  it('dos estaciones muy separadas (más que 2x distanciaMaximaM) producen dos islas de cobertura, no un puente entre ambas', () => {
    const estaciones: EstacionInterpolable[] = [
      { lat: 39.47, lon: -0.37, valor: 10 },
      { lat: 39.6, lon: -0.37, valor: 30 }, // ~14 km al norte
    ];
    const rejilla = rejillaInterpolada(estaciones, { pasoLat: 0.002, pasoLon: 0.002, distanciaMaximaM: 1000 });
    // El punto medio entre ambas (a ~7 km de cada una) no debe aparecer en la rejilla.
    const puntoMedio = rejilla.find((c) => Math.abs(c.lat - 39.535) < 0.002);
    expect(puntoMedio).toBeUndefined();
  });
});

describe('celdaCuadradaInterpolada', () => {
  it('genera un polígono cerrado centrado en (lat, lon) con el paso dado', () => {
    const poligono = celdaCuadradaInterpolada(39.47, -0.37, 0.002, 0.003);
    expect(poligono.type).toBe('Polygon');
    const anillo = poligono.coordinates[0]!;
    expect(anillo).toHaveLength(5);
    expect(anillo[0]).toEqual(anillo[4]);
    const lons = anillo.map((c) => c[0]!);
    const lats = anillo.map((c) => c[1]!);
    expect(Math.max(...lons) - Math.min(...lons)).toBeCloseTo(0.003, 10);
    expect(Math.max(...lats) - Math.min(...lats)).toBeCloseTo(0.002, 10);
  });
});

describe('featureCollectionInterpolada', () => {
  it('convierte cada celda en una Feature con su valor y distancia en properties', () => {
    const celdas: CeldaInterpolada[] = [
      { lat: 39.47, lon: -0.37, valor: 22.5, distanciaEstacionMasCercanaM: 120 },
      { lat: 39.48, lon: -0.38, valor: 19.1, distanciaEstacionMasCercanaM: 400 },
    ];
    const fc = featureCollectionInterpolada(celdas, 0.002, 0.003);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties).toEqual({ valor: 22.5, distanciaEstacionMasCercanaM: 120 });
    expect(fc.features[0]!.geometry.type).toBe('Polygon');
  });

  it('con cero celdas devuelve una FeatureCollection vacía, no un error', () => {
    expect(featureCollectionInterpolada([], 0.002, 0.003).features).toEqual([]);
  });
});
