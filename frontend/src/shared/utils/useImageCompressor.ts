import { useState, useCallback } from 'react';
import { compressImage, CompressOptions, CompressResult } from '@/shared/utils/compressImage';

interface UseImageCompressorReturn {
  /** Procesa y comprime un File de imagen. Devuelve el resultado o null si falla. */
  compress: (file: File, options?: CompressOptions) => Promise<CompressResult | null>;
  /** true mientras se está comprimiendo */
  isCompressing: boolean;
  /** Resultado de la última compresión */
  lastResult: CompressResult | null;
  /** Error de la última operación */
  error: string | null;
}

/**
 * Hook que envuelve la utilidad compressImage con estado de carga y error.
 * Uso:
 *   const { compress, isCompressing } = useImageCompressor();
 *   const result = await compress(file, { maxWidth: 1280, quality: 0.82 });
 *   if (result) setPhoto(result.file);
 */
export const useImageCompressor = (): UseImageCompressorReturn => {
  const [isCompressing, setIsCompressing] = useState(false);
  const [lastResult, setLastResult] = useState<CompressResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compress = useCallback(
    async (file: File, options?: CompressOptions): Promise<CompressResult | null> => {
      setIsCompressing(true);
      setError(null);
      try {
        const result = await compressImage(file, options);
        setLastResult(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al comprimir la imagen';
        setError(message);
        return null;
      } finally {
        setIsCompressing(false);
      }
    },
    [],
  );

  return { compress, isCompressing, lastResult, error };
};
