import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBusesEmt } from './emt-buses';

const RESPUESTA_GEOPORTAL_EJEMPLO = {
  features: [
    {
      attributes: { gid: 1676829970, linea: 'C2', trayecto: 'Blasco Ibáñez - Pl. Espanya', fecha: 1790900611000 },
      geometry: { x: -0.3337998036849712, y: 39.4809040782094 },
    },
    {
      attributes: { gid: null, linea: null, trayecto: null, fecha: null },
      geometry: null,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchBusesEmt', () => {
  it('normaliza la respuesta del Geoportal y descarta filas vacías', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(RESPUESTA_GEOPORTAL_EJEMPLO) }),
    );

    const buses = await fetchBusesEmt();

    expect(buses).toHaveLength(1);
    expect(buses[0]).toMatchObject({
      id: '1676829970',
      linea: 'C2',
      trayecto: 'Blasco Ibáñez - Pl. Espanya',
      lat: 39.4809040782094,
      lon: -0.3337998036849712,
      source: 'ajuntament-valencia-geoportal',
    });
    expect(buses[0]?.observedAt).toBe(new Date(1790900611000).toISOString());
  });

  it('lanza si el Geoportal responde con error HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchBusesEmt()).rejects.toThrow('503');
  });

  it('lanza si el Geoportal responde HTTP 200 con un cuerpo de error de ArcGIS Server', async () => {
    const cuerpoErrorArcGis = { error: { code: 400, message: 'Failed to execute query.', details: [] } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(cuerpoErrorArcGis) }));
    await expect(fetchBusesEmt()).rejects.toThrow('ArcGIS');
  });

  it('lanza si el Geoportal responde sin "features"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));
    await expect(fetchBusesEmt()).rejects.toThrow('features');
  });
});
