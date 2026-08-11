type SortableRecord = {
  createdAt?: string | null;
  updatedAt?: string | null;
  id?: number | string | null;
};

const toTime = (value?: string | null) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const toNumberId = (value?: number | string | null) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const sortByNewest = <T extends SortableRecord>(items: T[]) => {
  return [...items].sort((a, b) => {
    const aTime = toTime(a.createdAt ?? a.updatedAt ?? null);
    const bTime = toTime(b.createdAt ?? b.updatedAt ?? null);

    if (aTime !== null || bTime !== null) {
      return (bTime ?? 0) - (aTime ?? 0);
    }

    const aId = toNumberId(a.id ?? null);
    const bId = toNumberId(b.id ?? null);

    if (aId !== null || bId !== null) {
      return (bId ?? 0) - (aId ?? 0);
    }

    return 0;
  });
};
