-- Cada cuántos minutos se debe repetir el popup de una nota 'Repetitiva'
-- mientras esté dentro de su rango fecha_hora_inicio_repeticion..fin --
-- ver NotasService/RecordatorioNotas.tsx. Solo aplica a ese tipo; null en
-- el resto.
alter table notas
  add column if not exists periodicidad_minutos int;
