-- Ver comentarios en sql/schema.sql (tablas hoteles y cotizacion_detalle).
alter table hoteles add column if not exists logo_url text;
alter table hoteles add column if not exists razon_social text;
alter table hoteles add column if not exists direccion text;
alter table hoteles add column if not exists ciudad text;
alter table hoteles add column if not exists telefono text;
alter table hoteles add column if not exists nombre_contacto text;
alter table hoteles add column if not exists eslogan text;

alter table cotizacion_detalle add column if not exists disponibilidad_forzada boolean not null default false;
