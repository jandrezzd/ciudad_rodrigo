import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ClientType } from '@prisma/client';

export class CreateClientDto {

    @IsOptional()
    @IsString()
    name?: string;

    @IsString()
    ruc: string;

    @IsString()
    companyname: string;

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
}