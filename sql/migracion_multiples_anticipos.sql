-- Migración: permitir varios anticipos (pagos adelantados) por reserva.
-- Antes vivían como columnas sueltas en `reservas` (un solo anticipo por
-- reserva); ahora es una tabla 1:N. Este script crea la tabla nueva,
-- migra los anticipos ya registrados en el formato anterior, y luego
-- elimina las columnas viejas.

create table anticipos_reserva (
    id uuid primary key default gen_random_uuid(),
    reserva_id uuid not null references reservas(id) on delete cascade,
    monto numeric(10,2) not null,
    metodo_pago text not null check (metodo_pago in ('efectivo','transferencia','yape','tarjeta')),
    registrado_por uuid references personal(id),
    sesion_turno_id uuid references sesiones_turno(id),
    fecha timestamptz not null default now(),
    vinculado_estadia_id uuid references estadias(id)
);

alter table anticipos_reserva enable row level security;

create policy p_anticipos_reserva on anticipos_reserva for all
    using (is_super_admin() or reserva_id in (select id from reservas where hotel_id in (select my_hotel_ids())));

-- Backfill: cualquier reserva que ya tenga un anticipo registrado en el
-- formato anterior pasa a tener su primera fila en la tabla nueva.
insert into anticipos_reserva (reserva_id, monto, metodo_pago, registrado_por, sesion_turno_id, fecha, vinculado_estadia_id)
select id, anticipo_monto, anticipo_metodo_pago, anticipo_registrado_por, anticipo_sesion_turno_id,
       coalesce(anticipo_fecha, now()), anticipo_vinculado_estadia_id
from reservas
where anticipo_monto > 0;

alter table reservas
    drop column anticipo_monto,
    drop column anticipo_metodo_pago,
    drop column anticipo_registrado_por,
    drop column anticipo_sesion_turno_id,
    drop column anticipo_fecha,
    drop column anticipo_vinculado_estadia_id;
