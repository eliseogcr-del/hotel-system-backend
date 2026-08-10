-- Catálogo de tipos de desayuno vendibles (ej. Continental, Americano),
-- cada uno con su propio precio -- para venta suelta a huéspedes que no
-- lo tienen incluido de cortesía en la tarifa. Mismo patrón que
-- productos_bazar. Nuevo tipo 'desayuno' en el libro de movimientos_cuenta.

create table if not exists tipos_desayuno (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    nombre text not null,
    precio numeric(10,2) not null,
    activo boolean not null default true
);

alter table tipos_desayuno enable row level security;

drop policy if exists p_tipos_desayuno on tipos_desayuno;
create policy p_tipos_desayuno on tipos_desayuno for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));

alter table movimientos_cuenta add column if not exists tipo_desayuno_id uuid references tipos_desayuno(id);

alter table movimientos_cuenta drop constraint if exists movimientos_cuenta_tipo_check;
alter table movimientos_cuenta add constraint movimientos_cuenta_tipo_check
    check (tipo in ('alquiler','consumo_bazar','pago','early','late','ajuste','cochera','desayuno'));
