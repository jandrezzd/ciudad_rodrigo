import { useEffect, useState, type MouseEvent, type WheelEvent } from 'react';
import { Modal } from '@/shared/components/Modal';
import { formatNumber } from '@/shared/utils/format';

interface MaterialShowcaseProps {
  departureUrl?: string;
  arrivalUrl?: string;
  departureM3?: number | null;
  departureM3Corrected?: number | null;
  arrivalM3?: number | null;
  arrivalM3Corrected?: number | null;
  m3AlertClass?: string;
  vehicleCapacity?: number | null;
}

const renderMaterialPlaceholder = () => (
  <div className="flex min-h-[260px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500 box-border">
    Sin foto de material
  </div>
);

const renderMaterialCard = (
  title: string,
  url: string | undefined,
  onOpen: () => void,
  hasError: boolean,
  onError: () => void,
) => {
  if (!url || hasError) {
    return (
      renderMaterialPlaceholder()
    );
  }

  return (
    <button
      type="button"
      className="group block w-full text-left"
      onClick={onOpen}
    >
      <div className="relative overflow-hidden rounded-xl border border-gray-200">
        <img
          src={url}
          alt={title}
          loading="lazy"
          decoding="async"
          className="h-[260px] w-full bg-white object-contain transition group-hover:scale-[1.01]"
          onError={onError}
        />
        <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
      </div>
    </button>
  );
};

export const MaterialShowcase = ({
  departureUrl,
  arrivalUrl,
  departureM3,
  departureM3Corrected,
  arrivalM3,
  arrivalM3Corrected,
  m3AlertClass = 'font-normal',
  vehicleCapacity,
}: MaterialShowcaseProps) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [departureOffset, setDepartureOffset] = useState({ x: 0, y: 0 });
  const [arrivalOffset, setArrivalOffset] = useState({ x: 0, y: 0 });
  const [departureError, setDepartureError] = useState(false);
  const [arrivalError, setArrivalError] = useState(false);
  const [dragging, setDragging] = useState<{
    pane: 'departure' | 'arrival';
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    setDepartureError(false);
  }, [departureUrl]);

  useEffect(() => {
    setArrivalError(false);
  }, [arrivalUrl]);

  const resetView = () => {
    setZoom(1);
    setDepartureOffset({ x: 0, y: 0 });
    setArrivalOffset({ x: 0, y: 0 });
  };

  const handleOpenPreview = () => {
    resetView();
    setIsPreviewOpen(true);
  };

  const handleClosePreview = () => setIsPreviewOpen(false);

  const handleZoomChange = (value: number) => {
    const nextZoom = Math.min(3, Math.max(1, value));
    setZoom(nextZoom);
    if (nextZoom === 1) {
      setDepartureOffset({ x: 0, y: 0 });
      setArrivalOffset({ x: 0, y: 0 });
    }
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const step = 0.1;
    const nextZoom = zoom + (event.deltaY < 0 ? step : -step);
    handleZoomChange(nextZoom);
  };

  const startDrag = (
    pane: 'departure' | 'arrival',
    event: MouseEvent<HTMLDivElement>,
    offset: { x: number; y: number },
  ) => {
    if (event.button !== 0 || zoom <= 1) return;
    event.preventDefault();
    setDragging({
      pane,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    });
  };

  const handleDrag = (
    pane: 'departure' | 'arrival',
    event: MouseEvent<HTMLDivElement>,
    setOffset: (value: { x: number; y: number }) => void,
  ) => {
    if (!dragging || dragging.pane !== pane) return;
    const dx = event.clientX - dragging.startX;
    const dy = event.clientY - dragging.startY;
    setOffset({ x: dragging.originX + dx, y: dragging.originY + dy });
  };

  const stopDrag = () => setDragging(null);

  const renderPreviewPane = (
    pane: 'departure' | 'arrival',
    title: string,
    url: string | undefined,
    hasError: boolean,
    onError: () => void,
    offset: { x: number; y: number },
    setOffset: (value: { x: number; y: number }) => void,
  ) => {
    if (!url || hasError) {
      return renderMaterialPlaceholder();
    }

    const isFit = zoom <= 1.01;

    return (
      <div
        className={`h-[65vh] min-h-[360px] overflow-hidden rounded-xl border border-gray-200 bg-white p-3 ${
          zoom > 1 ? 'cursor-grab' : 'cursor-default'
        } ${dragging?.pane === pane ? 'cursor-grabbing' : ''}`}
        onMouseDown={(event) => startDrag(pane, event, offset)}
        onMouseMove={(event) => handleDrag(pane, event, setOffset)}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onWheel={handleWheel}
      >
        <div className="flex min-h-full items-center justify-center select-none">
          <img
            src={url}
            alt={title}
            loading="lazy"
            decoding="async"
            className="origin-center transition-transform pointer-events-none"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              width: isFit ? '100%' : 'auto',
              height: isFit ? '100%' : 'auto',
              maxWidth: isFit ? '100%' : 'none',
              maxHeight: isFit ? '100%' : 'none',
              objectFit: isFit ? 'contain' : 'unset',
            }}
            draggable={false}
            onError={onError}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 md:p-6 shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h4 className="text-base font-semibold text-gray-800">Material</h4>
          <p className="text-xs text-gray-500">Vista ampliada de material de salida y de entrada</p>
        </div>
        {vehicleCapacity != null && (
          <div className="mt-4 sm:mt-0 bg-blue-50 text-blue-900 px-5 py-3 rounded-xl border-2 border-blue-200 flex items-center shadow-sm">
            <span className="font-bold text-sm uppercase tracking-wide mr-3 text-blue-700">Capacidad M3:</span>
            <span className="font-extrabold text-3xl">{vehicleCapacity} m³</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Material de salida</p>
          {renderMaterialCard(
            'Material de salida',
            departureUrl,
            handleOpenPreview,
            departureError,
            () => setDepartureError(true),
          )}
          <div className="mt-3 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-gray-700">M3 de salida:</span>
              <span className={m3AlertClass}>{departureM3 !== null && departureM3 !== undefined ? formatNumber(departureM3) : '—'}</span>
            </div>
            {departureM3Corrected !== null && departureM3Corrected !== undefined && (
              <div className="flex justify-between items-center mt-1 pt-1 border-t border-gray-200">
                <span className="font-semibold text-gray-700">M3 corregido:</span>
                <span className={m3AlertClass}>{formatNumber(departureM3Corrected)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Material de llegada</p>
          {renderMaterialCard(
            'Material de llegada',
            arrivalUrl,
            handleOpenPreview,
            arrivalError,
            () => setArrivalError(true),
          )}
          <div className="mt-3 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-gray-700">M3 de llegada:</span>
              <span className={m3AlertClass}>{arrivalM3 !== null && arrivalM3 !== undefined ? formatNumber(arrivalM3) : '—'}</span>
            </div>
            {arrivalM3Corrected !== null && arrivalM3Corrected !== undefined && (
              <div className="flex justify-between items-center mt-1 pt-1 border-t border-gray-200">
                <span className="font-semibold text-gray-700">M3 corregido:</span>
                <span className={m3AlertClass}>{formatNumber(arrivalM3Corrected)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
        title="Material (salida y llegada)"
        size="2xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              Usa los controles para acercar y revisar el material de salida y llegada.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => handleZoomChange(zoom - 0.25)}
              >
                -
              </button>
              <input
                type="range"
                min={1}
                max={3}
                step={0.25}
                value={zoom}
                onChange={(e) => handleZoomChange(Number(e.target.value))}
                className="w-32 accent-blue-600"
              />
              <button
                type="button"
                className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => handleZoomChange(zoom + 0.25)}
              >
                +
              </button>
              <button
                type="button"
                className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                onClick={resetView}
              >
                100%
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Material de salida</p>
              {renderPreviewPane(
                'departure',
                'Material de salida',
                departureUrl,
                departureError,
                () => setDepartureError(true),
                departureOffset,
                setDepartureOffset,
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Material de llegada</p>
              {renderPreviewPane(
                'arrival',
                'Material de llegada',
                arrivalUrl,
                arrivalError,
                () => setArrivalError(true),
                arrivalOffset,
                setArrivalOffset,
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
