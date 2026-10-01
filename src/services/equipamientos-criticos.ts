// Equipamientos públicos críticos — spec 054. Dato estático (sin polling, ver
// spec §4): referencia geográfica de sanidad/policía/bomberos, no una señal
// que cambie en vivo.

export type CategoriaEquipamientoCritico = 'sanidad' | 'policia' | 'bomberos';

export interface EquipamientoCritico {
  id: string;
  nombre: string;
  categoria: CategoriaEquipamientoCritico;
  lat: number;
  lon: number;
  telefono: string | null;
  fetchedAt: string;
  source: 'geoportal-valencia-equipamientos';
}

interface FeatureEquipamientoBruto {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    identifica?: string | null;
    objectid?: number;
    equipamien?: string | null;
    telefono?: number | string | null;
  };
}

/**
 * Normaliza las features crudas del geoportal (un `FeatureCollection` por
 * categoría, ya filtrado en la query — ver `scripts/seed-equipamientos-criticos.ts`)
 * a `EquipamientoCritico[]`. Descarta filas sin nombre o sin geometría válida
 * en vez de fabricar un registro vacío.
 */
export function normalizarEquipamientosCriticos(
  features: FeatureEquipamientoBruto[],
  categoria: CategoriaEquipamientoCritico,
  fetchedAt: string,
): EquipamientoCritico[] {
  const resultado: EquipamientoCritico[] = [];
  for (const f of features) {
    const nombre = f.properties.equipamien?.trim();
    const lon = f.geometry?.coordinates?.[0];
    const lat = f.geometry?.coordinates?.[1];
    if (!nombre || typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }
    const id = f.properties.identifica?.trim() || String(f.properties.objectid ?? `${categoria}-${resultado.length}`);
    const telefonoCrudo = f.properties.telefono;
    const telefono = telefonoCrudo === null || telefonoCrudo === undefined || telefonoCrudo === '' ? null : String(telefonoCrudo);
    resultado.push({
      id,
      nombre,
      categoria,
      lat,
      lon,
      telefono,
      fetchedAt,
      source: 'geoportal-valencia-equipamientos',
    });
  }
  return resultado;
}
