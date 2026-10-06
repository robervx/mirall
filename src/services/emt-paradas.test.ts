import { describe, expect, it } from 'vitest';
import { normalizarParadasEmt, type ArcGisParadaFeature } from './emt-paradas';

const FEATURES: ArcGisParadaFeature[] = [
  {
    attributes: { id_parada: 1044, denominacion: 'Poliesportiu de Burjassot (1044)', lineas: '63', suprimida: 0 },
    geometry: { x: -0.4167, y: 39.5078 },
  },
  {
    attributes: { id_parada: 338, denominacion: 'Museu de Belles Arts (338)', lineas: '11,16,26,6,79,94,95', suprimida: 0 },
    geometry: { x: -0.3713, y: 39.479 },
  },
  {
    // suprimida (fuera de servicio) — se descarta.
    attributes: { id_parada: 999, denominacion: 'Parada suprimida', lineas: '1', suprimida: 1 },
    geometry: { x: -0.4, y: 39.47 },
  },
  {
    // fila vacía del ArcGIS Server — se descarta, mismo caso que otras capas del geoportal.
    attributes: { id_parada: null, denominacion: null, lineas: null, suprimida: null },
    geometry: null,
  },
];

describe('normalizarParadasEmt', () => {
  it('normaliza y parte el campo "lineas" por comas', () => {
    const paradas = normalizarParadasEmt(FEATURES, '2026-10-02T00:00:00.000Z');

    expect(paradas).toHaveLength(2);
    expect(paradas[0]).toMatchObject({
      id: '1044',
      nombre: 'Poliesportiu de Burjassot (1044)',
      lineas: ['63'],
      lat: 39.5078,
      lon: -0.4167,
      source: 'geoportal-valencia-emt-paradas',
    });
    expect(paradas[1]?.lineas).toEqual(['11', '16', '26', '6', '79', '94', '95']);
  });

  it('descarta paradas suprimidas y filas vacías', () => {
    const paradas = normalizarParadasEmt(FEATURES, '2026-10-02T00:00:00.000Z');
    expect(paradas.some((p) => p.id === '999')).toBe(false);
  });
});
