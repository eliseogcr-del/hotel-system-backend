-- Corrige el default de "facturable": debia quedar desmarcado (false) por
-- defecto, no marcado. Esto tambien revierte el valor que quedo puesto en
-- todas las reservas/estadias existentes cuando se agrego la columna con
-- default true (nadie las marco a proposito, fue el valor por defecto de la
-- migracion original).
alter table reservas alter column facturable set default false;
alter table estadias alter column facturable set default false;

update reservas set facturable = false where facturable = true;
update estadias set facturable = false where facturable = true;
