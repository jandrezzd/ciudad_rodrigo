import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  total: number;
  page: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  total,
  page,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  className = '',
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const startItem = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, total);

  return (
    <div
      className={`px-4 py-3.5 border-t border-stone-100 dark:border-night-border flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-night-surface transition-colors text-xs text-stone-600 dark:text-night-muted ${className}`}
    >
      {/* Sección Izquierda: Contador y Selector de Registros */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-stone-500 dark:text-night-muted">Mostrando</span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-md font-semibold bg-stone-100 dark:bg-night-raised text-stone-800 dark:text-night-text border border-stone-200/60 dark:border-night-border">
          {startItem} - {endItem}
        </span>
        <span className="text-stone-500 dark:text-night-muted">de</span>
        <span className="font-semibold text-stone-800 dark:text-night-text">{total}</span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-stone-200 dark:border-night-border">
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Registros por página"
              className="px-2 py-1 rounded-md text-xs font-medium bg-stone-50 dark:bg-night-input border border-stone-200 dark:border-night-border text-stone-700 dark:text-night-text focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer transition-colors"
            >
              {pageSizeOptions.map((size) => (
                <option
                  key={size}
                  value={size}
                  className="bg-white dark:bg-night-raised text-stone-900 dark:text-night-text"
                >
                  {size} / pág
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Sección Derecha: Botones de Navegación */}
      <div className="flex items-center gap-1.5 ml-auto">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1 || total === 0}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-night-border bg-white dark:bg-night-raised text-stone-700 dark:text-night-text hover:bg-stone-50 dark:hover:bg-night-hover hover:text-stone-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium shadow-xs"
        >
          <ChevronLeft size={14} />
          Anterior
        </button>

        <span className="h-7 min-w-7 px-2.5 flex items-center justify-center rounded-lg bg-blue-600 text-white font-semibold text-xs shadow-xs">
          {safePage}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages || total === 0}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-night-border bg-white dark:bg-night-raised text-stone-700 dark:text-night-text hover:bg-stone-50 dark:hover:bg-night-hover hover:text-stone-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium shadow-xs"
        >
          Siguiente
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};