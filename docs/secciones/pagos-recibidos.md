# Pagos recibidos — ficha de sección

Sección `pagos-recibidos`, área `local`. La pantalla que queda abierta en la compu del local para
que la empleada entregue la compra cuando el pago **aparece acá**, y no por lo que muestra el
teléfono de la clienta (la estafa de la app falsa de Mercado Pago). Nació el 2-oct-2026 a pedido de
Darío. Reemplaza mirar la app de MP, a la que las empleadas no tienen acceso.

## Dónde vive

`components/pagos-recibidos/PagosRecibidos.tsx` · `lib/pagos-recibidos/` (`core.core.js` lo usa
el handler; `cliente.ts`, el navegador) · `api/_pagos-recibidos.js` por `?recurso=pagos-recibidos`
· los pagos ⛔ se guardan: se leen de `/v1/payments/search` en cada pedido · `tests/pagos-recibidos.test.ts` y `-handler.test.ts` (base y MP de mentira).

⛔ **La Caja también lee de acá** (F5, la transferencia que se confirma sola): `pagosDelDia` y
`usosDe` se exportan del handler, y `cruzarTransferencia` vive en `core.core.js`. Qué pago «cuenta»
acá decide qué venta se manda a GN allá. Ver `docs/secciones/caja.md`.

Las cuentas viven en `mp_cuentas` + `mp_cuenta_uso` de la base de cada marca
(`sql/migrate-mp-cuentas.sql`) y se cargan **desde la pantalla** (bloque «Cuenta de cobro», sólo
admin). ⛔ No hay variable en Vercel: Darío pidió poder cambiar la cuenta de cobro sin tocar Vercel
(*«las cuentas son dinámicas de cada local, nosotros definimos la cuenta a cobrar»*). La llave se saca
en developers.mercadopago → la aplicación «Monitor Cobros» de **la cuenta que tiene el alias del
local** → Credenciales de producción. 🔴 En Zattia, al nacer, era la cuenta PERSONAL de Darío (apodo
`BDIACCESORIOS`, user 136578181), ⛔ la de Areben: la de la empresa no recibe esas transferencias.

## Reglas que el código no dice

- 🔑 **Cada día se busca en la cuenta que estaba en uso ese día** (`cuentasDelDia`), y el día del
  cambio en las dos. Antes de la primera carga, en la primera: así el cierre de caja de los días
  previos se puede comparar igual. `mp_cuenta_uso` ⛔ se edita: es el historial que lo decide.
- 🔴 **Cargar una cuenta ⛔ es lo mismo que usarla** (17-oct). La cuenta EN USO es también la que mira
  la Caja para confirmar transferencias y la que decide a qué cuenta de GN se asientan
  (`transferenciaPorMp`): cambiarla sin mapeo deja a la Caja sin cobrar transferencias. Para tener
  una cuenta cargada sólo para LEERLA (el MP de Areben; el plan es tener todas, para cobranzas y
  seguimiento) está «Sólo guardar» (`cargar` con `usar: false`).
- 🔑 **El nombre de la cuenta es titular + CUIT, ⛔ el apodo** (Bruno, 17-oct). Areben es
  `BDI_ACCESORIOS` (CUIT 30-71850818-1, en BDI) y la personal de Darío `BDIACCESORIOS` (CUIT
  20-43007697-4, en Zattia): un guion bajo de diferencia. Las cargadas antes se ponen al día solas la
  primera vez que las mira un admin (`refrescarNombres`).
- 🔴 **La llave ⛔ sale del servidor.** Las consultas que responden piden columnas por nombre; lo
  amarra `tests/pagos-recibidos.test.ts`. Cargar es verificar contra MP (`/users/me`) y recién
  después guardar: el id de la cuenta sale de MP, ⛔ del body.
- 🔴 **El total y los otros días son sólo para admin, y lo corta el servidor.** Decisión de Darío:
  la empleada sólo verifica que el cobro llegó; el total es para que Dirección lo cruce con el
  cierre de caja. Esconderlo en la pantalla no alcanza: el handler ⛔ lo manda.
- 🔴 **Sólo cuenta lo que ENTRÓ y está `approved`.** Las transferencias que SALEN de la cuenta
  aparecen en la misma búsqueda (llegan sin `collector_id`, con `collector.id` de la otra cuenta):
  sin ese filtro, un pago a un proveedor se vería como un cobro.
- 🔑 **No hay nombre de quien paga, y no se va a poder.** MP no lo manda en transferencias: en las
  de otro banco (`account_fund`) el `payer` es el dueño de la cuenta. Se muestra monto + hora + de
  dónde vino; el mail y el CUIT que sí vienen ⛔ viajan al navegador.
- 🔑 **Consulta, no webhook.** Se evaluó el aviso automático de MP (webhook): pide un receptor
  público, firma y una tabla, y nunca se probó que avise las transferencias. La consulta cada 15 s
  sí se midió con la cuenta real y alcanza.
- 🔴 **El cartel rojo de «no se está actualizando» es la parte más importante.** Una lista vieja
  que parece nueva hace que la empleada niegue un pago que entró. A los 60 s sin lectura buena la
  lista se tapa.
- ⚠️ El sonido necesita un clic («Activar sonido») cada vez que se abre la pantalla: regla de los
  navegadores. ⛔ Ningún aviso depende sólo del sonido.
- ⚠️ MP devuelve las horas en UTC-4; se convierten con `Date.parse`, ⛔ se cortan como texto.

## Pendiente

- BDI (15-oct): `bdi` sumado a `brands`; falta correr `sql/migrate-mp-cuentas.sql` en su base (SQL Editor) y
  cargar la cuenta desde la pantalla.
- Cruzar cada pago con la venta de Gestión Nube (otro proyecto, no pedido todavía).
