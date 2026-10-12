import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EmpresaVendedora, VentaOrdenEstado } from '@prisma/client';

/** ABC-0000: tres letras, guion medio, cuatro números. */
const PLACA_REGEX = /^[A-Z]{3}-\d{4}$/;
const PLACA_MENSAJE = 'CADA PLACA DEBE TENER EL FORMATO ABC-0000';

/** Un material comprometido dentro de la orden, con su cantidad en m³. */
export class VentaOrdenItemDto {
  @Type(() => Number)
  @IsInt()
  materialId: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001, { message: 'LA CANTIDAD ASIGNADA DEBE SER MAYOR A CERO' })
  m3Asignados: number;
}

/** Crea el pedido de un cliente para una de sus obras. */
export class CreateVentaOrdenDto {
  @Type(() => Number)
  @IsInt()
  clientId: number;

  @Type(() => Number)
  @IsInt()
  constSiteId: number;

  /** Empresa nuestra que vende. Obligatoria para clientes públicos y privados. */
  @IsEnum(EmpresaVendedora, { message: 'SELECCIONE LA EMPRESA VENDEDORA' })
  empresaVendedora: EmpresaVendedora;

  /** Transportista que retira el material. Opcional. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  transportistaId?: number;

  @IsOptional()
  @IsString()
  observacion?: string;

  /** Formato viejo, solo informativo. Las órdenes nuevas usan vehicleIds. */
  @IsOptional()
  @IsArray()
  @Matches(PLACA_REGEX, { each: true, message: PLACA_MENSAJE })
  placas?: string[];

  /** Vehículos registrados asignados a la orden. */
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  vehicleIds?: number[];

  @IsArray({ message: 'LA ORDEN DEBE TENER AL MENOS UN MATERIAL' })
  @ValidateNested({ each: true })
  @Type(() => VentaOrdenItemDto)
  items: VentaOrdenItemDto[];
}

/**
 * Edita una orden ya creada. `clientId` y `constSiteId` no se pueden cambiar
 * a propósito: una vez que la orden tiene despachos, cambiar de dueño la
 * dejaría sin sentido, igual que una venta no cambia de vehículo o de cantera.
 */
export class UpdateVentaOrdenDto {
  /** Opcional al editar, para poder completar las órdenes anteriores al campo. */
  @IsOptional()
  @IsEnum(EmpresaVendedora, { message: 'EMPRESA VENDEDORA INVÁLIDA' })
  empresaVendedora?: EmpresaVendedora;

  /** `null` quita el transportista; `undefined` no lo toca. */
  @ValidateIf((_, valor) => valor !== null && valor !== undefined)
  @Type(() => Number)
  @IsInt()
  transportistaId?: number | null;

  @IsOptional()
  @IsString()
  observacion?: string;

  @IsOptional()
  @IsArray()
  @Matches(PLACA_REGEX, { each: true, message: PLACA_MENSAJE })
  placas?: string[];

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  vehicleIds?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VentaOrdenItemDto)
  items?: VentaOrdenItemDto[];
}

/**
 * Agrega un vehículo a una orden escribiendo placa y cubicaje. Si la placa ya
 * existe se usa ese vehículo; si no, se crea: externo con el proveedor del
 * cliente público, o interno (pide ID y empresa) para un cliente privado.
 */
export class ResolverVehiculoOrdenDto {
  @Type(() => Number)
  @IsInt()
  clientId: number;

  @IsString()
  @MinLength(6, { message: 'PLACA INVÁLIDA' })
  plate: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001, { message: 'EL CUBICAJE DEBE SER MAYOR A CERO' })
  capacity: number;

  /** Solo para crear un vehículo de la empresa (cliente privado). */
  @IsOptional()
  @IsString()
  vehicleid?: string;

  @IsOptional()
  @IsEnum(['CIUDAD_RODRIGO', 'TRANSVELEZ'], {
    message: 'EMPRESA INVÁLIDA',
  })
  company?: 'CIUDAD_RODRIGO' | 'TRANSVELEZ';
}

/** Cierre manual desde la web, con motivo obligatorio. */
export class CerrarVentaOrdenDto {
  @IsString()
  @MinLength(3, { message: 'INDIQUE EL MOTIVO DEL CIERRE' })
  motivo: string;
}

/** Filtros de la grilla web de órdenes. Todos opcionales. */
export class QueryVentaOrdenesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  constSiteId?: number;

  @IsOptional()
  @IsEnum(VentaOrdenEstado)
  estado?: VentaOrdenEstado;

  @IsOptional()
  @IsEnum(EmpresaVendedora)
  empresaVendedora?: EmpresaVendedora;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  transportistaId?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
