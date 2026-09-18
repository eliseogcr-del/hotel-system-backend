-- Primera fase del agente de WhatsApp (cotización automática por chat):
-- flags de configuración + estado nuevo para cotizaciones de grupo que
-- necesitan que un recepcionista defina el precio antes de confirmarse.
-- El envío/recepción de mensajes en sí (Meta Cloud API) es una fase
-- posterior, pendiente de la verificación del negocio en Meta Business.

-- Prender/apagar el bot es por hotel, apagado por defecto. El umbral decide
-- cuándo un pedido se cotiza solo (grupos chicos, tarifa normal x noches) y
-- cuándo queda pendiente de que alguien del hotel defina el precio (grupos
-- grandes, precio por persona a definir).
alter table hoteles add column if not exists agente_whatsapp_activo boolean not null default false;
alter table hoteles add column if not exists umbral_grupo_grande int not null default 10;

-- A voluntad del recepcionista: si está en false, el agente de WhatsApp
-- nunca ofrece esa habitación aunque esté realmente disponible -- es una
-- exclusión comercial/de política del hotel, no toca el motor de
-- disponibilidad real que usan reservas/cotizaciones hechas por el staff.
alter table habitaciones add column if not exists visible_whatsapp boolean not null default true;

-- 'pendiente_revision': cotización de grupo grande generada por el bot, sin
-- precio todavía -- el staff completa la tarifa por línea (ya editable) y
-- recién ahí la pasa a 'aprobada'. Una cotización 'directa' del bot (bajo el
-- umbral) sí trae precio automático y entra directo como 'aprobada'.
alter table cotizaciones drop constraint if exists cotizaciones_estado_check;
alter table cotizaciones add constraint cotizaciones_estado_check
    check (estado in ('pendiente','pendiente_revision','aprobada','convertida','vencida','cancelada'));

-- Para poder filtrar/reportar aparte las que arma el bot vs. las que arma
-- recepción a mano.
alter table cotizaciones add column if not exists origen text not null default 'manual' check (origen in ('manual','whatsapp'));
