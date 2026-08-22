# Meta Ads — ficha de sección

Sección `meta-ads`, área **`meta`** — área propia, no Marketing (salió de adentro el 8-ago-2026; el
perfil `marketing` la sigue viendo porque tiene las dos áreas). Es la pauta de Facebook e Instagram
de las tres líneas, de leerla a accionarla: mirar qué está al aire, decidir qué apagar y qué escalar,
duplicar y crear conjuntos, subir piezas nuevas, y dejar escrito quién hizo qué y por qué. **Es la
sección más grande del monitor**: ~33.000 líneas con tests, 11 pantallas, 11 tablas, 4 crons y una
API externa con cinco candados de permisos. La key nunca se renombró aunque el label diga «Meta»:
renombrarla obliga a migrar el tilde de permiso de todo el equipo.

## Dónde vive

`components/meta-ads/` (51 archivos; `MetaAds.tsx` sólo despacha las 11 vistas por el 2º tramo de la
URL, y su encabezado las lista) · `lib/meta-ads/` (52 archivos, en pares `x.core.js` + `x.ts`: el
`.js` es el que pueden importar `api/*.js` y `scripts/*.mjs`) · `api/meta-ads.js` **es una de las 7
funciones de Vercel** y su encabezado es el índice de los `?recurso=` · los handlers `api/_meta-*.js`
(9) · 26 archivos de test (`tests/meta-*.test.ts`).

Tablas, **todas en la base de BDI y cross-marca** salvo dos: `meta_ads_snapshot_dia` (la foto diaria)
· `meta_ads_campania_linea` (de qué marca es cada campaña) · `meta_ads_accion` (el registro de cada
escritura) · `meta_ads_plan` + `meta_ads_plan_paso` · `meta_ads_regla` + `meta_ads_umbral` +
`meta_ads_hallazgo` · `meta_ads_decision` · `meta_ads_favorito` · `meta_ads_informe` ·
`meta_ads_rentabilidad`. Las dos que **sí** viven en las dos bases y llevan columna `store` son
`meta_ads_etapa` y `meta_ads_ideas`: la etapa es una decisión editorial de cada marca, pero *de quién
es la campaña X* es un hecho único (y guardarlo por store dejaría a dos personas dándole dos marcas
distintas sin verse).

Crons: `meta-snapshot.yml` 06:30 UTC (la foto) · `meta-reglas.yml` 07:00 UTC (evalúa las reglas, **sin
token de Meta**: lee la foto) · `avanzar-planes-meta.yml` cada hora a las :20 (⛔ **sólo planes
`escalar`**) · `ensayo-meta.yml` manual, y es el único que escribe en Meta desde Actions.

## ⛔ Lo que comparte con otras secciones

- 🔴 **`api/meta-ads.js` es una RUTA**: cada archivo nuevo sin `_` en `api/` gasta una de las 12
  funciones de Hobby. Todo recurso de Meta entra por `?recurso=` y se despacha a un `_meta-*.js`.
  Pasarse frena todos los deploys sin error visible.
- 🔑 **`meta-funnel` (ideas y overrides de etapa) y `meta-rentabilidad` entran por `api/datos.js`, no
  por `api/meta-ads.js`, y es a propósito**: aquel handler corta con 500 si falta `META_ADS_TOKEN`, y
  ni el tablero de ideas ni la calculadora de rentabilidad pueden morirse porque Meta se cayó.
- **`KEYS_CROSS_MARCA`** (`lib/nav.ts`) tiene un solo elemento y es éste: quien ve Meta en una marca
  sola no rebota a Inicio por estar parado en la otra. El corte real lo hace el servidor, línea por
  línea.
- 🔑 **Stunned NO es una `Marca`.** El eje de esta sección es la **línea de pauta** (`bdi` · `zattia`
  · `stunned`) y vive local a Meta (`lib/meta-ads/lineas.core.js`). `baseDeLinea()` manda `stunned` a
  la base y a los permisos de Zattia — igual que `sku_map` con `store='stunned'`. Sin ese helper,
  `puedeVer(perfil, 'stunned')` da false y contesta 403 sin que se entienda.
- Piezas usa `api/blob-upload.js` (otra de las 7 funciones) y `lib/drive/`.
- ⚠️ **`lib/gerencial/detectores/ads.ts` NO usa nada de esto**: atribuye por totales de cuenta con una
  regex sobre el nombre. Quedó así a sabiendas. Bajarlo a nivel campaña es otra tanda.

## Los CINCO candados de Meta — desde afuera fallan igual y se arreglan en lugares distintos

Es lo que más horas costó y no está en ningún archivo. Cuando algo «no anda con Meta», es uno de estos:

1. **El scope del token** — `(#200)`. Hoy: `ads_read`, `ads_management`, `pages_show_list`,
   `public_profile`.
2. **El permiso del system user sobre esa cuenta publicitaria** — `(#272)`. 🔑 **La `user_task` que
   habilita pautar es `ADVERTISE`, no `MANAGE`** (`MANAGE` es «administrar cuentas publicitarias»:
   finanzas y permisos, y a propósito no se dio). Buscar `MANAGE` marcaba «solo lectura» cuentas que
   estaban perfectas.
3. **El modo de la app** — `(#100)` subcódigo `1885183`. Una app en desarrollo **no puede crear
   anuncios**. ✅ Resuelto: «Areben Monitor» (`1493711852519633`) está **publicada** desde el
   7-ago-2026 y la lectura no se cayó (medido el mismo día y al siguiente).
4. **El tier de la Marketing API** — `ads_api_access_tier: development_access`. No lo destraba
   publicar: va por App Review humano. Es el **cupo**: `call_count` es un **porcentaje**, y cada
   escritura come **1-4%** (duplicar 4-7%). ⚠️ Cualquier cosa que corra sola hay que mirarla contra
   esto.
5. **Los activos asignados al system user** — las 3 páginas de Facebook están asignadas (Stunned co
   `992484813957797` · Zattia `470118182844894` · BDI Accesorios `264601567300555`); 🔴 **las cuentas
   de Instagram NO**, y por eso no se puede duplicar nada con avisos en la cuenta de Stunned.

🔴 **El token vive en dos lados y no se recupera de ninguno**: `META_ADS_TOKEN` en el Vercel del
monitor (que es de Darío) y en los secrets de Actions. Vercel no lo muestra y `vercel env pull` lo
baja **vacío sin quejarse**. La salida es generar uno nuevo en el system user `monitor-ads`
(`61591741817268`) → «Generar token»; ⛔ **NUNCA «Revocar tokens»**, que está al lado y mata el que
usa Vercel. Un system user banca varios tokens vivos. ⚠️ Y **cambiar la env var en Vercel no
redeploya**: la función sigue con el token viejo hasta el próximo push (un commit vacío alcanza).

Cuatro cuentas publicitarias, no tres: `1145878766790149` («Cuenta 0149», BDI **y** Zattia, donde
está toda la plata) · `4366752500136303` (Stunned, mudada en agosto) · `307068563918043` (BDI
ACCESORIOS, sin entrega) · `1766605934148471` (Areben Comercial SRL, vacía). El censo consulta
**todas** las del token y reparte campaña por campaña, así que el diseño no depende de cuántas sean.

## Lo que ya está comentado, y hay que leer antes de tocar

Casi todo el «cómo funciona» está escrito en el lugar donde muerde. Esta ficha no lo repite: manda.

- `api/meta-ads.js:1-51` — el índice de los `?recurso=` y qué devuelve cada uno.
- `lib/meta-ads/reglas.core.js:356` y `:484` — `agrupar()` devuelve **dos fotos**: `ultima` (la última
  fila de la ventana) y `actual` (la última con configuración escrita, esté o no en la ventana). Es
  la corrección del calibrador ciego, y el radar de atribución tardía es el único que se queda con
  `ultima`.
- `lib/meta-ads/snapshot.core.js:171` y `:200` — de qué **nivel** salen los totales (la misma plata
  está en los cuatro) y por qué `alcance` y `frecuencia` vuelven en `null`.
- `lib/meta-ads/escalado.core.js:47` y `lib/meta-ads/podado.core.js:15-28` — `ultimoDiaCerrado()` y
  **las dos direcciones del error**: la reatribución de Meta es barata para escalar y cara para podar.
- `lib/meta-ads/acciones.core.js:76` y `:319` — la tabla de acciones (con la que la pantalla dibuja
  los botones **y** el servidor contesta 403) y por qué una campaña sin línea es **409 y no 403**.
- `lib/meta-ads/acciones.core.js:364` — la unidad menor de la moneda. El `/100` no se escribe a mano
  en ningún lado.
- `lib/meta-ads/planes.core.js:419` — `politicaReintento()`: un paso que crea se **sondea**, nunca se
  repite. Es lo que sostiene el motor entero.
- `lib/meta-ads/receta.core.js:105`, `:237` y `:304` — las tres causas por las que `/copies` rechaza,
  que el mínimo real de presupuesto **sólo viene en el texto del error** (y se re-pregunta con
  `validate_only` en vez de creerle), y que `LINK_CLICKS` está retirado.
- `lib/meta-ads/ventana.core.js:3` — ausente → el defecto · servible → eso · pedido y no servible →
  400. Sustituir en silencio es la única de las tres que miente.
- `lib/meta-ads/creativos.core.js:121` y `:176` — pedir el tamaño de la miniatura en la llamada de
  los avisos **Meta lo ignora sin rechazar**, y el paginado que un `limit=200` escondía.
- `lib/meta-ads/pieza.core.js:107` y `:297` — en un aviso de video el destino vive **adentro del
  botón**, y preguntarle al nodo Página es preguntar por una puerta que este token no abre nunca.
- `lib/meta-ads/tendencia.core.js:22` · `lib/meta-ads/copia.ts:9` · `lib/meta-ads/informes.core.js:31`
  · `lib/meta-ads/rentabilidad.core.js:25` y `:130` · `lib/meta-ads/decisiones.core.js:11`.

## Reglas que el código no dice

- 🔑 **La marca de una campaña la pone una PERSONA, y «sin asignar» es un estado real.** No se deduce
  de nada que traiga la Graph API: BDI y Zattia se pautean de la **misma** cuenta. El chequeo barato
  de que no quedó plata sin atribuir es que la suma de lo asignado dé el total de la cuenta.
- 🔴 **La foto se arma desde los `insights`: un objeto que NO entregó no tiene fila.** La
  configuración (`estado`, `estado_real`, `diario_crudo`) sólo *enriquece* filas que ya existen, y se
  escribe **sólo en la fila del día en que se sacó la foto** — Meta no expone configuración hacia
  atrás. Consecuencias que muerden: el efecto de un escalón sólo se mide hacia adelante, y la regla
  `sin-avisos` puede no ver justamente el conjunto encendido y vacío que existe para detectar (medido:
  un fantasma de $12.800/día que no aparece en ningún día de la foto).
- 🔑 **Ninguna regla ejecuta: proponen.** Lo eligió Bruno. El hallazgo entra como renglón en «Qué hay
  que decidir» del Panel y accionar es apretar un botón, con su permiso, su `idem` y su registro. No
  hay pantalla nueva de alertas: un segundo lugar al que hay que acordarse de entrar es uno al que no
  se entra.
- 🎯 **Los umbrales no se definen, se calibran.** Lo **derivable** (un HECHO: el CPA medido de la
  línea) se autocompleta; lo **no derivable** (una DECISIÓN: el ROAS objetivo) nunca, porque el ROAS
  mediano es el que TENÉS y no el que querés. Para eso está el dial + el calibrador, que corre la
  misma `evaluarRegla` hacia atrás sobre 90 días y dice cuántas veces habría saltado **y sobre cuántos
  objetos distintos**: 40 saltos sobre 3 objetos es repetición, sobre 40 es un hallazgo.
- 🔑 **EL FRENO ES EL COSTO POR COMPRA, NO EL ROAS.** Techo de BDI **$9.100 por compra**, break-even
  **1,7×**, objetivo **3,4×**. El mix de medios de pago mueve el techo 0,65% y el ROAS 12% ⇒ el ROAS
  de Ads Manager baja ~10% si crece la transferencia **sin que la pauta empeore**. 🔴 1,7× es el
  break-even y 3,4× el objetivo: confundirlos hace apagar campañas que dan ganancia.
- 🔴 **Toda la pauta es ABO**: ninguna campaña tiene presupuesto propio, la plata vive en los
  conjuntos. El botón de presupuesto a nivel campaña no tiene hoy dónde usarse, y cualquier regla
  automática tiene que apuntar al conjunto.
- 🔑 **Toda escritura: el `idem` se RESERVA en la base ANTES de llamar a Meta, y el `ok` sale de
  RELEER, no del POST** (Meta acepta cambios de presupuesto que después no aplica). Una fila en
  `en-curso` es una escritura que se cortó y de la que **no sabemos** si se aplicó: se contesta eso.
- 🔑 **Todo objeto que crea un plan lleva su MARCA en el nombre, anotada antes del POST.** Es lo único
  que permite **adoptar en vez de reintentar** — y es cómo se confirma en Ads Manager, sin creerle a
  nadie, qué llegó a crearse: se busca el marcador.
- ⛔ **El monitor no borra, a propósito.** Eliminar es la única de la familia que destruye algo. Las
  copias de prueba las borra Bruno en Ads Manager.
- 🔑 **Podar es la acción más barata de deshacer, y por eso ofrece una lista de veinte donde duplicar
  pide confirmar de a uno.** La lista **no se acepta del cliente**: llegan ids y se apagan los que el
  servidor vuelve a medir y encuentra entre los candidatos.
- ⛔ **El informe en prosa lo escribe una persona.** `/meta-ads/informes` es un **depósito**: no
  calcula nada. El día que aparezca un gráfico ahí, dejó de ser un depósito y es un dashboard más de
  los que nadie abre.
- ⚠️ **Al sumar una vista hay que releer los TRES textos que la cuentan** (`MetaAds.tsx`, `lib/nav.ts`
  y el `info` de `PERM_CAT`). Ya mordió cuatro veces.
- ⚠️ Los subs `pausar`, `presupuesto` y `crear` **no se heredan de la función**: hay que tildarlos a
  mano, marca por marca. A Bruno le aparecen igual porque es admin — o sea que probarlo con su cuenta
  no prueba nada sobre el resto del equipo.

## Lo que ya se rompió acá

Todos están comentados donde muerden; acá van para saber **qué mirar primero**.

🔴 **Cinco veces salió a prod algo muerto con las cuatro del CI en verde, y ninguna era un error de
lógica** — por eso ninguna prueba de lógica podía verla:

- **`poda` faltaba en la cadena de `if` del despacho de `?recurso=`**: eso no falla ruidosamente, la
  llamada cae al camino de abajo y contesta otra cosa. 2.308 pruebas en verde y la pantalla dibujando
  nada. Lo cazó **abrir la pantalla**. Igual de silencioso es `VISTAS[vista] ?? Panel`: una entrada de
  menú sin su vista dibuja el Panel sin decir una palabra. ⇒ los dos espejos de `meta-ads-despacho`.
- **El calibrador miraba 2 días de 90** y contestaba un número chico en vez de decir que no veía: con
  el ROAS objetivo en 50×, donde tendría que caer todo, contestaba «4». **43 tests pasaban con el
  defecto puesto** porque todas sus series ponían `estado: 'ACTIVE'` en las 30 filas — ninguna tenía
  la forma del dato de producción adentro. Es la causa de que «los 10 minutos con el dial» no rindieran.
- **La foto del DÍA EN CURSO cortaba toda racha en cero** (a las 17 h un conjunto de $2.700/día figura
  con $335): ninguno de los 18 conjuntos pasaba el guardarraíl de escalar, ni con el ROAS en 1,5×.
- **`?dias=N` fuera de {30, 90} devolvía 30 en silencio**, con un número plausible. Ninguna pantalla
  lo sufría (el selector ofrece sólo 30 y 90) ⇒ **un parámetro público que la propia UI no puede pedir
  mal es justo el que nadie prueba**.
- **`api/` y `scripts/` estaban fuera de ESLint y de `tsconfig`**: una variable borrada dio 500 en
  prod. Se les prendió `no-undef`.

Y tres que aparecieron **usándolo**, no leyéndolo:

- 🔴 **La subida de piezas estaba muerta en prod**: `upload()` de `@vercel/blob/client` no pasa por
  `apiFetch`, así que el header de sesión no viajaba y `exigirUsuario` contestaba 403 a un usuario
  logueado. Los 34 tests probaban el núcleo puro, no la conversación con el SDK.
- 🔴 **`TIMEOUT_MS` (8 s) es más corto que una copia CON avisos** ⇒ el camino feliz se reportaba como
  «no sabemos cómo quedó», siempre. Se arregló reconciliando por el sufijo (`{reconciliar: idem}`, que
  **lee** y no escribe), no subiendo el timeout: 8 de los 10 s de Hobby ya están al tope. Y el sufijo
  falló dos veces en lo único para lo que existe: salió **en UTC** (Vercel corre en UTC, esta máquina
  no) y después con el día sin rellenar (`day: '2-digit'` **lo ignora `es-AR`** en esa combinación).
- 🔴 **Una copia recién nacida viene `effective_status: IN_PROCESS` con `status: PAUSED`** y se
  reportó como alarma de plata («no nació pausada»). Lo que `status_option: PAUSED` promete es el
  `status`. **La auditoría fue el testigo que corrigió la conclusión** — es por eso que guarda el `de`.
- ⚠️ **Una campaña pausada no aparecía en NINGUNA parte de la pantalla**: el reparto era `alAire` /
  `sinEntrega` / `sin asignar`, y lo que no está `ACTIVE` no caía en ninguno. La invariante que
  faltaba, hoy con test: **los tres cortes reparten todas las campañas y ninguna aparece dos veces**.
- 🔴 🔑 **Rentabilidad afirmaba $9.101 durante un cuadro, en TODAS las líneas** (22-ago-2026, lo vio
  Bruno): *«cada vez que cambio de marca, incluso en la de BDI, primero me aparece el rendimiento
  anterior de BDI de 9 mil pesos de techo por compra»*. `useRentabilidad` arranca en `DEFAULTS` y
  `DeUnaLinea` va con `key={laLinea}` ⇒ **cambiar de pestaña remonta** y repinta ese arranque. El
  techo de los defaults no es el de ninguna línea guardada — ni el de BDI, que está en $6.755.
  🔑 **El defecto era MEDIA regla en la pantalla**: `cargando` existía y lo miraba **sólo** el cartel
  de `DeDondeSalen`, en la columna angosta ⇒ el cartel decía «leyendo…» mientras el número grande de
  al lado afirmaba una cifra. **Un número dibujado no se lee como provisorio**, así que avisar al
  costado es peor que no mostrar nada. Hoy el padre no dibuja **ni un número** mientras carga, y
  `tests/meta-ads-rentabilidad-pantalla.test.tsx` lo amarra. ⛔ **No se arregla sacando la `key`**:
  eso arrastraría lo editado de una línea a la otra, que está decidido al revés a propósito.
  🔑 **El oráculo es `renderToStaticMarkup`, y es exacto y no una aproximación**: no corre
  `useEffect`, así que devuelve **el primer cuadro** — el único estado donde el defecto vivía. Un
  test que esperara el fin de la carga no podría verlo nunca. Verificado en rojo antes que en verde:
  sin el guard, 2 de 3 casos caen y el mensaje imprime el `$ 9.101` que vio Bruno.

## Medido contra la base el 16-ago-2026

- 🔴 **`meta_ads_regla`, `meta_ads_umbral` y `meta_ads_hallazgo` siguen en CERO filas**: el cron de
  Automatizaciones sale verde todos los días **evaluando nada**. Prenderlo no es código — es mover el
  dial en `/meta-ads/automatizaciones`. Es el pendiente más viejo del módulo.
- La foto está sana y al día: **3.018 filas, del 11-may al 16-ago** (98 días, cuatro niveles).
- `meta_ads_campania_linea`: **10 asignaciones** (5 en Cuenta 0149, 5 en la de Stunned). ⚠️ Borrar en
  Ads Manager **no limpia esta tabla**: hay filas de campañas que ya no existen.
- `meta_ads_accion`: 21 · `meta_ads_decision`: 12 · `meta_ads_plan`: 3 (**dos `duplicar` atascados y
  el de `piezas` cancelado**) · `meta_ads_informe`: 2, **los dos en borrador** ·
  `meta_ads_rentabilidad`: 1 (sólo BDI; Zattia y Stunned muestran los defaults prestados) ·
  `meta_ads_favorito`, `meta_ads_etapa` y `meta_ads_ideas`: 0.

## Rentabilidad: DREI, envío y saldo de IVA (19-ago-2026)

Los 19 supuestos pasaron a 22. Los tres nuevos salieron de medir la economía online de **Zattia**,
que el modelo de las fundas no podía expresar:

- **`drei`** — el municipal de Rosario, 0,75%. Sale de la contribución como el IIBB.
- **`envio`** — lo que la tienda absorbe por **PEDIDO** (⛔ no por unidad: no se multiplica por
  `unidades`). Se carga **con IVA**, y 🔑 **de la ganancia sale su NETO** —el crédito se descuenta
  como cualquier compra con factura— **pero de la caja sale entero**, porque con saldo a favor que
  no se consume ese crédito sólo engorda el pozo.
- **`saldoIva`** — si el IVA débito **se netea contra un saldo a favor** en vez de pagarse. Prendido
  aparece un segundo techo, `costoMaxCaja`, y `recuperoPedido` deja de ser 0.

🔴 **El recupero NO se suma adentro de `contribPedido`, y eso es deliberado.** No es ganancia: es
plata propia que se descongela. No se repite (el saldo es un stock finito), no depende de la calidad
de la venta (una vendida a pérdida libera el mismo IVA) y **no la genera la pauta** (la libera igual
una venta del local con tarjeta). ⇒ **`costoMax` —el del semáforo— sigue siendo el de GANANCIA**;
`costoMaxCaja` es un techo extra para un empujón deliberado y con fecha. `escenariosDeFreno` y
`proyeccionStock` siguen colgando de la ganancia, a propósito.

⚠️ **Los tres nacen NEUTROS (`0`, `0`, `false`) y no es una omisión.** `normalizar()` arranca en
`DEFAULTS` y una clave que la fila guardada no tiene se queda con el default ⇒ **un default ≠ 0 le
cambiaría el techo, en silencio, a toda línea ya guardada**. El primer test del bloque nuevo de
`tests/meta-ads-rentabilidad.test.ts` clava el techo que da la fila de BDI.

## 🔴 El techo de BDI se corrigió el 21-ago-2026: $9.101 → $6.755

`unidades` pasó de **2,6 a 1,93**. El 2,6 era un número **derivado** del ticket; el 1,93 está medido
con `scripts/medir-economia-bdi.mjs` en tres ventanas (n=91 / 213 / 448 ⇒ 1,92 / 1,93 / 1,86) y por
los **dos caminos** que la base ofrece (`ventas.items_sold` y la suma de `venta_detalles.quantity`),
que coinciden exactamente. El chequeo cruzado del script da 4,1% ⇒ **las unidades explican casi toda
la diferencia** y no hizo falta mover ningún otro supuesto. El ROAS break-even NO se movió: 1,72.

- 🔑 **`FILA_BDI` en `tests/meta-ads-rentabilidad.test.ts` es una COPIA de producción.** Cuando
  alguien guarde la fila desde la pantalla, ese fixture queda afirmando algo falso sobre «la fila
  guardada» **y el test sigue verde**, porque una copia no sabe que quedó vieja. Se relee con
  `psql "$DATABASE_URL_BDI" -A -t -c "select supuestos from meta_ads_rentabilidad where linea='bdi'"`.
- ⛔ **No se tocaron `costo` (medido $1.708 contra $1.700: mueve el techo $8) ni `mix`.** Cuál de
  MercadoPago / PagoNube cuenta como «transferencia» para el modelo es una **decisión**, no una
  medición: el script mide 58% / 35% / 6% de contado y no alcanza para deducirlo.
- 🔴 ▶️ **`DEFAULTS.unidades` sigue en 2,6 y eso quedó abierto a propósito.** Su comentario dice que
  es «la economía real de las fundas de BDI», y ya no coincide con la fila medida de BDI. Bajarlo a
  1,93 le movería el techo a **Zattia y Stunned**, que no tienen fila y muestran estos defaults
  prestados — y Zattia ya tiene su economía medida aparte ($5.125 de ganancia): lo que corresponde
  ahí es **cargarle su fila**, no ajustarle el préstamo. Lo decide Bruno.

## El parte del día (21-ago-2026)

`GET /api/meta-ads?recurso=parte&account=<id>[&linea=bdi]` → un TEXTO PLANO con todo lo que hace
falta para decidir presupuestos. Botón «Parte del día» en el **Panel** (⛔ no es una vista nueva: a
propósito, para no volver a tocar los tres textos que las cuentan).

- 🔑 **Existe porque analizar un día costaba ~12 llamadas al navegador** y cada vuelta traía el JSON
  entero de Meta. El armado es puro (`lib/meta-ads/parte.core.js` + `parte.ts`), la conversación
  vive en `api/_meta-parte.js`.
- 🔑 **Cinco llamadas a Graph, no veintisiete.** Pedir el detalle de cuenta tres veces (hoy, ayer,
  serie) son 9 cada vez. ⛔ **No se pide solo**: no hay `useEffect` que lo traiga al abrir el Panel,
  porque el cupo de la Marketing API es un porcentaje de la cuenta.
- 🔴 **Los días los resuelve META, no nosotros.** `date_preset=today` / `yesterday` se calculan en la
  zona de la CUENTA, y la fecha de la cabecera sale del `date_start` que Meta devuelve. Vercel corre
  en UTC y calcular «hoy» del lado del servidor ya falló dos veces acá (el sufijo de las copias).
- 🔴 🔑 **El bloque que decide es `PEDIDOS REALES vs META`, y el oráculo NO son las `purchases`.**
  Medido el 20-ago: Meta bajó el costo por compra 34% mientras el costo por pedido REAL de Tienda
  Nube subía 47%, porque el CAPI subió la atribución del 40% al 89%. La columna `atrib%` está en la
  misma tabla justamente para que eso se lea solo. Los pedidos salen de `ventas` con
  `channel = 'Tienda Nube'`, ⛔ sin filtrar por estado (una venta anulada se ELIMINA en GN).
- 🔴 🔑 **El cruce se corta en el último día CERRADO** (el `ayer` que contestó Meta), por DOS
  motivos y hacen falta los dos: el espejo lo llena el sync de las 3 AM ⇒ el día en curso puede venir
  vacío; **y aunque no venga vacío sigue siendo medio día de gasto contra medio día de pedidos**, y
  arrastra el promedio de la ventana que decide el marginal. ⛔ Cortar «donde la tienda tenga datos»
  sólo tapa el primero. Medido el 21-ago corriéndolo contra la pauta real: el día en curso entraba
  con 4 pedidos y $4.983, y el marginal salía **$6.322 en vez de $5.843** — 8% para arriba.
- 🔴 **Un costo con denominador 0 se imprime VACÍO, nunca `0`**: un 0 en una columna de costos se lee
  como «ese día las compras salieron gratis». Misma familia que el `atrib` que devuelve `null`.
- 🔴 **`marginalEntreVentanas` devuelve `null` con MOTIVO cuando no se puede calcular**, y esa es la
  mitad de la función: con Δpedidos ≤ 0 la división da un costo negativo que se lee perfecto y
  significaría «cada pedido nuevo te devuelve plata».
- 🔑 **`FUNNEL` y `TIPO_FUNNEL` bajaron a `lib/meta-ads/metricas.core.js`** el 21-ago, cuando apareció
  el segundo lector: el embudo de la cuenta y la proyección por aviso tienen que mirar el MISMO
  `action_type` o dejan de dar lo mismo sin que nada falle. `tests/meta-parte.test.ts` lo amarra
  texto contra texto sobre los DOS archivos de `api/`.
- ⚠️ `techosDiarios` se indexa por **NOMBRE** de conjunto (es la única llave que traen las filas de
  insights ya agregadas). Dos conjuntos homónimos en campañas distintas compartirían fila.

## Pendiente

### ▶️ ZATTIA — los cambios de conjuntos que quedaron decididos y SIN HACER (22-ago-2026)

Se deciden en Ads Manager a mano: **la API no cambia creativos ni sube videos**, y apagar un conjunto
sí se puede desde el monitor.

1. ▶️ **Apagar los 3 conjuntos de `ZATTIA - TRAFICO - 21/-05` que entregan** — `TEST INTERESES 1
   ZATTIA - 22/05` ($1.815/día), `(4) - 20/7` ($1.683), `(5) - 23/7` ($783). **Libera $4.281/día**,
   el 34% de lo que gasta Zattia.
   🔴 🔑 **El motivo NO es «los clicks no convierten», y esa lectura estaba mal**: lo corrigió Bruno
   — **todas las campañas de tráfico van a Instagram y NUNCA a la tienda** ⇒ sus 24.554 clicks no
   podían comprar, y ⛔ **no se comparan contra los de la campaña de ventas**. El motivo real es que
   **lo único que compran son seguidores, y salen $5.859 cada uno** (80 en 94 días, $475.575).
   ⚠️ Y al revés sí vale: **una campaña de VENTAS también genera visitas al perfil**, porque el que
   se interesa entra a ver el Instagram ⇒ apagar tráfico no deja el perfil en cero.
2. ▶️ **Mover el video que sirve a una campaña de VENTAS**: `AD 01 - REEL NUEVOS INGRESOS - 22/05`
   hizo **12.168 clicks —la mitad de todo el tráfico de Zattia—** con CTR 5,79% y CPC $14, y es el
   gancho de «nuevos ingresos», que es justo lo que se va a lanzar. Va en un conjunto optimizando
   `Comprar`, con la estructura del `AD 1 - SWEATERS & FITS SEMANA` ($1.343/compra).
   🔴 **Es una apuesta, no un ganador probado**: ese CTR se midió contra un destino de Instagram, no
   contra la tienda. ⛔ **Y no elegir por CTR**: en esta cuenta el aviso de PEOR CTR (`SWEATERS -
   REEL COLORES`, 1,95%) es de los mejores por costo ($2.345) y uno de 5,51% (`FALDAS 4 COLORES`) es
   el peor ($7.706).
3. ▶️ **Escalar VENTAS de a UN escalón, midiendo el marginal.** Techo $6.046/compra contra $3.069
   que paga hoy ⇒ 1,97× de aire. 🔴 **Zattia no tiene medido su costo por compra MARGINAL** —el que
   frenó a BDI en $6.755—, así que la plata liberada ⛔ no se vuelca de una.
4. ⚠️ **FALDAS falló en las dos campañas** (3 avisos en tráfico y `FALDAS 4 COLORES` a $7.706 en
   ventas), pero **probablemente sea ESTACIÓN y no creativo**: en agosto todavía es invierno y los
   sweaters son los que convierten. ⛔ No matar los creativos de verano por lo que midieron en agosto.

### ▶️ Rentabilidad

- 🏁 **Zattia YA tiene su fila** (22-ago, verificada por relectura): techo **$6.046**, ROAS BE 3,99×
  de ganancia y 2,36× de caja, `saldoIva` prendido, objetivo 40 ventas/día (lo decidió Bruno).
  🔑 **Se cargó con el régimen SIN LIQUIDACIÓN** (251 pedidos, 20-may→11-ago): la liquidación arranca
  el 13-ago y hunde el markup de 2,22× a 1,59×, y calibrar el semáforo sobre una promo lo descalibra
  solo el día que la promo termina. ▶️ Falta **Stunned**.
- 🔴 ▶️ **`rentabilidad.core.js` cobra IIBB sobre el BRUTO y `lib/comisiones/core.ts` sobre el NETO**
  (línea 61). Misma marca, dos márgenes: el techo de Zattia da $6.046 con base bruta y $6.171 con
  base neta (2,1%), y le pega igual a BDI. ⛔ No se tocó: cambiarlo mueve **el techo ya guardado de
  BDI en silencio**, que es el modo de falla que advierte el comentario de `DEFAULTS`. Lo decide Bruno.
- ⚠️ **El modelo no tiene dónde poner la comisión de la pasarela sobre el ENVÍO COBRADO** (~$338 por
  pedido en el 43% de Zattia que despacha) ⇒ el techo queda optimista ~3,7%. Meterlo en el campo
  `envio` —que dice «lo que absorbe la tienda»— sería mentirle a su etiqueta.
- 🔴 **`total_cost` es NULL antes del 20-may-2026 en la base de Zattia**: cualquier ventana anterior
  promedia mercadería sobre 334 pedidos y COGS sobre menos, y el markup de mayo da **18,4×**.

### ▶️ Lo de antes

- ▶️ 🔴 **Cargar los umbrales y crear las reglas** mirando el calibrador. Son 10 minutos y es lo que
  destraba las automatizaciones, los escalones (que sin `roas_objetivo` ni `techo_diario_crudo` no
  pueden armar nada) y el freno de emergencia.
- ▶️ **Nunca se escribió un escalón, ni se apagó un aviso de la poda, ni se apretó «Empezar» en una
  tanda de piezas.** Cada una de esas tres primeras veces **vale como la verificación** de su tanda —
  hasta entonces están escritas, probadas y sin ejercer.
- ▶️ Los 5 avisos que la poda propone apagar ($60.666 en 7 días, cero compras) — lo decide Bruno.
- ▶️ Publicar los 2 informes de BDI, que están en borrador.
- ▶️ **El semáforo vivo** de rentabilidad (cruzar el techo con la foto): es lo que hace que la
  pantalla deje de ser calculadora y pase a ser alarma.
- 🔴 **Stunned gastó $428.421 en 90 días sin una sola compra atribuida** y los tres píxeles están
  vivos ⇒ no es «no hay píxel». Su freno de emergencia queda apagado solo, porque el piso se deduce
  del CPA y su CPA es la cuenta entera sobre una compra. **Hay que mirar si es el píxel o es la pauta.**
- ⚠️ Al navegar entre subsecciones la URL pierde `?linea=` y `?cuenta=` (el eje sobrevive en el
  provider, así que la pantalla está bien; el link deja de reproducirse).
- ⛔ **Contar las tarjetas de un carrusel no se puede con este token** (`attachments` es un campo de
  POSTEO y pide `pages_read_engagement`). El código y sus tests existen: vuelve con un `git revert`
  de `957b79e` el día que el token tenga el permiso.
- ⚠️ Sin medir: si crear un creativo necesita también la cuenta de Instagram
  (`instagram_user_id` viaja en el mismo `object_story_spec`).

## Cómo se prueba

`npx vitest run tests/meta-ads-despacho.test.ts --reporter=dot` es el que más rinde por lo que cuesta:
amarra los tres espejos que ya se rompieron en silencio (los `recurso` del cliente contra la puerta,
las vistas del menú contra `VISTAS`, y los presets del tipo contra los que acepta el handler). Los
otros 25 corren por pieza; **uno por vez**, que la suite entera son 89 archivos.

🔑 **Contra esta sección, un test verde no es una medición.** Los cuatro defectos más caros pasaron
las cuatro del CI. Lo que sí sirve, en orden de lo barato a lo caro:

1. **`--calibrar`** (`scripts/evaluar-reglas-meta.mjs`): corre los detectores contra la pauta real,
   90 días, **sin escribir una fila y sin token de Meta**.
2. **`validate_only`**: Meta valida el pedido entero y no crea nada (contesta `{"success":true}` sin
   id). Convierte «¿esto saldría?» en una pregunta que se puede hacer decenas de veces sobre la pauta
   de verdad. ⚠️ Secuencial y con ~1,5 s entre medio: 48 POST en paralelo agotan el cupo de la cuenta.
3. **`scripts/crear-y-borrar-meta.mjs`** por `ensayo-meta.yml`: crea un conjunto de verdad, lo relee,
   lo coteja campo por campo y lo borra en un `finally`. 🔑 Tiene **`--probar-rojo`**, que le mete el
   defecto **a la relectura** (mutar el POST no sirve: Meta guardaría el valor mutado y el verde sería
   correcto) y con esa bandera **el resultado bueno está dado vuelta**: cazar los dos defectos es
   exit 0.
4. **Los conejillos de indias**, que conviene reusar siempre: para pausar/activar, una campaña **sin
   conjuntos** (Meta no tiene por dónde entregar); para presupuesto, un conjunto **pausado**; para la
   cadena de piezas, un PNG de 1080×1080 de 5 KB generado al vuelo.

🔴 **El token no está en ningún `.env` local** (sí lo están `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` de
BDI, que alcanzan para consultar las tablas con un script descartable). Para preguntarle al servidor
en prod se le pega desde Chrome con la sesión de Bruno, armando el header `x-monitor-auth` a mano
desde `localStorage['monitor-areben-idp']`. ⚠️ Hay varios Chrome conectados y **el nombre se corre**:
hay que elegir el del monitor por su deviceId, no por «Browser N».
