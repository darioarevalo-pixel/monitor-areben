-- bases: bdi
-- «Ya se resolvió»: sacar de la bandeja lo que no va a salir en la moto (Bruno, 22-oct-2026).
--
-- # Para qué
--
-- La bandeja «Sin fecha» no se vaciaba nunca: un pedido sólo salía si alguien lo agendaba o lo borraba.
-- Medido el 22-oct: 51 filas, 15 de más de 30 días, y de las 43 de Tienda Nube **ninguna seguía abierta en
-- TN** (19 entregadas, 9 canceladas, 15 cerradas sin despachar).
--
-- # Por qué columnas y no un estado
--
-- 🔑 Resolver **no toca `estado`, `fecha` ni `cobrado`**: la cuenta del cadete y la venta del ERP
-- (`seguirVenta`) leen esas tres, y un pedido que retiró la clienta en el local no es algo que el cadete
-- haya entregado. Es una marca aparte, y volverla a `null` lo devuelve a la bandeja tal como estaba.
--
-- Los motivos viven en `MOTIVOS_RESUELTO` (`lib/envios/reglas.core.js`); el check los repite para que una
-- escritura con basura rebote en la base y no aparezca como un rótulo vacío en la pantalla.
--
-- Aditiva: va ANTES de deployar (la pantalla la lee en `CAMPOS`). Correr con `node scripts/apply-envios.mjs`.
-- Idempotente.
alter table envios_reparto add column if not exists resuelto_motivo text;
alter table envios_reparto add column if not exists resuelto_en timestamptz;
alter table envios_reparto add column if not exists resuelto_por text;
alter table envios_reparto add column if not exists resuelto_nota text;
alter table envios_reparto drop constraint if exists envios_resuelto_motivo_valido;
alter table envios_reparto add constraint envios_resuelto_motivo_valido check (
  resuelto_motivo is null or resuelto_motivo in (
    'tn_entregada', 'tn_cancelada', 'retiro_local', 'entregado_por_fuera', 'cancelado', 'por_correo', 'otro'
  )
);
