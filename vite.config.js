import { defineConfig } from 'vite';

export default defineConfig({
  // Relative Asset-Pfade, damit der Build unter beliebigen Pfaden funktioniert
  // (GitHub Pages unter /routing_bulk/ ebenso wie lokal).
  base: './',
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
