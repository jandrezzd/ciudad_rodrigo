import { useMemo, useState, useEffect } from 'react';
import { Download, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Button } from '@/shared/components/Button';
import { Table } from '@/shared/components/Table';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { formatDateTime } from '@/shared/utils/format';
import { useReportObras } from '../hooks/useReportObras';
import { reportsService } from '../services/reportsService';
import { ObraDetailReportResponse, ObraReportDelivery } from '../types';


const statusLabel = (status: string): string => {
  const map: Record<string, string> = {
    PENDING: 'Pendiente',
    IN_PROGRESS: 'En progreso',
    COMPLETED: 'Completado',
    CANCELLED: 'Cancelado',
    PENDIENTE: 'Pendiente',
    EN_PROGRESO: 'En progreso',
    COMPLETADO: 'Completado',
    CANCELADO: 'Cancelado',
    ALERTA: 'Alerta',
    REVISADO: 'Revisado',
  };
  return map[status] ?? status;
};

const getResolvedM3 = (row: ObraReportDelivery) => {
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

const getDuration = (start?: string | null, end?: string | null): string => {
  if (!start || !end) return '—';
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (isNaN(startMs) || isNaN(endMs) || endMs < startMs) return '—';
  const diffMs = endMs - startMs;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
};

export const ReporteObrasSection = () => {
  const { obras, isLoading: isObrasLoading } = useReportObras();

  const [obraId, setObraId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportData, setReportData] = useState<ObraDetailReportResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Resumen de obra seleccionada
  const obraSeleccionada = useMemo(
    () => obras.find((o) => String(o.id) === obraId),
    [obras, obraId],
  );

  const obraOptions = useMemo(
    () =>
      obras.map((o) => ({
        value: String(o.id),
        label: `${o.name} — ${o.province}, ${o.canton}`,
      })),
    [obras],
  );

  const handleGenerarReporte = async () => {
    if (!obraId) {
      toast.error('Seleccione una obra');
      return;
    }
    if ((startDate && !endDate) || (!startDate && endDate)) {
      toast.error('Debe ingresar ambas fechas o ninguna');
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      toast.error('La fecha de inicio no puede ser mayor a la fecha de fin');
      return;
    }

    setIsGenerating(true);
    try {
      const params: { constSiteId: number; startDate?: string; endDate?: string } = {
        constSiteId: Number(obraId),
      };
      if (startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const data = await reportsService.getObraDetailReport(params);

      setReportData(data);

      if (data.deliveries.length === 0) {
        toast('No se encontraron movimientos para esta obra', {
          icon: '⚠️',
        });
      } else {
        toast.success(`Se encontraron ${data.deliveries.length} viaje(s)`);
      }
    } catch (e) {
      console.error(e);
      toast.error('Error al generar el reporte detallado');
      setReportData(null);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    setReportData(null);
  }, [obraId, startDate, endDate]);

  const reportRows = useMemo<ObraReportDelivery[]>(() => {
    if (!reportData) return [];
    return reportData.deliveries;
  }, [reportData]);

  const totalDeviation = useMemo(() => {
    if (!reportData) return null;
    const deviations = reportData.deliveries
      .map((row) => getResolvedM3(row).difference)
      .filter((value): value is number => value !== null && value !== 0);
    if (deviations.length === 0) return 0;
    return Number(deviations.reduce((sum, value) => sum + value, 0).toFixed(2));
  }, [reportData]);


  const handleExportExcel = () => {
    if (!reportData || reportRows.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    const exportData = reportRows.map((row) => ({
      'ID Vehículo': row.vehicle?.vehicleid || '—',
      Vehículo: row.vehicle?.plate || '—',
      Conductor: row.driver?.name || '—',
      Tipo: row.vehicle?.type || '—',
      Propietario: row.vehicle?.owner?.companyname || row.vehicle?.owner?.name || '—',
      Estado: statusLabel(row.status),
      Salida: row.departureAt ? formatDateTime(row.departureAt) : '—',
      Llegada: row.arrivalAt ? formatDateTime(row.arrivalAt) : '—',
      Tiempo: getDuration(row.departureAt, row.arrivalAt),
      'M3 Salida': getResolvedM3(row).departure ?? 0,
      'M3 Llegada': getResolvedM3(row).arrival ?? 0,
      'Desviación M3': (() => {
        const resolved = getResolvedM3(row);
        if (resolved.difference == null) return 0;
        return Number(resolved.difference.toFixed(2));
      })(),
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Detalle Obra');
    const obraName = (obraSeleccionada?.name ?? 'obra').replace(/\s+/g, '_');
    XLSX.writeFile(workbook, `reporte_obra_${obraName}.xlsx`);
  };

  const columns = [
    { header: 'ID Vehículo', accessor: (row: ObraReportDelivery) => row.vehicle?.vehicleid || '—' },
    { header: 'Vehículo', accessor: (row: ObraReportDelivery) => row.vehicle?.plate || '—' },
    { header: 'Conductor', accessor: (row: ObraReportDelivery) => row.driver?.name || '—' },
    { header: 'Salida', accessor: (row: ObraReportDelivery) => row.departureAt ? formatDateTime(row.departureAt) : '—' },
    { header: 'Llegada', accessor: (row: ObraReportDelivery) => row.arrivalAt ? formatDateTime(row.arrivalAt) : 'Pendiente' },
    { header: 'Tiempo', accessor: (row: ObraReportDelivery) => getDuration(row.departureAt, row.arrivalAt) },
    { header: 'M3 Salida', accessor: (row: ObraReportDelivery) => getResolvedM3(row).departure ?? 0 },
    { header: 'M3 Llegada', accessor: (row: ObraReportDelivery) => getResolvedM3(row).arrival ?? 0 },
    {
      header: 'Desviación M3',
      accessor: (row: ObraReportDelivery) => {
        const resolved = getResolvedM3(row);
        const dev = resolved.difference ?? 0;
        return (
          <span className={`font-semibold ${dev < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {dev > 0 ? `+${dev.toFixed(2)}` : dev.toFixed(2)}
          </span>
        );
      },
    },
  ];

  const isLoading = isObrasLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 p-2 rounded-lg">
            <Building2 size={22} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Reportes de Obras</h2>
            <p className="text-gray-600 text-sm mt-0.5">
              Consulta los movimientos de transporte asociados a una obra
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
          icon={<Download size={16} />}
          onClick={handleExportExcel}
          disabled={!reportData || reportRows.length === 0}
        >
          Exportar Excel
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 grid grid-cols-1 lg:grid-cols-4 gap-4 items-end">
        <div className="lg:col-span-2">
          <SearchableSelect
            label="Obra"
            options={obraOptions}
            value={obraId}
            onChange={setObraId}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Fecha inicio</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Fecha fin</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        <div className="lg:col-span-4">
          <Button
            variant="primary"
            onClick={handleGenerarReporte}
            isLoading={isGenerating}
            className="w-full"
            style={{ backgroundColor: '#059669' }}
          >
            Generar reporte
          </Button>
        </div>
      </div>

      {/* Spinner carga inicial */}
      {isLoading && (
        <div className="flex justify-center items-center py-6">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
        </div>
      )}

      {/* Resultado */}
      {reportData !== null && (
        <div className="space-y-4">
          {/* Resumen */}
          <div className="bg-white rounded-lg shadow p-4 space-y-4">
            {/* Fila principal */}
            <div className="grid grid-cols-2 md:grid-cols-8 gap-4">
              <div className="col-span-2">
                <p className="text-gray-500 text-sm">Obra</p>
                <p className="font-semibold text-gray-900">
                  {reportData.constSite.name}
                </p>
                <p className="text-gray-600 text-sm">
                  {reportData.constSite.province}, {reportData.constSite.canton}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Total Viajes</p>
                <p className="font-semibold text-gray-900">{reportData.summary.totalDeliveries}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">M3 Cargados</p>
                <p className="font-semibold text-blue-700">
                  {reportData.summary.totalM3Departed} m³
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">M3 Entregados</p>
                <p className="font-semibold text-emerald-700">
                  {reportData.summary.totalM3Delivered} m³
                </p>
              </div>
              {/* Desviación */}
              <div className="col-span-3 flex items-center justify-end">
                <div className="bg-gray-50 rounded px-4 py-2 flex justify-between items-center gap-6 w-full max-w-xs">
                  <span className="text-gray-600 font-medium text-sm">Desviación Total:</span>
                  {(() => {
                    const devTotal = totalDeviation ?? 0;
                    return (
                      <span className={`font-bold text-lg ${devTotal < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {devTotal > 0 ? `+${devTotal.toFixed(2)}` : devTotal.toFixed(2)} m³
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Fila de vehículos */}
            <div className="pt-3 border-t border-dashed border-gray-100 grid grid-cols-3 gap-4">
              <div>
                <p className="text-gray-500 text-sm">Vehículos Total</p>
                <p className="font-semibold text-gray-900">{reportData.summary.uniqueVehicles}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Vehículos Internos</p>
                <p className="font-semibold text-gray-900">{reportData.summary.uniqueInternalVehicles}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Vehículos Externos</p>
                <p className="font-semibold text-gray-900">{reportData.summary.uniqueExternalVehicles}</p>
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-lg shadow">
            <Table
              data={reportRows}
              columns={columns}
              emptyMessage="No hay viajes registrados para esta obra"
            />
          </div>
        </div>
      )}
    </div>
  );
};
