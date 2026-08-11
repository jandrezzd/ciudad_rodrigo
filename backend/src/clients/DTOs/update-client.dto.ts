import { IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';
import { ClientType } from '@prisma/client';

export class UpdateClientDto {

    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    ruc?: string;

    @IsOptional()
    @IsString()
    companyname?: string;

    @IsOptional()
    @IsString()
    province?: string;

    @IsOptional()
    @IsString()
    canton?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsEnum(ClientType)
    type?: ClientType;

    @IsOptional()
    @IsString()
    email: string;
    
    @IsOptional()
    @IsString()
    phone: string;

    @IsOptional()
    @IsBoolean()
    isActive: boolean;
}
