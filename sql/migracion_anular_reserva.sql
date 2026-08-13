-- Migración: motivo y auditoría de la anulación de una reserva.
alter table reservas
    add column if not exists motivo_cancelacion text,
    add column if not exists cancelado_por uuid references personal(id),
    add column if not exists cancelado_en timestamptz;
