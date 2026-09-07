-- Adelanto que el cliente ya pagó sobre una cotización (antes de que se
-- convierta en reserva real). Es solo informativo -- a diferencia de
-- anticipos_reserva, no genera movimiento de caja ni tiene método de pago,
-- porque una cotización todavía no es una reserva confirmada. Sirve para
-- mostrar "diferencia a pagar" (total_estimado - adelanto) en el cuadro.
alter table cotizaciones add column if not exists adelanto numeric(10,2) not null default 0;
