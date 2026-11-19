import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  ChevronDown,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  Pencil,
  Save,
  Undo2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/shared/components/Modal';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { formatDateTime, formatNumber } from '@/shared/utils/format';
import { formatMaterialType } from '@/modules/materiales/utils/materialLabels';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useLiquidacion } from '../hooks/useLiquidacion';
import { liquidacionService } from '../services/liquidacionService';
import { generarExcelLiquidacion, generarPdfLiquidacion } from '../utils/liquidacionExport';
import { CambiosLiquidacion, EditarLiquidacionPayload, LiquidacionDetalle } from '../types';
import {
  formatearDia,
  formatearDinero,
  mensajeDeError,
  normalizarPrecio,
  precioValido,
  sumarPrecios,
} from '../utils/liquidacion';

interface LiquidacionDetalleModalProps {
  /** null = cerrado. */
  liquidacionId: number | null;
  onClose: () => void;
  /** Después de guardar una edición (para recargar el historial). */
  onGuardada: () => void;
}

interface ViajeBorrador {
  tripId: number;
  precio: string;
  quitado: boolean;
}

interface Borrador {
  fecha: string;
  observacion: string;
  viajes: ViajeBorrador[];
}

const MOTIVO_MIN = 5;

const crearBorrador = (l: LiquidacionDetalle): Borrador => ({
  fecha: l.fecha,
  observacion: l.observacion ?? '',
  viajes: l.viajes.map((v) => ({ tripId: v.tripId, precio: String(v.precio), quitado: false })),
});

const centavos = (n: number) => Math.round(n * 100);

/** Lista legible de lo que cambió en una edición. */
const describirCambios = (c: CambiosLiquidacion): string[] => {
  const lineas: string[] = [];
  c.precios?.forEach((p) =>
    lineas.push(
      `${p.codigo ?? `Viaje #${p.tripId}`}: precio ${formatearDinero(p.antes)} → ${formatearDinero(p.despues)}`,
    ),
  );
  c.quitados?.forEach((q) =>
    lineas.push(`Quitado ${q.codigo ?? `viaje #${q.tripId}`} (${formatearDinero(q.precio)})`),
  );
  if (c.fecha) lineas.push(`Fecha: ${formatearDia(c.fecha.antes)} → ${formatearDia(c.fecha.despues)}`);
  if (c.observacion) {
    lineas.push(`Observación: "${c.observacion.antes ?? '—'}" → "${c.observacion.despues ?? '—'}"`);
  }
  if (c.montoTotal) {
    lineas.push(
      `Total: ${formatearDinero(c.montoTotal.antes)} → ${formatearDinero(c.montoTotal.despues)}`,
    );
  }
  if (c.anulada) {
    lineas.push(
      `Liquidación ANULADA: ${c.anulada.viajes} viaje(s) por ${formatearDinero(c.anulada.montoTotal)} volvieron a Liquidaciones de viajes`,
    );
  }
  return lineas;
};

/**
 * Detalle de una liquidación del historial.
 * Lectura → "Editar" → (al cambiar algo) "Guardar" → motivo obligatorio → PATCH.
 */
export const LiquidacionDetalleModal = ({
  liquidacionId,
  onClose,
  onGuardada,
}: LiquidacionDetalleModalProps) => {
  const { canEdit, canDelete } = usePermissions('liquidaciones');
  const { liquidacion, isLoading, setLiquidacion } = useLiquidacion(liquidacionId);

  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [verEdiciones, setVerEdiciones] = useState(false);
  // Anular: paso con motivo obligatorio dentro del mismo modal.
  const [anulando, setAnulando] = useState(false);
  const [motivoAnular, setMotivoAnular] = useState('');
  const [guardandoAnular, setGuardandoAnular] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);

  const editando = borrador !== null;

  // Al abrir otra liquidación (o cerrar), se sale del modo edición.
  useEffect(() => {
    setBorrador(null);
    setPidiendoMotivo(false);
    setMotivo('');
    setVerEdiciones(false);
    setAnulando(false);
    setMotivoAnular('');
  }, [liquidacionId]);

  const anular = async () => {
    if (!liquidacion) return;
    const motivoLimpio = motivoAnular.trim();
    if (motivoLimpio.length < MOTIVO_MIN) {
      toast.error(`El motivo debe tener al menos ${MOTIVO_MIN} caracteres`);
      return;
    }
    setGuardandoAnular(true);
    try {
      const anulada = await liquidacionService.anular(liquidacion.id, motivoLimpio);
      toast.success(`Liquidación ${anulada.codigo} anulada`);
      setLiquidacion(anulada);
      setAnulando(false);
      setMotivoAnular('');
      onGuardada();
    } catch (error) {
      console.error(error);
      toast.error(mensajeDeError(error, 'No se pudo anular la liquidación'));
    } finally {
      setGuardandoAnular(false);
    }
  };

  const exportarPdf = async () => {
    if (!liquidacion) return;
    setExportandoPdf(true);
    try {
      await generarPdfLiquidacion(liquidacion);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo generar el PDF');
    } finally {
      setExportandoPdf(false);
    }
  };

  // ─── Cambios del borrador frente a lo guardado ────────────────────────────
  const cambios = useMemo(() => {
    if (!liquidacion || !borrador) return null;
    const originales = new Map(liquidacion.viajes.map((v) => [v.tripId, v.precio]));
    const quitados = borrador.viajes.filter((v) => v.quitado);
    const preciosCambiados = borrador.viajes.filter((v) => {
      if (v.quitado) return false;
      const nuevo = precioValido(v.precio);
      return nuevo === null || centavos(nuevo) !== centavos(originales.get(v.tripId) ?? 0);
    });
    const fecha = borrador.fecha !== liquidacion.fecha;
    const observacion = borrador.observacion.trim() !== (liquidacion.observacion ?? '');
    return {
      quitados,
      preciosCambiados,
      fecha,
      observacion,
      hay: quitados.length > 0 || preciosCambiados.length > 0 || fecha || observacion,
    };
  }, [liquidacion, borrador]);

  const hayCambios = Boolean(cambios?.hay);

  const totalBorrador = useMemo(() => {
    if (!borrador) return liquidacion?.montoTotal ?? 0;
    return sumarPrecios(
      borrador.viajes.filter((v) => !v.quitado).map((v) => precioValido(v.precio) ?? 0),
    );
  }, [borrador, liquidacion]);

  // ─── Acciones ─────────────────────────────────────────────────────────────
  const cerrar = () => {
    if (guardando) return;
    if (hayCambios && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
    onClose();
  };

  const cancelarEdicion = () => {
    if (hayCambios && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
    setBorrador(null);
    setPidiendoMotivo(false);
    setMotivo('');
  };

  const cambiarViaje = (tripId: number, cambio: Partial<ViajeBorrador>) =>
    setBorrador((b) =>
      b ? { ...b, viajes: b.viajes.map((v) => (v.tripId === tripId ? { ...v, ...cambio } : v)) } : b,
    );

  const pedirMotivo = () => {
    if (!borrador) return;
    const activos = borrador.viajes.filter((v) => !v.quitado);
    if (activos.length === 0) {
      toast.error('Una liquidación debe tener al menos un viaje');
      return;
    }
    if (activos.some((v) => precioValido(v.precio) === null)) {
      toast.error('Cada viaje debe tener un precio mayor que 0');
      return;
    }
    if (!borrador.fecha) {
      toast.error('La fecha es obligatoria');
      return;
    }
    setPidiendoMotivo(true);
  };

  const guardar = async () => {
    if (!liquidacion || !borrador || !cambios) return;
    const motivoLimpio = motivo.trim();
    if (motivoLimpio.length < MOTIVO_MIN) {
      toast.error(`El motivo debe tener al menos ${MOTIVO_MIN} caracteres`);
      return;
    }

    const payload: EditarLiquidacionPayload = { motivo: motivoLimpio };
    if (cambios.fecha) payload.fecha = borrador.fecha;
    if (cambios.observacion) payload.observacion = borrador.observacion.trim() || null;
    if (cambios.quitados.length > 0 || cambios.preciosCambiados.length > 0) {
      payload.viajes = borrador.viajes
        .filter((v) => !v.quitado)
        .map((v) => ({ tripId: v.tripId, precio: precioValido(v.precio) as number }));
    }

    setGuardando(true);
    try {
      const actualizada = await liquidacionService.editar(liquidacion.id, payload);
      toast.success('Liquidación actualizada');
      setLiquidacion(actualizada);
      setBorrador(null);
      setPidiendoMotivo(false);
      setMotivo('');
      setVerEdiciones(true);
      onGuardada();
    } catch (error) {
      console.error(error);
      // Se queda en edición sin perder el borrador.
      toast.error(mensajeDeError(error, 'No se pudo guardar la edición'));
    } finally {
      setGuardando(false);
    }
  };

  // ─── Pie del modal según el estado ────────────────────────────────────────
  const activa = liquidacion?.estado !== 'ANULADA';

  const footer = !liquidacion ? undefined : anulando ? (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-night-text">
          Motivo de la anulación <span className="text-red-600">*</span>
        </label>
        <textarea
          autoFocus
          value={motivoAnular}
          maxLength={500}
          rows={2}
          onChange={(e) => setMotivoAnular(e.target.value)}
          placeholder="Ej. Se liquidó al cliente equivocado"
          className="border border-gray-300 dark:border-night-border dark:bg-night-raised dark:text-night-text rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
        <p className="text-xs text-red-700 dark:text-red-300">
          La liquidación quedará ANULADA en el historial (no se borra) y sus{' '}
          {liquidacion.viajes.length} viaje(s) volverán a Liquidaciones de viajes. No se puede deshacer.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={guardandoAnular}
          onClick={() => {
            setAnulando(false);
            setMotivoAnular('');
          }}
        >
          Volver
        </Button>
        <Button
          variant="danger"
          icon={<Ban size={16} />}
          isLoading={guardandoAnular}
          disabled={guardandoAnular || motivoAnular.trim().length < MOTIVO_MIN}
          onClick={anular}
        >
          Confirmar anulación
        </Button>
      </div>
    </div>
  ) : !editando ? (
    <div className="flex flex-col-reverse md:flex-row md:justify-between gap-2">
      <div className="flex gap-2">
        <Button
          variant="outline"
          icon={<FileDown size={16} />}
          isLoading={exportandoPdf}
          onClick={exportarPdf}
        >
          PDF
        </Button>
        <Button
          variant="outline"
          icon={<FileSpreadsheet size={16} />}
          onClick={() => generarExcelLiquidacion(liquidacion)}
        >
          Excel
        </Button>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={cerrar}>
          Cerrar
        </Button>
        {activa && canDelete && (
          <Button variant="danger" icon={<Ban size={16} />} onClick={() => setAnulando(true)}>
            Anular
          </Button>
        )}
        {activa && canEdit && (
          <Button
            variant="primary"
            icon={<Pencil size={16} />}
            onClick={() => setBorrador(crearBorrador(liquidacion))}
          >
            Editar
          </Button>
        )}
      </div>
    </div>
  ) : pidiendoMotivo ? (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-night-text">
          Motivo de la edición <span className="text-red-600">*</span>
        </label>
        <textarea
          autoFocus
          value={motivo}
          maxLength={500}
          rows={2}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej. El precio acordado con el cliente cambió"
          className="border border-gray-300 dark:border-night-border dark:bg-night-raised dark:text-night-text rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {cambios && cambios.quitados.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {cambios.quitados.length} viaje(s) volverán a Liquidaciones de viajes.
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setPidiendoMotivo(false)} disabled={guardando}>
          Volver
        </Button>
        <Button
          variant="primary"
          icon={<Save size={16} />}
          isLoading={guardando}
          disabled={guardando || motivo.trim().length < MOTIVO_MIN}
          onClick={guardar}
        >
          Confirmar y guardar
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={cancelarEdicion}>
        Cancelar
      </Button>
      {hayCambios && (
        <Button variant="primary" icon={<Save size={16} />} onClick={pedirMotivo}>
          Guardar
        </Button>
      )}
    </div>
  );

  const etiqueta = 'text-gray-500 dark:text-night-muted';
  const valor = 'font-medium text-gray-900 dark:text-night-text';

  return (
    <Modal
      isOpen={liquidacionId !== null}
      onClose={cerrar}
      title={liquidacion ? `Liquidación ${liquidacion.codigo}` : 'Liquidación'}
      size="xl"
      footer={footer}
    >
      {isLoading && !liquidacion && (
        <div className="flex justify-center items-center py-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      )}

      {liquidacion && (
        <div className="space-y-5 text-sm">
          {liquidacion.estado === 'ANULADA' && (
            <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-4 text-red-800 dark:text-red-200">
              <p className="font-semibold">Liquidación ANULADA</p>
              <p className="mt-1">
                Por <span className="font-semibold">{liquidacion.anuladaPor?.name ?? '—'}</span> el{' '}
                {liquidacion.anuladaEn ? formatDateTime(liquidacion.anuladaEn) : '—'}.
              </p>
              <p className="mt-1">
                <span className="font-semibold">Motivo:</span> {liquidacion.motivoAnulacion || '—'}
              </p>
              <p className="mt-1 text-xs">
                Los viajes se muestran como estaban al anularla; ya volvieron a Liquidaciones de viajes.
              </p>
            </div>
          )}

          {/* Cabecera */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 bg-gray-50 dark:bg-night-raised p-4 rounded-lg">
            <div>
              <p className={etiqueta}>Código</p>
              <p className={`${valor} font-mono`}>{liquidacion.codigo}</p>
            </div>
            <div>
              <p className={etiqueta}>Obra</p>
              <p className={valor}>{liquidacion.obra?.name || '—'}</p>
              {(liquidacion.obra?.province || liquidacion.obra?.canton) && (
                <p className="text-xs text-gray-500 dark:text-night-muted">
                  {[liquidacion.obra.province, liquidacion.obra.canton].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            <div>
              <p className={etiqueta}>Cliente</p>
              <p className={valor}>
                {liquidacion.cliente?.companyname || liquidacion.cliente?.name || '—'}
              </p>
              {liquidacion.cliente?.ruc && (
                <p className="text-xs text-gray-500 dark:text-night-muted">RUC {liquidacion.cliente.ruc}</p>
              )}
            </div>
            <div>
              <p className={etiqueta}>Fecha</p>
              {editando ? (
                <Input
                  type="date"
                  value={borrador!.fecha}
                  onChange={(e) => setBorrador((b) => (b ? { ...b, fecha: e.target.value } : b))}
                />
              ) : (
                <p className={valor}>{formatearDia(liquidacion.fecha)}</p>
              )}
            </div>
            <div>
              <p className={etiqueta}>Monto total</p>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                {formatearDinero(totalBorrador)}
              </p>
              {editando && centavos(totalBorrador) !== centavos(liquidacion.montoTotal) && (
                <p className="text-xs text-gray-500 dark:text-night-muted line-through">
                  {formatearDinero(liquidacion.montoTotal)}
                </p>
              )}
            </div>
          </div>

          {/* Observación */}
          <div>
            <p className={`${etiqueta} mb-1`}>Observación</p>
            {editando ? (
              <textarea
                value={borrador!.observacion}
                maxLength={500}
                rows={2}
                onChange={(e) => setBorrador((b) => (b ? { ...b, observacion: e.target.value } : b))}
                className="w-full border border-gray-300 dark:border-night-border dark:bg-night-raised dark:text-night-text rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <p className="text-gray-800 dark:text-night-text whitespace-pre-line">
                {liquidacion.observacion || '—'}
              </p>
            )}
          </div>

          {/* Viajes */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-night-border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-night-raised text-gray-600 dark:text-night-muted">
                <tr>
                  {['Código', 'Placa', 'ID Vehículo', 'Conductor', 'Material', 'Salida', 'Llegada', 'm³ Sal', 'm³ Lleg', 'Precio'].map(
                    (h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                        {h}
                      </th>
                    ),
                  )}
                  {editando && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-night-border">
                {liquidacion.viajes.map((v) => {
                  const enBorrador = borrador?.viajes.find((b) => b.tripId === v.tripId);
                  const quitado = Boolean(enBorrador?.quitado);
                  return (
                    <tr
                      key={v.tripId}
                      className={quitado ? 'line-through text-gray-400 dark:text-night-subtle' : 'text-gray-800 dark:text-night-text'}
                    >
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs whitespace-nowrap">{v.codigo || `#${v.tripId}`}</span>
                        {v.notaLiquidador && (
                          <p
                            className="mt-0.5 max-w-[14rem] text-xs italic text-gray-500 dark:text-night-muted whitespace-normal no-underline"
                            title="Nota del liquidador"
                          >
                            {v.notaLiquidador}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2">{v.placa || '—'}</td>
                      <td className="px-3 py-2">{v.vehicleid || '—'}</td>
                      <td className="px-3 py-2">{v.conductor || '—'}</td>
                      <td className="px-3 py-2">{v.material ? formatMaterialType(v.material) : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{v.salida ? formatDateTime(v.salida) : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{v.llegada ? formatDateTime(v.llegada) : '—'}</td>
                      <td className="px-3 py-2">{v.m3Salida != null ? formatNumber(v.m3Salida) : '—'}</td>
                      <td className="px-3 py-2">{v.m3Llegada != null ? formatNumber(v.m3Llegada) : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {editando && enBorrador && !quitado ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={`Precio del viaje ${v.codigo || v.tripId}`}
                            value={enBorrador.precio}
                            onChange={(e) => {
                              const normalizado = normalizarPrecio(e.target.value);
                              if (normalizado !== null) cambiarViaje(v.tripId, { precio: normalizado });
                            }}
                            className="w-24 border border-gray-300 dark:border-night-border dark:bg-night-raised dark:text-night-text rounded-md px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        ) : (
                          formatearDinero(v.precio)
                        )}
                      </td>
                      {editando && (
                        <td className="px-3 py-2 no-underline">
                          <Button
                            size="sm"
                            variant="outline"
                            icon={quitado ? <Undo2 size={14} /> : <X size={14} />}
                            onClick={() => cambiarViaje(v.tripId, { quitado: !quitado })}
                          >
                            {quitado ? 'Deshacer' : 'Quitar'}
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-night-raised">
                <tr>
                  <td colSpan={9} className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-night-text">
                    Total
                  </td>
                  <td className="px-3 py-2 font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                    {formatearDinero(totalBorrador)}
                  </td>
                  {editando && <td />}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Auditoría */}
          <div className="text-xs text-gray-500 dark:text-night-muted space-y-0.5">
            <p>
              Creada por <span className="font-semibold">{liquidacion.creadoPor?.name ?? '—'}</span> el{' '}
              {formatDateTime(liquidacion.createdAt)}
            </p>
            {liquidacion.editadoEn && (
              <p>
                Última edición por{' '}
                <span className="font-semibold">{liquidacion.editadoPor?.name ?? '—'}</span> el{' '}
                {formatDateTime(liquidacion.editadoEn)}
              </p>
            )}
          </div>

          {/* Historial de ediciones */}
          {liquidacion.ediciones.length > 0 && (
            <div className="border border-gray-200 dark:border-night-border rounded-lg">
              <button
                type="button"
                onClick={() => setVerEdiciones((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2 text-left font-semibold text-gray-800 dark:text-night-text"
              >
                <span>Historial de ediciones ({liquidacion.ediciones.length})</span>
                {verEdiciones ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              {verEdiciones && (
                <ul className="divide-y divide-gray-100 dark:divide-night-border">
                  {liquidacion.ediciones.map((e) => (
                    <li key={e.id} className="px-4 py-3">
                      <p className="text-gray-800 dark:text-night-text">
                        <span className="font-semibold">{e.usuario?.name ?? 'Usuario eliminado'}</span>
                        <span className="text-gray-500 dark:text-night-muted"> · {formatDateTime(e.fecha)}</span>
                      </p>
                      <p className="mt-1 text-gray-700 dark:text-night-text">
                        <span className="font-semibold">Motivo:</span> {e.motivo}
                      </p>
                      <ul className="mt-1 list-disc pl-5 text-gray-600 dark:text-night-muted">
                        {describirCambios(e.cambios).map((linea, i) => (
                          <li key={i}>{linea}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
