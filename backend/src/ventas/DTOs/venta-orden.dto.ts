import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VentaOrdenEstado } from '@prisma/client';

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

  @IsOptional()
  @IsString()
  observacion?: string;

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
  @IsOptional()
  @IsString()
  observacion?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VentaOrdenItemDto)
  items?: VentaOrdenItemDto[];
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
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
