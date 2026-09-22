-- Agrega el check "visible" a notas: permite ocultar una nota sin
-- borrarla (deja de aparecer en el listado por defecto y en el popup de
-- recordatorios) en vez de filtrar el listado por rango de fechas.
-- Ver NotasService.listar()/actualizar().

alter table notas add column if not exists visible boolean not null default true;
