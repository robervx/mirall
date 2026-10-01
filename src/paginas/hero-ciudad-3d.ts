// Fondo animado del hero de la landing — spec 053 v2.
//
// Ciudad procedural en Three.js: bloques extruidos aleatorios + partículas +
// "tráfico" que cruza la escena, con la cámara reaccionando sutilmente al
// ratón. La técnica está inspirada en un experimento público de Three.js
// (ciudad procedural + niebla + parallax de cámara, un patrón muy extendido
// en demos del motor); aquí está reescrita en TypeScript, sin la librería de
// tweening del original (todas las animaciones son un `requestAnimationFrame`
// con interpolación propia) y con la paleta de marca — navy/teal — en vez del
// rojo/magenta del original, que no tenía ningún significado semántico.
//
// Respeta `prefers-reduced-motion`: si está activo, se pinta un único frame
// estático y no se anima nada.
import * as THREE from 'three';

const NAVY = 0x0b1f33;
const NAVY_CLARO = 0x14304f;
const ACENTO = 0x33d6c0;

const NUM_EDIFICIOS = 90;
const NUM_PARTICULAS = 140;
const NUM_TRAFICO = 26;

function numeroAleatorio(rango = 8): number {
  return -Math.random() * rango + Math.random() * rango;
}

export function iniciarHeroCiudad3D(canvas: HTMLCanvasElement): void {
  const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pantallaPequena = window.innerWidth < 700;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const tamano = () => canvas.parentElement?.getBoundingClientRect() ?? { width: window.innerWidth, height: 480 };

  const camera = new THREE.PerspectiveCamera(22, 1, 1, 500);
  camera.position.set(0, 3.4, 18);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NAVY);
  scene.fog = new THREE.Fog(NAVY, 9, 17);

  const ciudad = new THREE.Object3D();
  const particulas = new THREE.Object3D();
  const bloques = new THREE.Object3D();
  ciudad.add(bloques, particulas);
  scene.add(ciudad);

  // ---------- edificios ----------
  for (let i = 0; i < NUM_EDIFICIOS; i++) {
    const geometria = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: i % 8 === 0 ? ACENTO : NAVY_CLARO,
      roughness: 0.85,
      metalness: 0.1,
    });
    const wireframe = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometria),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06 }),
    );

    const bloque = new THREE.Mesh(geometria, material);
    bloque.add(wireframe);
    bloque.castShadow = !pantallaPequena;
    bloque.receiveShadow = !pantallaPequena;

    const anchoBase = 0.9;
    bloque.scale.x = bloque.scale.z = anchoBase + numeroAleatorio(1 - anchoBase);
    bloque.scale.y = 0.15 + Math.abs(numeroAleatorio(3.2));
    bloque.position.x = Math.round(numeroAleatorio());
    bloque.position.z = Math.round(numeroAleatorio());
    bloque.position.y = bloque.scale.y / 2;

    bloques.add(bloque);
  }

  const suelo = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: NAVY, roughness: 1 }),
  );
  suelo.rotation.x = -Math.PI / 2;
  suelo.position.y = -0.01;
  suelo.receiveShadow = true;
  ciudad.add(suelo);

  const rejilla = new THREE.GridHelper(60, 60, ACENTO, NAVY_CLARO);
  (rejilla.material as THREE.Material).transparent = true;
  (rejilla.material as THREE.Material).opacity = 0.25;
  ciudad.add(rejilla);

  // ---------- partículas ----------
  const geometriaParticula = new THREE.CircleGeometry(0.012, 6);
  const materialParticula = new THREE.MeshBasicMaterial({ color: ACENTO, transparent: true, opacity: 0.5 });
  for (let i = 0; i < NUM_PARTICULAS; i++) {
    const particula = new THREE.Mesh(geometriaParticula, materialParticula);
    particula.position.set(numeroAleatorio(5), Math.abs(numeroAleatorio(4)) + 0.5, numeroAleatorio(5));
    particula.rotation.set(Math.random(), Math.random(), Math.random());
    particulas.add(particula);
  }

  // ---------- "tráfico": líneas que cruzan la escena en bucle ----------
  interface Trafico {
    malla: THREE.Mesh;
    eje: 'x' | 'z';
    desde: number;
    hasta: number;
    duracionMs: number;
    inicioMs: number;
  }
  const trafico: Trafico[] = [];
  const materialTrafico = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < NUM_TRAFICO; i++) {
    const horizontal = i % 2 === 0;
    const geometriaTrafico = new THREE.BoxGeometry(1, 0.02, 0.03);
    const malla = new THREE.Mesh(geometriaTrafico, materialTrafico);
    malla.position.y = Math.abs(numeroAleatorio(4)) + 0.05;

    const amplitud = 3;
    const distancia = 9;
    if (horizontal) {
      malla.position.z = numeroAleatorio(amplitud);
      trafico.push({ malla, eje: 'x', desde: -distancia, hasta: distancia, duracionMs: 3000 + Math.random() * 2000, inicioMs: -Math.random() * 5000 });
    } else {
      malla.rotation.y = Math.PI / 2;
      malla.position.x = numeroAleatorio(amplitud);
      trafico.push({ malla, eje: 'z', desde: -distancia, hasta: distancia, duracionMs: 4000 + Math.random() * 2000, inicioMs: -Math.random() * 5000 });
    }
    ciudad.add(malla);
  }

  // ---------- luces ----------
  scene.add(new THREE.AmbientLight(0xffffff, 2.2));
  const focoPrincipal = new THREE.SpotLight(0xffffff, pantallaPequena ? 8 : 16, 12);
  focoPrincipal.position.set(4, 5, 4);
  focoPrincipal.castShadow = !pantallaPequena;
  ciudad.add(focoPrincipal);
  const luzAcento = new THREE.PointLight(ACENTO, 6, 14);
  luzAcento.position.set(-4, 3, -2);
  ciudad.add(luzAcento);

  // ---------- interacción y resize ----------
  const raton = { x: 0, y: 0 };
  const alMoverRaton = (ev: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    raton.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    raton.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
  };
  window.addEventListener('pointermove', alMoverRaton, { passive: true });

  const ajustarTamano = (): void => {
    const { width, height } = tamano();
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };
  ajustarTamano();
  window.addEventListener('resize', ajustarTamano);

  function pintarFrame(tiempoMs: number): void {
    ciudad.rotation.y += (raton.x * 0.3 - ciudad.rotation.y) * 0.02;
    ciudad.rotation.x += (-raton.y * 0.08 - ciudad.rotation.x) * 0.02;
    particulas.rotation.y += 0.0015;

    for (const t of trafico) {
      const transcurrido = (tiempoMs - t.inicioMs) % t.duracionMs;
      const progreso = transcurrido / t.duracionMs;
      const posicion = t.desde + (t.hasta - t.desde) * progreso;
      if (t.eje === 'x') t.malla.position.x = posicion;
      else t.malla.position.z = posicion;
    }

    camera.lookAt(ciudad.position);
    renderer.render(scene, camera);
  }

  if (reducirMovimiento) {
    pintarFrame(0);
    return;
  }

  let activo = true;
  const observador = new IntersectionObserver((entradas) => {
    activo = entradas[0]?.isIntersecting ?? true;
  });
  observador.observe(canvas);

  function animar(tiempoMs: number): void {
    if (activo) pintarFrame(tiempoMs);
    requestAnimationFrame(animar);
  }
  requestAnimationFrame(animar);
}
