import { ArrayMinSize, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CrearCotizacionWhatsappDto } from './crear-cotizacion-whatsapp.dto';

// El cliente elige cuántas habitaciones quiere de cada TIPO (ej. 2
// matrimoniales), nunca cuáles en particular -- así nunca puede quedarse
// "apuntando" a una habitación puntual que otra persona reserve primero (ver
// CotizacionPublicaService.crearReservaDesdeWhatsapp: el servidor recién ahí
// elige, de lo que esté realmente libre en ese momento, qué habitaciones
// concretas asignar).
class SeleccionTipoHabitacionDto {
  @IsUUID()
  tipoHabitacionId: string;

  @IsInt()
  @Min(1)
  cantidad: number;
}

/**
 * Body del botón "Reservar" del formulario público: el cliente ya vio la
 * lista de tipos de habitación con cupo disponible (ver
 * HabitacionesDisponiblesWhatsappDto/buscarHabitacionesDisponibles) y marcó
 * cuántas quiere de cada tipo. A propósito no viaja el id de una habitación
 * puntual ni precio/aforo -- eso siempre se resuelve/recalcula del lado del
 * servidor a partir de `seleccion` (ver
 * CotizacionPublicaService.crearReservaDesdeWhatsapp), para que el cliente
 * nunca pueda alterarlos ni reservar sobre una habitación que ya no esté
 * libre.
 */
export class CrearReservaWhatsappDto extends CrearCotizacionWhatsappDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SeleccionTipoHabitacionDto)
  seleccion: SeleccionTipoHabitacionDto[];
}
