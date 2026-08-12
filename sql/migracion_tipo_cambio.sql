-- La tabla `tipo_cambio` ya existía en el schema original (fecha date PK,
-- valor_compra, valor_venta) pero nunca se usó: sin RLS, sin módulo
-- backend, sin pantalla. Se activa acá para el formulario de
-- Configuración → Tipo de cambio y para la conversión automática de pagos
-- en USD a soles (ver EstadiasService.registrarMovimiento()).

alter table tipo_cambio enable row level security;

-- Lectura abierta a cualquier usuario autenticado: el tipo de cambio del
-- día se muestra en la parte superior de toda la app, para todos los
-- roles (no es un dato sensible ni específico de un hotel).
drop policy if exists p_tipo_cambio_select on tipo_cambio;
create policy p_tipo_cambio_select on tipo_cambio for select
    using (true);

-- Escritura solo para quien sea admin de al menos un hotel (no está
-- scopeado por hotel_id porque el tipo de cambio es un dato del país, no
-- de un hotel en particular).
drop policy if exists p_tipo_cambio_insert on tipo_cambio;
create policy p_tipo_cambio_insert on tipo_cambio for insert
    with check (is_super_admin() or exists (select 1 from my_hotel_ids_by_rol('admin')));

drop policy if exists p_tipo_cambio_update on tipo_cambio;
create policy p_tipo_cambio_update on tipo_cambio for update
    using (is_super_admin() or exists (select 1 from my_hotel_ids_by_rol('admin')));

-- Referencia de pagos en USD: el monto que se guarda en monto/monto
-- (movimientos_cuenta/movimientos_caja) sigue siendo el equivalente en
-- soles (para que el saldo y la caja se mantengan siempre en una sola
-- moneda); estas columnas nuevas son solo para trazabilidad de que ese
-- monto vino de una conversión.
alter table movimientos_cuenta add column if not exists moneda_pago text check (moneda_pago in ('PEN','USD'));
alter table movimientos_cuenta add column if not exists monto_original numeric(10,2);
alter table movimientos_cuenta add column if not exists tipo_cambio_aplicado numeric(6,3);

alter table movimientos_caja add column if not exists moneda_pago text check (moneda_pago in ('PEN','USD'));
alter table movimientos_caja add column if not exists monto_original numeric(10,2);
alter table movimientos_caja add column if not exists tipo_cambio_aplicado numeric(6,3);
