import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ActualizarCocheraDto {
  @IsOptional()
  @IsString()
  numero?: string;

  @IsOptional()
  @IsEnum(['grande', 'chica'])
  tamano?: 'grande' | 'chica';

  @IsOptional()
  @IsString()
  tipoVehiculoPermitido?: string;

  @IsOptional()
  @IsEnum(['disponible', 'ocupada'])
  estado?: string;

  @IsOptional()
  @IsBoolean()
  esExterna?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioExterna?: number;
}
