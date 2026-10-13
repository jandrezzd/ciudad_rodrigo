import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: ReactNode;
}

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  className = '',
  disabled,
  ...props
}: ButtonProps) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 select-none outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:focus-visible:ring-blue-400/30 disabled:opacity-50 dark:disabled:opacity-40 disabled:cursor-not-allowed';

  const variantClasses = {
    primary:
      'bg-blue-600 hover:bg-blue-700 text-white shadow-xs hover:shadow-sm dark:bg-blue-600 dark:hover:bg-blue-500',
    secondary:
      'bg-orange-500 hover:bg-orange-600 text-white shadow-xs hover:shadow-sm dark:bg-orange-600 dark:hover:bg-orange-500',
    success:
      'bg-green-600 hover:bg-green-700 text-white shadow-xs hover:shadow-sm dark:bg-emerald-600 dark:hover:bg-emerald-500',
    danger:
      'bg-red-600 hover:bg-red-700 text-white shadow-xs hover:shadow-sm dark:bg-red-600 dark:hover:bg-red-500',
    outline:
      'border border-blue-600 dark:border-blue-400/40 text-blue-600 dark:text-blue-300 bg-transparent hover:bg-blue-50 dark:hover:bg-blue-950/40 shadow-xs',
    ghost:
      'bg-transparent hover:bg-stone-100 dark:hover:bg-night-hover text-stone-600 dark:text-night-muted',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs sm:text-sm gap-1.5',
    md: 'px-4 py-2 text-xs sm:text-sm gap-2',
    lg: 'px-5 py-2.5 text-sm sm:text-base gap-2.5',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg
            className="animate-spin h-4 w-4 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="ml-1.5">Cargando...</span>
        </>
      ) : (
        <>
          {icon && <span className="shrink-0">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
};