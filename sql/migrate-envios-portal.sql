-- El portal del cadete: un link público, responsive, con los envíos del día.
--
-- # Qué resuelve
--
-- Hasta hoy el cadete salía con los tickets y **la información volvía cuando volvía él**: quién
-- recibió, quién no estaba, quién pagó. Toda la tarde la hoja del día decía lo mismo que a la
-- mañana. Con esto marca desde la calle: entregado / no entregado, y cobrado / no cobrado.
--
-- ⛔ **No es la pantalla interna, y no puede serlo.** La de adentro muestra la cuenta corriente, deja
-- borrar filas y tiene la orden de Tienda Nube completa. Esto es otra pantalla, con otra salida
-- (`paraElCadete`, en `lib/envios/portal.core.js`) que se arma campo por campo.
--
-- # Cómo se protege
--
-- Lo que hay del otro lado no es plata: son **nombres, direcciones y teléfonos de clientas**. Tres
-- barreras, y ninguna alcanza sola:
--
--   1. **El token**, 64 hex, con vencimiento. Mismo patrón que `/reclamo/<token>` y `/canje/<token>`.
--   2. **El PIN**, corto, con contador de fallos y traba temporal.
--   3. **El día**: el link sirve para hoy (±1 por el huso), nunca para la agenda entera.
--
-- 🔑 **El PIN va en claro, a propósito.** No es la credencial de una persona: es un segundo factor
-- sobre 64 hex inadivinables, y su trabajo es que un link reenviado por WhatsApp no alcance solo.
-- Las chicas tienen que poder LEERLO en pantalla para mandárselo al cadete; hashearlo obligaría a
-- mostrarlo una sola vez al rotar, que es la forma garantizada de que se pierda y que nadie rote más.
--
-- 🔴 **La tabla nace VACÍA y sin token.** Un token escrito en un archivo del repo es un token
-- comprometido. El primero se genera desde la pantalla, con el botón que después se va a usar todos
-- los meses: así el camino que renueva queda ejercido el día uno y no se descubre roto en noviembre.
--
-- Aditiva: va ANTES de deployar. Correr con `node scripts/apply-envios.mjs`. Idempotente.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Lo que el cadete reporta desde la puerta.
--
-- 🔑 **`null` NO es `false`.** `null` es "todavía no dijo nada"; `false` es "no me pagó", que es un
-- hecho que él reporta. Sin esa diferencia, la rendición no puede distinguir un envío que falta
-- cobrar de uno que nadie tocó — y esos dos se saldan de formas opuestas.
--
-- Todavía no entra en `cuentaDelCadete`: la caja queda para otra tanda. Es el hecho que va a
-- permitir que el cierre deje de ser un número tipeado a mano.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table envios_reparto add column if not exists cobrado boolean;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- El link vigente. **Una sola fila**, siempre.
--
-- El token no es un atributo de un envío ni de un día ni de una marca: es un atributo del PORTAL,
-- que es lo que se renueva. Colgarlo de `envios_dia` haría que «cuál es el link vigente» tenga
-- trescientas respuestas; en una variable de entorno, renovarlo sería un deploy. El precedente en
-- este repo es `canje_config`.
--
-- Tampoco un token por envío como reclamos y canjes: la consigna es UN link, y por envío serían
-- doce links por día para la misma persona.
--
-- El `check` sobre el `id` es lo que hace cumplir el "una sola": sin él, dos filas y ninguna forma
-- de saber cuál gana.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists envios_portal (
  id                  text primary key default 'cadete' check (id = 'cadete'),
  token               text not null,
  token_vence         timestamptz not null,
  pin                 text not null,
  pin_fallos          integer not null default 0,
  pin_bloqueado_hasta timestamptz,
  rotado_por          text,
  rotado_en           timestamptz not null default now()
);

-- ⚠️ Igual que en las otras dos: prender RLS no queda como default de la base. Una tabla creada
-- después de `migrate-rls.sql` nace SIN RLS y sería la única abierta — y acá adentro está la llave
-- del único endpoint de Envíos que da a internet.
alter table envios_portal enable row level security;
