/**
 * compressImage.ts
 * Comprime imágenes en el navegador usando Canvas API.
 * Sin dependencias externas. Compatible con cualquier formato de imagen
 * soportado por el navegador (JPEG, PNG, WebP, HEIC*, etc.)
 * El resultado siempre es JPEG para máxima compatibilidad con el backend.
 */

export interface CompressOptions {
  /** Ancho máximo en píxeles (mantiene relación de aspecto). Default: 1280 */
  maxWidth?: number;
  /** Alto máximo en píxeles (mantiene relación de aspecto). Default: 1280 */
  maxHeight?: number;
  /** Calidad JPEG entre 0 y 1. Default: 0.82 */
  quality?: number;
  /** Tamaño máximo de salida en bytes. Si la imagen ya es menor, no se comprime. Default: 800KB */
  maxSizeBytes?: number;
}

export interface CompressResult {
  file: File;
  originalSizeKB: number;
  compressedSizeKB: number;
  wasCompressed: boolean;
  savingsPercent: number;
}

/**
 * Carga una imagen desde un File/Blob y la devuelve como HTMLImageElement.
 */
const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/**
 * Calcula las dimensiones finales manteniendo el aspect ratio.
 */
const calculateDimensions = (
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } => {
  if (srcWidth <= maxWidth && srcHeight <= maxHeight) {
    return { width: srcWidth, height: srcHeight };
  }

  const widthRatio = maxWidth / srcWidth;
  const heightRatio = maxHeight / srcHeight;
  const scale = Math.min(widthRatio, heightRatio);

  return {
    width: Math.round(srcWidth * scale),
    height: Math.round(srcHeight * scale),
  };
};

/**
 * Comprime una imagen usando Canvas API.
 * Si el archivo ya es más pequeño que maxSizeBytes y sus dimensiones
 * son menores al límite, se devuelve sin procesar.
 *
 * @param file - Archivo de imagen original
 * @param options - Opciones de compresión
 * @returns Resultado con el archivo comprimido y métricas
 */
export const compressImage = async (
  file: File,
  options: CompressOptions = {},
): Promise<CompressResult> => {
  const {
    maxWidth = 1280,
    maxHeight = 1280,
    quality = 0.82,
    maxSizeBytes = 800 * 1024, // 800 KB
  } = options;

  const originalSizeKB = Math.round(file.size / 1024);

  // Si el archivo ya es pequeño y es JPEG, no recomprimir innecesariamente
  const isAlreadySmall = file.size <= maxSizeBytes;
  const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg';

  if (isAlreadySmall && isJpeg) {
    return {
      file,
      originalSizeKB,
      compressedSizeKB: originalSizeKB,
      wasCompressed: false,
      savingsPercent: 0,
    };
  }

  // Cargar imagen en memoria
  const img = await loadImage(file);
  const { width, height } = calculateDimensions(img.naturalWidth, img.naturalHeight, maxWidth, maxHeight);

  // Dibujar en canvas con las nuevas dimensiones
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Fallback: si canvas no está disponible, devolver original
    return {
      file,
      originalSizeKB,
      compressedSizeKB: originalSizeKB,
      wasCompressed: false,
      savingsPercent: 0,
    };
  }

  // Fondo blanco para transparencias (PNG con alpha → JPEG)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Dibujar con interpolación de alta calidad
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  // Obtener blob JPEG comprimido
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas toBlob devolvió null'));
      },
      'image/jpeg',
      quality,
    );
  });

  // Construir nombre de archivo: cambiar extensión a .jpg
  const originalName = file.name.replace(/\.[^.]+$/, '');
  const compressedFile = new File([blob], `${originalName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });

  const compressedSizeKB = Math.round(compressedFile.size / 1024);
  const savingsPercent =
    originalSizeKB > 0
      ? Math.round(((originalSizeKB - compressedSizeKB) / originalSizeKB) * 100)
      : 0;

  return {
    file: compressedFile,
    originalSizeKB,
    compressedSizeKB,
    wasCompressed: true,
    savingsPercent,
  };
};
