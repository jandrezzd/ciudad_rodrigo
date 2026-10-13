import { ReactNode } from 'react';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  className?: string;
  headerClassName?: string;
}

export interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  onRowClick?: (row: T) => void;
  getRowId?: (row: T, index: number) => string | number;
}

export function Table<T extends Record<string, any>>({
  data,
  columns,
  isLoading = false,
  emptyMessage = 'No hay datos disponibles',
  className = '',
  onRowClick,
  getRowId,
}: TableProps<T>) {
  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center py-14 gap-2.5 bg-white/40 dark:bg-night-surface/50 rounded-xl transition-colors">
        <div className="relative flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-stone-200 dark:border-night-border" />
          <div className="absolute h-8 w-8 animate-spin rounded-full border-2 border-blue-600 dark:border-blue-400 border-t-transparent" />
        </div>
        <p className="text-xs font-medium text-stone-500 dark:text-night-muted animate-pulse">
          Cargando información...
        </p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 px-4 text-center bg-transparent transition-colors">
        <div className="h-10 w-10 rounded-full bg-stone-100 dark:bg-night-surface flex items-center justify-center text-stone-400 dark:text-night-muted mb-2.5">
          <svg className="w-5 h-5 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="1.75">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
            />
          </svg>
        </div>
        <p className="text-xs font-medium text-stone-500 dark:text-night-muted max-w-sm">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full text-left border-collapse table-auto">
        <thead>
          <tr className="border-b border-stone-200/90 dark:border-night-border bg-stone-50/80 dark:bg-night-raised transition-colors">
            {columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className={`py-2.5 px-3 sm:px-4 text-xs font-semibold text-stone-600 dark:text-night-muted uppercase tracking-wide whitespace-nowrap select-none ${
                  column.headerClassName || ''
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 dark:divide-night-divider text-xs">
          {data.map((row, rowIndex) => {
            const key = getRowId ? getRowId(row, rowIndex) : row.id ?? rowIndex;
            return (
              <tr
                key={key}
                onClick={() => onRowClick && onRowClick(row)}
                className={`bg-white dark:bg-night-surface hover:bg-stone-50/70 dark:hover:bg-night-hover transition-colors duration-150 ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
              >
                {columns.map((column, colIndex) => {
                  const cellValue =
                    typeof column.accessor === 'function'
                      ? column.accessor(row)
                      : row[column.accessor];

                  return (
                    <td
                      key={colIndex}
                      className={`py-2.5 px-3 sm:px-4 align-middle text-stone-700 dark:text-night-text leading-normal font-normal ${
                        column.className || ''
                      }`}
                    >
                      {cellValue ?? '—'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}