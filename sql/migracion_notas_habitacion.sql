-- Nota operativa persistente de la habitación (independiente de la estadía o
-- de una tarea de HK en curso): sirve para dejar avisos que ayudan a
-- recepción a decidir aun con la habitación disponible (ej. "faltan
-- toallas", "el control remoto no funciona"). Se edita desde el panel de
-- Habitaciones (ver HabitacionesService.actualizarNotas()) y queda tal cual
-- hasta que alguien la borre a mano -- no se limpia sola al hacer check-in
-- ni checkout, a diferencia de las notas de la estadía o de una tarea HK.
alter table habitaciones add column if not exists notas_operativas text;
