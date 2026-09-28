// Preferencias de qué paneles del panel principal se muestran — spec 019 v3
// (sección "Configuración" del sidebar). Solo gobierna los 5 paneles fijos
// del panel principal (meteo, predicción, aire, insights, histórico de
// tráfico) — las leyendas de capa (tráfico, Valenbisi...) ya se controlan
// con sus propios toggles en el panel de capas, no duplicar aquí.

export interface PanelPreferenceDefinition {
  key: string; // debe coincidir con el id que usa buildInfoPanel() en main.ts
  label: string;
}

export const PANEL_PREFERENCES_REGISTRY: PanelPreferenceDefinition[] = [
  { key: 'meteo-panel', label: 'Meteorología actual' },
  { key: 'meteo-prediccion-panel', label: 'Predicción próximas horas' },
  { key: 'aire-panel', label: 'Calidad del aire' },
  { key: 'insights-panel', label: 'Insights y alertas' },
  { key: 'trafico-historico-panel', label: 'Histórico de tráfico' },
];

const STORAGE_KEY = 'mirall:panel-visibility-hidden';

function readHiddenSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeHiddenSet(hidden: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
}

export function isPanelVisible(key: string): boolean {
  return !readHiddenSet().has(key);
}

/** Aplica la preferencia guardada a los nodos ya presentes en el DOM. */
export function applyPanelVisibility(): void {
  for (const def of PANEL_PREFERENCES_REGISTRY) {
    const el = document.getElementById(def.key);
    if (el) el.hidden = !isPanelVisible(def.key);
  }
}

export function setPanelVisible(key: string, visible: boolean): void {
  const hidden = readHiddenSet();
  if (visible) hidden.delete(key);
  else hidden.add(key);
  writeHiddenSet(hidden);
  applyPanelVisibility();
}
