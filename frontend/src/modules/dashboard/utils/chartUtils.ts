/**
 * Agrupa un array de registros por mes (últimos N meses)
 * y devuelve la cantidad de registros creados en cada mes.
 *
 * @param records    Array de registros con campo createdAt
 * @param monthCount Cuántos meses hacia atrás mostrar (default 12)
 * @returns          { labels: string[], counts: (number|null)[] }
 */
export function groupByMonth(
  records: { createdAt?: string }[],
  monthCount = 12
): { labels: string[]; counts: (number | null)[] } {
  const now = new Date();

  // Generar los últimos N meses como labels y claves de mapa
  const labels: string[] = [];
  const keys: string[] = [];

  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    // Clave interna: "YYYY-MM"
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    // Etiqueta legible: "Ene 2025"
    labels.push(
      d.toLocaleString('es-ES', { month: 'short', year: 'numeric' })
    );
  }

  // Mapa de conteos
  const countMap: Record<string, number> = {};
  keys.forEach((k) => (countMap[k] = 0));

  records.forEach((r) => {
    if (!r.createdAt) return;
    const d = new Date(r.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key in countMap) countMap[key]++;
  });

  const counts = keys.map((k) => countMap[k]);

  return { labels, counts };
}

/**
 * A partir de conteos mensuales devuelve la acumulación progresiva.
 * Útil para mostrar el total acumulado en lugar de solo nuevos registros.
 */
export function cumulativeSum(counts: (number | null)[]): (number | null)[] {
  let acc = 0;
  return counts.map((c) => {
    if (c === null) return null;
    acc += c;
    return acc;
  });
}

/**
 * Genera un arreglo de labels para los últimos `daysCount` días (formato local)
 * y evalúa un Record<string, number> (desde el backend) donde la clave es "YYYY-MM-DD".
 */
export function mapDailyStats(
  statsObj: Record<string, number> | undefined,
  daysCount = 30
): { labels: string[]; counts: number[] } {
  const now = new Date();
  const labels: string[] = [];
  const counts: number[] = [];

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    // Key formato YYYY-MM-DD
    const key = d.toISOString().split('T')[0];
    
    labels.push(
      d.toLocaleString('es-ES', { day: 'numeric', month: 'short' })
    );

    counts.push((statsObj && statsObj[key]) ? statsObj[key] : 0);
  }

  return { labels, counts };
}

