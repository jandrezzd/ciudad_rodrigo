/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Capas del menú lateral móvil: encima de los filtros (z-30/40) y debajo de los modales (z-50).
      zIndex: {
        45: '45',
        46: '46',
      },
      colors: {
        // Paleta del modo oscuro, por rol. Usar siempre estos nombres
        // (dark:bg-night-surface, dark:text-night-muted...) en vez de hex sueltos.
        night: {
          bg: '#151c28', // fondo general de la app
          sidebar: '#111722', // menú lateral (arriba)
          'sidebar-deep': '#0c121c', // menú lateral (abajo del degradado)
          surface: '#1b2433', // tarjetas, modales, tablas
          raised: '#232e40', // encabezados de tabla, pies de modal, listas desplegables
          hover: '#2a3649', // hover de filas, opciones y botones
          input: '#121925', // fondo de inputs y selects (más oscuro que la tarjeta)
          border: '#2f3b4f', // bordes de inputs, tarjetas y modales
          divider: '#263142', // separadores suaves (filas, secciones)
          text: '#e5e9f0', // texto principal
          muted: '#a0abbd', // etiquetas y texto secundario
          subtle: '#6b7789', // placeholders y texto deshabilitado
        },
      },
    },
  },
  plugins: [],
};
