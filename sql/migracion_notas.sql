-- ============================================================================
-- MIGRACIÓN: MODULO NOTAS
-- ============================================================================

create table notas (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    fecha_hora timestamptz not null default now(),
    descripcion text not null,
    usuario_escribio uuid not null references personal(id),
    tipo text not null check (tipo in ('Informativa', 'Repetitiva', 'Mensajeria')),
    dirigido_a text not null check (dirigido_a in ('Recepcionista', 'HK', 'Huesped')),
    
    -- Para notas repetitivas
    fecha_hora_inicio_repeticion timestamptz,
    fecha_hora_fin_repeticion timestamptz,
    
    -- Para notas de mensajería
    fecha_hora_envio timestamptz,
    celular_destino text,
    adjuntos text[],        -- URLs de cotizaciones o imágenes
    telefonos_adicionales text[],  -- Otros números a quienes enviar
    
    created_at timestamptz not null default now()
);

-- Índices de apoyo
create index idx_notas_hotel on notas(hotel_id);
create index idx_notas_usuario on notas(usuario_escribio);
create index idx_notas_tipo on notas(tipo);
create index idx_notas_dirigido_a on notas(dirigido_a);

-- Row Level Security
alter table notas enable row level security;

-- Política de selección: super_admin ve todo; el resto solo ve notas de sus hoteles asignados
create policy p_notas on notas for select
    using (
        is_super_admin()
        or hotel_id in (select my_hotel_ids())
    );

-- Política de inserción: cualquiera puede crear notas en sus hoteles asignados
create policy p_notas_insert on notas for insert
    with check (
        hotel_id in (select my_hotel_ids())
    );

-- Política de actualización: solo puede actualizar notas de sus hoteles asignados
create policy p_notas_update on notas for update
    using (hotel_id in (select my_hotel_ids()))
    with check (hotel_id in (select my_hotel_ids()));

-- Política de eliminación: solo puede eliminar notas de sus hoteles asignados
create policy p_notas_delete on notas for delete
    using (hotel_id in (select my_hotel_ids()));