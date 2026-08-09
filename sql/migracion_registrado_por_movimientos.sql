-- Cuentas x cobrar: registrar quién generó cada cargo/abono, para poder
-- verlo en el detalle de la estadía.
alter table movimientos_cuenta add column if not exists registrado_por uuid references personal(id);

-- Antes solo el admin de un hotel podía ver los nombres de sus colegas
-- (personal); ahora cualquiera asignado a un hotel en común puede verlos,
-- para poder mostrar "quién registró este cargo" en el detalle de la
-- estadía sin importar el rol de quien lo consulta.
drop policy if exists p_personal on personal;
create policy p_personal on personal for select
    using (
        is_super_admin()
        or auth_user_id = auth.uid()
        or id in (
            select ph.personal_id from personal_hotel ph
            where ph.hotel_id in (select my_hotel_ids())
        )
    );
