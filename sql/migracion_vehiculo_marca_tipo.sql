-- Agrega marca/tipo de vehículo y hace 1:1 la relación vehiculos <-> reserva_habitacion
-- (una estadía tiene a lo más un vehículo/cochera asignado). No hay filas
-- existentes en `vehiculos` a la fecha de esta migración, así que el
-- constraint UNIQUE es seguro de aplicar directo.

alter table vehiculos add column if not exists marca text;
alter table vehiculos add column if not exists tipo text;
alter table vehiculos add constraint vehiculos_reserva_habitacion_id_key unique (reserva_habitacion_id);
