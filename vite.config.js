import { readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig } from 'vite';

// Nur lokal erzeugte Schülerzahlen (*.local.json, z. B. Bayern) dürfen nicht
// veröffentlicht werden: aus jedem Build entfernen, auch aus einem lokalen
// (preprocessing/schuelerzahlen/README.md).
function dropLocalData() {
  let outDir = 'dist';
  return {
    name: 'drop-local-data',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const dir = join(outDir, 'data', 'schuelerzahlen');
      let files = [];
      try {
        files = readdirSync(dir);
      } catch {
        return;
      }
      files.filter(f => f.endsWith('.local.json')).forEach(f => rmSync(join(dir, f)));
    },
  };
}

export default defineConfig({
  // Relative Asset-Pfade, damit der Build unter beliebigen Pfaden funktioniert
  // (GitHub Pages unter /routing_bulk/ ebenso wie lokal).
  base: './',
  plugins: [dropLocalData()],
  optimizeDeps: {
    // maplibre-gl lädt seinen Web-Worker über eine relative URL; Vites
    // Prebundling bricht diese Auflösung (net::ERR_FAILED im Dev-Modus).
    exclude: ['maplibre-gl'],
  },
  worker: {
    // MapLibre-Worker ist ein ES-Module-Worker (import aus Shared-Chunk).
    format: 'es',
  },
});
