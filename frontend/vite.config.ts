import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: '/sct/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['highcharts', 'highcharts-react-official'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
