-- Índices de rendimiento: ver comentarios en sql/schema.sql (sección
-- ÍNDICES DE APOYO). No cambian ningún dato ni comportamiento, solo
-- aceleran consultas que hoy hacen seq scan en tablas que crecen sin
-- límite (estadias, personal, sesiones_turno). Seguro correr con la app
-- en producción -- CREATE INDEX en Postgres no bloquea lecturas.
create index if not exists idx_personal_auth_user on personal(auth_user_id);
create index if not exists idx_estadias_estado_actual on estadias(estado_actual);
create index if not exists idx_sesiones_turno_personal_hotel_estado on sesiones_turno(personal_hotel_id, estado);
