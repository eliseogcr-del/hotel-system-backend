-- Configuración de horas de check-in / check-out por hotel (feature:
-- check-in rápido desde Habitaciones + cálculo automático de early/late).

alter table hoteles
  add column if not exists hora_checkin time not null default '13:00',
  add column if not exists hora_checkout time not null default '12:00',
  add column if not exists modo_24h boolean not null default false;

-- Solo el admin del hotel puede editar su configuración de horas.
create policy p_hoteles_update on hoteles for update
    using (is_super_admin() or id in (select my_hotel_ids_by_rol('admin')))
    with check (is_super_admin() or id in (select my_hotel_ids_by_rol('admin')));

-- Hotel Jorge Chávez: horario real (1pm check-in, 12m check-out).
update hoteles set hora_checkin = '13:00', hora_checkout = '12:00', modo_24h = false
where nombre ilike '%jorge ch%';
