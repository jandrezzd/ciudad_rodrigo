import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, QrCode, Ban } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { MultiSelect } from '@/shared/components/MultiSelect';
import { useProveedoresMateriales } from '@/modules/proveedores-materiales';
import { ventasService } from '../services/ventasService';
import { VentaQr } from '../types';
import { downloadVentaQrImage, downloadVentaQrZip } from '../utils/qrZip';

interface VentaQrModalProps {
  onClose: () => void;
}

/**
 * Alta y descarga de los QR de venta.
 *
 * Generar el QR de una cantera es lo que la convierte en punto de venta: no hay
 * una bandera aparte que pueda quedar en contradicción. Darla de baja es lógico,
 * y las ventas ya registradas se conservan — son hechos ocurridos, no
 * configuración.
 */
export const VentaQrModal = ({ onClose }: VentaQrModalProps) => {
  const { proveedores, isLoading: isLoadingProveedores } = useProveedoresMateriales();

  const [qrs, setQrs] = useState<VentaQr[]>([]);
  const [isLoadingQrs, setIsLoadingQrs] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const cargarQrs = async () => {
    try {
      setIsLoadingQrs(true);
      setQrs(await ventasService.getQrs());
    } catch (error) {
      console.error(error);
      toast.error('No se pudieron cargar los QR de venta');
    } finally {
      setIsLoadingQrs(false);
    }
  };

  useEffect(() => {
    cargarQrs();
  }, []);

  /** Todas las canteras del sistema, aplanadas desde sus proveedores. */
  const canteraOptions = useMemo(() => {
    const opciones = proveedores.flatMap((proveedor) =>
      (proveedor.canteras ?? [])
        .filter((cantera) => cantera.isActive !== false)
        .map((cantera) => ({
          value: String(cantera.id),
          label: `${cantera.nombre ?? `Cantera ${cantera.id}`} — ${
            proveedor.razonsocial ?? proveedor.nombreComercial ?? 'Sin proveedor'
          }`,
        }))
    );
    return opciones.sort((a, b) => a.label.localeCompare(b.label));
  }, [proveedores]);

  const handleGenerar = async () => {
    if (!seleccionadas.length) {
      toast.error('Seleccione al menos una cantera');
      return;
    }

    try {
      setIsGenerating(true);
      const resultado = await ventasService.generateQr(seleccionadas.map(Number));

      if (!resultado.qrUrls.length) {
        toast.error('No se generaron QRs');
        return;
      }

      await downloadVentaQrZip(resultado.qrUrls, 'qrs_ventas.zip');
      toast.success(`QRs generados y descargados: ${resultado.qrUrls.length}`);
      setSeleccionadas([]);
      await cargarQrs();
    } catch (error) {
      console.error(error);
      toast.error('Error al generar los QR de venta');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDescargarUno = async (qr: VentaQr) => {
    try {
      await downloadVentaQrImage(qr.url, `${qr.qrcode}.png`);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo descargar el QR');
    }
  };

  const handleDesactivar = async (qr: VentaQr) => {
    const nombre = qr.cantera?.nombre ?? `Cantera ${qr.canteraId}`;
    const confirmado = window.confirm(
      `¿Dar de baja "${nombre}" como punto de venta?\n\n` +
        'Dejará de aparecer en la app y su QR no podrá escanearse. ' +
        'Las ventas ya registradas se conservan.'
    );
    if (!confirmado) return;

    try {
      await ventasService.deactivateQr(qr.canteraId);
      toast.success('Punto de venta dado de baja');
      await cargarQrs();
    } catch (error) {
      console.error(error);
      toast.error('No se pudo dar de baja el punto de venta');
    }
  };

  return (
    <div className="space-y-5">
      {/* Banner Informativo */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          El QR de venta es <strong>fijo por cantera</strong> y se escanea una vez por cada
          camión que sale. Generarlo habilita a la cantera como punto de venta en la app.
        </p>
        <p className="text-xs text-blue-700 mt-2">
          Regenerar el QR de una cantera reescribe la imagen pero conserva el mismo código,
          así que los QR ya impresos siguen sirviendo.
        </p>
      </div>

      {/* Selector y Generador con capa relativa */}
      <div className="space-y-3 relative z-20">
        <MultiSelect
          label="Canteras"
          placeholder={isLoadingProveedores ? 'Cargando canteras...' : 'Seleccione una o varias'}
          options={canteraOptions}
          values={seleccionadas}
          onChange={setSeleccionadas}
          disabled={isLoadingProveedores}
        />

        <Button
          variant="primary"
          icon={<QrCode size={18} />}
          onClick={handleGenerar}
          isLoading={isGenerating}
          disabled={!seleccionadas.length}
        >
          Generar y descargar ZIP
        </Button>
      </div>

      {/* Listado de Puntos de Venta Activos acotado a 4-5 items con scroll contenido */}
      <div className="relative z-10">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">
          Puntos de venta activos ({qrs.length})
        </h3>

        {isLoadingQrs && (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        )}

        {!isLoadingQrs && !qrs.length && (
          <p className="text-sm text-gray-500 py-4">
            Todavía no hay canteras habilitadas como punto de venta.
          </p>
        )}

        {!isLoadingQrs && qrs.length > 0 && (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto pr-1">
            {qrs.map((qr) => (
              <div key={qr.id} className="flex items-center justify-between gap-3 p-3 hover:bg-gray-50/80 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {qr.cantera?.nombre ?? `Cantera ${qr.canteraId}`}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {qr.qrcode}
                    {qr.cantera?.materialProvider?.razonsocial
                      ? ` · ${qr.cantera.materialProvider.razonsocial}`
                      : ''}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="!bg-blue-200 !text-blue-800 hover:!bg-blue-300 border-none"
                    icon={<Download size={16} />}
                    onClick={() => handleDescargarUno(qr)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="!bg-rose-100 !text-rose-800 hover:!bg-rose-200 border-none"
                    icon={<Ban size={16} />}
                    onClick={() => handleDesactivar(qr)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer del Modal */}
      <div className="flex justify-end pt-2 border-t border-gray-100">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
};