import { useMemo } from 'react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

type PageItem = number | '...';

const buildPageItems = (totalPages: number, currentPage: number): PageItem[] => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, '...', totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
};

export const Pagination = ({
  page,
  pageSize,
  total,
  onPageChange,
  className = '',
}: PaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const startItem = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = total === 0 ? 0 : Math.min(safePage * pageSize, total);

  const pageItems = useMemo(() => buildPageItems(totalPages, safePage), [totalPages, safePage]);

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === safePage) return;
    onPageChange(nextPage);
  };

  return (
    <div
      className={`flex flex-col gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <span>Mostrando</span>
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-semibold text-gray-800">
          {startItem} - {endItem}
        </span>
        <span>de</span>
        <span className="font-semibold text-gray-800">{total}</span>
      </div>
      <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-9 rounded-full border border-gray-300 px-4 text-sm font-medium text-gray-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => handlePageChange(safePage - 1)}
            disabled={safePage === 1 || total === 0}
          >
            Anterior
          </button>
          {pageItems.map((item, index) => (
            <button
              key={`${item}-${index}`}
              type="button"
              className={`flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                item === safePage
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : item === '...'
                    ? 'border-transparent text-gray-400'
                    : 'border-gray-300 text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
              } ${item === '...' ? 'pointer-events-none' : ''}`}
              onClick={() => {
                if (typeof item === 'number') {
                  handlePageChange(item);
                }
              }}
              disabled={item === '...'}
              aria-current={item === safePage ? 'page' : undefined}
            >
              {item}
            </button>
          ))}
          <button
            type="button"
            className="h-9 rounded-full border border-gray-300 px-4 text-sm font-medium text-gray-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => handlePageChange(safePage + 1)}
            disabled={safePage === totalPages || total === 0}
          >
            Siguiente
          </button>
      </div>
    </div>
  );
};
