const APP_TIME_ZONE = 'America/Guayaquil';
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MIDNIGHT_REGEX = /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.\d+)?Z$/;

const parseDate = (value: string | Date): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const formatDateOnly = (value: string): string => {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
};

export const formatDate = (date: string | Date): string => {
  if (!date) return '';
  if (typeof date === 'string' && (DATE_ONLY_REGEX.test(date) || ISO_MIDNIGHT_REGEX.test(date))) {
    return formatDateOnly(date.slice(0, 10));
  }

  const parsed = parseDate(date);
  if (!parsed) return '';

  return parsed.toLocaleDateString('es-EC', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: APP_TIME_ZONE,
  });
};

export const formatDateTime = (date: string | Date): string => {
  if (!date) return '';
  const parsed = parseDate(date);
  if (!parsed) return '';

  return parsed.toLocaleString('es-EC', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIME_ZONE,
  });
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

export const formatNumber = (num: number, decimals: number = 2): string => {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};
