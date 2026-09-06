-- Rediseño del flujo de Cotizaciones: en vez de armar una línea por
-- habitación a mano (precio por noche, sacado de tarifas), recepción arma
-- un cuadro tipo Excel a partir de un check-in/check-out con hora
-- (necesarios para el motor de disponibilidad -- ver DisponibilidadService)
-- y cotiza cada habitación por precio por persona por noche, con una nota
-- libre por línea.
--
-- hora_checkin/hora_checkout quedan en la cotización (antes estaban
-- hardcodeadas en 15:00/11:00 en el código) para poder reconstruir el
-- rango exacto al convertir la cotización en reserva real.
alter table cotizaciones add column if not exists hora_checkin time not null default '15:00';
alter table cotizaciones add column if not exists hora_checkout time not null default '11:00';

-- precio_persona reemplaza a precio_noche como base del subtotal (nro_personas
-- x precio_persona x dias). precio_noche queda nullable -- se conserva por si
-- hay cotizaciones viejas creadas con el flujo anterior, pero el flujo nuevo
-- ya no lo llena.
alter table cotizacion_detalle add column if not exists notas text;
alter table cotizacion_detalle add column if not exists precio_persona numeric(10,2);
alter table cotizacion_detalle alter column precio_noche drop not null;
