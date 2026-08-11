import { useMemo, useState, useEffect } from 'react';
import HighchartsReact from 'highcharts-react-official';
import Highcharts from 'highcharts';

// ─── Carga dinámica del módulo variable-pie (ESM puro, Vite compatible) ───────
// Se importa dinámicamente para evitar "X is not a function" que ocurre
// con Highcharts v12 + Vite cuando se usa import estático en ESM.
let moduleReady = false;

async function loadVariablePie() {
  if (moduleReady) return;
  try {
    const mod = await import('highcharts/modules/variable-pie');
    // Doble cast a unknown primero para manejar la incompatibilidad de tipos ESM
    const init = ((mod as unknown) as { default?: (h: typeof Highcharts) => void }).default
      ?? (mod as unknown as (h: typeof Highcharts) => void);
    if (typeof init === 'function') init(Highcharts);
    moduleReady = true;
  } catch (e) {
    console.warn('variable-pie module could not be loaded', e);
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface DashboardChartProps {
  totalClientes: number;
  totalPlanificacion: number;
  totalObras: number;
  totalProveedoresMaterial: number;
}

// ─── Paleta de colores coherente con el sistema ───────────────────────────────
const PALETTE = ['#3b82f6', '#ef4444', '#f97316', '#22c55e', '#a855f7'];

// ─── Componente ───────────────────────────────────────────────────────────────
export const DashboardChart = ({
  totalClientes,
  totalPlanificacion,
  totalObras,
  totalProveedoresMaterial,
}: DashboardChartProps) => {

  // Controla cuándo el módulo ya fue cargado para forzar re-render
  const [ready, setReady] = useState(moduleReady);

  useEffect(() => {
    if (moduleReady) {
      setReady(true);
      return;
    }
    loadVariablePie().then(() => setReady(true));
  }, []);

  const options = useMemo<Highcharts.Options>(() => {
    const data = [
      { name: 'Total Clientes',      y: Math.max(totalClientes, 0),      z: Math.max(totalClientes, 0.1)      },
      { name: 'Total Planificación', y: Math.max(totalPlanificacion, 0), z: Math.max(totalPlanificacion, 0.1) },
      { name: 'Total de Obras',      y: Math.max(totalObras, 0),         z: Math.max(totalObras, 0.1)         },
      { name: 'Total Prov. Material',   y: Math.max(totalProveedoresMaterial, 0),   z: Math.max(totalProveedoresMaterial, 0.1)   },
    ].map((item, i) => ({ ...item, color: PALETTE[i] }));

    return {
      chart: {
        type: 'variablepie',
        backgroundColor: '#ffffff',
        style: {
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        },
        animation: { duration: 800 },
        height: 380,
      },

      title: {
        text: 'Distribución General del Sistema',
        style: {
          fontSize: '14px',
          fontWeight: '700',
          color: '#111827',
        },
      },

      subtitle: {
        text: 'Clientes · Planificaciones · Obras · Prov. Material',
        style: { fontSize: '11px', color: '#6b7280' },
      },

      tooltip: {
        headerFormat: '',
        pointFormatter: function (
          this: Highcharts.Point & { z?: number }
        ) {
          return (
            `<span style="color:${this.color}">\u25CF</span> ` +
            `<b>${this.name}</b><br/>Cantidad: <b>${this.y}</b><br/>`
          );
        },
        backgroundColor: '#1f2937',
        borderWidth: 0,
        borderRadius: 8,
        style: { color: '#f9fafb', fontSize: '13px' },
      },

      legend: {
        layout: 'horizontal',
        align: 'center',
        verticalAlign: 'bottom',
        itemStyle: { fontSize: '11px', fontWeight: '500', color: '#374151' },
        itemHoverStyle: { color: '#111827' },
      },

      series: [
        {
          type: 'variablepie',
          name: 'Registros',
          minPointSize: 20,
          innerSize: '20%',
          zMin: 0,
          borderRadius: 6,
          showInLegend: true,
          dataLabels: {
            enabled: true,
            format: '<b>{point.name}</b>: {point.y}',
            style: {
              fontSize: '12px',
              color: '#374151',
              textOutline: 'none',
              fontWeight: '500',
            },
          },
          data,
        },
      ],

      credits: { enabled: false },

      responsive: {
        rules: [
          {
            condition: { maxWidth: 500 },
            chartOptions: {
              series: [
                {
                  type: 'variablepie',
                  dataLabels: { enabled: false },
                },
              ],
              legend: { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' },
            },
          },
        ],
      },
    };
  }, [totalClientes, totalPlanificacion, totalObras, totalProveedoresMaterial]);

  if (!ready) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center justify-center h-[320px]">
        <span className="text-gray-400 text-sm">Cargando gráfico...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        containerProps={{ style: { width: '100%' } }}
      />
    </div>
  );
};
