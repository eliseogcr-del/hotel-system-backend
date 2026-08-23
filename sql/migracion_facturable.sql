-- "Facturable": si se le va a emitir boleta/factura al cliente o no. Vive
-- por separado en reservas (se decide al planificar) y en estadias (se
-- confirma/copia al hacer check-in y queda editable después desde "Editar
-- estadía") -- puede diferir si el huésped cambia de opinión entre reservar
-- y presentarse. No confundir con la tabla `comprobantes` (que registra el
-- boleta/factura ya emitido en sí): esto es solo la intención/bandera de si
-- corresponde emitirlo.
alter table reservas add column if not exists facturable boolean not null default false;
alter table estadias add column if not exists facturable boolean not null default false;
