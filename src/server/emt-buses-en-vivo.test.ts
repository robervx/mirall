import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './emt-buses-en-vivo';

const RESPUESTA_OK = {
  features: [
    {
      attributes: { gid: 1676829970, linea: 'C2', trayecto: 'Blasco Ibáñez - Pl. Espanya', fecha: 1790900611000 },
      geometry: { x: -0.3337998036849712, y: 39.4809040782094 },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

// Orden importa: la caché del módulo empieza vacía — ver valenbisi-estaciones.test.ts.
describe('GET /api/transporte/v1/emt-buses', () => {
  it('devuelve 502 si la fuente falla y nunca hubo un valor previo cacheado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const res = await handler();
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(502);
    expect(body.error).toContain('503');
  });

  it('devuelve los buses normalizados con fresh:true en un fetch correcto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(RESPUESTA_OK) }));

    const res = await handler();
    const body = (await res.json()) as { buses: Array<{ linea: string }>; fresh: boolean };

    expect(res.status).toBe(200);
    expect(body.fresh).toBe(true);
    expect(body.buses).toHaveLength(1);
    expect(body.buses[0]?.linea).toBe('C2');
  });
});
