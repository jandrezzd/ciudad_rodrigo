import { InputHTMLAttributes, forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', required, type, ...props }, ref) => {
    const esPassword = type === 'password';
    const [mostrarPassword, setMostrarPassword] = useState(false);

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            type={esPassword && mostrarPassword ? 'text' : type}
            className={`
              w-full px-3 py-2 border rounded-lg
              focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              disabled:bg-gray-100 disabled:cursor-not-allowed
              ${esPassword ? 'pr-10' : ''}
              ${error ? 'border-red-500' : 'border-gray-300'}
              ${className}
            `}
            required={required}
            {...props}
          />
          {esPassword && (
            <button
              type="button"
              onClick={() => setMostrarPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700"
              aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              title={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              tabIndex={-1}
            >
              {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </div>
        {error && (
          <p className="mt-1 text-sm text-red-600">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1 text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
