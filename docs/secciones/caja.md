# Caja — ficha de sección

Sección `caja`, área `local`, sólo Zattia. El POS propio del local: se escanea, se cobra por cuenta
con su descuento, sale el vuelto y el ticket, y la venta queda en Gestión Nube con su número, en la
cuenta de cobro y bajando el stock. Reemplaza al POS de GN (`/ventas/pos`), que ⛔ muestra el stock
en el pedido, ⛔ tiene vuelto y ⛔ guarda el mail sin dar de alta al cliente (decidido el 3-oct-2026).
El plan completo, por fases, vive afuera del repo: `~/Documents/reunion-gerencia/2026-10-03-POS-plan-v1.md`.

## Dónde vive

`components/caja/Caja.tsx` · `lib/caja/` (`core.core.js` el cobro, `gn.core.js` la respuesta de
GN, `enviar.core.js` el envío compartido con la cola, `ticket.ts` el papel, `cliente.ts`) ·
`api/_caja.js` por `?recurso=caja` · tablas `caja_venta` y `caja_config` en la base de **Zattia**
(`sql/migrate-caja.sql`) · respaldo de la cola `scripts/caja-reintentar.mjs` +
`.github/workflows/caja-reintentar.yml` · tests `tests/caja-*.test.ts`.

## ⛔ Lo que comparte con otras secciones

- **El precio es el de Etiquetas** (`construirPrecios`, `lib/etiquetas/core.ts`): la Caja cobra lo
  que dice la etiqueta colgada, y la cajera lo puede cambiar. Tocar esa regla cambia lo que se cobra.
- `lib/gn/inventario-vivo.core.js` es también de `api/_inventario-vivo.js` (los Conteos).
- `lib/rollo80.ts` es también del ticket y el recibo de Envíos.

## Reglas que el código no dice

- 🔴 **El dinero se calcula DOS veces con el MISMO núcleo**: la pantalla para mostrarlo, el servidor
  para mandarlo. Si el total que vio la cajera ⛔ coincide ⇒ 409 y ⛔ sale nada a GN.
- 🔴 **En el `POST /ventas`, `items[].discount` son PESOS; en las ventas del POS de GN, %.** Medido
  con ventas reales (#30046/#30047). Cualquier lector de ventas tiene que mirar `integration_source`.
- 🔴 **GN ⛔ acepta descuento negativo** ⇒ el redondeo PARA ARRIBA se suma al `unit_price`, y en el
  ticket se llama «Recargo por redondeo» (Bruno, 4-oct). Feria TC (recargo) ⛔ se cobra en la Caja.
- 🔑 **El id de la venta es el `integration_id` de GN, nace con el carrito y vive en el
  `localStorage` con él.** Reintentar con el mismo id ⇒ GN contesta 409 = «ya está». Se renueva sólo
  cuando el servidor contestó: renovarlo antes de saber es la forma de duplicar una venta.
- 🔑 **Con GN caído se cobra igual**: el ticket sale con el número provisorio (8 letras del id) y la
  venta queda en el cartel rojo de Pendientes; la cola la reintenta cada 10 min.
- 🔴 `referencias` trae el **saldo** de las cuentas de GN: al navegador va sólo id, nombre y regla.
- 🔴 El stock se lee con `GN_TOKEN_ZATTIA`; `GN_TOKEN_VENTAS` ⛔ lee `inventario` (caía al espejo, callado).
- ⚠️ Cada unidad viaja en su renglón con `quantity: 1`: con cantidad > 1, cómo toma GN el descuento
  en pesos ⛔ está medido.
- ⚠️ La política de cambio del pie del ticket la escribe un admin desde la pantalla (`caja_config`).

## Pendiente

- F4: el ticket por mail y el alta en la base del mailer (`source:"pos"`). Hoy el mail se GUARDA en
  `caja_venta.email` y ⛔ se manda nada.
- F5: transferencia que se confirma sola contra Pagos recibidos.
- Una semana en paralelo con el POS de GN antes de apagarlo; definir si la Caja usa los turnos de GN.
- ⛔ Probado `--kiosk-printing` en la PC del local (imprimir sin diálogo).
