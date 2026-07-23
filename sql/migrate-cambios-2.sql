-- Cambios Fase B.2: número de seguimiento del envío (cargable al crear o después). Idempotente.
alter table cambios add column if not exists seguimiento text;
