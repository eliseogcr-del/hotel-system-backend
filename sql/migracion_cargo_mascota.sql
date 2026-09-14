-- Nuevo tipo 'cargo_mascota' en el libro de movimientos_cuenta: un cobro
-- puntual por mascota (ej. una mascota no declarada al reservar) que
-- recepción registra durante la estadía desde EstadiaDetalle.tsx, pagable
-- al momento igual que consumo_bazar/desayuno (genera su propio ingreso de
-- caja en vez de quedar como deuda pendiente).
--
-- Es un tipo aparte del ya existente 'mascota', que sigue siendo el cargo
-- automático por día que trae la reserva (con_mascota/cobro_mascota,
-- precio_mascota * días -- ver EstadiasService.checkin): ese no se toca.
alter table movimientos_cuenta drop constraint if exists movimientos_cuenta_tipo_check;
alter table movimientos_cuenta add constraint movimientos_cuenta_tipo_check
    check (tipo in ('alquiler','consumo_bazar','pago','early','late','ajuste','cochera','desayuno','mascota','cargo_mascota'));
