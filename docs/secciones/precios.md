# Precios de campaña — ficha de sección

Sección `precios`, área `marketing`. **La lista de precios de una campaña de Liquidación, para quien
tiene que comunicarla**: foto, precio de lista, precio de campaña, % off, stock y la ⭐ de producto
estrella. ⛔ Sin costo, sin markup, sin margen y sin ventas.

Nació el 10-sep-2026, de un pedido de Bruno con fecha encima: *«necesito que las chicas puedan ver
qué precio van a estar los distintos productos»*. La **Feria Septiembre 2026** de Zattia arranca el
**lunes 14** con 351 productos, y sus precios ⛔ **no están publicados** —va oculta en Tienda Nube,
se vende presencial— así que la tienda ⛔ no sirve de lista de precios.

## Dónde vive

- `components/precios/Precios.tsx` — la pantalla entera (selector de campaña + tabla).
- `lib/precios/` — `core.core.js` (**la lista blanca**, JS plano porque la usa el handler) ·
  `core.ts` (el re-export tipado) · `tipos.ts` · `persistencia.ts`.
- Handler: `api/_precios.js`, por `/api/datos?recurso=precios`. **Sólo GET.**
- ⛔ **No tiene tablas propias.** Lee `liquidaciones` + `liquidacion_items` (de Liquidación),
  `inventario` y `sync_state` (el espejo) y `destacados` (las ⭐).
- Tests: `tests/precios-marketing.test.ts` (la lista blanca, 5 mutantes) y el bloque
  `_precios · la puerta de Marketing, y la que sigue cerrada` de `tests/handlers-autorizacion.test.ts`.

## 🔴 Por qué existe en vez de darle `liquidacion` a Marketing

**Porque `liquidacion` está afuera de la función `marketing` a propósito, ⛔ no por olvido**
(`lib/permisos.core.js`): la foto congelada de cada ítem trae `costo`, `sinCosto`, `markup`,
`margen` y las ventas de 7/30/90 días, y sus tres tablas los dibujan. **La feria se vende al costo**
—el ítem real que usa el test tiene costo $8.295,89 contra un precio de feria de $8.990—, así que
abrir esa sección es publicar el margen de la casa adentro del equipo.

⇒ Lo que sale de acá pasa entero por `listaParaMarketing()`, que es una **lista blanca**: un campo se
agrega ahí o **no viaja**. Una lista negra («sacale el costo») falla en silencio el día que alguien
suma un campo a la foto — y el test tiene un caso que fija exactamente eso.

## Reglas que el código no dice

- 🔴 **Un `definido` ⛔ no se dibuja igual que un `confirmado`, y ése es el punto de la pantalla.**
  Un `definido` es un precio que puso una persona y que **nadie miró**; cambiarlo lo devuelve a la
  cola de revisión, y eso puede pasar el domingo. Al 10-sep la feria tiene **286 confirmados y 65
  sin revisar**: mostrarlos iguales le hace prometer a Marketing el 18% de una lista que se puede
  mover. Va como chip (**Confirmado** / **Provisorio**) y como aviso arriba de la tabla.
- 🔑 **Se comparte con un INTERRUPTOR, ⛔ no con el estado de la campaña.** El botón «Compartir con
  Marketing» vive en Liquidación y lo aprieta un **admin** (`action:'compartir'`). Derivarlo de
  `en_curso | aplicada` estaba mal por los dos lados: dejaba afuera una campaña **en borrador** con
  los precios listos —que es justo el caso que abrió esto— y adentro cualquier prueba. ⛔ Una
  `cerrada` no se comparte aunque tenga el flag: sus precios ya no rigen.
- 🔑 **El stock es el de HOY y ⛔ no el de la foto congelada**, al revés que toda la sección
  Liquidación. La foto tiene las unidades del día en que el producto entró (para la feria, el
  6-sep) y esta lista manda a alguien a comunicar un producto: hace falta saber si queda algo.
  Y por eso viaja el sello (`sync_state.updated_at`) — el espejo se sincroniza una vez por día,
  así que decir «recién» sobre un número de ayer a la mañana sería mentir.
- 🆕 🔑 **El stock se toca y se abre por talle y color** (pedido de Bruno, 10-sep). Un número solo
  dice cuántas hay, ⛔ no CUÁLES — y una pieza que promete un corset que sólo queda en Verde S no
  sirve. 🔑 **En Gestión Nube el talle y el color son UNA sola cosa**: `size_name` viene como
  `Bordó - M`, así que «por talle o color» ⛔ no son dos desgloses, es uno.
  🔴 **Las columnas de tienda salen del DATO, ⛔ no de una lista escrita a mano.** Medido en las dos
  bases: Zattia tiene `Local` y **`Deposito ` con un espacio al final** (de ahí el `trim`), y **BDI
  tiene TRES** — `Local`, `Deposito Minorista` y `Deposito Mayorista`, este último con **−13
  unidades**. Un `store_name === 'Local' ? … : 'deposito'` se habría tragado el mayorista de BDI sin
  que nada fallara, y en una feria presencial la pregunta es justamente **dónde está la prenda**.
  🔑 **El total de la fila y los renglones del desglose salen de la MISMA cuenta**, así que las
  variantes en cero **viajan** aunque la pantalla las pliegue: filtrarlas en el núcleo dejaría un
  desglose que no suma su propio encabezado. Medido: de **955 variantes, 630 tienen unidades** — un
  CORSET FRANK son 28 renglones y **3** con algo. Y viaja **entero en el payload** (60 KB para los
  351): un pedido por producto serían 351 requests para una tabla que se mira de arriba abajo.
  ⛔ **Un producto sin variantes ⛔ no se abre**: `Variante Única` es como GN dice «no tiene», ⛔ no es
  un talle. Son 68 de los 351.
- ⛔ **Los `descartado` y los `pendiente` ⛔ no entran.** Un descartado se miró y se decidió que NO
  va (25 en la feria): comunicarlo es prometer algo que no está en la mesa. Un pendiente ⛔ no tiene
  precio, y un renglón sin número en una lista de precios es una pregunta abierta, no información.
- ⛔ **`null` en el % off dice «—» y ⛔ NUNCA 0.** Un «0% off» afirma que el precio no bajó, que es la
  peor respuesta posible en una lista de liquidación. Misma regla que el ★ sin votos de Diseños.
- 🔑 **La nota de la campaña se muestra, y ahí es donde se dice que la feria es PRESENCIAL.** Sin
  eso, una lista de precios se lee como una lista de precios **de la tienda** — y la feria justamente
  no se publica online. La escribe quien arma la campaña, en Liquidación → Editar.

## ⛔ Lo que comparte con otras secciones

- **La ⭐ es de `destacados`, ⛔ no de acá** (`api/_destacados.js`, `components/destacados/`). La misma
  estrella se marca desde tres pantallas de dos áreas: esta lista, la campaña por dentro
  (Liquidación) y Análisis → Por producto. Ver `sql/migrate-destacados.sql`.
- **`compartida` vive en `liquidaciones.datos`** (jsonb, sin migración) y lo escribe
  `api/_liquidacion.js`. ⛔ El flag **nunca viaja en el body**: se lee y se reescribe en el servidor,
  por el mismo motivo por el que `confirmado` no entra por `guardar-item`.

## Cómo se prueba

```bash
npx vitest run tests/precios-marketing.test.ts tests/handlers-autorizacion.test.ts --reporter=dot
```

- 🔴 **El mutante que hay que ver caer**: hacer que `paraMarketing` devuelva `{ ...item, ...f, ...d }`
  en vez de campo por campo. Es la lista blanca convertida en lista negra, y es el único cambio que
  reabre el costo sin romper ninguna pantalla. Los otros nueve están listados en los dos docblocks
  del test — **10 mutantes, 10 muertos**.
- 🔑 **El desglose se mide contra SQL, ⛔ no contra sí mismo**: el total de cada producto tiene que
  dar lo mismo que un `sum(available_quantity) group by product_id`. Corrido el 10-sep sobre los
  351: **0 diferencias**.
- **El fixture del test es un ítem REAL de la feria**, leído de la base. A propósito: un fixture
  escrito a mano tiende a traer sólo los campos que uno se acuerda, que son justo los que la lista
  blanca ya deja pasar.
- **Medir contra la base, ⛔ no estimar**: `DATABASE_URL_ZATTIA` / `_BDI` del `.env` llegan a las dos
  marcas desde local. La lista de la feria tiene que dar **351** (286 + 65) y **cero** apariciones
  del costo.

## Pendiente

- 🔴 ⛔ **Nadie con perfil de Marketing la caminó**: los usuarios de prueba los crea Bruno. Todo lo
  verificado hasta ahora está hecho con admin — el mismo agujero que quedó abierto en Ventas de
  Marketing.
- ▶️ **No hay salida a archivo.** Si hace falta llevarse la lista al celular o imprimirla para el
  local, hoy es la pantalla o nada. Se decide cuando se sepa si hace falta.
