import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const ThemeToggle: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      aria-label="Alternar modo oscuro"
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors duration-300 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border ${
        isDark
          ? 'bg-slate-900 border-slate-700 shadow-inner'
          : 'bg-stone-200 border-stone-300/80 shadow-inner'
      }`}
    >
      {/* Iconos de fondo decorativos */}
      <span className="flex w-full justify-between px-1 text-[10px] select-none pointer-events-none">
        <Moon className={`h-3.5 w-3.5 transition-opacity duration-200 ${isDark ? 'opacity-0' : 'opacity-40 text-stone-600'}`} />
        <Sun className={`h-3.5 w-3.5 transition-opacity duration-200 ${isDark ? 'opacity-40 text-amber-300' : 'opacity-0'}`} />
      </span>

      {/* Bolita deslizante con icono activo */}
      <span
        className={`absolute flex h-6 w-6 items-center justify-center rounded-full shadow-md transition-transform duration-300 ease-in-out transform ${
          isDark
            ? 'translate-x-6 bg-slate-800 text-amber-400 border border-slate-600'
            : 'translate-x-0 bg-white text-stone-700 border border-stone-200'
        }`}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5" />
        ) : (
          <Sun className="h-3.5 w-3.5" />
        )}
      </span>
    </button>
  );
};