import { useMemo, useState } from 'react';
import { FileSearch, History } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Table } from '@/shared/components/Table';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { useObras } from '@/modules/obras/hooks/useObras';
import { useLiquidaciones } from '../hooks/useLiquidaciones';
import { LiquidacionResumen } from '../types';
import {
  formatearDia,
  formatearDinero,
  hoyEcuador,
  inicioMesEcuador,
  sumarPrecios,
} from '../utils/liquidacion';
import { LiquidacionDetalleModal } from './LiquidacionDetalleModal';

const nombreCliente = (c: LiquidacionResumen['cliente']) => c.companyname || c.name || '—';

/** Historial de liquidaciones guardadas: vista previa y botón Revisar. */
export const LiquidacionHistorialPage = () => {
  const { obras } = useObras();
  const [desde, setDesde] = useState(inicioMesEcuador);
  const [hasta, setHasta] = useState(hoyEcuador);
  const [obraFilter, setObraFilter] = useState('');
  const [codigo, setCodigo] = useState('');
  const [seleccionada, setSeleccionada] = useState<number | null>(null);

  const { liquidaciones, isLoading, refetch } = useLiquidaciones({
    desde: desde || undefined,
    hasta: hasta || undefined,
    constSiteId: obraFilter ? Number(obraFilter) : undefined,
    codigo,
  });

  const obraOptions = useMemo(
    () => [
      { value: '', label: 'Todas' },
      ...obras
        .filter((o) => o.name)
        .map((o) => ({ value: String(o.id), label: o.name })),
    ],
    [obras],
  );

  const totalPeriodo = useMemo(
    () => sumarPrecios(liquidaciones.map((l) => l.montoTotal)),
    [liquidaciones],
  );

  const columns = [
    {
      header: 'Código',
      accessor: (row: LiquidacionResumen) => (
        <span className="font-mono text-xs whitespace-nowrap">
          {row.codigo}
          {row.editadoEn && (
            <span
              className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 font-sans"
              title="Esta liquidación fue editada"
            >
              Editada
            </span>
          )}
        </span>
      ),
    },
    { header: 'Obra', accessor: (row: LiquidacionResumen) => row.obra?.name || '—' },
    { header: 'Cliente', accessor: (row: LiquidacionResumen) => nombreCliente(row.cliente) },
    {
      header: 'Monto total',
      accessor: (row: LiquidacionResumen) => (
        <span className="font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
          {formatearDinero(row.montoTotal)}
        </span>
      ),
    },
    { header: 'Fecha', accessor: (row: LiquidacionResumen) => formatearDia(row.fecha) },
    { header: 'N° viajes', accessor: (row: LiquidacionResumen) => row.cantidadViajes },
    {
      header: 'Acciones',
      accessor: (row: LiquidacionResumen) => (
        <Button
          size="sm"
          variant="outline"
          className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25 border-none"
          icon={<FileSearch size={16} />}
          onClick={() => setSeleccionada(row.id)}
        >
          Revisar
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-blue-100 dark:bg-blue-500/15 p-2 rounded-lg">
          <History size={22} className="text-blue-700 dark:text-blue-300" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-night-text">
            Historial de liquidaciones
          </h1>
          <p className="text-gray-600 dark:text-night-muted mt-1">
            Liquidaciones guardadas. Revisa el detalle o edítalas con un motivo.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-night-surface rounded-lg shadow p-4 border border-gray-100 dark:border-night-border grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative z-30 overflow-visible">
        <Input label="Fecha desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <Input label="Fecha hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <SearchableSelect label="Obra" value={obraFilter} onChange={setObraFilter} options={obraOptions} />
        <Input
          label="Código"
          placeholder="Ej. 0007"
          value={codigo}
          maxLength={30}
          onChange={(e) => setCodigo(e.target.value)}
        />
      </div>

      <div className="bg-white dark:bg-night-surface rounded-lg shadow">
        <Table
          data={liquidaciones}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No hay liquidaciones con estos filtros"
        />
        <div className="border-t border-gray-100 dark:border-night-border px-4 py-3 flex justify-between text-sm">
          <span className="text-gray-600 dark:text-night-muted">
            {liquidaciones.length} liquidación(es)
          </span>
          <span className="text-gray-700 dark:text-night-text">
            Total del período:{' '}
            <span className="font-bold text-emerald-700 dark:text-emerald-400">
              {formatearDinero(totalPeriodo)}
            </span>
          </span>
        </div>
      </div>

      <LiquidacionDetalleModal
        liquidacionId={seleccionada}
        onClose={() => setSeleccionada(null)}
        onGuardada={refetch}
      />
    </div>
  );
};
