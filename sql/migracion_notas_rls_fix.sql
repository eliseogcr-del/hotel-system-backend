-- Las políticas de RLS de `notas` (migracion_notas.sql) quedaron
-- asimétricas respecto al patrón del resto del sistema: la de select sí
-- deja pasar a is_super_admin(), pero insert/update/delete no (ver
-- sql/schema.sql -- TODAS las demás tablas usan una sola policy "for all"
-- con is_super_admin() or hotel_id in (select my_hotel_ids())).
--
-- Un UPDATE que no matchea la policy no da error -- Postgres simplemente
-- no encuentra la fila, y el backend lo reporta como "Nota no encontrada
-- en este hotel". Se reemplazan las 4 policies sueltas por una sola
-- unificada, igual que el resto de las tablas.
drop policy if exists p_notas on notas;
drop policy if exists p_notas_insert on notas;
drop policy if exists p_notas_update on notas;
drop policy if exists p_notas_delete on notas;

create policy p_notas on notas for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));
