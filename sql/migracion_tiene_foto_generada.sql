-- URGENTE: Supabase reportó Egress al 343% de la cuota gratis (17GB de
-- 5GB), con el período de gracia ya vencido -- en cualquier momento puede
-- empezar a rechazar pedidos con 402.
--
-- La migración anterior (sql/migracion_organizaciones.sql no, la de fotos
-- en PR #117) dejó de REENVIAR el base64 de las fotos al navegador, pero
-- el backend seguía pidiéndoselo completo a Postgres en cada carga del
-- dashboard de Habitaciones (que se auto-refresca cada 5 min) -- ese tramo
-- Postgres -> backend es justo el que cuenta como "Egress" en Supabase, y
-- es el que de verdad hay que cortar.
--
-- Esta migración agrega columnas GENERATED (calculadas por Postgres mismo,
-- sin que la app tenga que mantenerlas sincronizadas) que dicen "sí/no hay
-- foto" sin cargar el contenido: el backend ahora puede pedir SOLO estas
-- dos columnas (un booleano, unos bytes) en vez de foto1_url/foto2_url (el
-- data URI completo, hasta ~200KB cada uno) en los listados que se repiten
-- todo el día.
alter table habitaciones
    add column if not exists tiene_foto1 boolean generated always as (foto1_url is not null) stored,
    add column if not exists tiene_foto2 boolean generated always as (foto2_url is not null) stored;

alter table cocheras
    add column if not exists tiene_foto1 boolean generated always as (foto1_url is not null) stored,
    add column if not exists tiene_foto2 boolean generated always as (foto2_url is not null) stored;

-- Sin policy nueva: tiene_foto1/tiene_foto2 son columnas más de
-- habitaciones/cocheras, ya cubiertas por p_habitaciones/p_cocheras.
