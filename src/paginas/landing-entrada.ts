// Punto de entrada de la landing (`/`) — spec 053.
import { iniciarHeroCiudad3D } from './hero-ciudad-3d';
import './nav-publica';

const lienzo = document.getElementById('hero-ciudad-3d');
if (lienzo instanceof HTMLCanvasElement) iniciarHeroCiudad3D(lienzo);
