import { IsBoolean, IsInt, IsMilitaryTime, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class ActualizarHotelDto {
  @IsOptional()
  @IsMilitaryTime()
  horaCheckin?: string;

  @IsOptional()
  @IsMilitaryTime()
  horaCheckout?: string;

  @IsOptional()
  @IsBoolean()
  modo24h?: boolean;

  // Cobro por mascota, por día. 0 = sin cobro configurado todavía.
  @IsOptional()
  @IsNumber()
  @Min(0)
  precioMascota?: number;

  // Solo editable mientras el hotel no tenga ninguna sesión de caja
  // todavía (ver ConfiguracionService.actualizarHotel()).
  @IsOptional()
  @IsNumber()
  @Min(0)
  saldoInicialCaja?: number;

  // Imagen como data URI (data:image/png;base64,...), no una URL a un
  // archivo -- ver comentario en sql/schema.sql. Tope generoso (~1.4MB de
  // imagen real) para no dejar subir fotos de celular sin comprimir.
  @IsOptional()
  @IsString()
  @Matches(/^data:image\/(png|jpe?g|webp);base64,/, {
    message: 'logoUrl debe ser una imagen en base64 (png, jpg o webp)',
  })
  @MaxLength(2_000_000)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  razonSocial?: string;

  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'El RUC debe tener 11 dígitos' })
  ruc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ciudad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombreContacto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  eslogan?: string;

  @IsOptional()
  @IsBoolean()
  agenteWhatsappActivo?: boolean;

  // Cantidad de personas a partir de la cual una cotización del agente de
  // WhatsApp deja de autocotizarse (tarifa normal x noches) y queda
  // 'pendiente_revision' para que el staff defina el precio por persona.
  @IsOptional()
  @IsInt()
  @Min(1)
  umbralGrupoGrande?: number;
}
