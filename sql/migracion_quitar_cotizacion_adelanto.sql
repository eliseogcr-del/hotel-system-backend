-- Revierte migracion_cotizacion_adelanto.sql: el adelanto de una reserva se
-- registra recién cuando la cotización se convierte en reserva real (ver
-- ReservasService.procesarAnticipo), no antes -- la columna "adelanto" en
-- cotizaciones no tenía sentido como concepto y quedó sin usar.
alter table cotizaciones drop column if exists adelanto;
