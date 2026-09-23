# Cobranzas — ficha de sección

Sección `cobranzas`, área `administracion`. Las compras de Tienda Nube con pago **manual**
(transferencia directa a la cuenta de la empresa, efectivo al retirar) que Pago Nube no concilia solo.
La pidió Bruno el 23-sep-2026 para abrir la feria de Zattia online; los cobros los carga él.

## Dónde vive

`components/cobranzas/` · `lib/cobranzas/` (la regla en `core.core.js`, tipada en `tipos.ts`) ·
`api/_cobranzas.js` por `?recurso=cobranzas` · tabla `tn_cobros` (`sql/migrate-tn-cobros.sql`) ·
tests `tests/cobranzas.test.ts` y `tests/cobranzas-handler.test.ts`.
La otra mitad está en **`bdi-catalogo`**: `?cobros=1` de `api/tiendanube-audit.js` (la lista liviana)
y la acción `nota-cobro` de `api/tn-categorias.js` (la nota interna de la orden).

## ⛔ Lo que comparte con otras secciones

- 🔴 **Envíos del día.** Cobrar una orden le pone en **cero** `monto_pedido_a_cobrar` a su fila de
  `envios_reparto` (si todavía no se entregó), y `traer-tn` de `api/_envios.js` mira `tn_cobros` para
  que una orden ya cobrada entre en cero. Sin esto el cadete cobra dos veces: TN sigue en `pending`
  hasta que una persona aprieta «pagado». Anular devuelve el saldo **sólo si sigue en 0** (si alguien
  lo corrigió a mano, su número manda). Por eso `tn_cobros` vive en la base de BDI, junto a
  `envios_reparto`, y ⛔ en la de cada marca.

## Reglas que el código no dice

- 🔴 **TiendaNube ⛔ deja marcar una orden pagada por API** (doc de `resources/order`: *«there is no
  action to pay an order»*; las transacciones son *«for the exclusive use of payment apps»*). ⇒ el
  cobro vive acá, en la orden queda una **línea en la nota interna**, y el «pagado» se aprieta en el
  admin con el link de la fila. El estado sale de **cruzar las dos verdades**: `estadoDeCobro`.
- 🔑 **Manual = `gateway: 'offline'`**, ⛔ el método. Medido el 23-sep-2026 sobre 236 órdenes de Zattia:
  las transferencias de **Pago Nube** también dicen `wire_transfer` y se concilian solas.
  Ese día: 18 manuales pagadas, 13 canceladas sin pagar (no van) y **2 cerradas todavía `pending`**.
- 🔑 **Cancelada con cobro = «Revisar», ⛔ se esconde**: es plata de una compra que ya no existe.
- 🔑 **La nota se AGREGA, ⛔ pisa** (la escribe también el equipo) y lleva el **id del cobro**: así el
  reintento no la duplica. El cobro vale aunque la nota falle; `nota_tn` dice cómo quedó.
- ⚠️ **Nadie comprobó todavía que el token de TN tenga `write_orders`.** Si no lo tiene, `nota_tn`
  queda en `sin-permiso` y la pantalla lo dice: el cobro sirve igual, falta el permiso de la app.
- ⚠️ La ventana que se le pide a TN (45 días) **se estira hasta la orden más vieja con cobro vigente**:
  si no, una cobrada hace dos meses y sin marcar en TN se iría de la lista sólo por vieja.
- 🔑 Cobrar y anular piden el sub **`cobranzas.cobrar`**, que ⛔ se hereda de la función.
- ⚠️ Marcar pagado en TN dispara `order/paid` ⇒ **el mailer manda los mails de compra y reseña**.

## Lo que ya se rompió acá

- `es-AR` con `2-digit` le saca el cero al mes en el ICU de Node («21/9») ⇒ la fecha de la nota se arma
  desde `en-CA` (`diaAR` en `core.core.js`).

## Pendiente

- Caminarlo en producción con un pedido de prueba (el circuito entero, ⛔ sólo el render).
- Verificar el link al admin (`/admin/orders/<id>` sobre `ADMIN_BASE`), que se armó sin abrirlo.
