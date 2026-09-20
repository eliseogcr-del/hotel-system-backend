-- Tarifa más baja para cuando un tipo pensado para 2 (ej. Matrimonial) se
-- alquila a una sola persona -- ver ConfiguracionService, ReservasService
-- (tarifaSegunTipoCliente) y CotizacionPublicaService (agente de WhatsApp).
-- null = este tipo no admite esa modalidad, se sigue cobrando precio_normal.
alter table tipos_habitacion
  add column if not exists precio_individual numeric(10,2);

-- Dato real del cliente: la Matrimonial del Hotel Jorge Chávez se alquila
-- también a una sola persona a S/. 85 (más barato que la tarifa de pareja).
-- Solo completa el valor si todavía no se configuró uno.
update tipos_habitacion
set precio_individual = 85
where lower(nombre) like '%matrimonial%'
  and precio_individual is null;
