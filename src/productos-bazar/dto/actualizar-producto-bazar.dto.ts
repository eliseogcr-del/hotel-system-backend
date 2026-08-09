import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ActualizarProductoBazarDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precio?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
