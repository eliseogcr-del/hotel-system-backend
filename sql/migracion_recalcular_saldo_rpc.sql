-- Mueve el recálculo del saldo de una estadía a una función de Postgres,
-- llamada por .rpc() en vez de hacerlo en dos viajes separados desde el
-- backend (un SELECT de todos los movimientos_cuenta + un UPDATE de
-- estadias.saldo). Mismo cálculo exacto (suma de movimientos, nunca
-- confiar en un saldo incremental) -- solo se mueve el "dónde" para que
-- sea un solo viaje a la base en vez de dos. Esto corre en CADA checkin,
-- checkout, pago, cargo, etc. -- es la operación más repetida del
-- sistema, así que ahorrar un viaje acá se siente en todas partes (el
-- reclamo real: "demora tanto al guardar").
--
-- Sin `security definer` a propósito: corre con los permisos de quien
-- llama (el cliente autenticado del request), así sigue respetando RLS
-- igual que si lo hiciera el backend con el cliente del usuario -- "RLS
-- como última línea de defensa" (ver CLAUDE.md sección 7).
create or replace function recalcular_saldo_estadia(p_estadia_id uuid)
returns numeric
language sql
as $$
  update estadias
  set saldo = coalesce(
    (select sum(monto) from movimientos_cuenta where estadia_id = p_estadia_id),
    0
  )
  where id = p_estadia_id
  returning saldo;
$$;
