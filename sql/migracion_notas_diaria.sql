-- Nota 'Repetitiva' con modo "diaria": en vez de repetirse cada
-- periodicidad_minutos dentro de un único rango
-- fecha_hora_inicio_repeticion..fin, se dispara UNA vez por día a la hora
-- (hora del día, no la fecha) de fecha_hora_inicio_repeticion, todos los
-- días desde esa fecha hasta fecha_hora_fin_repeticion (o para siempre si
-- se deja sin fecha de fin) -- ver RecordatorioNotas.tsx. Así no hay que
-- recrear la nota cada día para un recordatorio fijo (ej. "revisar
-- desayunos a las 7am").
alter table notas
  add column if not exists repite_diario boolean not null default false;
