// Punto de entrada de la landing (`/`) — spec 053, reskin Mirall v2 (spec 056 Fase 2).
import { iniciarHeroCiudad3D } from './hero-ciudad-3d';
import { iniciarMetricasLanding } from './metricas-landing';
import './nav-publica';

const lienzo = document.getElementById('hero-ciudad-3d');
if (lienzo instanceof HTMLCanvasElement) iniciarHeroCiudad3D(lienzo);

iniciarMetricasLanding();
