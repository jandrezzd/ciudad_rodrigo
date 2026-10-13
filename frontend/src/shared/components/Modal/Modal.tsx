import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  footer?: ReactNode;
  className?: string;
}

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  footer,
  className = '',
}: ModalProps) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    '2xl': 'max-w-7xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        {/* Backdrop oscuro translúcido con desenfoque suave */}
        <div
          className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-xs transition-opacity"
          onClick={onClose}
        />

        {/* Ventana modal contenida en viewport con elevación Soft Dark */}
        <div
          className={`relative w-full ${sizeClasses[size]} bg-white dark:bg-night-surface border border-stone-200/80 dark:border-night-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors duration-150 z-10 ${className}`}
        >
          {/* Header fijo con borde suave */}
          <div className="flex items-center justify-between px-5 py-4 sm:px-6 border-b border-stone-200/80 dark:border-night-border shrink-0">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-night-text">
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:text-night-muted dark:hover:text-night-text hover:bg-stone-100 dark:hover:bg-night-hover transition-colors"
              aria-label="Cerrar modal"
              title="Cerrar modal"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body con scroll vertical contenido */}
          <div className="p-5 sm:p-6 overflow-y-auto flex-1 text-stone-700 dark:text-night-text text-xs sm:text-sm">
            {children}
          </div>

          {/* Footer opcional fijo al pie */}
          {footer && (
            <div className="flex items-center justify-end gap-3 px-5 py-3.5 sm:px-6 border-t border-stone-200/80 dark:border-night-border bg-stone-50/80 dark:bg-night-raised shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};