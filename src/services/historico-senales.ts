/**
 * Escritura del histórico de señales/recomendaciones en Postgres (ADR-006,
 * `docs/04_MODELO_DE_DATOS.md`). Nunca lanza — si `sql` es `null` (sin
 * `DATABASE_URL`) o cualquier consulta falla, se registra en consola y se
 * sigue sirviendo la respuesta en caliente sin histórico, igual que el
 * resto de fuentes de este proyecto (stale-on-error / degradación).
 *
 * **Alcance deliberado de v1** (verificado en vivo el 2026-09-17 con datos
 * reales: ~250-500 señales por ciclo, la inmensa mayoría `informativo` —
 * tráfico denso rutinario, cámaras de corroboración): solo se persisten
 * señales `aviso`/`urgente`. No es una limitación del esquema (`senal`
 * admite cualquier severidad) — es una decisión de qué merece la pena
 * guardar en el free tier de Neon en esta primera versión. Ampliable sin
 * romper nada si hiciera falta más adelante.
 *
 * **Escritura por cambio de estado** (§13.2 del modelo): antes de insertar,
 * se compara contra la última fila conocida para `(fuente_id, id_origen)` —
 * solo se escribe si `severidad`/`descripcion` cambiaron o no había fila
 * previa. Evita llenar la tabla con la misma señal repetida cada 90 min.
 */
import type { NeonQueryFunction } from '@neondatabase/serverless';
import type { SenalCorrelacionada } from './correlacion-senales';
import type { RecomendacionActuacion } from './sintesis-ia-v2';

type Sql = NeonQueryFunction<false, false>;

/** `trafico:487` -> `487`; `evento:e1:07` -> `e1:07` (solo se quita el primer segmento, el tipo). */
function idOrigenDe(id: string): string {
  return id.slice(id.indexOf(':') + 1);
}

interface FilaPrevia {
  id: string;
  severidad: string;
  descripcion: string;
}

export interface ResultadoEscrituraSenales {
  /** Nº de filas nuevas insertadas — solo para logging. */
  escritas: number;
  /** `SenalCorrelacionada.id` (transitorio, del lote) -> `senal.id` real en Postgres, para las señales persistidas (aviso/urgente). */
  idsPersistidos: Map<string, string>;
}

/** Persiste las señales relevantes (`aviso`/`urgente`) y sus asociaciones mutuas. */
export async function escribirHistoricoSenales(
  sql: Sql | null,
  senales: SenalCorrelacionada[],
): Promise<ResultadoEscrituraSenales> {
  const idsPersistidos = new Map<string, string>();
  if (!sql) return { escritas: 0, idsPersistidos };

  const relevantes = senales.filter((s) => s.severidad !== 'informativo');
  if (relevantes.length === 0) return { escritas: 0, idsPersistidos };

  let escritas = 0;

  try {
    // Fase 1: fila previa de cada señal — lecturas independientes entre sí,
    // en paralelo (antes se hacía una a una; con el driver HTTP de Neon cada
    // consulta es un round-trip de red completo, así que secuencial escalaba
    // linealmente con el nº de señales relevantes del ciclo).
    const conPrevia = await Promise.all(
      relevantes.map(async (s) => {
        const idOrigen = idOrigenDe(s.id);
        const previas = (await sql`
          select id, severidad, descripcion from senal
          where fuente_id = ${s.fuenteId} and id_origen = ${idOrigen}
          order by observado_en desc
          limit 1
        `) as FilaPrevia[];
        return { s, idOrigen, previa: previas[0] };
      }),
    );

    // Fase 2: insertar en paralelo solo las que cambiaron (o no tenían fila previa).
    await Promise.all(
      conPrevia.map(async ({ s, idOrigen, previa }) => {
        if (previa && previa.severidad === s.severidad && previa.descripcion === s.descripcion) {
          idsPersistidos.set(s.id, previa.id);
          return;
        }

        const insertadas = (await sql`
          insert into senal (fuente_id, id_origen, dominio, distrito_codigo, calle, lat, lon, severidad, descripcion, payload, observado_en, ingerido_en)
          values (${s.fuenteId}, ${idOrigen}, ${s.tipo}, ${s.distritoCodigo}, ${s.calle}, ${s.lat}, ${s.lon}, ${s.severidad}, ${s.descripcion}, ${JSON.stringify({ fuenteSpec: s.fuenteSpec })}, ${s.observedAt}, ${s.fetchedAt})
          on conflict (fuente_id, id_origen, observado_en) do nothing
          returning id
        `) as { id: string }[];

        if (insertadas[0]) {
          idsPersistidos.set(s.id, insertadas[0].id);
          escritas++;
        } else if (previa) {
          // conflicto de idempotencia (mismo ciclo reintentado) — reutiliza la fila ya existente
          idsPersistidos.set(s.id, previa.id);
        }
      }),
    );

    // Fase 3: asociaciones, también en paralelo — solo entre señales que sí
    // se persistieron (aviso/urgente). Las relaciones con señales
    // informativo/cámara no persistidas se quedan solo en la respuesta en
    // caliente — no rompen nada, simplemente no generan una fila de `asociacion`.
    const asociaciones: Promise<unknown>[] = [];
    for (const s of relevantes) {
      const idPropio = idsPersistidos.get(s.id);
      if (!idPropio) continue;
      for (const relacionadaId of s.relacionadas) {
        const idRelacionado = idsPersistidos.get(relacionadaId);
        if (!idRelacionado || idRelacionado === idPropio) continue;
        asociaciones.push(sql`
          insert into asociacion (senal_id, asociada_id, criterio)
          values (${idPropio}, ${idRelacionado}, 'correlacion-047')
          on conflict (senal_id, asociada_id, criterio) do nothing
        `);
      }
    }
    await Promise.all(asociaciones);
  } catch (err) {
    console.error('Fallo al escribir histórico de señales (degradando, sin romper la respuesta):', err);
  }

  return { escritas, idsPersistidos };
}

/** Persiste las recomendaciones generadas y su relación con las señales que las motivaron (`idsPersistidos` de `escribirHistoricoSenales`, mismo lote). */
export async function escribirHistoricoRecomendaciones(
  sql: Sql | null,
  recomendaciones: RecomendacionActuacion[],
  modelo: string,
  idsPersistidos: Map<string, string>,
): Promise<void> {
  if (!sql || recomendaciones.length === 0) return;
  try {
    // Recomendaciones independientes entre sí — en paralelo por el mismo
    // motivo que en escribirHistoricoSenales (round-trip HTTP por sentencia).
    await Promise.all(
      recomendaciones.map(async (r) => {
        const idsSenal = r.situacionAsociada.map((id) => idsPersistidos.get(id)).filter((id): id is string => Boolean(id));
        if (idsSenal.length === 0) return; // ninguna señal motivadora se persistió (no debería pasar, pero no bloquea)

        const insertadas = (await sql`
          insert into recomendacion (distrito_codigo, zona, texto, tipo_actuacion, modelo)
          values (${r.distritoCodigo}, ${r.zona}, ${r.texto}, ${r.tipoActuacionSugerida}, ${modelo})
          returning id
        `) as { id: string }[];
        const recomendacionId = insertadas[0]?.id;
        if (!recomendacionId) return;

        await Promise.all(
          idsSenal.map(
            (senalId) => sql`
              insert into recomendacion_senal (recomendacion_id, senal_id)
              values (${recomendacionId}, ${senalId})
              on conflict do nothing
            `,
          ),
        );
      }),
    );
  } catch (err) {
    console.error('Fallo al escribir histórico de recomendaciones (degradando, sin romper la respuesta):', err);
  }
}
