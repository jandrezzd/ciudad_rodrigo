import { ReactNode } from 'react';

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  className?: string;
  headerClassName?: string;
}

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  emptyMessage?: string;
}

export function Table<T extends { id: string | number }>({
  data,
  columns,
  isLoading = false,
  emptyMessage = 'No hay datos disponibles',
}: TableProps<T>) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-10 text-stone-400 text-xs font-medium">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      {/* table-auto para distribución fluida y auto-adaptable */}
      <table className="w-full text-left border-collapse table-auto">
        <thead>
          <tr className="border-b border-stone-200/90 bg-stone-50/70">
            {columns.map((column, index) => (
              <th
                key={index}
                className={`py-2.5 px-6 text-xs font-bold text-stone-600 uppercase tracking-wide whitespace-nowrap ${
                  column.headerClassName || ''
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 text-xs text-stone-900">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-stone-50/50 transition-colors">
              {columns.map((column, colIndex) => (
                <td
                  key={colIndex}
                  className={`py-2.5 px-6 align-middle text-stone-700 leading-normal font-normal ${
                    column.className || ''
                  }`}
                >
                  {typeof column.accessor === 'function'
                    ? column.accessor(row)
                    : String(row[column.accessor] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}