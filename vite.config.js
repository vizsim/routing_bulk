import { defineConfig } from 'vite';

export default defineConfig({
  // Relative Asset-Pfade, damit der Build unter beliebigen Pfaden funktioniert
  // (GitHub Pages unter /routing_bulk/ ebenso wie lokal).
  base: './',
});
