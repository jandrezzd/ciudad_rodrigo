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

  // `?? ''` a propósito aunque el tipo diga `string`: varios labels salen de
  // columnas que dejaron de ser obligatorias en la base (razonsocial, nombre de
  // cantera), así que un solo registro sin llenar llegaba acá como null y
  // tumbaba el render de toda la pantalla, no solo el de este selector.
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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          className={`
            w-full px-3 py-2 border rounded-lg pr-8
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none
            ${error ? 'border-red-500' : 'border-gray-300'}
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
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">
          ▼
        </div>
      </div>
      
      {isOpen && (
        <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, index) => (
              <li
                key={opt.value}
                className={`px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm ${opt.value === value ? 'bg-blue-100 font-medium' : ''} ${index === highlightedIndex ? 'bg-blue-50' : ''}`}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectOption(opt)}
              >
                {opt.label}
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-sm text-gray-500">{emptyMessage ?? 'No hay proveedores con ese nombre'}</li>
          )}
        </ul>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
};
