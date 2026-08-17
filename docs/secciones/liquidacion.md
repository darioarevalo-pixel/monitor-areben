# Liquidación — ficha de sección

Sección `liquidacion`, área `analisis`. Campañas de sale: se juntan productos, se les define un
precio uno por uno con el simulador de margen al lado, **el Monitor se lo escribe a Gestión Nube**,
y después se contrasta lo decidido contra lo que se cobró de verdad.

Reemplazó tres pantallas y un archivo: se tildaban productos en Análisis → Por producto, salía un
**PDF**, se los cargaba a mano en el simulador de Comisiones y la lista terminaba en el
`localStorage` de una sola persona.

## Dónde vive

- `components/liquidacion/` — `Liquidacion.tsx` (1.331 l.: la portada, la campaña por dentro y el
  aviso de ofertas colgadas) · `DefinirPrecio.tsx` (582) · `Resultado.tsx` (513) · `Revision.tsx`
  (389) · `Bitacora.tsx` · `MandarALiquidacion.tsx` · `CeldaEnSale.tsx`.
- `lib/liquidacion/` — `core.ts` (avisos, topes, `reprecificar`) · `resultado.ts` (el contraste
  contra lo cobrado, y los agotados que no cierran) · `bitacora.core.js` + `.ts` ·
  `colgadas.core.js` + `.ts` · `vendido.core.js` + `.ts` · `ventas.ts` · `persistencia.ts` ·
  `tipos.ts`.
- Handler: `api/_liquidacion.js` (1.280 l.), por `/api/datos?recurso=liquidacion`. **No es una
  función de Vercel**: entra por la puerta de `datos.js` (ver el invariante de las 12 funciones).
- Tablas: `liquidaciones` · `liquidacion_items` · `liquidacion_bitacora` (`sql/migrate-liquidacion*.sql`).
  Lee además `inventario`, `ventas`, `venta_detalles` y `sync_state`.
- Tests: los nueve `tests/liquidacion-*.test.ts`, más el candado de permisos en
  `tests/handlers-autorizacion.test.ts`.

## ⛔ Lo que comparte con otras secciones

- 🔴 **`api/_liquidacion.js` tiene CUATRO llaves, no una**, y tres de ellas no son de Liquidación:
  Etiquetas (`?etiquetas=1`), Análisis (`?vendido=1`, para la marca «en sale» de Por producto,
  Variantes y Ventas mensuales) y la única escritura que abre Etiquetas (`action:'etiquetado'`).
  Tocar el gate de arriba del handler le cambia el acceso a gente que no tiene esta sección. El
  porqué de cada una está comentado ahí mismo, arriba del `puedeVerAlguna`.
- **`lib/liquidacion/vendido.ts` lo consumen tres pantallas de Análisis** (`ProductosTable`,
  `VariantesTable`, `VentasMensuales`). Un cambio ahí se ve en secciones que nadie asocia con el sale.
- ⚠️ **`canalDe` (`resultado.ts`) NO es `esVentaTecnica` (`lib/etl/helpers.ts`) y no hay que
  unificarlas.** Contestan preguntas distintas y el canal vacío cae de lado opuesto en cada una — ya
  está comentado en las dos puntas, con el número medido.
- **Etiquetas depende de la bitácora de acá**: la cola de reetiquetado se arma leyendo
  `liquidacion_bitacora`, no las campañas. Ver `lib/etiquetas/cola.core.js`.

## Reglas que el código no dice

- 🔴 🔑 **Desde el 16-ago-2026 todos los descuentos se cargan desde el Monitor** (decisión de Bruno).
  Lo que lo motivó: el 15-ago Gestión Nube tenía **404 promos vivas** en Zattia y la bitácora conocía
  **262** ⇒ 142 cambios de precio invisibles para el reporte, para la marca «en sale» y para
  cualquier control. Con el agujero cerrado, **la bitácora es la lista completa de cambios de precio
  de la marca**, y de ahí cuelgan la cola de reetiquetado y el aviso de ofertas colgadas.
- 🔴 ⛔ **El Monitor escribe SÓLO el precio promocional.** El de lista (`retailer_price`) se sigue
  cargando a mano en GN. No es pereza: es el `precioNormal` de **todas las fotos congeladas**, así
  que moverlo invalidaría la base de comparación de las campañas vivas, y además pide parametrizar
  el PATCH y un `ALTER` del `check` de `liquidacion_bitacora.modo`.
- 🔑 **La foto del producto se congela al entrar a la campaña** (costo, precio, stock, ventas). Si
  leyera el ETL de hoy, un producto definido la semana pasada mostraría otro margen que el que se
  aprobó — y el ETL no guarda historia, así que el número viejo no se recupera.
- 🔑 **El estado de la campaña sigue a lo que hay puesto en Gestión Nube, en los DOS sentidos.**
  Poner la deja `aplicada`; **sacar la última oferta la devuelve a `en_curso`**. ⇒ una campaña que se
  levantó bien y una que nadie levantó **se ven igual desde el estado**: cualquier chequeo de «esto
  ya no debería estar puesto» necesita mirar también la fecha (es lo que hace `colgadas.core.js`).
- 🔑 **`liquidaciones.datos` es `jsonb`**: un campo nuevo de la campaña viaja **sin migración**. Es
  por donde va a entrar el `tipo` de campaña (ver Pendiente).
- 🔴 **El sub-permiso `liquidacion.aplicar` no se hereda de la función**: hay que tildarlo a mano, y
  en las dos marcas. Es el único permiso del Monitor que escribe precios en la tienda.
- 🔑 **`TOPE_APLICAR` es 5 y lo fija el tope de Gestión Nube** (60 consultas/minuto, compartidas con
  los otros sistemas de la casa) ⇒ el bucle de una campaña de 260 vive **en el cliente**, con barra
  de progreso, no en el handler. Cualquier acción nueva que escriba precios en lote hereda eso: si no
  entra en una llamada, manda a la campaña en vez de duplicar la máquina.
- 🔑 **Hay OCHO reglas distintas de «el precio que el cliente paga» en el repo**, sobre los mismos dos
  campos de Tienda Nube. En agosto de 2026 se unificaron **sólo dos** —Etiquetas y el chequeo de
  exhibición, que se contradecían y hacían imprimir un precio más caro que el de lista— en
  `precioDeGondola`. ⛔ Las otras seis (Márgenes, Comisiones, SALE, Canjes…) quedaron como estaban a
  propósito: tocarlas cambia números que la gente ya usa.
- ⚠️ **Los números de stock salen del espejo, que se sincroniza una vez por día** (~6 UTC). `inventario`
  no tiene fecha propia: de cuándo es el número lo dice `sync_state.updated_at`, y por eso viaja hasta
  la pantalla. Una lista que manda a alguien a caminar por el local no puede decir «recién» sobre un
  dato de ayer a la mañana.
- 🔑 **Al conciliar stock se cuenta TODO lo que descuenta unidades** —mayorista, canjes y fallas
  incluidos—, al revés que el resto de `resultado.ts`, que los excluye para no hundir el precio
  promedio. Las dos reglas conviven en el mismo archivo y las dos están bien.

## Lo que ya se rompió acá

- 🔴 **La pestaña «🏷️ Liquidaciones» de Etiquetas mostraba CERO justo el día que más hay para
  etiquetar.** Al sacar la oferta cada ítem vuelve de `aplicado` a `confirmado`, y la lista sólo
  tomaba `aplicado`. La reemplazó la cola de reetiquetado, que lee la bitácora.
- 🔴 **`ventas-campania` estaba debajo del guard del id de campaña** y contestaba `400 falta el id`
  a un request perfectamente válido — el mensaje mandaba a buscar el problema al lado equivocado. Las
  acciones que preguntan por productos y no por una campaña van **arriba** de ese guard
  (`ventas-campania`, `stock-campania`).
- ⚠️ **Dos docblocks afirmaron durante días que el token no podía escribir precios**, cuando GN ya
  había habilitado la ability el 13-ago-2026. Una afirmación vieja en un docblock manda a construir
  el rodeo de nuevo: se corrigieron en `resultado.ts` y en `Liquidacion.tsx`.
- 🔴 **Un 200 de Gestión Nube no quiere decir que el precio se movió.** Es el modo de falla clásico
  de esta integración («lo cargué y se revirtió solo»): el aplicador compara lo que devuelve el PATCH
  contra lo que quiso escribir, y **la bitácora se anota recién ahí** — registrar la intención diría
  que el cliente vio un precio que nunca estuvo puesto.

## Pendiente

- ▶️ **El `tipo` de campaña** (pieza 1 del plan, la única que quedó sin hacer): `datos.tipo` con
  `liquidación · promo puntual · ajuste de precio`, **cero SQL**. Apaga por clave los avisos
  `no-es-descuento` y `ya-en-oferta` para «ajuste», cambia rótulos, y saca el `Math.max(0, …)` de
  `resigna`, que hoy esconde las subas. ⛔ **La sección no se renombra ahí**: renombrarla toca el
  sidebar, el espejo `SECCION_AREA` ↔ `PERM_CAT.area`, los permisos guardados de cada usuario y el
  ícono.
- 🔴 ⛔ **El aviso de ofertas colgadas no se ejerció a mano**, porque al escribirlo no había ni una:
  la única campaña seguía viva. El botón «Sacarles la oferta» reusa `aplicar`, que sí está ejercido,
  pero el camino entero —aviso → botón → la oferta sale de la tienda— nadie lo caminó.
- ⏸️ **Los sub-permisos de Etiquetas**: declarados (`dep · loc · sku · libre`) y **sin un solo
  `puedeSub` que los consulte** ⇒ hoy las pestañas las ve cualquiera que tenga la sección. Ejercerlos
  puede dejar a alguien sin una que usa; borrarlos es decir que Etiquetas es todo o nada. Decide Bruno.
- ▶️ **Etiquetas no tiene ficha** y comparte handler, bitácora y regla de precio con esta sección.
  La escribe quien la toque.

## Cómo se prueba

```bash
npx vitest run tests/liquidacion-resultado.test.ts --reporter=dot   # y los otros ocho
```

- 🔴 **El mutante que hay que ver caer**: copiarle a `agotadosQueNoCierran` el filtro de canal de
  `resultadoCampania` (excluir mayorista y técnicas). Da verde en la cabeza y en la pantalla acusa al
  local de perder prendas que salieron bien. El test que lo caza está marcado 🔴 en el archivo.
- 🔴 **El candado de permisos se ejerce, no se argumenta.** `tests/handlers-autorizacion.test.ts`
  recorre las `action` del POST con la llave de **Etiquetas** y exige 403 en todas menos
  `etiquetado`. **Una `action` nueva se agrega a esa lista**: sin eso, la garantía vuelve a ser una
  frase en un comentario.
- **Medir contra la base, no estimar**: `psql "$DATABASE_URL_ZATTIA"` / `_BDI` (están en el `.env`)
  llega a cualquier tabla de las dos marcas desde local. Es como se midieron los agotados que no
  cierran y las ofertas colgadas antes de escribir una línea — y es lo que mostró que **el caso que
  el plan daba por seguro no existía**: el botón «sacar» barre todos los `aplicado`, agotados
  incluidos.
- ⚠️ **Escribir precios de verdad no se ensaya**: `aplicar` le pega a Gestión Nube en producción y no
  hay sandbox. Se prueba con un producto y se mira en la tienda.
