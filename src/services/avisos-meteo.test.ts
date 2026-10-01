import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  construirAviso,
  esVigente,
  fetchAvisosVigentes,
  parsearTarjetas,
  VENTANA_VIGENCIA_HORAS,
} from './avisos-meteo';

// Fragmento real capturado el 2026-09-16 de
// https://comunica.gva.es/es/emergencies-i-interior (verificación de spec 001 §2),
// más una cuarta tarjeta real capturada el 2026-10-01 (ver memoria de proyecto:
// bug real que dejaba desaparecer una alerta ROJA vigente) — cuatro tarjetas:
// una alerta naranja que menciona Valencia (debe pasar), una nota sin alerta/
// aviso (debe descartarse), una alerta de Alicante cuyo resumen también
// menciona Valencia (caso límite del filtro amplio) y una alerta ROJA real
// cuyo título NO usa el verbo "activa" (usa "insiste") — debe pasar igual,
// es exactamente el caso que falló en producción.
const HTML_EJEMPLO = `
<div class="cards-container" role="listitem">
	<div class="card">
		<div class="content justify-content-start">
			<div class="text">
				<div class="extra-info">
					<span class="color-neutral-600">		<span class="metadata-entry metadata-publish-date">

			15/09/2026
	</span>
</span>
					<span class="multimedia float-right">
							<i class="fa fa-volume-up color-primary-900" aria-hidden="true" title='Audio'></i>
					</span>
				</div>
				<a class="title" href="https://comunica.gva.es/es/detalle?id=414994177&site=388053550" target='_self'>
					Emergencias activa la alerta naranja ante la previsión de fuertes lluvias y tormentas en toda la provincia de Valencia para este miércoles
				</a>
					<div class="extra-info"><ul>
	<li>La predicción de Aemet se establece para la franja comprendida entre las 16.00 horas y la medianoche de este 16 de septiembre, con acumulados de 40 mm/hora y posibilidad de superar los 80 mm en dos o tres horas</li>
	<li>El Centro de Coordinación de Emergencias activa además el nivel amarillo para la misma jornada en todo el sur de la provincia de Castellón ante la predicción de lluvias y tormentas con acumulados de 30 mm/hora</li>
</ul></div>
			</div>
		</div>
	</div>
</div>
<div class="cards-container" role="listitem">
	<div class="card">
		<div class="content justify-content-start">
			<div class="text">
				<div class="extra-info">
					<span class="color-neutral-600">		<span class="metadata-entry metadata-publish-date">

			11/09/2026
	</span>
</span>
				</div>
				<a class="title" href="https://comunica.gva.es/es/detalle?id=414880682&site=388053550" target='_self'>
					El Consell pide al Gobierno central la declaración como zonas gravemente afectadas por una emergencia de protección civil para los municipios afectados por los últimos incendios forestales
				</a>
					<div class="extra-info"><ul>
	<li>La Generalitat solicita que se activen medidas de apoyo para las localidades de Sierra Engarcerán, Tírig, Catí, Segorbe, Gátova y El Saler de València</li>
</ul></div>
			</div>
		</div>
	</div>
</div>
<div class="cards-container" role="listitem">
	<div class="card">
		<div class="content justify-content-start">
			<div class="text">
				<div class="extra-info">
					<span class="color-neutral-600">		<span class="metadata-entry metadata-publish-date">

			08/09/2026
	</span>
</span>
				</div>
				<a class="title" href="https://comunica.gva.es/es/detalle?id=414854409&site=388053550" target='_self'>
					Emergencias activa la alerta naranja ante la previsión de fuertes lluvias, granizo y viento en todo el litoral de Alicante para este miércoles
				</a>
					<div class="extra-info"><ul>
	<li>Se establece también alerta amarilla por lluvias y tormentas con granizo y viento en el interior de Alicante y el litoral y el interior sur de Valencia</li>
	<li>El Centro de Coordinación de Emergencias de la Generalitat recomienda a la ciudadanía extremar las precauciones y seguir los consejos de autoprotección</li>
</ul></div>
			</div>
		</div>
	</div>
</div>
<div class="cards-container" role="listitem">
	<div class="card">
		<div class="content justify-content-start">
			<div class="text">
				<div class="extra-info">
					<span class="color-neutral-600">		<span class="metadata-entry metadata-publish-date">

			01/10/2026
	</span>
</span>
				</div>
				<a class="title" href="https://comunica.gva.es/es/detalle?id=415200000&site=388053550" target='_self'>
					Emergencias insiste a la ciudadanía en que intensifique las precauciones ante las alertas por riesgo extremo por lluvias y tormentas
				</a>
					<div class="extra-info"><ul>
	<li>Se establece alerta roja por lluvias en el interior norte y litoral de Castellón y en todo el litoral de Valencia por precipitaciones acumuladas de 90 mm en una hora</li>
</ul></div>
			</div>
		</div>
	</div>
</div>
`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parsearTarjetas', () => {
  it('extrae título, url, fecha y resumen de cada tarjeta', () => {
    const tarjetas = parsearTarjetas(HTML_EJEMPLO);
    expect(tarjetas).toHaveLength(4);
    expect(tarjetas[0]!.titulo).toBe(
      'Emergencias activa la alerta naranja ante la previsión de fuertes lluvias y tormentas en toda la provincia de Valencia para este miércoles',
    );
    expect(tarjetas[0]!.url).toBe('https://comunica.gva.es/es/detalle?id=414994177&site=388053550');
    expect(tarjetas[0]!.fechaTexto).toBe('15/09/2026');
    expect(tarjetas[0]!.resumen).toContain('40 mm/hora');
  });

  it('devuelve [] si no hay tarjetas', () => {
    expect(parsearTarjetas('<html><body>sin avisos</body></html>')).toEqual([]);
  });
});

describe('construirAviso', () => {
  const FETCHED_AT = '2026-09-16T09:00:00.000Z';

  it('construye un AvisoMeteo desde una tarjeta de activación real que menciona Valencia', () => {
    const [naranjaValencia] = parsearTarjetas(HTML_EJEMPLO);
    const aviso = construirAviso(naranjaValencia!, FETCHED_AT);
    expect(aviso).not.toBeNull();
    expect(aviso!.nivel).toBe('naranja');
    expect(aviso!.publicadoEn).toBe('2026-09-15T00:00:00.000Z');
    expect(aviso!.id).toBe(naranjaValencia!.url);
    expect(aviso!.source).toBe('gva-emergencias-scraping');
  });

  it('descarta una nota que no menciona alerta/aviso', () => {
    const [, incendios] = parsearTarjetas(HTML_EJEMPLO);
    expect(construirAviso(incendios!, FETCHED_AT)).toBeNull();
  });

  it('construye un AvisoMeteo ROJO desde una tarjeta de escalada que NO usa el verbo "activa" — bug real de producción 2026-10-01', () => {
    const [, , , rojaInsiste] = parsearTarjetas(HTML_EJEMPLO);
    const aviso = construirAviso(rojaInsiste!, FETCHED_AT);
    expect(aviso).not.toBeNull();
    expect(aviso!.nivel).toBe('rojo');
  });

  it('incluye una alerta de Alicante cuando el resumen también menciona Valencia (filtro amplio a propósito)', () => {
    const [, , alicanteConValencia] = parsearTarjetas(HTML_EJEMPLO);
    const aviso = construirAviso(alicanteConValencia!, FETCHED_AT);
    expect(aviso).not.toBeNull();
    expect(aviso!.nivel).toBe('naranja');
  });
});

describe('esVigente', () => {
  it('es vigente dentro de la ventana de horas', () => {
    const aviso = construirAviso(parsearTarjetas(HTML_EJEMPLO)[0]!, '2026-09-16T09:00:00.000Z')!;
    const ahoraMs = new Date('2026-09-16T09:00:00.000Z').getTime();
    expect(esVigente(aviso, ahoraMs)).toBe(true);
  });

  it('deja de ser vigente pasada la ventana', () => {
    const aviso = construirAviso(parsearTarjetas(HTML_EJEMPLO)[0]!, '2026-09-16T09:00:00.000Z')!;
    const ahoraMs = new Date(aviso.publicadoEn).getTime() + (VENTANA_VIGENCIA_HORAS + 1) * 60 * 60 * 1000;
    expect(esVigente(aviso, ahoraMs)).toBe(false);
  });
});

describe('fetchAvisosVigentes', () => {
  it('filtra a solo los avisos vigentes de activación que mencionan Valencia, ordenados por nivel', async () => {
    vi.setSystemTime(new Date('2026-09-16T09:00:00.000Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(HTML_EJEMPLO) }),
    );

    const snapshot = await fetchAvisosVigentes();

    expect(snapshot.avisos).toHaveLength(1); // la de Alicante (08/09) ya caducó a la ventana de 48h
    expect(snapshot.avisos[0]!.nivel).toBe('naranja');
    expect(snapshot.avisos[0]!.url).toContain('414994177');

    vi.useRealTimers();
  });

  it('lanza si la fuente responde con error HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchAvisosVigentes()).rejects.toThrow('500');
  });
});
