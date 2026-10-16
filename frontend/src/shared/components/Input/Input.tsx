import { InputHTMLAttributes, forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      className = '',
      required,
      type,
      id,
      ...props
    },
    ref
  ) => {
    const esPassword = type === 'password';
    const esDate = type === 'date';
    const [mostrarPassword, setMostrarPassword] = useState(false);
    const inputId = id || props.name || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-night-muted mb-1 transition-colors"
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={esPassword && mostrarPassword ? 'text' : type}
            className={`
              w-full px-3 py-2 text-xs sm:text-sm border rounded-lg outline-none transition-colors
              bg-white dark:bg-night-input
              text-gray-900 dark:text-night-text
              placeholder-gray-400 dark:placeholder-night-subtle
              disabled:bg-gray-100 dark:disabled:bg-night-surface/50 disabled:cursor-not-allowed dark:disabled:text-night-subtle
              ${esPassword ? 'pr-10' : ''}
              ${
                esDate
                  ? 'cursor-pointer dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70 hover:[&::-webkit-calendar-picker-indicator]:opacity-100'
                  : ''
              }
              ${
                error
                  ? 'border-red-500 focus:ring-2 focus:ring-red-500/20 focus:border-red-500'
                  : 'border-gray-300 dark:border-night-border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400'
              }
              ${className}
            `}
            required={required}
            {...props}
          />
          {esPassword && (
            <button
              type="button"
              onClick={() => setMostrarPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 dark:text-night-muted dark:hover:text-night-text transition-colors"
              aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              title={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              tabIndex={-1}
            >
              {mostrarPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
        </div>
        {error && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1 text-[11px] text-gray-500 dark:text-night-muted">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';