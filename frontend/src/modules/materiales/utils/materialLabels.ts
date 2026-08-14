import type { Material } from '../types';

/**
 * Nombre comercial de cada material, tal como lo maneja la empresa.
 *
 * En la base el material se guarda como un enum (`MaterialType`), que solo admite
 * letras, números y guión bajo. Los nombres reales llevan `#`, `/`, puntos y
 * paréntesis — "PIEDRA 4 (19-38 MM)", "MAT. TRITURADO PARA RIPIO" — así que el
 * nombre visible vive acá y el código en la base.
 *
 * Debe coincidir con `backend/prisma/data/materiales.json`, que es la fuente que
 * generó tanto este mapa como el enum y las migraciones.
 */
export const MATERIAL_LABELS: Record<string, string> = {
  ARENA_DE_BANCO: 'ARENA DE BANCO',
  ARENA_DE_MAR: 'ARENA DE MAR',
  ARENA_DE_PLAYA: 'ARENA DE PLAYA',
  ARENA_DE_RIO: 'ARENA DE RIO',
  ARENA_DE_RIO_COLIMES: 'ARENA DE RIO COLIMES',
  ARENA_FINA: 'ARENA FINA',
  ARENA_FINA_LAVADA: 'ARENA FINA LAVADA',
  ARENA_HOMOGENIZADA: 'ARENA HOMOGENIZADA',
  ARENA_LAVADA: 'ARENA LAVADA',
  ARENA_LISTA_PARA_HORMIGON: 'ARENA LISTA PARA HORMIGON',
  BASALTO_SAN_CARLOS: 'BASALTO SAN CARLOS',
  BASALTO_SIN_CLASIFICAR: 'BASALTO SIN CLASIFICAR',
  BASE: 'BASE',
  BASE_CEMENTO: 'BASE CEMENTO',
  BASE_CIUDAD_RODRIGO: 'BASE CIUDAD RODRIGO',
  BASE_CLASE_1_A: 'BASE CLASE 1-A',
  CASCAJO: 'CASCAJO',
  CASCAJO_CRIBADO: 'CASCAJO CRIBADO',
  CISCO: 'CISCO',
  CISCO_CRUDO: 'CISCO CRUDO',
  CISCO_LAVADO: 'CISCO LAVADO',
  CISCO_P_TUBERIA: 'CISCO P/TUBERIA',
  CRUDO: 'CRUDO',
  ESCOMBROS: 'ESCOMBROS',
  FRESADO: 'FRESADO',
  LASTRE: 'LASTRE',
  MAT_TRITURADO_PARA_RIPIO: 'MAT. TRITURADO PARA RIPIO',
  MATERIAL_DE_MEJORAMIENTO: 'MATERIAL DE MEJORAMIENTO',
  MEJORAMIENTO: 'MEJORAMIENTO',
  MEJORAMIENTO_CRIBADO: 'MEJORAMIENTO CRIBADO',
  MEJORAMIENTO_MTOP: 'MEJORAMIENTO MTOP',
  MEJORAMIENTO_S_C: 'MEJORAMIENTO S/C',
  MEZCLA_ASFALTICA: 'MEZCLA ASFALTICA',
  P_BOLON: 'P-BOLON',
  PIEDRA_1_2_VSI: 'PIEDRA 1/2 VSI',
  PIEDRA_2_4: 'PIEDRA 2 -4',
  PIEDRA_3_4: 'PIEDRA 3/4',
  PIEDRA_3_8_VSI: 'PIEDRA 3/8 VSI',
  PIEDRA_4_19_38_MM: 'PIEDRA 4 (19-38 MM)',
  PIEDRA_6: 'PIEDRA # 6',
  PIEDRA_6_LAVADA: 'PIEDRA #6 LAVADA',
  PIEDRA_67: 'PIEDRA # 67',
  PIEDRA_7: 'PIEDRA # 7',
  PIEDRA_7_8: 'PIEDRA 7/8',
  PIEDRA_8_3_8: 'PIEDRA #8 3/8',
  PIEDRA_BASE: 'PIEDRA BASE',
  PIEDRA_BLANCA: 'PIEDRA BLANCA',
  PIEDRA_BOLA: 'PIEDRA BOLA',
  PIEDRA_BOLA_BANCO: 'PIEDRA BOLA BANCO',
  PIEDRA_BOLA_SELECCIONADA: 'PIEDRA BOLA SELECCIONADA',
  PIEDRA_BOLON: 'PIEDRA BOLON',
  PIEDRA_DEFENSA: 'PIEDRA DEFENSA',
  PIEDRA_ESCOLLERA: 'PIEDRA ESCOLLERA',
  PIEDRA_FILTRANTE: 'PIEDRA FILTRANTE',
  PIEDRA_FILTRANTE_CAFE: 'PIEDRA FILTRANTE CAFE',
  PIEDRA_HOMO_57: 'PIEDRA HOMO #57',
  PIEDRA_TRANSICION: 'PIEDRA TRANSICION',
  PIEDRAPLEN: 'PIEDRAPLEN',
  PRESTAMO_IMPORTADO: 'PRESTAMO IMPORTADO',
  RIPIO: 'RIPIO',
  ROCARENA: 'ROCARENA',
  SUB_BASE: 'SUB-BASE',
  SUB_BASE_CLASE_3: 'SUB-BASE CLASE 3',
  TRITURADO_4_10: 'TRITURADO 4-10',
};

/**
 * Nombre del material listo para mostrar. Si llega un código que todavía no está
 * en el mapa (porque se agregó en la base antes que acá), lo deja legible en vez
 * de romper la pantalla.
 */
export const formatMaterialType = (value?: string | null): string => {
  if (!value) return '—';
  return MATERIAL_LABELS[value] ?? value.replace(/_/g, ' ');
};

/** Ordena por nombre visible, que es lo que el usuario está leyendo en la lista. */
export const compareMaterialLabel = (a?: string | null, b?: string | null): number =>
  formatMaterialType(a).localeCompare(formatMaterialType(b), 'es');

/** Materiales ordenados alfabéticamente por su nombre comercial. */
export const sortMateriales = <T extends Pick<Material, 'materialType'>>(materiales: T[]): T[] =>
  [...materiales].sort((a, b) => compareMaterialLabel(a.materialType, b.materialType));

/** Opciones `{ value, label }` para los selects de material. */
export const materialOptions = (materiales: Material[]) =>
  sortMateriales(materiales).map((m) => ({
    value: String(m.id),
    label: formatMaterialType(m.materialType),
  }));
