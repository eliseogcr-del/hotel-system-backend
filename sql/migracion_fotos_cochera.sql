-- Hasta 2 fotos por cochera, cada una con su propia descripción (ej.
-- medidas: ancho/largo/altura) -- mismo patrón que habitaciones.foto1_url/
-- foto2_url (data URI, sin bucket de storage).

alter table cocheras
    add column if not exists foto1_url text,
    add column if not exists foto1_descripcion text,
    add column if not exists foto2_url text,
    add column if not exists foto2_descripcion text;
