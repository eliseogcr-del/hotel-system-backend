-- Permite editar a mano la etiqueta de "tipo de habitación" que se ve en
-- el cuadro y el PDF de una cotización -- es solo una plantilla/documento
-- para ese cliente, no toca tipos_habitacion (que sigue siendo la fuente
-- real para tarifas/aforo/etc. en el resto del sistema).
--
-- Cuando tipo_manual es null, la pantalla y el PDF siguen calculando la
-- etiqueta solos (Individual con 1 persona, Múltiple con más de 5, tipo
-- real en el resto de los casos) -- ver etiquetaTipoCotizacion en
-- frontend/src/pages/CotizacionDetalle.tsx.
alter table cotizacion_detalle add column if not exists tipo_manual text;
