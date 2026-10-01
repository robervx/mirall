import { describe, expect, it } from 'vitest';
import {
  resumenAltimetriaPorDistrito,
  celdaCuadrada,
  featureCollectionAltimetriaPuntos,
  PASO_LAT_REJILLA,
  PASO_LON_REJILLA,
  NODATA_IGN,
  type MuestraElevacion,
} from './altimetria';

describe('resumenAltimetriaPorDistrito', () => {
  const nombres = new Map([
    ['01', 'Ciutat Vella'],
    ['05', "L'Eixample"],
  ]);

  it('calcula min/max/media por distrito', () => {
    const muestras: MuestraElevacion[] = [
      { lat: 39.47, lon: -0.37, elevacionM: 10, distritoCodigo: '01' },
      { lat: 39.471, lon: -0.371, elevacionM: 14, distritoCodigo: '01' },
      { lat: 39.472, lon: -0.372, elevacionM: 12, distritoCodigo: '01' },
      { lat: 39.48, lon: -0.38, elevacionM: 25, distritoCodigo: '05' },
    ];
    const resumen = resumenAltimetriaPorDistrito(muestras, nombres);
    const ciutatVella = resumen.find((r) => r.distritoCodigo === '01')!;
    expect(ciutatVella).toMatchObject({ elevacionMinM: 10, elevacionMaxM: 14, muestras: 3 });
    expect(ciutatVella.elevacionMediaM).toBeCloseTo(12, 5);
  });

  it('descarta muestras NODATA del IGN (mar/sin cobertura)', () => {
    const muestras: MuestraElevacion[] = [
      { lat: 39.47, lon: -0.37, elevacionM: 10, distritoCodigo: '01' },
      { lat: 39.471, lon: -0.371, elevacionM: NODATA_IGN, distritoCodigo: '01' },
    ];
    const resumen = resumenAltimetriaPorDistrito(muestras, nombres);
    expect(resumen.find((r) => r.distritoCodigo === '01')!.muestras).toBe(1);
  });

  it('ordena de más alto a más bajo (media)', () => {
    const muestras: MuestraElevacion[] = [
      { lat: 39.47, lon: -0.37, elevacionM: 5, distritoCodigo: '01' },
      { lat: 39.48, lon: -0.38, elevacionM: 25, distritoCodigo: '05' },
    ];
    const resumen = resumenAltimetriaPorDistrito(muestras, nombres);
    expect(resumen.map((r) => r.distritoCodigo)).toEqual(['05', '01']);
  });
});

// Spec 052 v2 — celdas cuadradas de la rejilla real (sustituyen al
// choropleth de 19 distritos).
describe('celdaCuadrada', () => {
  it('genera un polígono cerrado centrado en (lat, lon) con el paso real de la rejilla', () => {
    const poligono = celdaCuadrada(39.47, -0.37);
    expect(poligono.type).toBe('Polygon');
    const anillo = poligono.coordinates[0]!;
    expect(anillo).toHaveLength(5);
    expect(anillo[0]).toEqual(anillo[4]); // anillo cerrado
    const lons = anillo.map((c) => c[0]!);
    const lats = anillo.map((c) => c[1]!);
    expect(Math.max(...lons) - Math.min(...lons)).toBeCloseTo(PASO_LON_REJILLA, 10);
    expect(Math.max(...lats) - Math.min(...lats)).toBeCloseTo(PASO_LAT_REJILLA, 10);
  });
});

describe('featureCollectionAltimetriaPuntos', () => {
  it('convierte cada punto en una Feature con su elevación y distrito en properties', () => {
    const puntos: MuestraElevacion[] = [
      { lat: 39.47, lon: -0.37, elevacionM: 12.5, distritoCodigo: '01' },
      { lat: 39.48, lon: -0.38, elevacionM: 3.2, distritoCodigo: '11' },
    ];
    const fc = featureCollectionAltimetriaPuntos(puntos);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties).toEqual({ elevacionM: 12.5, distritoCodigo: '01' });
    expect(fc.features[0]!.geometry.type).toBe('Polygon');
  });

  it('con cero puntos devuelve una FeatureCollection vacía, no un error', () => {
    expect(featureCollectionAltimetriaPuntos([]).features).toEqual([]);
  });
});
