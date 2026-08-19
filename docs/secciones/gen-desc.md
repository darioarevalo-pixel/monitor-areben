# Redacción (`gen-desc`) — ficha de sección

La cola de descripciones de producto de Zattia. Se llega por **Marketing > Tienda Nube >
Redacción** (`/tncat/redaccion`); la monta `components/tncat/Tncat.tsx` como quinta subárea,
pero **es una sección aparte con su propio permiso**, igual que la Tabla de talles.

## Por qué existe, con los números que la justifican

Medido contra la tienda viva el **19-ago-2026** (706 productos en TiendaNube, **369 publicados**):

| | |
|---|---|
| publicados **sin una sola palabra de prosa** | **41** (40 con la descripción del todo vacía) |
| publicados con menos de 120 caracteres | **237** (232 caen entre 30 y 120) |
| publicados con 120 o más | 91 |
| publicados **sin ninguna foto** | **0** — siempre hay imagen |

**La categoría dominante de los vacíos es NEW IN**: el problema pega en los ingresos. Un
producto entra, se publica, y sale a la calle mudo.

Y el formato base **no existía**, también medido: de 369 publicados **uno solo** (SWEATER
VIENNA) tenía formato rico, cero decían la composición, y convivían tres dialectos —
«Disponible en…» (58), «Colores disponibles:» (8), «Talle único» (3).

## Las tres decisiones de Bruno, y dónde viven

Las tomó el 19-ago-2026. No se deducen del código, por eso están acá y con test.

1. **El formato**: un párrafo que vende (≤220) + 3 o 4 bullets duros (≤60, sin punto final),
   con etiqueta de una lista cerrada. → `lib/tn-desc/formato.ts`
2. **No se nombran colores ni talles.** Los muestra el selector de variantes, y el texto se
   desactualiza solo. 🔴 **No es teórico**: TOP EMBER promete «beige, negro y blanco» y las
   variantes son blanco y negro; FAJA CLEO promete «negro y marrón» y sólo existe marrón. Los
   dos son casos de `tests/tn-desc-formato.test.ts`.
3. **La tela es dato, no adivinanza.** Para los 41 vacíos alguien del local tipea 3-4 palabras
   («gasa, botones nacarados») y de ahí sale. Un bullet de `Tela` que no se apoye en el insumo
   o en el nombre se rechaza: una foto de estudio no distingue gasa de voile, y una tela mal
   puesta es un cambio o una devolución.

📌 De los 237 cortos, **163 ya nombran una tela** («microfibra», «morley», «jersey 20/1»): ésos
no necesitan que nadie tipee nada. El insumo a mano es sobre todo para los 41.

## Lo que muerde

- 🔴 **La descripción de TiendaNube tiene TRES cosas en un solo campo**: la prosa, la tabla de
  talles (`gen-talles` escribe ahí mismo) y —medido— **un `<img>` en 19 de los 369 publicados**.
  Por eso `lib/tn-desc/bloques.ts` **conserva lo que no es nuestro** y descartarlo es explícito:
  «rearmar y tirar el resto» se comería esas imágenes en silencio.
- 🔴 **TiendaNube no tiene historial.** Cuando se pisa una descripción, la anterior no existe en
  ningún lado. Por eso `html_previo` va a Supabase con RLS y no al KV, y por eso el invariante
  es **el respaldo se escribe ANTES que la tienda**. → `sql/migrate-tn-descripciones.sql`
- 🔴 **`validarBorrador` es carga estructural, no un adorno.** Cuando el borrador lo escriba un
  modelo, el JSON Schema de structured outputs **no puede** fijar «3 o 4 bullets» ni «máximo 220
  caracteres» (no soporta `minItems`/`maxItems`/`maxLength`). Si esto no está, no hay formato.
- ⚠️ El catálogo se baja con **`?variantes=1`**, que usa **otra clave de caché** del lado del
  servidor (`:var3`): esta bajada no comparte caché con Fotos ni con Tabla de talles.
- 🔑 El piso de 3 caracteres al buscar variantes en el texto no es capricho: los talles viajan
  como valores de variante igual que los colores y son cortos —y los de pantalón son **números**—,
  así que sin el piso «2 bolsillos» quedaría rechazado por «nombrar el talle 2».

## Dos permisos, y la línea está donde está el costo

| nivel | quién | qué habilita |
|---|---|---|
| sección `gen-desc` | el local | ver la cola y **cargar el insumo** |
| sub `gen-desc.publicar` | marketing | escribir el borrador y **aprobarlo** |

No se colgó de `gen-talles` a propósito: pegar una tabla de medidas es mecánico y reversible;
redactar reescribe el texto de venta de la tienda (y va a gastar plata en una API externa).
Colgarlo ahí habilitaría a todos los que hoy pegan tablas sin que nadie toque un checkbox.

## El redactor con IA (tanda 3, 19-ago-2026)

El borrador lo puede escribir un modelo. **No cambió nada de lo de arriba**: ni la tabla, ni la
pantalla, ni el validador, ni `bloques.ts`. Sólo cambió de dónde vienen `{parrafo, bullets}`.

- **`lib/tn-desc/redactor.core.js`** — el prompt, el esquema, el costo y el reintento. No habla
  con la red: recibe la función de llamada por parámetro, y por eso `tests/tn-desc-redactor.test.ts`
  ejerce el camino entero —reintento incluido— sin API key y sin gastar un centavo.
- **`api/_tn-desc-ia.js`** — recurso `tn-desc-ia` de `api/datos.js`. Es el único endpoint del
  monitor que **gasta plata por apretar un botón**, así que pide el sub `gen-desc.publicar`, el
  mismo que aprobar. ⛔ No guarda: devuelve el borrador y se para.

🔴 **El reintento es carga estructural, igual que `validarBorrador`.** El JSON Schema de structured
outputs fija la FORMA (que venga un `parrafo` y bullets con etiqueta de la lista cerrada) y nada
más: no soporta `minItems`/`maxItems`/`maxLength`, así que «3 o 4 bullets» y «hasta 220 caracteres»
no se pueden pedir ahí, y «no nombres los colores de ESTE producto» menos. Cuando el validador
rechaza, los problemas vuelven al modelo —**todos juntos**— y se pide de nuevo. Dos intentos.

🔑 **Las variantes viajan EN EL PROMPT, no sólo en el validador.** Si el modelo no sabe que «arena»
es un color de este producto, lo escribe, se lo rechazan, y se paga un reintento por algo que se
podía decir de entrada.

🔑 **`formato.core.js`: por qué el validador bajó a JS plano.** El reintento necesita validar, y ese
camino termina en `api/_tn-desc-ia.js` — un handler de `api/` corre en Node sin pasar por el
compilador de Next y **no puede importar TypeScript** (es el motivo de `lib/permisos.core.js`).
`formato.ts` quedó como el re-export tipado: ningún import de la pantalla ni de los tests cambió.
⚠️ La unión `Etiqueta` se declara a mano en el `.ts` porque TS infiere `string[]` de un `.js`; que
las dos no se separen lo cuida un test, porque **media regla en cada lado no se ve mal de ningún
lado**: una etiqueta agregada sólo en el `.js` la aceptaría el validador y la rechazaría el `<select>`.

### El modelo se elige en la pantalla, y el costo se muestra

Arranca en **Haiku 4.5** por decisión de Bruno; se puede pasar a **Sonnet 5** desde el mismo
desplegable y comparar los dos textos con el costo real de cada uno al lado. Eso es lo que decide,
no una opinión sobre la prosa.

- ⚠️ **Haiku 4.5 rechaza `output_config.effort` con un 400.** Va sólo donde el modelo lo acepta; si
  no, la comparación sería entre dos configuraciones y no entre dos modelos.
- ⚠️ **Sonnet 5 está con precio de intro hasta el 31-ago-2026** ($2/$10 en vez de $3/$15). Está
  modelado con su fecha: cobrarle de más al comparar empujaría la decisión hacia Haiku por un
  motivo que no es real.
⛔ **Y no se cambia de proveedor.** Decidido el 19-ago-2026 con el prompt ya escrito y contado:
el catálogo entero sale **US$1,14 una sola vez** con Haiku. Un modelo más barato de otra empresa
ahorra centavos y suma una key, un SDK y un proveedor que mantener — y como rompe el formato más
seguido, se lo come el reintento (dos llamadas en vez de una) más el rato de alguien releyendo
borradores feos. **Dentro de Anthropic tampoco hay nada más abajo**: Haiku 3.5 está retirado y
Haiku 3 se retiró en abril de 2026. La plata de esta tanda no está en la API: está en las horas de
leer 370 borradores.

📌 Si algún día igual se prueba otro proveedor, **no hay que rehacer nada**: el núcleo recibe la
función de llamada por parámetro, así que es una `llamar` distinta en el handler (~20 líneas) y ni
la pantalla, ni el validador, ni la tabla se enteran.

- ⚠️ **El CDN de TiendaNube no redimensiona a pedido.** Probado el 19-ago-2026 sobre una foto real:
  `-480-480`, `-480-640`, `-480-600` y `-240-240` contestan **403**; sólo resuelve el archivo
  guardado (hoy `-1024-1024`). Son ~1.400 tokens de imagen, o sea US$0,0014 con Haiku.
- ⚠️ **La foto es el 77% del costo de entrada** (1.398 tokens de 1.824). Sacarla bajaría los 370 a
  US$0,62 — el único ahorro real que hay acá, y son cincuenta centavos. ⛔ No se saca: es lo único
  que el modelo tiene para describir la prenda, y **los 41 mudos no tienen ni insumo ni prosa
  previa**, así que sin foto escribirían a partir del nombre y nada más.

## Publicar en la tienda (tanda 4, 19-ago-2026)

El botón **«Publicar en la tienda»** aparece en la fila cuando el borrador está aprobado, y
escribe **un producto por vez**. Nadie va a leer 370 borradores de corrido; la corrida masiva
sigue sin existir a propósito.

🔴 **El orden es el invariante, y es el único motivo por el que esto vive en el servidor.**
TiendaNube no tiene historial: `html_previo` es la única copia que va a existir del texto
anterior. Los cuatro pasos van seguidos en `api/_tn-desc.js`, `op:'publicar'`:

1. **Leer fresco** — `GET tn-categorias?accion=descripcion&productId=`. No sale del audit, que
   está cacheado: un respaldo sacado de un caché de hace media hora es el respaldo de otra cosa.
2. **Respaldar y CONFIRMAR** — `html_previo` + `hash_previo`, estado `escribiendo`. Si esto
   falla, se corta acá y la tienda no se toca.
3. **Escribir con compare-and-swap** — `POST accion:'descripcion-prosa'` con `hashPrevio`. Del
   otro lado se relee la descripción y, si el hash no coincide, **muere en 409 sin escribir**:
   alguien la tocó en el medio (pegaron una tabla de talles, el local editó a mano) y el
   respaldo guardado ya es de otra versión.
4. **Releer y verificar** — ⛔ un 200 del `PUT` no prueba que la escritura haya pasado. Se
   vuelve a leer el producto y se compara; si no coincide, la fila queda con `verificado:false`
   y la pantalla dice «se escribió, pero la relectura no coincide», **no «listo»**.

🔑 **Va del lado del servidor y no del navegador** para que cerrar la pestaña en el medio no
pueda dejar la tienda escrita y la fila diciendo que no.

🔑 **Se compone una sola vez, en `lib/tn-desc/bloques.core.js`.** `bdi-catalogo` recibe el texto
ya armado y sólo se hace las preguntas que necesitan la tienda delante. Dos composiciones del
mismo campo es lo que se desincroniza. Por eso `bloques`, `generarHtml` y `esc` bajaron a `.js`
plano: el que compone es un handler de `api/`, que **no puede importar TypeScript**.

🔑 **El HTML sale del borrador GUARDADO, no de lo que manda el navegador**: lo que se aprobó es
lo que se publica. Y sólo sale a la tienda un borrador en estado `aprobado`.

🔴 **El residuo se conserva salvo que alguien lo destilde a mano**, y la pantalla lo muestra
antes (avisando si adentro hay una imagen). No hay default destructivo: descartar es
irreversible y del lado de TiendaNube no hay historial para darse cuenta.

## 🔴 La colisión del wrapper de 680px (encontrada al arrancar esta tanda)

`generarHtml` envuelve la prosa en un `<div style="…max-width:680px…">`, que es **la misma firma**
con la que el generador de talles reconoce y borra su envoltorio viejo. Dos consecuencias, las
dos medidas antes de escribir una sola descripción:

- **`prosaDe` daba 0 caracteres sobre nuestro propio texto** ⇒ el producto recién redactado iba a
  seguir contando como «sin descripción» en el KPI de Marketing y en el filtro de esta pantalla.
- **Pegar la tabla de talles después borraba la prosa entera**, dejando `<!--PROSA-INI-->
  <!--PROSA-FIN-->` vacío. Y no hay historial: ese texto no quedaba en ningún lado.

La regla que lo arregla ya estaba escrita («primero los bloques firmados, después los tags»):
estaba aplicada al bloque de talles y no al de prosa, en las dos puntas. Ahora el bloque de prosa
se extrae **antes** de tocar wrappers en `lib/tn-desc/prosa.ts` y en
`bdi-catalogo/api/_desc-talles.js`.

🔑 **El test que tenía que cazarlo existía y estaba verde**: su fixture era un `<p>` pelado adentro
de las marcas, no el HTML que sale de `generarHtml`. Ahora el fixture es la salida real.

⚠️ `bdi-catalogo` no tiene runner de tests. Por eso las dos reglas puras viven en `api/_desc-talles.js`
y `api/_desc-prosa.js`, y se ejercen con `node scripts/check-desc-talles.mjs` y
`node scripts/check-desc-prosa.mjs` — sin credenciales, y **saliendo 1 si algo falla**.

## Lo que TODAVÍA no hace

⛔ **No hay verbo de vuelta todavía.** El respaldo (`html_previo`) está guardado y es la única
copia que existe, pero restaurarlo desde la pantalla no está hecho: hoy se recupera leyendo la
fila. Es la próxima tanda y es barata, justamente porque el respaldo ya está.

🔴 ▶️ **Falta `ANTHROPIC_API_KEY` en Vercel.** Sin eso el botón «Redactar con IA» contesta un 500
con ese texto y el resto de Redacción anda igual. **Es el único eslabón de la tanda que no se pudo
ejercer**: todo lo demás está probado contra un modelo falso, pero que la llamada real funcione no
lo prueba ningún test — el oráculo es apretar el botón una vez y ver el borrador.

⛔ Tampoco hay corrida masiva: se redacta de a uno, desde la fila. Pasar los 370 de una es otro
verbo (y otra tanda), porque nadie va a leer 370 borradores de corrido.

✅ La migración `scripts/apply-tn-descripciones.mjs` **corrió el 19-ago-2026** en las dos bases. El
oráculo fue la app en vivo, no la consola: `GET /api/datos?recurso=tn-desc&store=zattia` contesta
`200 {"ok":true,"filas":[]}` — que además prueba que en Vercel está la service key de Zattia, porque
el handler devuelve un 500 con nombre y apellido si la clave que agarra es la pública.
