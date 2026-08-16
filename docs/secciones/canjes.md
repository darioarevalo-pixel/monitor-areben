# Canjes — ficha de sección

Sección `canjes`, área `marketing`. Canjes con creadoras de contenido, de punta a punta: el padrón
(quién es cada una, cuándo se habló por última vez), la propuesta, lo que ella elige, la compra o el
retiro, el contenido que publica y el cierre. **Está en producción y en uso real desde agosto de
2026** — no es un módulo a estrenar: lo usan marketing y el mostrador todos los días.

## Dónde vive

Es la sección más grande del monitor (~18.700 líneas con tests) y **cruza cinco lugares**:

| | |
|---|---|
| panel | `components/canjes/` (22 archivos; los caros: `FichaCanje.tsx` 866 · `Vitrinas.tsx` 783) |
| lógica | `lib/canjes/` (16 archivos; `tipos.ts` **1.261** · `cliente.ts` 803 · `vitrina.ts` 462) |
| reglas duras | `lib/canjes/reglas.core.js` — 📌 **se mudó de `api/_canjes-reglas.js`**, que ya no existe |
| servidor | `api/_canjes.js` (**2.227**) y `api/_canje-portal.js` (533), por `api/postventa.js?recurso=canjes` y `?recurso=canje` |
| mostrador | `components/cupones/CanjesLocal.tsx` — la pestaña del local, adentro de **Cupones** |
| base | 8 tablas `canje_*` en la base de **BDI, para las tres marcas** (`sql/migrate-canjes.sql`) |
| tests | 8 archivos `tests/canje*.test.ts`, ~3.300 líneas |

Portal público sin sesión: `/canje/<token>`, fuera del nav y resuelto antes del guard de permisos.

🔑 **`api/_canjes.js` no se lee entero.** Son ~47 acciones en una sola cadena de `if`: ubicarlas con
`grep -n "action === '" api/_canjes.js` y leer por rango. Arriba de `const id = parseInt(b.id, 10)`
(~848) están las que no cuelgan de un id; de ahí para abajo todas lo asumen.

## ⛔ Lo que comparte con otras secciones

- **`lib/canjes/reglas.core.js` lo importan los DOS handlers**, y uno es `api/_canje-portal.js`, el
  único endpoint del módulo **sin sesión y abierto a internet**. Por eso ese archivo **no importa
  nada**: arrastrar `_auth.js` + `permisos.core.js` al bundle del portal es justo lo que evita.
  Tocarlo toca el panel y el teléfono de ella a la vez.
- **El precio de la vitrina ya no es de Canjes**: `precioDeVitrina` es un re-export de
  `precioVigente` (`lib/tienda.core.js:58`), que usa también el buscador de **Atención**. Cambiar la
  regla del precio cambia lo que se cotiza por WhatsApp.
- **La pestaña del local vive en Cupones** (`components/cupones/`, la sección se llama «Cupones y
  canjes» y la pestaña sólo aparece en BDI): quien toca Cupones está tocando Canjes.
- **La entrega en el mostrador escribe una venta real en Gestión Nube** por `api/crear-venta.js`,
  que es también de Sesión de fotos y de Fallas. 🔴 Su CORS no se puede sacar.
- `puedeAtenderRetiroLocal` (`lib/permisos.core.js:395`) es **la única rendija** por la que alguien
  sin la sección `canjes` —que es de Marketing— toca un canje.
- `lib/canjes/seguimiento.ts` importa `diasDesde`/`addDiasISO` de `lib/crm/core.ts`, no los copia.

## Lo que ya está comentado, y hay que leer antes de tocar

El módulo está muy documentado **adentro**. Esta ficha no lo repite: acá va qué mirar con cuidado.

- El **grafo de estados** y por qué `propuesta → acuerdo` no existe → `lib/canjes/reglas.core.js:35`.
  🔑 El token del portal y `acordado_at` nacen **cuando ella acepta**, no al aprobar puertas adentro.
- **De dónde sale «¿hay para su celular?»**: son tres respuestas, no una → `lib/canjes/modelos.ts:84`.
- **El orden de la lista** («primero lo que espera algo nuestro») sale de `tramoDeCanje` + `PESO_TRAMO`,
  una sola derivación con la etiqueta que se lee → `lib/canjes/tipos.ts:132`.
- **La venta del retiro es TÉCNICA** ⇒ esas unidades no existen para rotación, vida útil, caducados
  ni CRM; cómo revertirlo, en dos líneas → `api/crear-venta.js:36`.
- **El puntaje se escribió antes de tener datos** y lo único que lo sostiene es el piso mínimo →
  `lib/canjes/puntaje.ts:1`.
- **`bloquear_por_vencidos` arranca apagado a propósito** → `lib/canjes/tipos.ts:1025`.
- **El precio es `promo_price ?? price`**, con la medición de los dos catálogos → `lib/tienda.core.js:58`.

## Reglas que el código no dice

Decisiones de Bruno y cosas medidas contra los catálogos y las vitrinas reales. **Ya están tomadas:
no re-preguntarlas.**

- 🔑 **El arranque son DOS contactos**: primero el sondeo («¿te interesa?») y **sólo si contesta que
  sí**, la propuesta con el número. Tirarle el trato antes de que quiera hablar se contesta que no
  mucho más fácil, y si queda corto la negociación arranca perdiendo. Por eso `mensajeSondeo` no
  puede tener **ningún dígito**, y hay un test que lo exige.
- 🔑 **La vitrina se reutiliza entre canjes; el link NO.** Cada persona conserva su token, porque
  lleva su cantidad y sus datos prellenados.
- 🔴 **La llave de un item de vitrina es el `id` de variante de Tienda Nube, no el SKU.** Medido: en
  BDI falta en 4 de cada 10 variantes y en Zattia se repite igual en las 24 de un producto.
  Consecuencias que parecen olvidos: lo que ella elige llega **sin SKU** (el botón de buscar en el
  admin copia `nombre · variante`, no un código) y **el costo no se puede cruzar**, así que los items
  van con `costo_unit: null` y el balance los estima con `factor_costo_estimado` (0,4).
- 🔴 **Contestar con el stock general es la misma mentira que el texto libre, con más números
  encima.** Medido en la vitrina «Girlhood Collection» (19 productos activos): el iPhone 11 tiene
  **uno** y el iPhone 12 **ninguno**, mientras GN dice 3.205 y 901. Se **cayeron dos canjes** por
  acordar con alguien cuyo modelo no teníamos.
- 🔑 **El mail de la orden de Tienda Nube es el de la MARCA** (`canje_config.email_pedido`), nunca el
  de ella: la orden es un trámite interno para que el envío salga y la venta marque $0. Con el de
  ella, TN le mandaba los avisos de una compra que no hizo. ⚠️ Si la marca no lo cargó el campo sale
  **vacío a propósito** — no cae al de ella, y así se ve que falta.
- 🔑 **QUE ELLA ACEPTE ES LA CONFIRMACIÓN** (Bruno, textual). Se empezó a construir un paso aparte de
  «confirmar para el local» y lo frenó antes de que llegara a la base: apenas el canje pasa a
  `acuerdo` le aparece al mostrador, y no hay nada en el medio.
- ⛔ **Cambiar envío ↔ retiro no es el trato, es logística.** «Ya lo acordamos y después me dice que
  pasa por el local» es el caso normal ⇒ es acción propia y el corte es **haber salido**, no el
  estado. ⚠️ La lección general: un campo que se elige al crear casi siempre necesita también dónde
  cambiarse después.
- ⛔ **Nada de CSV ni de subir un Excel para el alta masiva**: es una grilla para tipear. Los datos no
  vienen de una planilla, se tipean mirando Instagram.
- 🔑 **«Canjes masivos» = un canje IGUAL para N personas**, cada una con el suyo, su link y sus datos.
  **No** es un canje con varias personas adentro: el token, la cantidad y lo prellenado cuelgan de la
  persona.
- 🔑 **El cupón de 100% es genérico, uno por marca y sin vencimiento** — «es para uso interno de
  marketing, para que la venta marque $0, nada más». `cupon_desde`/`cupon_hasta` siguen sin usarse a
  propósito: no volver a proponerlas.
- ⛔ **De Tienda Nube sólo se LEE.** El monitor no crea órdenes ni cupones: la orden se tipea a mano
  en el admin con los botones de copiar campo por campo.
- 🔴 **Los sub-permisos no se heredan de la función.** Por eso **no se creó** `canjes-entregar`, que
  el plan pedía: habría que tildarlo usuario por usuario y el día del deploy no anda para nadie.
- ⚠️ **`published: false` en BDI significa dos cosas** y de afuera no se distinguen: lo agotado que se
  despublica, y **el ingreso nuevo que todavía no salió**. Medido el 4-ago-2026: 81 despublicados, de
  los cuales 20 modelos con stock completo y **sin ninguna categoría**. Por eso los ocultos son un
  filtro propio y «Revisar el stock» manda por el **stock**, no por la publicación.

## Lo que ya se rompió acá

- 🔴 **`itemDeVitrinaDelBody` es lista blanca** (`api/_canjes.js:377`): un campo nuevo que no se
  agregue ahí viaja desde el panel y **se pierde sin un solo error**. Y su `texto()` hace `String(v)`
  sobre lo que sea, así que una lista de URLs entra como `"[object Object]"`.
- 🔴 **La vitrina no se entera sola de que algo se agotó.** Traer de nuevo la categoría sólo refresca
  lo que vuelve en esa importación, y un producto agotado del todo **ya no vuelve**: su fila quedaba
  intacta y se ofrecía para siempre. Lo arregla «Revisar el stock», que además **no toca nada si la
  tienda devuelve cero productos** — sin esa guarda una lectura fallida apaga la vitrina entera y es
  indistinguible de «se agotó todo». ⛔ Y no vuelve a prender lo que alguien apagó a mano.
- 🔴 **La pestaña del local abría con «store inválido»**: `leerCanjesDelLocal` no mandaba `store` y el
  handler lo exige antes de mirar la vista. **Ninguna prueba lo cazaba porque la capa cliente no
  estaba cubierta**; hoy hay un test que stubea `fetch` y mira la URL. Una vista nueva es justo donde
  se olvida un parámetro.
- 🔴 **`canje_entregables` no tiene columna `usuario`** (→ `api/_canjes.js:1297`) y el canje se
  inserta antes: cada intento dejaba un canje vacío. Hoy si los entregables fallan **el canje se
  borra** — supabase-js va por REST, no hay transacción, se compensa a mano.
- 🔴 **No se podía pasar a retiro un canje ya acordado**: el selector estaba sólo al proponer y
  `canje-editar` corre sólo en `propuesta`/`enviada`.
- ⚠️ **Dos listeners de Escape sobre `window` corren los dos**, y `stopPropagation` no los separa: por
  eso el visor de fotos **no** tiene listener propio, el dueño de las dos capas es `PortalVitrina`.
- ⚠️ **El lint prohíbe `setState` adentro de un `useEffect`**: `Ajustes` inicializa el formulario en
  el `useState` y **se remonta con `key`** desde `Canjes.tsx`. Es el patrón a copiar para el próximo
  formulario que espere datos asincrónicos.

## Pendiente

- 🐢 **La entrega en el mostrador va LENTA.** Es lo único que reportaron del uso real: no falla,
  tarda. Hace dos idas —crear la venta en GN y recién después registrar—, así que el candidato obvio
  es esa cadena, con el cliente esperando adelante. **Nadie midió cuánto tarda**: es una queja, no un
  número. Primero medir.
- ▶️ **Falta cargar `email_pedido` en las tres marcas**: sin eso la tarjeta «Mail» de la orden sale
  vacía.
- ⚠️ **`acuerdo` quedó tercero en el orden de la lista por decisión de quien lo escribió, no de
  Bruno** — no estaba en la lista que él eligió y **falta que lo confirme**.
- ⚠️ **Las vitrinas cargadas antes de la galería no la tienen**, y el panel lo avisa. Se rellenan con
  «Revisar el stock», que recorre la vitrina entera contra la tienda de hoy — **no** con «Actualizar
  la tienda», que sólo refresca lo que venga en esa importación. Un backfill por script es imposible:
  el catálogo de TN sólo se lee desde el panel.
- ⚠️ `umbral_aprobacion_alta` sigue en `null`, o sea que **todo va a firma alta**.
- ▶️ La novedad del retiro en el local quedó en **borrador**, sin publicar.

## Cómo se prueba

`npx vitest run tests/canjes-flujo.test.ts --reporter=dot` es el flujo entero; los otros siete, por
nombre. Lo que no es obvio:

- 🔴 **Lo que ningún test cubre es la venta en Gestión Nube.** `entregado_at` es lo **único** que
  frena una venta duplicada y **GN no permite anular por API**: dos toques seguidos serían dos ventas
  y dos veces el stock descontado. Hay test y se cazó **mutando la guarda** — si se toca esa zona,
  volver a mutarla.
- **Una vitrina sólo se arma desde el panel**: el catálogo de TN no se lee de ningún otro lado, ni
  por script. Probar un cambio de vitrina es armar una de verdad, activarla, colgarla a un canje
  acordado y **abrir el link desde un celular** — el portal es lo único del monitor que se usa en un
  teléfono ajeno.
- ⚠️ En localhost el login por Google no anda: se entra por usuario y contraseña.
