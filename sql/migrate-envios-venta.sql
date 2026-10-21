-- bases: bdi
-- La VENTA del ERP de cada envío (contrato-venta.md §20, «Contraentrega»; Bruno, 20-oct-2026).
--
-- # Para qué
--
-- Una venta cargada con la forma de pago «Contraentrega» la cobra el cadete en la puerta. El ERP lleva la venta y si
-- ya se cobró; Envíos lleva la cuenta del cadete. Con esta columna el envío sabe cuál es su venta, y al marcarlo
-- «entregado» (desde la pantalla o el portal) le avisa al motor por dónde entró la plata: `cobrado` ≠ false ⇒ el
-- cadete, `false` ⇒ le transfirieron al local (`api/_envios-venta.js`).
--
-- # Por qué un uuid suelto y no una referencia
--
-- La venta vive en la base del MOTOR de la marca (la de Zattia es otra base), así que ⛔ hay foreign key posible:
-- el que la valida es el motor, que contesta `NO_ENCONTRADA`. `null` = el envío no tiene venta del ERP (todos los de
-- hoy, y los de TN hasta que el pedido sea venta propia).
--
-- Aditiva: va ANTES de deployar (la pantalla la lee en `CAMPOS`). Correr con `node scripts/apply-envios.mjs`.
-- Idempotente.
alter table envios_reparto add column if not exists venta_id uuid;
create index if not exists envios_reparto_venta_idx on envios_reparto (venta_id) where venta_id is not null;
