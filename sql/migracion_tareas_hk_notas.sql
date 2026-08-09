-- Mensaje de estado corto para las tareas de HK (ej. "Empezó la
-- limpieza"), visible en el panel de Habitaciones mientras no hay
-- huésped activo en la fila. Se limpia cuando la tarea termina.
alter table tareas_hk add column if not exists notas text;
