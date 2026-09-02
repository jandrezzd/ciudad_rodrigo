import { useMemo, useState } from 'react';
import { Download, Warehouse } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Table } from '@/shared/components/Table';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { formatDate, formatDateTime, formatNumber } from '@/shared/utils/format';
import { reportsService } from '../services/reportsService';
import { useReportProveedorMaterial } from '../hooks/useReportProveedorMaterial';
import {
  ProveedorMaterialReportResponse,
  ProveedorMaterialMovement,
  ReportTransportStatus,
} from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDateInput = (value: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(value);

const sanitizeFileName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

const statusLabel = (status: ReportTransportStatus): string => {
  const map: Record<string, string> = {
    EN_PROGRESO: 'En progreso',
    IN_PROGRESS: 'En progreso',
    COMPLETADO: 'Completado',
    COMPLETED: 'Completado',
    CANCELADO: 'Cancelado',
    CANCELLED: 'Cancelado',
    ALERTA: 'Alerta',
    REVISADO: 'Revisado',
  };
  return map[status] ?? status;
};

const statusToBadge = (status: ReportTransportStatus) => {
  if (status === 'COMPLETED' || status === 'COMPLETADO') return 'completado';
  if (status === 'CANCELLED' || status === 'CANCELADO') return 'cancelado';
  if (status === 'ALERTA') return 'alerta';
  if (status === 'REVISADO') return 'revisado';
  return 'en_progreso';
};

const getResolvedM3 = (row: ProveedorMaterialMovement) => {
  const departure = row.departureM3Corrected ?? row.departureM3 ?? null;
  const arrival = row.arrivalM3Corrected ?? row.arrivalM3 ?? null;
  const difference =
    row.deviationM3 !== undefined && row.deviationM3 !== null
      ? row.deviationM3
      : departure !== null && arrival !== null
        ? arrival - departure
        : null;
  return { departure, arrival, difference };
};

const resolveOwner = (row: ProveedorMaterialMovement): string => {
  return (
    row.owner?.companyname ||
    row.owner?.name ||
    row.vehicle?.owner?.companyname ||
    row.vehicle?.owner?.name ||
    'Interno'
  );
};

const resolveCanterasLabel = (row: ProveedorMaterialMovement): string => {
  if (!row.planning?.canteras?.length) return '—';
  return row.planning.canteras.map((c) => c.nombre).join(', ');
};

// ─── Tipo de fila de tabla ────────────────────────────────────────────────────

interface TableRow {
  id: number;
  numeroFactura: string;
  vehicleid: string;
  conductor: string;
  proveedor: string;
  canteras: string;
  planificacion: string;
  obra: string;
  departureAt: string;
  arrivalAt: string;
  m3Salida: number | null;
  m3Llegada: number | null;
  desviacion: number | null;
  status: ReportTransportStatus;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export const ReporteProveedorMaterialSection = () => {
  const { providers, isLoading: isProvidersLoading } = useReportProveedorMaterial();

  const [providerId, setProviderId] = useState('');
  const [canteraId, setCanteraId] = useState('');
  const [factura, setFactura] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatDateInput(d);
  });
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));
  const [report, setReport] = useState<ProveedorMaterialReportResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // ─── Opciones de selectores ─────────────────────────────────────────────────

  const providerOptions = useMemo(
    () => [
      { value: '', label: 'Todos los proveedores' },
      ...providers.map((p) => ({ value: String(p.id), label: p.razonsocial })),
    ],
    [providers],
  );

  const selectedProvider = useMemo(
    () => providers.find((p) => String(p.id) === providerId),
    [providers, providerId],
  );

  const canteraOptions = useMemo(() => {
    const base = [{ value: '', label: 'Todas las canteras' }];
    if (!providerId || !selectedProvider) return base;
    return [
      ...base,
      ...selectedProvider.canteras.map((c) => ({ value: String(c.id), label: c.nombre })),
    ];
  }, [providerId, selectedProvider]);

  // Reset cantera cuando cambia el proveedor
  const handleProviderChange = (val: string) => {
    setProviderId(val);
    setCanteraId('');
  };

  // ─── Generar reporte ────────────────────────────────────────────────────────

  const handleGenerateReport = async () => {
    if (!startDate || !endDate) {
      toast.error('Seleccione el rango de fechas');
      return;
    }
    if (startDate > endDate) {
      toast.error('La fecha de inicio no puede ser mayor a la fecha de fin');
      return;
    }

    setIsGenerating(true);
    try {
      const data = await reportsService.getMaterialProviderReport({
        startDate,
        endDate,
        providerId: providerId ? Number(providerId) : undefined,
        canteraId: canteraId ? Number(canteraId) : undefined,
        factura: factura.trim() || undefined,
      });
      setReport(data);
      if (data.movements.length === 0) {
        toast('Sin movimientos para los filtros seleccionados', { icon: 'ℹ️' });
      } else {
        toast.success(`Reporte generado: ${data.movements.length} movimiento(s)`);
      }
    } catch {
      toast.error('No se pudo generar el reporte');
      setReport(null);
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Filas de la tabla ──────────────────────────────────────────────────────

  const tableRows = useMemo<TableRow[]>(() => {
    if (!report) return [];
    return report.movements.map((row) => {
      const { departure, arrival, difference } = getResolvedM3(row);
      return {
        id: row.id,
        numeroFactura: row.numeroFactura || '—',
        vehicleid: row.vehicle?.vehicleid || row.vehicle?.plate || '—',
        conductor: row.driver?.name || '—',
        proveedor: resolveOwner(row),
        canteras: resolveCanterasLabel(row),
        planificacion: row.planning?.planningCode || '—',
        obra: row.constSite?.name || '—',
        departureAt: row.departureAt ? formatDateTime(row.departureAt) : '—',
        arrivalAt: row.arrivalAt ? formatDateTime(row.arrivalAt) : 'Pendiente',
        m3Salida: departure,
        m3Llegada: arrival,
        desviacion: difference !== null ? Number(difference.toFixed(2)) : null,
        status: row.status,
      };
    });
  }, [report]);

  // ─── Export Excel ───────────────────────────────────────────────────────────

  const handleExportExcel = () => {
    if (!report || tableRows.length === 0) {
      toast.error('Genera el reporte antes de exportar');
      return;
    }

    const wsData = [
      [
        'N° Factura',
        'ID Vehículo',
        'Conductor',
        'Proveedor',
        'Canteras',
        'Planificación',
        'Obra',
        'Fecha Salida',
        'Fecha Llegada',
        'M3 Salida',
        'M3 Llegada',
        'Desviación',
        'Estado',
      ],
      ...tableRows.map((r) => [
        r.numeroFactura,
        r.vehicleid,
        r.conductor,
        r.proveedor,
        r.canteras,
        r.planificacion,
        r.obra,
        r.departureAt,
        r.arrivalAt,
        r.m3Salida ?? '',
        r.m3Llegada ?? '',
        r.desviacion ?? '',
        statusLabel(r.status),
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Proveedor Material');

    const provName = selectedProvider
      ? sanitizeFileName(selectedProvider.razonsocial)
      : 'Todos';
    XLSX.writeFile(wb, `Reporte_Proveedor_Material_${provName}_${startDate}_${endDate}.xlsx`);
  };

  // ─── Columnas ───────────────────────────────────────────────────────────────

  const columns = [
    { header: 'N° Factura', accessor: 'numeroFactura' as keyof TableRow },
    { header: 'ID Vehículo', accessor: 'vehicleid' as keyof TableRow },
    { header: 'Conductor', accessor: 'conductor' as keyof TableRow },
    { header: 'Proveedor', accessor: 'proveedor' as keyof TableRow },
    { header: 'Canteras', accessor: 'canteras' as keyof TableRow, className: 'max-w-xs whitespace-normal' },
    { header: 'Planificación', accessor: 'planificacion' as keyof TableRow },
    { header: 'Obra', accessor: 'obra' as keyof TableRow },
    { header: 'Fecha Salida', accessor: 'departureAt' as keyof TableRow },
    { header: 'Fecha Llegada', accessor: 'arrivalAt' as keyof TableRow },
    {
      header: 'M3 Salida',
      accessor: (row: TableRow) =>
        row.m3Salida !== null ? formatNumber(row.m3Salida) : '—',
    },
    {
      header: 'M3 Llegada',
      accessor: (row: TableRow) =>
        row.m3Llegada !== null ? formatNumber(row.m3Llegada) : '—',
    },
    {
      header: 'Desviación',
      accessor: (row: TableRow) => {
        if (row.desviacion === null) return '—';
        const val = Number(row.desviacion.toFixed(2));
        const cls =
          val > 0
            ? 'text-red-600 font-semibold'
            : val < 0
              ? 'text-blue-600 font-semibold'
              : 'text-green-600 font-semibold';
        return <span className={cls}>{formatNumber(val)}</span>;
      },
    },
    {
      header: 'Estado',
      accessor: (row: TableRow) => <StatusBadge status={statusToBadge(row.status)} />,
    },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-amber-100 p-2 rounded-lg">
            <Warehouse size={22} className="text-amber-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Reporte Proveedor Material</h2>
            <p className="text-gray-600 text-sm mt-0.5">
              Consulta movimientos por proveedor de cantera y exporta a Excel
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 !border-none"
          icon={<Download size={16} />}
          onClick={handleExportExcel}
          disabled={!report || tableRows.length === 0}
        >
          Exportar Excel
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <SearchableSelect
          label="Proveedor"
          options={providerOptions}
          value={providerId}
          onChange={handleProviderChange}
        />
        <SearchableSelect
          label="Cantera"
          options={canteraOptions}
          value={canteraId}
          onChange={setCanteraId}
        />
        <Input
          label="N° Factura"
          type="text"
          placeholder="Buscar factura..."
          value={factura}
          onChange={(e) => setFactura(e.target.value)}
        />
        <Input
          label="Fecha inicio"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <Input
          label="Fecha fin"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
        <div className="flex items-end">
          <Button
            variant="primary"
            onClick={handleGenerateReport}
            isLoading={isGenerating}
            className="w-full"
          >
            Generar reporte
          </Button>
        </div>
      </div>

      {isProvidersLoading && (
        <div className="flex justify-center items-center py-6">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600" />
        </div>
      )}

      {/* Resumen */}
      {report && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-sm text-gray-500">Total movimientos</p>
                <p className="text-2xl font-bold text-gray-900">
                  {report.summary.totalMovements}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">M3 Salida total</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatNumber(report.summary.totalDepartureM3)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">M3 Llegada total</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {formatNumber(report.summary.totalArrivalM3)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">Desviación total</p>
                <p
                  className={`text-2xl font-bold ${
                    report.summary.deviation > 0
                      ? 'text-red-600'
                      : report.summary.deviation < 0
                        ? 'text-blue-600'
                        : 'text-green-600'
                  }`}
                >
                  {formatNumber(report.summary.deviation)}
                </p>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-3 text-sm text-gray-600">
              <span>
                <strong>Período:</strong>{' '}
                {formatDate(report.period.startDate)} — {formatDate(report.period.endDate)}
              </span>
              {selectedProvider && (
                <span>
                  <strong>Proveedor:</strong> {selectedProvider.razonsocial}
                </span>
              )}
              {canteraId && selectedProvider && (
                <span>
                  <strong>Cantera:</strong>{' '}
                  {selectedProvider.canteras.find((c) => String(c.id) === canteraId)?.nombre ?? '—'}
                </span>
              )}
            </div>
          </div>

          {tableRows.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              No hay movimientos para los filtros seleccionados.
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">
                  Movimientos ({tableRows.length})
                </h3>
              </div>
              <Table
                data={tableRows}
                columns={columns}
                keyExtractor={(row) => String(row.id)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
