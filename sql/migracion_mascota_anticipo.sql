-- Cobro de mascota: configurable por hotel, por día (igual que la tarifa de
-- habitación), y opcional por línea de reserva. Se calcula al reservar
-- (con_mascota + cobro_mascota = precio_mascota * dias) pero, igual que
-- cobro_early/cobro_late, recién se postea como movimiento del libro de
-- cuentas al hacer el check-in real (ver EstadiasService.checkin()).
alter table hoteles add column if not exists precio_mascota numeric(10,2) not null default 0;

alter table reserva_habitacion add column if not exists con_mascota boolean not null default false;
alter table reserva_habitacion add column if not exists cobro_mascota numeric(10,2) not null default 0;

alter table movimientos_cuenta drop constraint if exists movimientos_cuenta_tipo_check;
alter table movimientos_cuenta add constraint movimientos_cuenta_tipo_check
    check (tipo in ('alquiler','consumo_bazar','pago','early','late','ajuste','cochera','desayuno','mascota'));

-- Anticipo (pago adelantado) de una reserva, antes de que exista una
-- estadía real. El método de pago lo decide quien reserva (efectivo, yape,
-- transferencia, tarjeta): solo si es efectivo genera un ingreso en la caja
-- de la sesión de turno abierta de quien lo registra (mismo criterio que
-- el resto del sistema -- yape/tarjeta/transferencia van directo a la
-- cuenta de la empresa, sin pasar por la caja física del recepcionista).
-- Se enlaza a la estadía real recién en el check-in (ver
-- EstadiasService.checkin()), como un movimiento 'pago' que reduce el
-- saldo -- sin generar un segundo ingreso de caja si ya se contó como
-- efectivo al momento de tomar el anticipo.
alter table reservas add column if not exists anticipo_monto numeric(10,2) not null default 0;
alter table reservas add column if not exists anticipo_metodo_pago text check (anticipo_metodo_pago in ('efectivo','transferencia','yape','tarjeta'));
alter table reservas add column if not exists anticipo_registrado_por uuid references personal(id);
alter table reservas add column if not exists anticipo_sesion_turno_id uuid references sesiones_turno(id);
alter table reservas add column if not exists anticipo_fecha timestamptz;
alter table reservas add column if not exists anticipo_vinculado_estadia_id uuid references estadias(id);
