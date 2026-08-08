import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CrearTipoHabitacionDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsInt()
  @Min(1)
  aforoMax: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  tiempoLimpiezaMin?: number;

  // Precios por tipo de cliente que el recepcionista elige al alquilar.
  @IsNumber()
  @Min(0)
  precioNormal: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioCorporativo?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioWeb?: number;

  // Si no se envía, este tipo no admite alquiler por horas.
  @IsOptional()
  @IsNumber()
  @Min(0)
  precioPorHora?: number;

  // Piso: ninguna tarifa (por defecto o editada por recepción) puede
  // registrarse por debajo de este valor. 0 = sin piso configurado.
  @IsOptional()
  @IsNumber()
  @Min(0)
  precioCosto?: number;
}
