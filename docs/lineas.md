# Líneas de negocio: Stunned adentro de Zattia

> ⛔ **Leer esto antes de tocar `lib/lineas.core.js`, `lib/etl/linea.ts` o de agregarle el selector de
> línea a una pantalla.** Es la única explicación de por qué una marca y una línea no son lo mismo.

## Qué es una línea

El monitor tiene **dos marcas** (`lib/nav.datos.ts`) y cada una **es una base de Supabase**:
`bdi` y `zattia`. **Stunned no es una tercera.** Está cargada adentro del Gestión Nube de Zattia:
comparte su base, sus permisos, su depósito y su local.

Medido el 22-ago-2026 contra producción:

| | |
|---|---|
| Productos con SKU `STU` | **28** de 2.676 (los 28 activos) |
| Unidades en inventario | **195** de 6.218 (**3,1 %**) — 178 en `Local`, 17 en `Deposito` |
| Venta 24-jul → 22-ago | **19 ventas · 19 u · $619.710** (Zattia sola: 621 · 908 u · $22.381.563) |
| STU con costo cargado | 25 de 28 |

🔑 **El stock NO está separado**: los 195 viven en los mismos `Deposito`/`Local` que Zattia. **Lo
único que separa a las dos líneas es el prefijo de SKU.**

⛔ **No se convierte en `Marca`.** `CUENTAS` es `Record<Marca, Cuenta>` y pediría una tercera base de
Supabase que no existe; `bdi | zattia` son 514 apariciones en 143 archivos, más los `brands` de las
~40 secciones y el padrón.

## Dónde vive la regla

**Una sola vez, en `lib/lineas.core.js`** (`.js` plano porque `api/*.js` no puede importar
TypeScript; `lib/lineas.ts` es el re-export tipado). Ahí están `LINEAS`, `ETIQUETA_LINEA`,
`baseDeLinea`, `lineasDeMarca`, `esStunned` y `lineaDe`.

Antes del 22-ago-2026 estaba repartida, y las copias ya se habían despegado:

- **«STU ⇒ Stunned», 3 copias haciendo 3 cosas distintas**: clasificaba en `lib/memo/foto.core.js`,
  clasificaba sobre variantes en `lib/conteo-estandar/core.ts`, y **excluía** en `lib/margenes.ts`.
- **«de qué marca cuelga», 5 copias, dos con modos de falla OPUESTOS**: `baseDeLinea` devolvía `null`
  ante lo desconocido y `marcaDePermisos` devolvía `'zattia'` **por descarte** — o sea que un
  `?store=` inventado salía con permisos de Zattia. Hoy las dos son la misma función y `null` corta:
  `puedeVerAlguna` niega.

Los archivos viejos re-exportan, así que ningún import cambió.

## El corte por línea en las pantallas

`useDatosMonitor({ porLinea: true })` (`components/fundas/useDatosMonitor.ts`) devuelve los datos de
**una sola línea**. El corte es `filtrarPorLinea` (`lib/etl/linea.ts`) sobre el payload **crudo**,
antes de `computarDatos`.

- **No baja nada ni cambia la clave del caché**: el caché sigue siendo uno por marca y la línea se
  computa encima de lo que ya está en memoria.
- **Es derivado y sincrónico** (`useMemo`), no un segundo estado que se publica. Por eso no puede
  repetir el defecto de agosto —publicar tarde los datos de una marca bajo el rótulo de la otra—:
  entre el payload y la línea no hay un solo `await` donde meterse.
- **Una venta entra si TIENE UN RENGLÓN de la línea.** La mixta queda en las dos —el ticket no se
  corta al medio, mismo criterio que Norte y el Memo—, y de 634 ventas en 30 días 620 tienen renglón
  de Zattia y 19 de Stunned, **5 en las dos**. ⚠️ La venta **sin ningún** renglón de producto activo
  no es de ninguna línea y no se le regala a ninguna: **1 de 634** (0,16 %).

  🔴 **La primera versión no filtraba `ventas` y estaba mal.** «Una venta mixta es de las dos, así
  que no se filtra» confundía dos cosas: dejarlas todas no es dejar las mixtas en las dos, es dejar
  también las que no tienen nada de la línea. **Lo encontró caminar la pantalla con los 4.246 tests
  en verde**: «Cómo viene la venta» de Stunned mostraba **1 prenda online con 140 compras** y 17 en
  el local con 463, porque `serieDiaria` (`lib/mkt-ventas/core.ts`) cuenta las compras recorriendo
  `ventas` y las unidades desde `detalles`. Una cifra de la marca entera al lado de una de la línea,
  sin rótulo — justo lo que el selector existe para que no pase. 📌 El test que lo cubría **afirmaba
  el defecto**: decía «las ventas NO se filtran» y estaba verde.

### Lo que cuesta, medido (22-ago-2026, payload real de Zattia)

667 productos · 3.518 filas de inventario · 21.686 ventas · 35.947 detalles:

| | ms |
|---|---|
| `computarDatos` mezclado (lo de hoy) | **221** |
| `filtrarPorLinea` + `computarDatos`, Zattia sola | **140** |
| ídem, Stunned sola | **11** |

🔑 **El corte sale más barato que la mezcla**: filtrar saca trabajo. Por eso cambiar de pestaña no
lleva estado de carga — se decidió con este número, no a ojo.

Y la partición no pierde ni repite: **639 + 28 = 667 productos** y **6.023 + 195 = 6.218 unidades**,
que es exactamente lo que dice `psql`.

### 🔴 El mutante que sale solo: filtrar productos y NO el inventario

`computarDatos` llama **huérfana** a la fila de stock cuyo producto no está en `productos` —una
variante recién cargada en GN—. Si se filtran los productos sin filtrar el inventario, las filas de
la otra línea se convierten en huérfanas fabricadas. Medido contra producción: **112 huérfanas donde
hay 0**. En la app se verían como variantes sin producto en las pantallas que las dibujan, sin que
falle nada. Lo defiende `tests/lineas.test.ts`.

### 🔴 Es opt-in por pantalla, y eso es la mitad del diseño

Un filtro global **no se puede**. Las pantallas **operativas** —Exhibición, Etiquetas, Liquidación,
Reposición, Caducados— tienen que seguir viendo la mercadería del local **entera**: partirlas haría
desaparecer las prendas de Stunned del trabajo del local, que es lo contrario de lo que se pidió.
Sin el flag, `useDatosMonitor` devuelve exactamente lo de siempre.

**Sesión de fotos es la excepción, y la excepción tiene un motivo que no es mirar** (22-ago-2026): su
ciclo **termina subiendo la foto a una Tienda Nube**, y ésa es la única cosa que Stunned NO comparte
con Zattia. Por eso su solicitud es una fila aparte y su catálogo se corta. Ver la sección de abajo.
⚠️ El precio: una sesión que fotografía las dos líneas son **dos solicitudes**.

### 🔴 «Ventas mensuales» no puede llevar selector

Sus números salen de **vistas materializadas ya agregadas por mes** (`vmMes`, `vmCat`, `vmFundas`):
no traen producto, así que no hay con qué separarlas. `filtrarPorLinea` las pasa intactas a propósito.
Ponerle el selector sin tocar eso mostraría el total de la marca con el rótulo de una línea.

## Quién conoce la línea hoy

| dónde | cómo |
|---|---|
| Meta Ads | eje de la sección (`SelectorMeta`), asignación por campaña |
| Memo semanal · Norte (P&L) | `lineaDe(store, sku)` sobre `venta_detalles` |
| Conteo Stunned | sección propia (`conteo-estandar-stunned`), por variantes |
| Canjes · sync TN→GN · `sku_map` | `store = 'stunned'` |
| Etiquetas | fusiona el catálogo de TN de Stunned |
| **Resumen · Ventas de Marketing · Por producto · Por variante · Márgenes** | **selector de línea** (22-ago-2026) |
| **Norte › Metas** | **selector PARCIAL** (23-ago-2026): sólo los objetivos: el resto de la pantalla es de la marca |
| **Sesión de fotos** | **selector + historial propio** (`store='stunned'`), 22-ago-2026 |
| **Marketing · Tienda Nube › Carga de imágenes** | **selector** (22-ago-2026): hablan con **una** Tienda Nube |
| Solicitudes (la lista) · Inicio · el chip de marca | el resumen y el aviso traen `linea` además de `marca` |

## Los TRES stores de Stunned, que no son el mismo (22-ago-2026)

🔴 **Ésta es la confusión que puede salir cara, y ninguno de sus dos errores falla solo.**

| a quién se le habla | store | por qué |
|---|---|---|
| Supabase (la base) | `zattia` | `baseDeLinea`; Stunned no tiene base propia |
| Gestión Nube (la venta técnica) | `zattia` | mismo GN, mismo depósito, mismo local, mismo stock |
| la fila de `solicitudes` | **`stunned`** | historial propio; la clave de la tabla ya es `store,id` |
| Tienda Nube (catálogo, fotos, links) | **`stunned`** | tienda propia: store 7516263, token propio, `stunned.com.ar` |

- Mandarle `store:'stunned'` a `api/crear-venta.js` **crea la venta igual**, pero sin cliente:
  `SF_CFG.stunned` existe sólo para `tn_import` y tiene `client_id: null`.
- Mandarle `zattia` a Tienda Nube sube la foto de una prenda de Stunned **a la tienda de Zattia**.

El par lo nombra `destinosDe` (`components/solicitudes/useHistorialSolicitudes.ts`), en un solo
lugar, y lo defiende `tests/lineas-solicitudes.test.ts` con mutantes.

### 🔴 La mitad que casi se olvida: el aviso

La solicitud podía crearse y guardarse bien y **no la veía nadie**. `store/useAvisos.ts` pedía el
cajón **por marca**, y esa lista es la pantalla `/solicitudes` — de donde el local saca qué preparar.
Una solicitud que no aparece ahí **no se prepara nunca**. Hoy las de fotos se piden por LÍNEA (las
internas no: se piden sobre la mercadería del local, que es una sola), y `ResumenSolicitud`/`Aviso`
llevan **`marca` y `linea` por separado**: la marca es adónde salta la app, la línea es lo que dice
el chip. Con un solo campo, o el chip miente o el salto va a una marca que no existe.

### ⚠️ El cruce GN ⨯ TN de Stunned se apoya en el NOMBRE, no en el SKU

Medido el 22-ago-2026: en Gestión Nube **los 28 productos de Stunned tienen `sku = 'STUNNED'`**, los
28 el mismo — los códigos `STU-REM-0001-S` viven a nivel **variante** (`inventario`), y son los que
Tienda Nube trae como `sku` del producto. O sea que `matchTn` (`lib/tn.ts:65`) falla por SKU y
resuelve por el **fallback de nombre** ("todas las palabras de ≥3 letras del nombre de GN están en el
nombre de TN"). Corrido contra los dos catálogos reales: **28 de 28 matchean**, ninguno se cae.

🔑 Dos consecuencias: `esStunned` sigue andando (`STUNNED` empieza con `stu`), y **Marketing de
Stunned no pierde productos hoy** — pero el día que alguien renombre una publicación en la tienda y
no en GN, ese producto **desaparece** de la lista sin cartel, porque `buildLista` descarta lo que no
matchea. El arreglo de fondo sería cargar el SKU real a nivel producto en GN.

### El chip de Stunned

`MarcaChip` toma una `Linea` y tiene su color en `app/tokens.css` (verde azulado, para separarse del
violeta de Zattia de un golpe de vista). No es decoración: es lo único que distingue una solicitud de
Stunned de una de Zattia en una lista que las mezcla.

## ⚠️ Lo que el separador no puede hacer

El prefijo de SKU es la única señal y **no está siempre**: 96 productos activos de Zattia tienen
`sku` NULL (47 vendieron $3,1M en la ventana de 30 días). Para todos ellos `esStunned` sólo puede
contestar «no». Hoy ninguno es de Stunned —0 productos con «stunned» en el nombre y sin SKU STU—,
pero **el día que carguen uno de Stunned sin SKU, su plata cae en Zattia sin que falle nada**. No hay
otra columna en la base con la que cruzarlo.

## 🔴 El `|| BDI` que había en `lib/tienda.core.js`

`tiendaBaseUrl` y `adminBaseUrl` terminaban en `|| TIENDA_BASE.bdi`, así que **cualquier** clave
desconocida salía con un link de BDI: bien formado, clickeable y copiable a un cliente. Es el mismo
"por descarte" que `baseDeLinea` mató en los permisos, viviendo en otro archivo. Hoy devuelven
`null` y las tres líneas están en los dos mapas. De paso cayó la **sexta copia** de "cuál es el admin
de cada tienda", que se le había escapado a la consolidación: `tnAdminUrl` (`lib/exhib/core.ts`).

## El oráculo, y su trampa

Se cotejan los números de la pantalla contra `psql "$DATABASE_URL_ZATTIA"`, que es otro camino que el
hecho. 🔴 **El rango de fechas va fijo, nunca `current_date`**: `current_date` en la base es **UTC**,
así que a las 21:00 de Rosario la ventana de 30 días se corre sola y la misma consulta contesta
distinto sobre el mismo hecho. Pasó midiendo esto: 21 ventas a las 20:55 y 19 a las 21:06 — la
diferencia era el 23-jul saliendo de la ventana (2 ventas, 8 u, $254.520), no un bug.

```sql
with d as (
  select vd.quantity, vd.total, vd.sale_id, coalesce(p.sku ilike 'stu%', false) stu
  from venta_detalles vd join ventas v on v.id = vd.sale_id join productos p on p.id = vd.product_id
  where v.date_sale::date between date '2026-07-24' and date '2026-08-22'
)
select count(distinct sale_id) ventas, sum(quantity) u, round(sum(total)) plata from d where stu;
```

### ⚠️ La segunda trampa: la ventana de la pantalla no es la de tu `select`

`resumenPorCanal` recorta con `cortesDeVentas` (`lib/etl/helpers.ts:177`), que hace `today - 30 días`
sobre un **instante**, no sobre una medianoche — y compara contra `new Date('2026-07-24')`, que
JavaScript parsea como **UTC**. En Rosario (UTC−3) eso cae 3 h antes del corte, así que **a partir de
las 21:00 el primer día de la ventana se cae solo**.

Medido el 22-ago a las 22:10: la pantalla decía Stunned **local 17 · online 1** y el `select` de
24-jul a 22-ago daba **18 y 1**. La de más era la venta del 24-jul. Con la ventana real —25-jul a
22-ago— el `select` da **17 y 1**, al peso. **No era un defecto del corte por línea**, y perseguirlo
como si lo fuera cuesta media hora.

⚠️ Y el `coalesce` no es cosmético: `p.sku ilike 'stu%'` da **NULL** en los 96 sin SKU, así que sin
él ni `stu` ni `not stu` los agarra y el total de Zattia sale corto.

### Caminado en prod el 23-ago-2026, y los dos oráculos que sirvieron

Los tests verdes no dicen si la app viva hace esto. Se ejerció a mano, contra producción:

- **Sesión de fotos › Stunned** trae historial propio (vacío) y sólo los STU. 🔑 **El oráculo tiene
  que ser de DOS LADOS**: en la pestaña **Zattia**, buscar `STU` contesta **«Sin resultados con
  stock»**. Con un solo lado no se distingue «filtra» de «no filtra, pero igual no había nada».
  ⚠️ La lista de «Agregar producto» está cortada en 20 (`.slice(0, 20)`, `SesionFotos.tsx`): **contar
  ahí no verifica los 28**.
- Una solicitud de prueba salió **arriba de todo en `/solicitudes` con el chip `Stunned`**, al lado de
  los de BDI y Zattia (31 → 32; se borró después: dejarla es hacer que el local prepare un pedido que
  no existe). Es el camino que casi se va invisible.
- **Marketing › Stunned: 28 productos, 3 sin foto en TN.** Zattia al lado: 614 y 51.

🔑 **Y así se mira el deploy de `bdi-catalogo` sin acceso a su Vercel** (es el de Darío): en
**Tienda Nube › Carga de imágenes**, con la página **recién cargada**, el `datalist#tnimg-prods` trae
**706** (Zattia); al tocar **Stunned** sale el GET a
`bdi-catalogo.vercel.app/api/tn-subir-imagen?store=stunned&productos=1` y el datalist pasa a **28**
con SKUs `STU-…`. Eso prueba las dos cosas de una: el deploy y la env `TIENDANUBE_TOKEN_STUNNED`.

⚠️ **Mirar la pantalla no alcanza**: `recargarProductos` (`components/tncat/ImagenesCard.tsx`) tiene
un `catch { /* nada */ }` — si el fetch falla **no dice nada y deja la lista vieja**. Lo que hace
honesto al oráculo es que **cambiar de línea resetea `productos` a `[]`**. Y `traerProductosImg`
cachea por línea **en memoria**: ir a Zattia y volver a Stunned **no vuelve a pedir**, así que la
medición se hace con la página recién cargada.

## 🔴 Caminar las OCHO encontró dos defectos que los 4.246 tests no ven (23-ago-2026)

La lista de pasos decía «caminarlo» y nombraba **tres** pantallas. El selector está en **ocho**
(`grep -l SelectorLinea components/`): SesionFotos, Marketing, ImagenesCard, **Resumen,
ProductosTable, VariantesTable, Margenes, MktVentas**. **Las cinco que faltaban eran las que tenían
los defectos.** ⛔ Una lista de pasos a caminar no reemplaza contar las pantallas que el cambio tocó.

### 1. ✅ La foto y el PRECIO de TN se pedían por MARCA, no por línea — ARREGLADO

`useTnPromo` / `useTnImages` / `asegurarTnPromo` (`components/productos/useTnImages.ts`) recibían una
`Marca`. `lib/tn-audit.ts` ya bajaba por línea desde el 22-ago, pero las pantallas le pasaban
`zattia` estando en Stunned ⇒ `matchTn` no engancha nunca y `lib/margenes.ts:66-72` cae al `else`:
**`foto = null` y `precio = retailer_price`**.

Medido en prod antes del arreglo: Márgenes con Stunned daba **24 de 24 «sin foto»** y Por producto
**0 de 28 con foto**, contra **401 imágenes** y 47 de 50 en Zattia — y Marketing, que sí cruzaba por
línea, decía que **sólo 3 de 28** no tienen foto en TN.

🔴 **Lo grave no era la foto, era el markup**: **304 de 449** tarjetas de Zattia (**68 %**) valoran
con el precio de **promo** y las 24 de Stunned con el de **lista** ⇒ el «markup promedio **180 %**»
de Stunned al lado del «**88 %**» de Zattia **no era la misma medición**, y el rótulo de línea lo
hacía leer como que Stunned rinde el doble. Alcanzaba también al chip **«en oferta hoy»** (nunca se
encendía en Stunned) y a **«Generar sale»**, que sobre productos STU salía con los precios de la
tienda equivocada.

**Caminado en prod el 23-ago, después del deploy** (`a148559`): en Márgenes › Stunned el GET sale a
`tiendanube-audit?store=stunned` —el oráculo de alambre, porque el arreglo no agrega ni una cadena
nueva al bundle—, **ninguna de las 25 tarjetas dice «sin foto»** (eran 24 de 24), las 25 valoran con
el precio de promo y el **markup promedio bajó de 180 % a 107 %**, al lado del 88 % de Zattia. En Por
producto › Stunned el chip **«en oferta hoy» se enciende**, que antes no pasaba nunca.

El arreglo son **tres firmas y cuatro llamadas**: los hooks toman `Linea`, y las tres pantallas con
selector le pasan `linea`. ⚠️ **`Marca` sigue entrando a propósito** —es un subconjunto de `Linea`—
porque **Comisiones, Reposición, Gerencial, Liquidación y las cards de tncat son de mercadería
ENTERA** y tienen que seguir pidiendo la marca. Cambiar `tn-audit` no era el camino: de ahí comen
también ellas.

🔑 **Lo amarra `tests/lineas-tn-por-linea.test.ts`, y en las dos direcciones**: con selector ningún
hook de TN puede recibir `marca`, y sin selector ninguno puede recibir `linea`. El defecto no estaba
en ninguna función —`matchTn` es puro y correcto, `tn-audit` ya era por línea—, estaba en **qué
argumento le pasa la pantalla**, que es justo lo que un test de unidad no mira.

### 2. ✅ El objetivo de Norte de la pantalla Ventas era el de la MARCA — Stunned tiene rampa propia

`useMetas(marca)` (`components/mkt-ventas/MktVentas.tsx`). Medido antes: la tarjeta era **idéntica en
las dos pestañas** («40 compras por día online al sáb 31-oct · escalón 10 ventas/día para el mar
8-sep»), que es la rampa de **Zattia**. O sea: **la venta de Stunned se medía contra el objetivo de
Zattia, con el rótulo de Stunned** — y la venta de abajo sí estaba cortada por línea.

**Decisión de Bruno (23-ago-2026): Stunned tiene rampa propia.** Cómo quedó:

| | |
|---|---|
| dónde viven sus filas | `norte_metas` de la base de **Zattia**, con `store='stunned'` — igual que `solicitudes` |
| por qué se puede | la PK es `(key, store)`: las dos rampas conviven sin pisarse |
| quién manda para credenciales y permisos | la **marca** (`baseDeLinea`), nunca el `store` crudo |
| qué abre la línea | **sólo los objetivos** (`?metas=1`, POST `meta`, `borrar-meta`) |
| qué NO abre | condiciones de compra, contribución y P&L: `contribucionDe` mira la venta **entera** de la base y `skusDe` sólo reparte en Zattia ⇒ un `?store=stunned` por ahí devolvería la plata de Zattia con el rótulo de Stunned, el mismo defecto del otro lado. El handler lo rechaza con 400 |

🔑 **De paso se cerró una puerta de más**: las metas viajaban **por dos caminos** —el pedido grande de
Norte y `?metas=1`— y el grande no sabe de líneas. Con las dos, la pantalla de Norte habría tenido
que elegir a cuál creerle según la pestaña abierta. Ahora la puerta es una sola y es la que corta por
línea; `leerNorte` ya no trae metas.

**En Norte el selector es PARCIAL, y eso es la decisión**: corta **sólo el bloque de Metas**. El
ritmo, el stock, los pagos y la contribución de esa pantalla son de la marca entera —el P&L por línea
ya sale de `pylPorLinea`, adentro del mismo número—, así que la rampa de otra línea se lista
**sin medir, con el motivo puesto** («el medido de Stunned está en Ventas: acá el ritmo es de la marca
entera»). Medir el objetivo de Stunned contra el ritmo de Zattia sería el defecto que se acaba de
arreglar, del otro lado. El camino de `medido: null` + motivo ya existía: es el de las metas de
contribución sin dashboard.

⚠️ **Falta cargar los escalones de Stunned**: hasta que estén, su pestaña dice «Sin metas cargadas»,
que es verdad y no miente a nadie.

### 🔴 Y caminar Norte encontró un tercero: la línea elegida sobrevivía al cambio de MARCA

Con el selector recién deployado, pasar de **BDI a Zattia** dejaba la tabla de Metas mostrando **los
objetivos de BDI (100 · 25 · 50) bajo el rótulo de Zattia**, con el selector **sin ninguna pestaña
marcada**. La causa: el selector es un `useState`, que se inicializa **una sola vez**.

🔴 **No era sólo de mirar**: «Agregar meta» en ese estado habría **escrito en la base de BDI** estando
parado en Zattia.

⇒ La regla vive en el núcleo, `lineaVigente(elegida, marca)` (`lib/lineas.core.js`): la elegida vale
**sólo si pertenece a la marca**, si no cae a la marca. Es **derivada, no un efecto** — con un
`useEffect` habría un render en el que la pantalla dibuja lo de la marca anterior. La próxima pantalla
con selector la hereda en vez de repetir el `useState`. Lo defiende `tests/lineas.test.ts` con
mutante.

🔑 **Es el mismo defecto que el selector vino a matar** —una cifra de un lado con el rótulo del otro—
sólo que en el otro eje, y **con 4.295 tests en verde**. 📌 [[MEMORY_probar]]

### 🏁 Lo que SÍ anduvo en las cinco

La partición cierra en las tres pantallas de Análisis: **639 + 28 = 667 productos** y
**1.656 + 112 = 1.768 variantes** (Resumen, Por producto y Por variante dan lo mismo). En Ventas el
corte está bien: **1 online · 17 local**, igual que el `select`, y «Los que más salieron» trae sólo
STU. ⚠️ **En `/variantes` no se puede mirar el mutante de las huérfanas**: se dibujan en **Etiquetas**
(`allVariantesHuerfanas`), que a propósito no tiene selector — buscar la palabra ahí no prueba nada.

## ▶️ La novedad al equipo está ESCRITA y RETENIDA a propósito

Decisión de Bruno (22-ago-2026): *«la novedad la hacemos conjunta, cuando hagamos todo lo de
Stunned»*. ⛔ **No publicarla suelta** — va una sola, al cerrar el resto (la sesión de fotos de
Stunned y lo que salga con ella).

⚠️ **Mientras tanto el equipo no está avisado y los números YA cambiaron**: desde el 22-ago las cinco
pantallas con selector muestran Zattia sola, ~3 % menos que antes. Si alguien pregunta por qué le
bajó un número, es esto.

El borrador, para no reescribirlo:

> En Zattia, **Resumen, Ventas, Por producto, Por variante, Margen por producto, Marketing, Sesión de
> fotos y la Carga de imágenes de Tienda Nube** ahora se miran por línea: arriba de cada una hay dos
> pestañas, **Zattia** y **Stunned**.
>
> **Arranca en Zattia.** Eso quiere decir que los números de esas pantallas ahora son **de Zattia
> sola**: antes venían con Stunned adentro, sin decirlo. La diferencia es chica pero real — son 28
> productos y 195 unidades, unos $620.000 de venta en los últimos 30 días — así que si alguno te
> suena un poco más bajo que ayer, es esto: lo que falta está en la pestaña de al lado.
>
> Stunned no tiene sección propia y no la va a tener: está cargada adentro del sistema de Zattia y se
> la reconoce por el SKU, que empieza con **STU**.
>
> **Sesión de fotos de Stunned**: ahora se pide desde la pestaña Stunned y queda en su propia lista.
> Es la pestaña la que decide a qué tienda van después las fotos, así que **una sesión que mezcla las
> dos líneas son dos solicitudes**, una por pestaña. En la lista de Solicitudes y en el Inicio cada
> una lleva su etiqueta, igual que BDI y Zattia. Para el depósito y el local no cambia nada: se
> prepara y se devuelve igual, y la mercadería sigue siendo una sola.
>
> **Carga de imágenes**: la pestaña elige a qué tienda sube la foto. Antes las fotos de Stunned no
> tenían por dónde subir desde el Monitor.
>
> ⚠️ **«Ventas mensuales» no tiene las pestañas** y sigue mostrando el total de Zattia con Stunned
> adentro. No es un olvido: ese cuadro se calcula de otra manera y no se puede separar.
>
> Las pantallas de trabajo del local —Exhibición, Etiquetas, Liquidación, Reposición, Sesión de
> fotos— **no cambiaron**: siguen mostrando toda la mercadería junta, que es como hay que verla para
> trabajar.

Se publica con `node scripts/novedad.mjs "Título" cuerpo.md --destino=seccion:resumen --marca=zattia`
(deja BORRADOR; ⛔ el script no tiene `--publicar` a propósito). ▶️ **Falta decidir el destino**: el
selector toca **ocho** secciones, así que `--destino` por sección alcanza sólo a una.
