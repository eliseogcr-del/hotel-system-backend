-- Hasta 2 fotos por habitación, guardadas como data URI (igual patrón que
-- hoteles.logo_url) -- no amerita un bucket de storage para fotos chicas de
-- un catálogo de este tamaño. null = sin foto en ese slot.

alter table habitaciones
    add column if not exists foto1_url text,
    add column if not exists foto2_url text;
