-- Migración: cierre automático de sesiones de turno vencidas.
-- Permite distinguir en el historial si una sesión de caja se cerró porque
-- el recepcionista la liquidó, o porque el sistema la cerró solo tras 5
-- minutos de que el turno terminó sin que nadie la cerrara.
alter table sesiones_turno
    add column if not exists cerrada_automaticamente boolean not null default false;
