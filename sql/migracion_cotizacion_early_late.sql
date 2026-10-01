-- Agrega cargos de early check-in / late check-out a cotizacion_detalle,
-- como cargos únicos por línea (no se multiplican por días) -- mismo
-- concepto que ya existe en reserva_habitacion.cobro_early/cobro_late
-- (CLAUDE.md 3.3). Antes de esto solo se anotaban como texto suelto en
-- `notas` y no sumaban al subtotal real de la cotización.

alter table cotizacion_detalle
    add column if not exists cobro_early numeric(10,2) not null default 0,
    add column if not exists cobro_late numeric(10,2) not null default 0;
