const STORAGE_KEY = 'transport_reported_ids';

const safeParse = (value: string | null): number[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    }
    return [];
  } catch (error) {
    void error;
    return [];
  }
};

export const getReportedTransportIds = (): number[] => {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    void error;
    return [];
  }
};

export const isTransportReported = (id: number): boolean => {
  if (!Number.isFinite(id)) return false;
  const ids = getReportedTransportIds();
  return ids.includes(id);
};

export const markTransportReported = (id: number) => {
  if (!Number.isFinite(id)) return;
  try {
    const ids = new Set(getReportedTransportIds());
    ids.add(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch (error) {
    void error;
    // Silenciar errores de storage.
  }
};
