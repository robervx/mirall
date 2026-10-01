import { describe, expect, it } from 'vitest';
import { normalizarEquipamientosCriticos } from './equipamientos-criticos';

function feature(props: Record<string, unknown>, coords: [number, number] = [-0.37, 39.47]) {
  return {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: coords },
    properties: props,
  };
}

describe('normalizarEquipamientosCriticos', () => {
  it('normaliza una feature válida con todos los campos', () => {
    const r = normalizarEquipamientosCriticos(
      [feature({ identifica: '002866', equipamien: 'COMISARÍA DE POLICÍA DE PATRAIX', telefono: 963707456 })],
      'policia',
      '2026-10-01T10:00:00.000Z',
    );
    expect(r).toEqual([
      {
        id: '002866',
        nombre: 'COMISARÍA DE POLICÍA DE PATRAIX',
        categoria: 'policia',
        lat: 39.47,
        lon: -0.37,
        telefono: '963707456',
        fetchedAt: '2026-10-01T10:00:00.000Z',
        source: 'geoportal-valencia-equipamientos',
      },
    ]);
  });

  it('usa objectid como id de respaldo si falta "identifica"', () => {
    const r = normalizarEquipamientosCriticos([feature({ objectid: 19733, equipamien: 'PARQUE DE BOMBEROS OESTE' })], 'bomberos', 'x');
    expect(r[0]!.id).toBe('19733');
  });

  it('telefono null si viene vacío/ausente, no la cadena "null"', () => {
    const r = normalizarEquipamientosCriticos([feature({ equipamien: 'CENTRO DE SALUD MALVARROSA', telefono: null })], 'sanidad', 'x');
    expect(r[0]!.telefono).toBeNull();
  });

  it('descarta filas sin nombre', () => {
    const r = normalizarEquipamientosCriticos([feature({ equipamien: '  ' }), feature({ equipamien: null })], 'sanidad', 'x');
    expect(r).toEqual([]);
  });

  it('descarta filas con coordenadas no finitas', () => {
    const r = normalizarEquipamientosCriticos([feature({ equipamien: 'X' }, [NaN, 39.47])], 'sanidad', 'x');
    expect(r).toEqual([]);
  });

  it('con cero features devuelve array vacío, no lanza', () => {
    expect(normalizarEquipamientosCriticos([], 'policia', 'x')).toEqual([]);
  });
});
