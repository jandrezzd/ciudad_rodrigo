import { SelectHTMLAttributes, forwardRef } from 'react';
import { SelectOption } from '@/shared/types/common';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: readonly SelectOption[] | SelectOption[];
  hideDefaultOption?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      options,
      hideDefaultOption = false,
      className = '',
      required,
      id,
      ...props
    },
    ref
  ) => {
    const selectId = id || props.name || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-night-muted mb-1 transition-colors"
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={`
              w-full px-3 py-2 pr-9 text-xs sm:text-sm rounded-lg border outline-none cursor-pointer transition-colors appearance-none
              bg-white dark:bg-night-input
              text-gray-900 dark:text-night-text
              dark:[color-scheme:dark]
              disabled:bg-gray-100 dark:disabled:bg-night-surface/50 disabled:cursor-not-allowed
              disabled:text-gray-400 dark:disabled:text-night-subtle
              ${
                error
                  ? 'border-red-500 focus:ring-2 focus:ring-red-500/20 focus:border-red-500'
                  : 'border-gray-300 dark:border-night-border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400'
              }
              ${className}
            `}
            required={required}
            {...props}
          >
            {!hideDefaultOption && (
              <option value="" className="bg-white dark:bg-night-input text-gray-500 dark:text-night-muted">
                Seleccionar...
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                className="bg-white dark:bg-night-input text-gray-900 dark:text-night-text"
              >
                {option.label}
              </option>
            ))}
          </select>

          {/* Flecha chevron SVG estilizada con rotación e iluminación suave */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-muted pointer-events-none transition-colors">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
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

Select.displayName = 'Select';