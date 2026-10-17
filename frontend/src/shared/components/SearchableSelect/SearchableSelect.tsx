import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { SelectOption } from '@/shared/types/common';

interface SearchableSelectProps {
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  options: readonly SelectOption[] | SelectOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  emptyMessage?: string;
}

export const SearchableSelect = ({
  label,
  required,
  disabled,
  placeholder,
  options,
  value,
  onChange,
  error,
  emptyMessage,
}: SearchableSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.value === value);
  const displayValue = isOpen ? search : (selectedOption ? selectedOption.label : '');

  // `?? ''` defensivo para prevenir crash si columnas opcionales de BD llegan en null
  const filteredOptions = options.filter((o) =>
    (o.label ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    if (!isOpen) {
      setHighlightedIndex(-1);
      return;
    }
    if (filteredOptions.length === 0) {
      setHighlightedIndex(-1);
      return;
    }
    setHighlightedIndex((prev) => (prev >= 0 && prev < filteredOptions.length ? prev : 0));
  }, [isOpen, filteredOptions.length]);

  const selectOption = (option: SelectOption) => {
    onChange(option.value);
    setSearch('');
    setIsOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) setIsOpen(true);
      if (filteredOptions.length === 0) return;
      setHighlightedIndex((prev) => {
        if (prev < 0) return 0;
        return (prev + 1) % filteredOptions.length;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) setIsOpen(true);
      if (filteredOptions.length === 0) return;
      setHighlightedIndex((prev) => {
        if (prev <= 0) return filteredOptions.length - 1;
        return prev - 1;
      });
      return;
    }

    if (event.key === 'Enter' && isOpen) {
      if (filteredOptions.length > 0) {
        const option = filteredOptions[highlightedIndex >= 0 ? highlightedIndex : 0];
        selectOption(option);
      } else {
        setIsOpen(false);
      }
      event.preventDefault();
      return;
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className="w-full relative" ref={wrapperRef}>
      {label && (
        <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-night-muted mb-1 transition-colors">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          type="text"
          className={`
            w-full px-3 py-2 pr-9 border rounded-lg outline-none transition-colors text-xs sm:text-sm
            bg-white dark:bg-night-input
            text-gray-900 dark:text-night-text
            placeholder-gray-400 dark:placeholder-night-subtle
            disabled:bg-gray-100 dark:disabled:bg-night-surface/50 disabled:cursor-not-allowed dark:disabled:text-night-subtle
            ${
              error
                ? 'border-red-500 focus:ring-2 focus:ring-red-500/20 focus:border-red-500'
                : 'border-gray-300 dark:border-night-border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400'
            }
          `}
          placeholder={placeholder ?? 'Buscar o seleccionar...'}
          value={displayValue}
          disabled={disabled}
          onKeyDown={handleKeyDown}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearch('');
          }}
        />

        {/* Flecha Chevron SVG con rotación y tono night.muted */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-muted pointer-events-none transition-transform duration-200">
          <svg
            className={`w-3.5 h-3.5 transform transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-blue-500 dark:text-blue-400' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isOpen && (
        <ul
          className="
            absolute z-50 w-full mt-1.5 p-1.5
            bg-white dark:bg-night-raised
            border border-stone-200/90 dark:border-night-border
            rounded-xl shadow-xl max-h-60 overflow-y-auto space-y-0.5
            [scrollbar-width:thin] [scrollbar-color:theme(colors.night.border)_transparent]
            [&::-webkit-scrollbar]:w-1.5
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-night-border
            hover:[&::-webkit-scrollbar-thumb]:bg-stone-400 dark:hover:[&::-webkit-scrollbar-thumb]:bg-night-hover
          "
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, index) => {
              const isSelected = opt.value === value;
              const isHighlighted = index === highlightedIndex;

              return (
                <li
                  key={opt.value}
                  className={`
                    px-3 py-2 cursor-pointer text-xs sm:text-sm rounded-lg transition-colors duration-100 flex items-center justify-between
                    ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 font-semibold dark:bg-blue-900/40 dark:text-blue-300'
                        : isHighlighted
                        ? 'bg-stone-100/80 text-stone-900 dark:bg-night-hover dark:text-night-text'
                        : 'text-stone-700 dark:text-night-muted hover:bg-stone-50 dark:hover:bg-night-hover'
                    }
                  `}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => selectOption(opt)}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <span className="text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0 ml-2">
                      ✓
                    </span>
                  )}
                </li>
              );
            })
          ) : (
            <li className="px-3 py-3 text-xs text-stone-400 dark:text-night-muted text-center italic">
              {emptyMessage ?? 'No hay opciones disponibles'}
            </li>
          )}
        </ul>
      )}

      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
};