-- Los precios pasan a ser un atributo editable de tipos_habitacion (en vez
-- de la tabla histórica `tarifas`, que ya no se usa desde el backend y
-- queda intacta solo como registro). 3 precios por tipo de cliente que
-- elige el recepcionista al alquilar (normal/corporativo/web) + precio por
-- hora opcional + precio de costo como piso que nunca se puede bajar.

alter table tipos_habitacion
  add column if not exists precio_normal numeric(10,2) not null default 0,
  add column if not exists precio_corporativo numeric(10,2) not null default 0,
  add column if not exists precio_web numeric(10,2) not null default 0,
  add column if not exists precio_por_hora numeric(10,2),
  add column if not exists precio_costo numeric(10,2) not null default 0;

-- Copia el valor MÁS RECIENTE que ya tenía cada tipo en `tarifas` (si
-- tenía alguno) a los nuevos campos. normal->precio_normal,
-- minimo->precio_por_hora, booking->precio_web (ambos son precio de canal
-- online). precio_corporativo arranca igual a precio_normal (nadie había
-- configurado un precio corporativo todavía; el admin lo ajusta luego).
-- airbnb no tiene un campo equivalente en el nuevo modelo y no se migra.
update tipos_habitacion th
set
  precio_normal = t.normal,
  precio_web = coalesce(t.booking, t.normal),
  precio_corporativo = t.normal,
  precio_por_hora = t.minimo
from (
  select distinct on (tipo_hab_id) tipo_hab_id, normal, booking, minimo
  from tarifas
  order by tipo_hab_id, vigente_desde desc
) t
where th.id = t.tipo_hab_id;
