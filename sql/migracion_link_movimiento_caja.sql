-- Un pago de huésped que genera ingreso de caja se registra en DOS tablas
-- (movimientos_cuenta, del lado de la estadía, y movimientos_caja, del lado
-- del turno) sin ningún vínculo entre ambas filas. Al editar el método de
-- pago o el monto desde Estadías, la fila espejo en Caja quedaba
-- desactualizada porque no había forma de encontrarla. Este vínculo permite
-- que editarMovimiento() (estadías) propague el cambio también a Caja.
alter table movimientos_caja
    add column if not exists movimiento_cuenta_id uuid references movimientos_cuenta(id) on delete set null;

create index if not exists idx_movimientos_caja_movimiento_cuenta on movimientos_caja(movimiento_cuenta_id);
