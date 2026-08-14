import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: '/sct/',
  plugins: [react()],
  optimizeDeps: {
    // lucide-react debe pre-empaquetarse: si se excluye, Vite sirve cada icono
    // como modulo suelto y los bloqueadores de anuncios cortan fingerprint.js,
    // lo que rompe el bundle entero y deja la pagina en blanco.
    include: ['highcharts', 'highcharts-react-official', 'lucide-react'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
