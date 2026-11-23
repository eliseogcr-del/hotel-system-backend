-- Hasta ahora, convertir() creaba UNA sola reserva con todas las
-- habitaciones de la cotización como líneas (reserva grupal) y guardaba
-- ese único id en cotizaciones.reserva_id. Eso causó un incidente real
-- (Amada Reyes, 17/11): una cotización armada con 11 habitaciones de 11
-- huéspedes INDEPENDIENTES (no un grupo que paga como un solo bloque) se
-- convirtió en una sola reserva, y los anticipos que se registraron
-- después se enlazaron todos a una sola habitación al hacer check-in (ver
-- EstadiasService.checkin(), que enlaza anticipos_reserva por reserva_id
-- completo, no por habitación).
--
-- A partir de ahora, convertir() crea una reserva independiente POR CADA
-- habitación de la cotización -- así cada una es una reserva normal de una
-- sola habitación, igual que cualquier otra creada a mano, sin necesidad de
-- repartir anticipos entre varias habitaciones. cotizaciones.reserva_id (una
-- sola columna) ya no alcanza para apuntar a todas, así que cada línea
-- guarda la suya propia acá.
alter table cotizacion_detalle
    add column if not exists reserva_id uuid references reservas(id);

create index if not exists idx_cotizacion_detalle_reserva on cotizacion_detalle(reserva_id);
