-- ============================================================================
-- LIMPIEZA DE DATOS DE PRUEBA — Hotel Jorge Chávez
-- ============================================================================
-- Borra TODA la data operativa/transaccional (reservas, estadías, pagos,
-- huéspedes, tareas HK, cotizaciones, importaciones de correo) para dejar
-- el sistema listo para operar con datos reales.
--
-- CONSERVA (configuración, según lo confirmado):
--   - hoteles (horarios de check-in/checkout, precio_mascota, etc. — no se toca)
--   - tipos_habitacion (con sus precios)
--   - habitaciones (se resetea su estado a 'disponible', pero no se borran las filas)
--   - cocheras (se resetea su estado a 'disponible', pero no se borran las filas)
--   - productos_bazar
--   - tipos_desayuno
--   - tipo_cambio
--   - turnos: solo "Mañana", "Tarde", "Noche" — cualquier otro turno se borra
--   - personal / personal_hotel: solo los perfiles con rol 'admin' — el resto
--     (recepción/HK) se borra, incluyendo la fila personal_hotel asociada
--
-- IRREVERSIBLE. Antes de correr esto:
--   1. Confirma que ya no necesitas ninguno de los datos de prueba actuales.
--   2. Si tu plan de Supabase lo permite, considera hacer un backup/snapshot
--      manual desde el dashboard (Database → Backups) antes de ejecutar.
--
-- Nota aparte (no lo hace este script): los usuarios de recepción/HK que se
-- borran de `personal` siguen existiendo como cuentas de Supabase Auth (con
-- su email/contraseña), solo que sin acceso a ningún hotel. Si quieres
-- eliminarlos por completo para poder reusar esos correos, hazlo desde
-- Supabase → Authentication → Users, manualmente.
-- ============================================================================

begin;

-- ID del hotel (el único que existe hoy: Hotel Jorge Chávez).
-- Si en el futuro hay más de un hotel, correr esto por separado para cada uno.
do $$
declare
    v_hotel_id uuid := 'ac2edc89-a00b-4c40-80a2-dd995f878e9e';
begin

    -- 1) Correos de Booking/Airbnb procesados (referencian reservas).
    delete from importaciones_canal where hotel_id = v_hotel_id;

    -- 2) Cotizaciones (cascada automática a cotizacion_detalle).
    delete from cotizaciones where hotel_id = v_hotel_id;

    -- 3) Reservas (cascada automática a: anticipos_reserva, reserva_habitacion,
    --    vehiculos, estadias, movimientos_cuenta, comprobantes).
    delete from reservas where hotel_id = v_hotel_id;

    -- 4) Tareas de HK (limpieza/mantenimiento) — deben irse antes que
    --    personal, porque referencian a quién las hizo/asignó.
    delete from tareas_hk where hotel_id = v_hotel_id;

    -- 5) Sesiones de caja y sus movimientos (cascada automática a
    --    movimientos_caja) — deben irse antes que personal_hotel, que las
    --    referencia con RESTRICT.
    delete from sesiones_turno
    where personal_hotel_id in (
        select id from personal_hotel where hotel_id = v_hotel_id
    );

    -- 6) Huéspedes (ya no hay reservas/cotizaciones que los referencien).
    delete from huespedes where hotel_id = v_hotel_id;

    -- 7) Empresas / tarifas corporativas especiales (cascada automática).
    delete from empresas where hotel_id = v_hotel_id;

    -- 8) Tabla histórica de tarifas, ya no se usa (reemplazada por los
    --    precios en tipos_habitacion desde el 2026-08-08).
    delete from tarifas where hotel_id = v_hotel_id;

    -- 9) Personal_hotel: solo se queda el rol 'admin'.
    delete from personal_hotel
    where hotel_id = v_hotel_id
      and rol <> 'admin';

    -- 10) Personal: solo se queda quien tenga al menos un perfil 'admin'
    --     (en cualquier hotel, por si en el futuro hay más de uno).
    delete from personal p
    where not exists (
        select 1 from personal_hotel ph
        where ph.personal_id = p.id and ph.rol = 'admin'
    );

    -- 11) Habitaciones: se conservan las filas, se resetea su estado.
    update habitaciones
    set estado = 'disponible', mantenimiento_planificado = false
    where hotel_id = v_hotel_id;

    -- 12) Cocheras: se conservan las filas, se resetea su estado.
    update cocheras
    set estado = 'disponible'
    where hotel_id = v_hotel_id;

    -- 13) Turnos: solo se quedan Mañana/Tarde/Noche.
    delete from turnos
    where hotel_id = v_hotel_id
      and nombre not in ('Mañana', 'Tarde', 'Noche');

end $$;

commit;
