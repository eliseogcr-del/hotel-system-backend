-- 'whatsapp' ya era un origen válido para reservas hechas a mano por
-- recepción cuando el cliente escribe por WhatsApp con una persona (ver
-- ORIGENES en ReservaFormModal.tsx) -- no distingue eso de una reserva
-- creada sola por el agente de WhatsApp (formulario público sin login).
-- Se agrega un flag aparte para no reusar `origen` con dos significados
-- distintos: el calendario de Reservas pinta de naranja solo cuando este
-- flag es true, nunca por el origen.
alter table reservas
  add column if not exists creado_por_agente boolean not null default false;
