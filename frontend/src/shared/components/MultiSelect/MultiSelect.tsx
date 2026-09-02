import { useEffect, useMemo, useRef, useState } from 'react';
import { SelectOption } from '@/shared/types/common';

interface MultiSelectProps {
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  options: readonly SelectOption[] | SelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  error?: string;
  allowSelectAll?: boolean;
  selectAllLabel?: string;
}

const DEFAULT_SELECT_ALL_LABEL = 'Todos';

export const MultiSelect = ({
  label,
  required,
  disabled,
  placeholder,
  options,
  values,
  onChange,
  error,
  allowSelectAll = true,
  selectAllLabel = DEFAULT_SELECT_ALL_LABEL,
}: MultiSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
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

  const allSelected = values.length === 0;

  const selectedLabels = useMemo(() => {
    if (allSelected) return [];
    const labelMap = new Map(options.map((opt) => [opt.value, opt.label]));
    return values.map((value) => labelMap.get(value) ?? value).filter(Boolean);
  }, [allSelected, options, values]);

  const summaryLabel = useMemo(() => {
    if (allSelected) return selectAllLabel;
    if (selectedLabels.length === 0) return '';
    if (selectedLabels.length <= 2) return selectedLabels.join(', ');
    return `${selectedLabels[0]} +${selectedLabels.length - 1}`;
  }, [allSelected, selectAllLabel, selectedLabels]);

  const displayValue = isOpen ? search : summaryLabel;

  const filteredOptions = useMemo(() => {
    const query = search.toLowerCase();
    // `?? ''` por lo mismo que en SearchableSelect: un label null (columna
    // opcional sin llenar) reventaba el filtro y con él la pantalla entera.
    return options.filter((opt) => (opt.label ?? '').toLowerCase().includes(query));
  }, [options, search]);

  const handleToggleAll = () => {
    if (disabled) return;
    onChange([]);
    setSearch('');
    setIsOpen(false);
  };

  const handleToggleOption = (option: SelectOption) => {
    if (disabled) return;
    if (allSelected) {
      onChange([option.value]);
      return;
    }
    const exists = values.includes(option.value);
    const nextValues = exists
      ? values.filter((value) => value !== option.value)
      : [...values, option.value];
    onChange(nextValues.length === 0 ? [] : nextValues);
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
          onChange={(event) => {
            setSearch(event.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            if (disabled) return;
            setIsOpen(true);
            setSearch('');
          }}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">
          ▼
        </div>
      </div>

      {isOpen && !disabled && (
        <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {allowSelectAll && (
            <li
              className={`px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm flex items-center gap-2 ${
                allSelected ? 'bg-blue-100 font-medium' : ''
              }`}
              onClick={handleToggleAll}
            >
              <input
                type="checkbox"
                readOnly
                checked={allSelected}
                className="accent-blue-600"
              />
              <span>{selectAllLabel}</span>
            </li>
          )}
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => {
              const isSelected = !allSelected && values.includes(opt.value);
              return (
                <li
                  key={opt.value}
                  className={`px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm flex items-center gap-2 ${
                    isSelected ? 'bg-blue-50 font-medium' : ''
                  }`}
                  onClick={() => handleToggleOption(opt)}
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={isSelected}
                    className="accent-blue-600"
                  />
                  <span>{opt.label}</span>
                </li>
              );
            })
          ) : (
            <li className="px-3 py-2 text-sm text-gray-500">No hay opciones con ese nombre</li>
          )}
        </ul>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
};
