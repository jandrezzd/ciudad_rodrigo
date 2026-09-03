export type DriverTipo = 'INTERNO' | 'EXTERNO';

export type DriverCargo =
  | 'CHOFER_DE_VOLQUETA'
  | 'CHOFER_CAMION'
  | 'CHOFER_DE_FURGONETA'
  | 'CHOFER_DE_CAMIONCITO'
  | 'CHOFER_TANQUERO';

/// Nombre visible del cargo, tal como aparece en el listado de la empresa.
/// Vive acá y no en el enum de Prisma por lo mismo que MATERIAL_LABELS: el
/// enum no admite espacios ni tildes.
export const DRIVER_CARGO_LABELS: Record<DriverCargo, string> = {
  CHOFER_DE_VOLQUETA: 'Chofer de volqueta',
  CHOFER_CAMION: 'Chofer camión',
  CHOFER_DE_FURGONETA: 'Chofer de furgoneta',
  CHOFER_DE_CAMIONCITO: 'Chofer de camioncito',
  CHOFER_TANQUERO: 'Chofer tanquero',
};

export const DRIVER_CARGO_OPTIONS = (
  Object.keys(DRIVER_CARGO_LABELS) as DriverCargo[]
).map((value) => ({ value, label: DRIVER_CARGO_LABELS[value] }));

export const DRIVER_TIPO_LABELS: Record<DriverTipo, string> = {
  INTERNO: 'Interno',
  EXTERNO: 'Externo (proveedor)',
};

export const DRIVER_TIPO_OPTIONS = (
  Object.keys(DRIVER_TIPO_LABELS) as DriverTipo[]
).map((value) => ({ value, label: DRIVER_TIPO_LABELS[value] }));

/// Proveedor (Owner) al que pertenece un chofer externo. El backend lo manda
/// dentro de cada chofer para que la tabla lo muestre sin pedir /owners.
export interface DriverOwner {
  id: number;
  companyname?: string | null;
  name?: string | null;
  ruc?: string | null;
}

export interface Driver {
  id: number;
  name: string;
  document?: string | null;
  phone?: string | null;
  cargo?: DriverCargo | null;
  /// Opcional aunque en la base sea NOT NULL: un backend que todavía no
  /// conozca la columna responde sin ella, y la tabla y los selectores tienen
  /// que seguir siendo legibles en vez de pintar una etiqueta en blanco o
  /// esconder al chofer.
  tipo?: DriverTipo | null;
  ownerId?: number | null;
  owner?: DriverOwner | null;
  isActive?: boolean;
}

export interface DriverFormData {
  name: string;
  document: string;
  phone: string;
  cargo: DriverCargo | '';
  tipo: DriverTipo;
  ownerId: number | null;
}

/// Etiqueta del proveedor para tablas y selectores: razón social, y si no hay,
/// el nombre de la persona.
export const ownerLabel = (owner?: DriverOwner | null): string =>
  owner ? owner.companyname || owner.name || `Proveedor ${owner.id}` : '—';
