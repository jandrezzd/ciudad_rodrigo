/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      zIndex: {
        45: '45',
        46: '46',
      },
      colors: {
        canvas: '#faf8f5',

        // Escala Dark Mode Grisáceo Mate (Anti-fatiga por luz azul con contraste visible)
        night: {
          bg: '#1e1f24',             // Fondo grisáceo del sistema (elimina el negro terminal)
          sidebar: '#0e1726',        // Menú lateral azul institucional (arriba)
          'sidebar-deep': '#0a101d',   // Menú lateral azul profundo (abajo)
          surface: '#262830',        // Tarjetas de filtros, contenedor de tabla y modales
          raised: '#2f313a',         // Cabeceras de tabla, dropdowns flotantes
          hover: '#353843',          // Hover de filas y opciones
          input: '#191a1f',          // Inputs y selects (rehundido)
          border: '#353742',         // Bordes y separadores sutiles
          divider: '#2b2d36',        // Líneas divisoras internas
          text: '#f3f4f6',           // Texto principal de alto contraste
          muted: '#9ca3af',          // Etiquetas y textos secundarios
          subtle: '#6b7280',         // Placeholders y deshabilitados
        },
      },
    },
  },
  plugins: [],
};