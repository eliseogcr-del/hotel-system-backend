import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CrearTipoDesayunoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsNumber()
  @Min(0)
  precio: number;
}
