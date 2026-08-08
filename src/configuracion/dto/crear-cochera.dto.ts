import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CrearCocheraDto {
  @IsString()
  @IsNotEmpty()
  numero: string;

  @IsEnum(['grande', 'chica'])
  tamano: 'grande' | 'chica';

  @IsOptional()
  @IsString()
  tipoVehiculoPermitido?: string;

  @IsOptional()
  @IsBoolean()
  esExterna?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioExterna?: number;
}
