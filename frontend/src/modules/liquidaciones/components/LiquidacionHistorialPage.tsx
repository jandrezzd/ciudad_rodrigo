import { useEffect, useMemo, useState } from 'react';
import { FileSearch, History } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Table } from '@/shared/components/Table';
import { Pagination } from '@/shared/components/Pagination';
import { SearchableSelect } from '@/shared/components/SearchableSelect/SearchableSelect';
import { useObras } from '@/modules/obras/hooks/useObras';
import { useClientes } from '@/modules/clientes/hooks/useClientes';
import { useLiquidaciones } from '../hooks/useLiquidaciones';
import { EstadoLiquidacion, LiquidacionResumen } from '../types';
import {
  formatearDia,
  formatearDinero,
  hoyEcuador,
  inicioMesEcuador,
  sumarPrecios,
} from '../utils/liquidacion';
import { LiquidacionDetalleModal } from './LiquidacionDetalleModal';

const nombreCliente = (c: LiquidacionResumen['cliente']) => c.companyname || c.name || '—';

const ESTADO_OPCIONES = [
  { value: '', label: 'Todas' },
  { value: 'ACTIVA', label: 'Activas' },
  { value: 'ANULADA', label: 'Anuladas' },
];

/** Historial de liquidaciones guardadas: vista previa y botón Revisar. */
export const LiquidacionHistorialPage = () => {
  const { obras } = useObras();
  const { clientes } = useClientes();
  const [desde, setDesde] = useState(inicioMesEcuador);
  const [hasta, setHasta] = useState(hoyEcuador);
  const [obraFilter, setObraFilter] = useState('');
  const [clienteFilter, setClienteFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [codigo, setCodigo] = useState('');
  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  const { liquidaciones, isLoading, refetch } = useLiquidaciones({
    desde: desde || undefined,
    hasta: hasta || undefined,
    constSiteId: obraFilter ? Number(obraFilter) : undefined,
    clientId: clienteFilter ? Number(clienteFilter) : undefined,
    estado: (estadoFilter || undefined) as EstadoLiquidacion | undefined,
    codigo,
  });

  useEffect(() => {
    setPage(1);
  }, [desde, hasta, obraFilter, clienteFilter, estadoFilter, codigo]);

  const totalPages = Math.max(1, Math.ceil(liquidaciones.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginadas = useMemo(
    () => liquidaciones.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [liquidaciones, currentPage, pageSize],
  );

  const obraOptions = useMemo(
    () => [
      { value: '', label: 'Todas' },
      ...obras.filter((o) => o.name).map((o) => ({ value: String(o.id), label: o.name })),
    ],
    [obras],
  );

  const clienteOptions = useMemo(
    () => [
      { value: '', label: 'Todos' },
      ...clientes
        .map((c) => ({ value: String(c.id), label: c.companyname || c.name || '' }))
        .filter((o) => o.label),
    ],
    [clientes],
  );

  // Las anuladas no suman: ya no se cobran.
  const activas = useMemo(() => liquidaciones.filter((l) => l.estado !== 'ANULADA'), [liquidaciones]);
  const totalPeriodo = useMemo(() => sumarPrecios(activas.map((l) => l.montoTotal)), [activas]);
  const cantidadAnuladas = liquidaciones.length - activas.length;

  const columns = [
    {
      header: 'Código',
      accessor: (row: LiquidacionResumen) => (
        <span className="font-mono text-xs whitespace-nowrap">
          {row.codigo}
          {row.estado === 'ANULADA' ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 font-sans">
              Anulada
            </span>
          ) : (
            row.editadoEn && (
              <span
                className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 font-sans"
                title="Esta liquidación fue editada"
              >
                Editada
              </span>
            )
          )}
        </span>
      ),
    },
    { header: 'Obra', accessor: (row: LiquidacionResumen) => row.obra?.name || '—' },
    { header: 'Cliente', accessor: (row: LiquidacionResumen) => nombreCliente(row.cliente) },
    {
      header: 'Monto total',
      accessor: (row: LiquidacionResumen) => (
        <span
          className={`font-semibold whitespace-nowrap ${
            row.estado === 'ANULADA'
              ? 'text-gray-400 dark:text-night-subtle line-through'
              : 'text-emerald-700 dark:text-emerald-400'
          }`}
        >
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
            Liquidaciones guardadas. Revisa el detalle, expórtalas, edítalas o anúlalas con un motivo.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-night-surface rounded-lg shadow p-4 border border-gray-100 dark:border-night-border grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 relative z-30 overflow-visible">
        <Input label="Fecha desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <Input label="Fecha hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <SearchableSelect label="Obra" value={obraFilter} onChange={setObraFilter} options={obraOptions} />
        <SearchableSelect label="Cliente" value={clienteFilter} onChange={setClienteFilter} options={clienteOptions} />
        <SearchableSelect label="Estado" value={estadoFilter} onChange={setEstadoFilter} options={ESTADO_OPCIONES} />
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
          data={paginadas}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No hay liquidaciones con estos filtros"
        />
        <Pagination
          className="px-4 pb-4"
          total={liquidaciones.length}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
        <div className="border-t border-gray-100 dark:border-night-border px-4 py-3 flex flex-col md:flex-row md:justify-between gap-1 text-sm">
          <span className="text-gray-600 dark:text-night-muted">
            {liquidaciones.length} liquidación(es)
            {cantidadAnuladas > 0 && ` · ${cantidadAnuladas} anulada(s), no suman al total`}
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
