-- Nota operativa libre de la cochera (independiente de si está o no
-- amarrada a una habitación/estadía): sirve para anotar cosas como "auto
-- del gerente", "cliente externo pagó S/10 por 2 días", una placa a mano,
-- etc. Se edita desde el panel de Habitaciones (ver
-- ConfiguracionService.actualizarCocheraOperativo()) igual que
-- habitaciones.notas_operativas -- queda tal cual hasta que alguien la
-- borre a mano.
alter table cocheras add column if not exists notas text;
