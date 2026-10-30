-- Fallas — el número del AJUSTE del ERP que descontó la unidad. Idempotente.
-- Desde el corte de Stunned (28-oct-2026) su falla ⛔ crea una venta en GN: el ERP la baja con un ajuste
-- «Fallado» (A-N, `api/_salida-documento.js` → `fallaStunnedAlErp`). Sin esta columna el número quedaba
-- sólo en el historial y la lista ⛔ lo mostraba, como sí muestra `gn_venta_number`.
-- Las fallas viejas (todas de GN) quedan en null.
-- Correr en Supabase de BDI y ZATTIA ANTES de deployar: `api/_fallas.js` la pide en su SELECT.
alter table fallas_deposito add column if not exists erp_ajuste integer;
