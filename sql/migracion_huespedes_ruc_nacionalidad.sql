-- Huéspedes: RUC/razón social para facturación (puede ser del propio
-- huésped o de la empresa que paga su estadía) + nacionalidad pasa de
-- texto libre a un combo peruano/extranjero, con el país de origen en un
-- campo aparte para cuando es extranjero.

alter table huespedes
  add column if not exists origen text,
  add column if not exists ruc text,
  add column if not exists razon_social text;

-- Antes nacionalidad era texto libre (ej. "Peruana", "Colombiana"). Lo que
-- no sea claramente peruano se guarda en origen para no perder el dato,
-- ANTES de normalizar nacionalidad al nuevo combo.
update huespedes
set origen = nacionalidad
where nacionalidad is not null and nacionalidad not ilike 'per%';

update huespedes
set nacionalidad = case
  when nacionalidad ilike 'per%' then 'peruano'
  when nacionalidad is not null then 'extranjero'
  else null
end;

alter table huespedes
  add constraint huespedes_nacionalidad_check check (nacionalidad in ('peruano','extranjero'));
