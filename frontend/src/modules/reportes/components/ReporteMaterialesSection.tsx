import { useMemo, useState } from 'react';
import { Download, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Table } from '@/shared/components/Table';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { formatDate, formatDateTime, formatNumber } from '@/shared/utils/format';
import { useReportObras } from '../hooks/useReportObras';
import { reportsService } from '../services/reportsService';
import {
  MaterialConstSiteReportResponse,
  MaterialDelivery,
  ReportTransportStatus,
} from '../types';
import { useMateriales } from '@/modules/materiales/hooks/useMateriales';
import {
  formatMaterialType,
  materialOptions as buildMaterialOptions,
} from '@/modules/materiales/utils/materialLabels';

const formatDateInput = (value: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(value);

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
  if (status === 'IN_PROGRESS' || status === 'EN_PROGRESO') return 'en_progreso';
  return 'pendiente';
};

const sanitizeFileName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

const toDateKey = (value: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(parsed);
};

const getResolvedM3 = (row: MaterialDelivery) => {
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

const resolveVehicleLabel = (row: MaterialDelivery) =>
  row.vehicle?.plate || row.vehicle?.vehicleid || '—';

const resolveOwnerLabel = (row: MaterialDelivery) =>
  row.owner?.companyname ||
  row.owner?.name ||
  row.vehicle?.owner?.companyname ||
  row.vehicle?.owner?.name ||
  'Interno';

interface GroupedVehicleRow {
  id: string;
  vehicleId: string;
  plate: string;
  conductor: string;
  obra: string;
  client: string;
  date: string;
  totalDepartureM3: number;
  totalArrivalM3: number;
  totalDeviationM3: number;
  totalDeliveries: number;
  totalTransitTimeMs: number;
  transitTimeFormatted: string;
}

interface DailySummaryRow {
  date: string;
  deliveries: number;
  totalDepartureM3: number;
  totalArrivalM3: number;
  totalDeviationM3: number;
}

export const ReporteMaterialesSection = () => {
  const { obras, isLoading: isObrasLoading } = useReportObras();
  const { materiales, isLoading: isMaterialesLoading } = useMateriales();

  const [constSiteId, setConstSiteId] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [abscisaFilter, setAbscisaFilter] = useState('');
  const [startDate, setStartDate] = useState(() => formatDateInput(new Date()));
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));
  const [report, setReport] = useState<MaterialConstSiteReportResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const obraOptions = useMemo(
    () => [
      { value: '', label: 'Todas las obras' },
      ...obras.map((obra) => ({
        value: String(obra.id),
        label: `${obra.name} — ${obra.province}, ${obra.canton}`,
      }))
    ],
    [obras],
  );

  const materialOptions = useMemo(
    () => [{ value: '', label: 'Seleccione un material' }, ...buildMaterialOptions(materiales)],
    [materiales],
  );

  const handleGenerateReport = async () => {
    if (!startDate || !endDate) {
      toast.error('Seleccione el rango de fechas');
      return;
    }
    if (startDate > endDate) {
      toast.error('La fecha de inicio no puede ser mayor a la fecha de fin');
      return;
    }

    if (!materialId) {
      toast.error('Seleccione un material');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await reportsService.getMaterialByConstSite({
        materialId: Number(materialId),
        startDate,
        endDate,
        constSiteId: constSiteId || undefined,
      });
      setReport(response);
      toast.success('Reporte generado correctamente');
    } catch (error) {
      console.error(error);
      toast.error('No se pudo generar el reporte');
      setReport(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const abscisaOptions = useMemo(() => {
    if (!report?.deliveries) return [{ value: '', label: 'Todas las abscisas' }];
    const unique = new Set<number>();
    report.deliveries.forEach((d) => {
      if (d.abscisa != null) unique.add(d.abscisa);
    });
    const sorted = Array.from(unique).sort((a, b) => a - b);
    return [
      { value: '', label: 'Todas las abscisas' },
      ...sorted.map((a) => ({ value: String(a), label: `Abscisa ${a}` })),
    ];
  }, [report]);

  const deliveries = useMemo(() => {
    let list = report?.deliveries ?? [];
    if (abscisaFilter) {
      list = list.filter((d) => String(d.abscisa) === abscisaFilter);
    }
    return list;
  }, [report, abscisaFilter]);

  const dailySummary = useMemo<DailySummaryRow[]>(() => {
    if (deliveries.length === 0) return [];
    const map = new Map<string, DailySummaryRow>();

    deliveries.forEach((row) => {
      const dateKey = toDateKey(row.arrivalAt ?? row.departureAt);
      if (!dateKey) return;
      const resolved = getResolvedM3(row);
      const current = map.get(dateKey) ?? {
        date: dateKey,
        deliveries: 0,
        totalDepartureM3: 0,
        totalArrivalM3: 0,
        totalDeviationM3: 0,
      };
      current.deliveries += 1;
      current.totalDepartureM3 += resolved.departure ?? 0;
      current.totalArrivalM3 += resolved.arrival ?? 0;
      current.totalDeviationM3 += resolved.difference ?? 0;
      map.set(dateKey, current);
    });

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        totalDepartureM3: Number(row.totalDepartureM3.toFixed(2)),
        totalArrivalM3: Number(row.totalArrivalM3.toFixed(2)),
        totalDeviationM3: Number(row.totalDeviationM3.toFixed(2)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [deliveries]);

  const groupedVehicleRows = useMemo<GroupedVehicleRow[]>(() => {
    if (!report) return [];

    const map = new Map<string, GroupedVehicleRow>();

    deliveries.forEach((row) => {
      const dateKey = toDateKey(row.arrivalAt ?? row.departureAt) ?? 'Sin fecha';
      const resolved = getResolvedM3(row);
      const obra = row.constSite?.name || report.constSite?.name || '—';
      const client = row.client?.companyname || row.client?.name || '—';
      const vehicleId = row.vehicle?.vehicleid || '—';
      const plate = resolveVehicleLabel(row);
      const conductor = row.driver?.name || '—';

      const groupKey = `${dateKey}-${vehicleId}-${plate}-${obra}-${client}-${conductor}`;

      let transitTimeMs = 0;
      if (row.departureAt && row.arrivalAt) {
        const depTime = new Date(row.departureAt).getTime();
        const arrTime = new Date(row.arrivalAt).getTime();
        if (!isNaN(depTime) && !isNaN(arrTime)) {
          transitTimeMs = Math.max(0, arrTime - depTime);
        }
      }

      const current = map.get(groupKey) ?? {
        id: groupKey,
        vehicleId,
        plate,
        conductor,
        obra,
        client,
        date: dateKey,
        totalDepartureM3: 0,
        totalArrivalM3: 0,
        totalDeviationM3: 0,
        totalDeliveries: 0,
        totalTransitTimeMs: 0,
        transitTimeFormatted: '',
      };

      current.totalDeliveries += 1;
      current.totalDepartureM3 += resolved.departure ?? 0;
      current.totalArrivalM3 += resolved.arrival ?? 0;
      current.totalDeviationM3 += resolved.difference ?? 0;
      current.totalTransitTimeMs += transitTimeMs;

      map.set(groupKey, current);
    });

    return Array.from(map.values()).map(row => {
      let formattedTime = '—';
      if (row.totalTransitTimeMs > 0) {
        const totalMinutes = Math.floor(row.totalTransitTimeMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        formattedTime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      }
      
      return {
        ...row,
        totalDepartureM3: Number(row.totalDepartureM3.toFixed(2)),
        totalArrivalM3: Number(row.totalArrivalM3.toFixed(2)),
        totalDeviationM3: Number(row.totalDeviationM3.toFixed(2)),
        transitTimeFormatted: formattedTime,
      };
    }).sort((a, b) => a.date.localeCompare(b.date) || a.plate.localeCompare(b.plate));
  }, [deliveries, report]);

  const resumen = useMemo(() => {
    if (!report) return null;
    if (!abscisaFilter) return report.summary;

    let totalM3Departed = 0;
    let totalM3Delivered = 0;
    const uniqueVehiclesSet = new Set<string>();

    deliveries.forEach((d) => {
      totalM3Departed += d.departureM3Corrected ?? d.departureM3 ?? 0;
      totalM3Delivered += d.arrivalM3Corrected ?? d.arrivalM3 ?? 0;
      if (d.vehicle) {
        uniqueVehiclesSet.add(d.vehicle.plate || d.vehicle.vehicleid || '');
      }
    });

    return {
      totalDeliveries: deliveries.length,
      totalM3Departed: Number(totalM3Departed.toFixed(2)),
      totalM3Delivered: Number(totalM3Delivered.toFixed(2)),
      deviation: Number((totalM3Departed - totalM3Delivered).toFixed(2)),
      uniqueVehicles: uniqueVehiclesSet.size,
      uniqueOwners: report.summary.uniqueOwners,
      uniqueConstSites: report.summary.uniqueConstSites ?? 1,
      uniqueInternalVehicles: report.summary.uniqueInternalVehicles ?? 0,
      uniqueExternalVehicles: report.summary.uniqueExternalVehicles ?? 0,
    };
  }, [report, deliveries, abscisaFilter]);

  const handleExportExcel = () => {
    if (!report) {
      toast.error('Primero genera el reporte');
      return;
    }

    const headerInfo = formatMaterialType(report.material.materialType);

    const resumenSheet = [
      {
        Tipo: 'Reporte de Material',
        Material: formatMaterialType(report.material.materialType),
        Obra: report.constSite ? report.constSite.name : 'Todas',
        'Periodo inicio': formatDate(report.period.startDate),
        'Periodo fin': formatDate(report.period.endDate),
        'Total viajes': report.summary.totalDeliveries,
        'M3 Salida': report.summary.totalM3Departed,
        'M3 Llegada': report.summary.totalM3Delivered,
        'Desviación': report.summary.deviation,
        'Vehículos únicos': report.summary.uniqueVehicles,
        'Vehículos internos': report.summary.uniqueInternalVehicles ?? 0,
        'Vehículos externos': report.summary.uniqueExternalVehicles ?? 0,
        'Propietarios únicos': report.summary.uniqueOwners ?? '—',
        'Obras vinculadas': report.summary.uniqueConstSites ?? 1,
      },
    ];

    const exportDetails = groupedVehicleRows.length > 0
      ? groupedVehicleRows.map((row) => ({
          Fecha: row.date !== 'Sin fecha' ? formatDate(row.date) : '—',
          'ID Vehículo': row.vehicleId,
          Vehículo: row.plate,
          Conductor: row.conductor,
          Obra: row.obra,
          Cliente: row.client,
          Viajes: row.totalDeliveries,
          'Tiempo Transcurrido': row.transitTimeFormatted,
          'M3 Salida': row.totalDepartureM3,
          'M3 Llegada': row.totalArrivalM3,
          'Desviación M3': row.totalDeviationM3,
        }))
      : [{ Mensaje: 'Sin movimientos en el periodo seleccionado' }];

    const dailySheet = dailySummary.map((row) => ({
      Fecha: formatDate(row.date),
      Movimientos: row.deliveries,
      'M3 Salida': row.totalDepartureM3,
      'M3 Llegada': row.totalArrivalM3,
      'Desviación M3': row.totalDeviationM3,
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(resumenSheet), 'Resumen');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportDetails), 'Detalle');
    if (dailySheet.length > 0) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dailySheet), 'Resumen diario');
    }

    const safeName = sanitizeFileName(headerInfo || 'materiales');
    XLSX.writeFile(workbook, `reporte_materiales_${safeName}_${startDate}_${endDate}.xlsx`);
    if (groupedVehicleRows.length === 0) {
      toast('Reporte sin movimientos. Se exportó el resumen.', { icon: 'ℹ️' });
      return;
    }
    toast.success('Excel generado correctamente');
  };

  const columns = [
    { header: 'Fecha', accessor: (row: GroupedVehicleRow) => row.date !== 'Sin fecha' ? formatDate(row.date) : '—' },
    { header: 'ID Vehículo', accessor: 'vehicleId' as keyof GroupedVehicleRow },
    { header: 'Vehículo / Placa', accessor: 'plate' as keyof GroupedVehicleRow },
    { header: 'Conductor', accessor: 'conductor' as keyof GroupedVehicleRow },
    { header: 'Obra', accessor: 'obra' as keyof GroupedVehicleRow },
    { header: 'Cliente', accessor: 'client' as keyof GroupedVehicleRow },
    { header: 'Viajes', accessor: 'totalDeliveries' as keyof GroupedVehicleRow },
    { header: 'Tiempo Transcurrido', accessor: 'transitTimeFormatted' as keyof GroupedVehicleRow },
    {
      header: 'M3 Salida',
      accessor: (row: GroupedVehicleRow) => formatNumber(row.totalDepartureM3),
    },
    {
      header: 'M3 Llegada',
      accessor: (row: GroupedVehicleRow) => formatNumber(row.totalArrivalM3),
    },
    {
      header: 'Desviación',
      accessor: (row: GroupedVehicleRow) => {
        const dev = row.totalDeviationM3;
        return (
          <span className={dev < 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
            {dev > 0 ? `+${formatNumber(dev)}` : formatNumber(dev)}
          </span>
        );
      },
    },
  ];

  const dailyColumns = [
    { header: 'Fecha', accessor: (row: DailySummaryRow) => formatDate(row.date) },
    { header: 'Movimientos', accessor: 'deliveries' as keyof DailySummaryRow },
    {
      header: 'M3 Salida',
      accessor: (row: DailySummaryRow) => formatNumber(row.totalDepartureM3),
    },
    {
      header: 'M3 Llegada',
      accessor: (row: DailySummaryRow) => formatNumber(row.totalArrivalM3),
    },
    {
      header: 'Desviación',
      accessor: (row: DailySummaryRow) => {
        const dev = row.totalDeviationM3;
        return (
          <span className={dev < 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
            {dev > 0 ? `+${formatNumber(dev)}` : formatNumber(dev)}
          </span>
        );
      },
    },
  ];

  const isAnyLoading = isObrasLoading || isGenerating || isMaterialesLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-rose-100 p-2 rounded-lg">
            <Package size={22} className="text-rose-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Reportes de Materiales</h2>
            <p className="text-gray-600 text-sm mt-0.5">
              Consulta el material transportado por obra y exporta a Excel
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          icon={<Download size={16} />}
          onClick={handleExportExcel}
          disabled={!report}
        >
          Exportar Excel
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <SearchableSelect
            label="Material"
            options={materialOptions}
            value={materialId}
            onChange={setMaterialId}
            placeholder="Seleccione un material"
          />

          <SearchableSelect
            label="Obra"
            options={obraOptions}
            value={constSiteId}
            onChange={setConstSiteId}
            placeholder="Todas las obras"
          />

          <SearchableSelect
            label="Abscisa"
            options={abscisaOptions}
            value={abscisaFilter}
            onChange={setAbscisaFilter}
            placeholder="Todas las abscisas"
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
              style={{ backgroundColor: '#e11d48' }}
            >
              Generar reporte
            </Button>
          </div>
        </div>
      </div>

      {isAnyLoading && (
        <div className="flex justify-center items-center py-6">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rose-600" />
        </div>
      )}

      {report && resumen && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
              <div className="lg:col-span-2">
                <p className="text-gray-500 text-sm">Referencia (Material)</p>
                <p className="font-semibold text-gray-900 uppercase">
                  {formatMaterialType(report.material.materialType)}
                </p>
                <p className="text-gray-600 text-sm">
                  {report.constSite ? `${report.constSite.name} — ${report.constSite.province ?? ''} ${report.constSite.canton ?? ''}`.trim() : 'Todas las obras'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Periodo</p>
                <p className="font-semibold text-gray-900">
                  {formatDate(report.period.startDate)} al<br/>{formatDate(report.period.endDate)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">M3 Salida</p>
                <p className="font-semibold text-blue-700">
                  {formatNumber(resumen.totalM3Departed)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">M3 Llegada</p>
                <p className="font-semibold text-emerald-700">
                  {formatNumber(resumen.totalM3Delivered)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Desviación</p>
                <p className={`font-semibold ${resumen.deviation < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {resumen.deviation > 0
                    ? `+${formatNumber(resumen.deviation)}`
                    : formatNumber(resumen.deviation)}{' '}
                  m³
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Viajes</p>
                <p className="font-semibold text-gray-900">{resumen.totalDeliveries}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-100 pt-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Vehículos int. / ext.</p>
                <p className="text-lg font-bold text-gray-900">
                  {resumen.uniqueInternalVehicles ?? 0} / {resumen.uniqueExternalVehicles ?? 0}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Obras vinculadas</p>
                <p className="text-lg font-bold text-gray-900">
                  {resumen.uniqueConstSites ?? 1}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Propietarios únicos</p>
                <p className="text-lg font-bold text-gray-900">
                  {resumen.uniqueOwners ?? '—'}
                </p>
              </div>
            </div>
          </div>

          {dailySummary.length > 0 && (
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-gray-900 font-semibold mb-3">Resumen diario</h3>
              <Table
                data={dailySummary}
                columns={dailyColumns}
                emptyMessage="No hay movimientos en el periodo seleccionado"
              />
            </div>
          )}

          <div className="bg-white rounded-lg shadow">
            <Table
              data={groupedVehicleRows}
              columns={columns}
              emptyMessage="No hay movimientos en el periodo seleccionado"
            />
          </div>
        </div>
      )}
    </div>
  );
};
