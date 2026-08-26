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

> ⚠️ **Superado el 22-ago**: con el DREI y el recupero prendidos el techo de ganancia es **$6.668** y
> el que manda en BDI es el de **CAJA, $8.686**. Ver la sección de abajo. Lo de acá sigue valiendo
> para entender **cómo se midió `unidades`**.

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

## 🏁 22-ago-2026: el recupero de IVA y el DREI, y **en BDI manda el techo de CAJA**

Lo decidió Bruno. Los dos campos **faltaban en el jsonb** de la fila de BDI y caían al default
(`saldoIva:false`, `drei:0`), **siendo el mismo CUIT y la misma ciudad que Zattia**, que ya los
tenía. No era una decisión: era el default.

| BDI | antes | ahora |
|---|---|---|
| contribución por pedido | $13.511 | **$13.337** (el DREI la baja) |
| recupero de IVA | — | **$4.035** |
| caja por pedido | — | **$17.371** |
| techo de ganancia (50%) | $6.755 | **$6.668** |
| **techo de CAJA (50%)** | — | **$8.686 ← EL QUE MANDA EN BDI** |

⚠️ **En Zattia la regla permanente sigue siendo la de GANANCIA** ($6.046) y la de caja es un techo
extra con fecha. **En BDI es al revés, y el motivo es concreto**: BDI importa las fundas ⇒ genera el
crédito, y **su mayorista no se factura** (confirmado por Bruno el 22-ago) ⇒ **online es el único
canal que consume el pozo**. Mientras eso sea así, el recupero es incremental a la pauta.

- 🔑 **Y no es «gastarse la ganancia»**: al 50% de caja quedan **$4.651 por pedido**, el 35% de la
  contribución. El que sí la come es el break-even de caja ($17.371), que no lo propone nadie.
- 🔑 **La curva es plana**: pagar $6.668 o $8.686 deja **casi la misma ganancia total** ($186.542 vs
  $179.722 por día, ±4%). Lo que compra el de caja es **38% más volumen** (28,0 → 38,6 pedidos/día)
  y **$43.000/día más de saldo liberado**. La decisión no la manda la ganancia.
- 🔴 ▶️ **EL TRIPWIRE: falta medir a qué ritmo crece el saldo de IVA.** Es el único número que dice
  cuándo **se apaga** esta regla. El día que el mayorista se facture, el techo extra sobra y hay que
  volver a $6.668.

## 🔴 La elasticidad de BDI es 0,55 — y es lo que dimensiona TODO el presupuesto

Medida el 22-ago por regresión log-log de **pedidos reales de Tienda Nube** contra gasto diario, en
tres ventanas: **0,535 · 0,551 · 0,560** (n = 52 / 43 / 66 días). Los pedidos suben **menos que
proporcionalmente** al gasto. Se ve sin modelo en la serie semanal: **el gasto ×6 y los pedidos ×2,4
⇒ el costo por pedido se duplicó** ($1.131 el 13-jul → $2.882 el 10-ago).

| | el techo de caja se toca en | pauta/mes |
|---|---|---|
| elasticidad 0,50 | 30,6 pedidos/día | $7,97M |
| **0,55 (el medido)** | **38,6 pedidos/día** | **$10,07M** |
| 0,60 | 51,7 pedidos/día | $13,48M |

**Y las 100 ventas/día cuestan $40,4M a $85,2M por mes**, o sea **$13.476 a $28.394 por pedido**,
contra una contribución de $13.337 ⇒ **se llega al objetivo perdiendo plata.**
🔑 **El objetivo no lo traba la plata: lo traba la eficiencia.**

- 🔴 ⛔ **El marginal LINEAL no sirve para extrapolar.** Está bien medido ($3.600-$4.385 por cuatro
  ventanas, $4.108 por OLS con R²=0,72) y **describe bien el tramo 4→14 pedidos/día**, pero
  **predice 124 pedidos/día con $15M** — más que el objetivo. Fuera del tramo medido, miente.
- ⚠️ **La ventana en la que se midió tenía CINCO cambios simultáneos** (CAPI de `Comprar`,
  ADVANTAGE+, promo de 2ª unidad, envío gratis a $44.000 y el banco de 5 celdas, todos entre el 18
  y el 19-ago). Que dé estable en tres ventanas **no la vuelve independiente**: son ventanas
  solapadas del mismo período. Y si el ADV+ canibalizó —está medido que **redirigió gasto, no lo
  sumó**— parte del rendimiento decreciente es canibalización y no saturación.
  ⇒ ▶️ **Re-medirla en ventana limpia.**

## 🔴🔑 $62.043 POR DÍA: lo que necesita UN conjunto para salir de aprendizaje

Meta pide **50 conversiones por semana por conjunto**. Al techo de $8.686 eso son **7,14 compras/día
= $62.043/día en un solo conjunto**.

| un conjunto a… | conv/semana | de lo que Meta pide |
|---|---|---|
| $10.000/día | 8 | **16%** |
| $20.000/día | 16 | 32% |
| $35.000/día | 28 | 56% |
| **$62.043/día** | **50** | **100%** |

🔑 **Esto dimensiona la estructura entera**: el presupuesto de BDI al techo ($335.642/día) aguanta
**5,4 conjuntos** fuera de aprendizaje. **Hoy, con $53.703/día, aguanta 0,87 — ni uno.**
⇒ Es la explicación del `6 → 4 → 1` de la escalada, y de que `GIRLHOOD FRIO` haga ~21 de 50.

🔴 ⛔ **Lo que NO se sigue de esto, y se venía afirmando igual: «entonces no se pueden tener muchos
conjuntos».** Las 50 conv/semana son de la documentación de Meta y dicen cuándo un conjunto **sale
de aprendizaje** — no dicen que agregar conjuntos encarezca al resto. Eso era una inferencia, y el
23-ago-2026 se midió y **no da**: ver la sección de abajo. El número de arriba queda; la
consecuencia que se le colgaba, no.

### La forma de los tests, decidida por Bruno el 22-ago

> **Celdas de $10.000/día con 2 o 3 anuncios, que gane el mejor, buscando diversidad creativa.**
> A $10.000 una sola venta ya deja la celda debajo del techo ⇒ **el downside está acotado.**

Dos reglas para que el test sirva:

1. 🔴 ⛔ **No se rankea por COMPRAS**: a $10.000/día son ~1,15 compras/día ⇒ **6 en cinco días**, y
   con 6 eventos no se distingue nada. ⛔ **Y tampoco por CTR** — está medido acá que **no predice
   la compra**: el aviso de peor CTR resultó de los mejores por costo.
   ⇒ ⛔ **«Se rankea por COSTO POR CARRITO» QUEDÓ RETIRADO el 23-ago-2026.** Era la idea correcta
   —buscar la señal con volumen— sobre una premisa que no se había medido. Cuando se guardaron los
   carritos y se pudo medir: **la correlación entre costo por carrito y costo por compra es −0,07**
   (n=14 conjuntos de BDI). Cero. La tasa carrito→compra va de **0% a 9,1%** ⇒ se compran carritos
   baratos que no valen lo mismo. Ver la sección del 23-ago más abajo.
2. 🔴 **El ganador NO se queda en $10.000.** Hay que mudarlo a un conjunto con **$62.043/día**, o se
   encontró un ganador y se lo dejó donde no puede rendir. **El test es de $10.000; el destino del
   ganador es de $62.000.**

## 🔑 El techo es de ADQUISICIÓN: pauta + creativos, no la pauta sola

Un peso en Meta y un peso en un editor **compran lo mismo**: pedidos. Si el techo se compara sólo
contra la pauta, cualquier costo creativo se mete por afuera y **el techo deja de significar nada**.

⇒ **La regla de gobierno del gasto creativo** (⛔ y **NO hay cupo de piezas**, se retiró la cuota de
«10 a 12 videos por semana»):

> **Se suma edición mientras el costo por venta TOTAL (pauta + edición) quede debajo del techo y el
> ROAS arriba de su objetivo. El límite es el resultado, no el volumen.**

A 38,6 pedidos/día el sobre son **$10,07M/mes entre las dos cosas**. Con **$1,04M/mes de edición**
(10,3% del sobre) quedan $9,02M de pauta, y **se paga si agrega 2,60 pedidos/día — un 6,7%**.
Verificado por el camino largo: sacarle ese millón a Meta cuesta 2,25 pedidos/día, así que la
eficiencia tiene que subir **6,2%** para empatar ⇒ **la vara publicada es medio punto conservadora.**

🔑 **Por qué la vara es baja**: hoy se corre sobre las mismas piezas hasta que se gastan —
`GIRLHOOD FRIO` perdió **la mitad del CTR en 10 días con los clics sostenidos**. Eso es desgaste de
pieza, y **es el mecanismo de la elasticidad 0,55**. Cualquier cosa que lo rompa rinde más de 6,7%.

⚠️ **Y el modo de falla de la regla**: un editor externo nuevo **no arranca a la tasa de acierto de
hoy**, así que el mes 1 va a mostrar que no se paga y la regla dirá «cortá» justo cuando hay que
tener paciencia. ▶️ **Hace falta una ventana de arranque excluida de la regla.**

📌 El desarrollo completo, con el detalle por marca y el para-qué corporativo, está en el documento
de Marketing (`~/Documents/quien-hace-que/definicion-marketing.md`) y en `norte`, que es donde vive
**el objetivo**: esta ficha tiene **las reglas**.

## El parte del día (21-ago-2026)

`GET /api/meta-ads?recurso=parte&account=<id>[&linea=bdi]` → un TEXTO PLANO con todo lo que hace
falta para decidir presupuestos — **y desde el 26-ago-2026 también `banda`, la misma verdad en
objeto**, que es lo que dibuja la BANDA DE HOY arriba de la zona. Vive en `/meta-ads` (⛔ no es una
vista nueva: a propósito, para no volver a tocar los tres textos que las cuentan).

- 🔑 **Existe porque analizar un día costaba ~12 llamadas al navegador** y cada vuelta traía el JSON
  entero de Meta. El armado es puro (`lib/meta-ads/parte.core.js` + `parte.ts`), la conversación
  vive en `api/_meta-parte.js`.
- 🔑 **Seis llamadas a Graph, no veintisiete.** Pedir el detalle de cuenta tres veces (hoy, ayer,
  serie) son 9 cada vez.
- 🔴 🔑 **26-ago-2026: AHORA SÍ SE PIDE SOLO, y eso corrige lo que decía este documento.** El motivo
  escrito era *«el cupo de la Marketing API es un porcentaje que se agota»* — una **suposición de
  magnitud, nunca una medición**. Medido contra prod (el header `X-Business-Use-Case-Usage` que
  `usoDe()` ya guardaba en la auditoría): `call_count` de la cuenta en **1-3%**, tier
  `development_access`. ⇒ **cuando la premisa se mide, la decisión se revisa.** Los candados que
  hacen segura la decisión viven en `components/meta-ads/parte/useParte.ts`: caché de módulo con TTL
  de 10 min, dedup por `enVuelo` (dos montajes comparten la MISMA promesa) y **la hora de lectura a
  la vista** — 🔑 un número sin hora al lado se lee como vivo. El `<pre>` para copiar consume el
  mismo hook, así que abrirlo ⛔ ya no pide nada.
- 🔴 🔑 **LA BANDA DE HOY compara contra ayer A ESTA MISMA HORA, ⛔ nunca contra el día entero.** El
  bloque de CONJUNTOS imprimía un `delta%` de hoy-parcial contra ayer-entero: a las 15:00 daba −56%
  en casi todas las filas y se leía como un derrumbe cuando lo único que decía es que el día iba por
  la mitad — **un número que existe y no significa**, el cuarto de la familia en tres días.
  ⇒ una llamada más con `breakdowns=hourly_stats_aggregated_by_advertiser_time_zone` a nivel
  **campaña** (⛔ no aviso: multiplicar los avisos por 24 baldes son miles de filas para contestar
  dos números). 🔑 **Y la hora en curso se DERIVA del dato**, igual que `ultimoDiaCerrado()`: es el
  balde más alto de HOY que tuvo entrega, porque acá ⛔ no se puede saber qué hora es en la zona de
  la cuenta. Si Meta no da el desglose, **no se compara y se dice el motivo** (`motivoSinHora`);
  ⛔ jamás se cae al día entero. `horaEnCurso` · `sumarHasta` · `bandaDeHoy` en `parte.core.js`.
- 🔴 **El tope diario prendido puede ser un PISO, y por eso el porcentaje no siempre se dibuja.** Los
  conjuntos de una campaña con presupuesto a nivel campaña (CBO) no tienen `daily_budget` propio:
  sumar sólo los que lo tienen da un divisor más chico que el real ⇒ el porcentaje sale **por encima
  del verdadero**, que es el peor error posible en la pantalla con la que se decide soltar plata.
  `topeQueEntrega()` devuelve `sinTope`, y con `sinTope > 0` la banda muestra el tope como piso y
  ⛔ no el `%`. ⚠️ Se indexa por NOMBRE de conjunto, con la misma limitación que `techosDiarios`.
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

## 🔴🔴 23-ago-2026: dos doctrinas de este documento se cayeron MEDIDAS

Las dos eran inferencias razonables encima de números correctos, y las dos se pudieron falsar el
mismo día porque ese día la foto empezó a guardar el embudo (`carritos`, `checkouts`, `lpv`,
commit `0bf11e0`). 🔑 **El primer uso de una métrica con más n no es decidir: es re-preguntarle a lo
que ya se había afirmado con menos n.** Ahí estaban las dos.

### 1. ⛔ La fragmentación NO encarece la pauta — medido

El núcleo de BDI (`GIRLHOOD FRIO` + `TEST BROAD BDI` + `MODELO x SIMILAR`), antes y después de
prender las **5 celdas del banco** el 19-ago:

| | antes (12-18) | después (19-23) | |
|---|---|---|---|
| **CPM** | **$1.496** | **$1.492** | **idéntico** |
| CTR | 4,90% | 3,94% | −20% |
| costo por carrito | $169 | $240 | +42% |
| **carrito→compra** | **4,4%** | **4,3%** | **idéntico** |

🔑 **Si hubiera superposición en la subasta entre celdas propias, el CPM SUBE.** No se movió un
peso, y la mitad de abajo del embudo quedó clavada. ⇒ **se puede testear en paralelo.**

🔑 **El oráculo que queda vale más que la doctrina que se cayó: el CPM del núcleo es el tripwire.**
Se sube un escalón de celdas, se mira si el CPM del núcleo se movió, y recién ahí el siguiente.
**El límite se descubre, no se supone** — y cuando aparezca, cuesta un escalón.
🔴 ⛔ **Y lo medido son 5 celdas, no 30**: decir «medí que no pasa nada, andá a 30» sobre el MISMO
similar 1% es el error de extrapolar otra vez. Por eso el escalón y el tripwire.

### 2. ⛔ El costo por carrito no reemplaza a la compra

**Correlación con el costo por compra: −0,07** (n=14). `GIRLHOOD FRIO` $139/carrito → CPA $3.937 ✅,
pero `CREATIVO 3` $194/carrito → CPA **$15.511**, y `FUNDAS MENOS 15MIL` $502/carrito (casi el peor)
→ CPA **$5.520** (bueno). La tasa carrito→compra va de **0% a 9,1%**.
⇒ Corrido hacia atrás sobre el banco de 5, un corte en $400/carrito **se equivoca más que la regla
de la venta**: mataba a `FUNDAS MENOS 15MIL` y aprobaba a `GIRLY CASES` (**35 carritos, 0 compras**).

▶️ **La pista que queda viva es el CHECKOUT**: convierte ~20% parejo en los conjuntos sanos
(GIRLHOOD FRIO 21% · ADV+ 21% · TEST BROAD 20% · UNBOXING 20%) ⇒ *costo por checkout × 5 ≈ CPA*.
⛔ **No afirmado**: n=14, y con CPAs armados sobre 1-2 compras.

🔑 **Lo que el carrito SÍ muestra, y antes no se veía:** hay piezas que hacen carritos y **no venden
nunca** (`GIRLY CASES` 35/0, `CREATIVO 1` 54/0). Esas piezas hacen bien su trabajo y **la venta se
muere ABAJO del carrito** — el problema no es el video.

## 🏁 La regla del test de creativos (23-ago-2026)

**$10.000, conjunto propio, UN solo aviso, decisión al día siguiente.** Y **tres puertas**:

| resultado a los $10.000 | veredicto |
|---|---|
| **0 ventas** | **muere** |
| **1 venta** | **NO se aprueba: va otra tanda de $10.000** |
| **2 o más** | **aprobado** |

**Por qué no dos puertas.** A $10.000 con el techo en $6.755 el test compra **1,5 ventas
esperadas** ⇒ con «1 venta = aprobado», la probabilidad de aprobar según lo que la pieza realmente
cuesta: $6.755 → 77% · $13.510 (2× el techo) → 52% · **$20.000 (3× el techo) → 39%**.
**Un desastre de 3× el techo pasa 4 de cada 10 veces.** Y corrido hacia atrás sobre el banco de 5,
**mató a `FUNDAS MENOS 15MIL` por $7** (primera venta a los $10.007; terminó comprando a $5.463,
debajo del techo) **y aprobó a `UNBOXING` por $60** (a los $10.060; terminó en $8.139, arriba).
🔑 La puerta del medio es simplemente **no decidir cuando no se sabe**: hoy «1 venta» es la
respuesta más común tanto de una pieza buena como de una mala.

⛔ **Y NO se reparte en 3 días.** Se llegó a recomendar $3.500/día × 3 con el argumento de que «el
día 1 sale 1,7× más caro» ($11.049 vs $6.514) — eso salía de **5 compras**. Con las métricas que
tienen n de verdad (36.249 impresiones, 99 carritos) el día 1 sale **más barato**: CPM $1.538 vs
$1.791, **costo por carrito $251 vs $277**.

🔑 **Un test que anda no es gasto: vende.** `IP AZUL` $5.350 y `FUNDAS MENOS 15MIL` $5.520, los dos
debajo del techo. De los 16 conjuntos de BDI con historia, **6 compran debajo del techo — 38%**, no
«1 de cada 5» (⚠️ con sesgo de supervivencia: los muy malos se apagaron antes).

## 🔴🔑 El desgaste creativo tiene FIRMA: CTR abajo con el CPM CLAVADO

`AD02 - GIRLHOOD COLLECTION`, la pieza más grande de BDI: **CTR 6,80% → 3,92% (−42%)** y
**CPC $26 → $49 (+88%)** con el **CPM en $1.777 → $1.801: 0%**.

🔑 **El CPM decide de quién es la culpa.** Si la subasta se hubiera puesto cara, el CPM sube. No se
movió ⇒ cuesta lo mismo mostrar el aviso y **la gente dejó de clickearlo**. Es la pieza, no el
mercado. ⇒ ⛔ **antes de explicar un costo que sube con «está caro Meta», mirar el CPM.**

Y el calendario cierra: el último creativo nuevo con presupuesto real debutó el **19-ago**; el
costo por pedido REAL de BDI subió **$2.989 (17-ago) → $5.059 (23-ago), +69%**.
⇒ 🔑 **La elasticidad de 0,55-0,59 no es una ley de Meta: es la firma de quedarse sin creativos.**
El cuello para las 100 ventas **no es la plata ni la cuenta publicitaria: es cuántas piezas entran.**

⚠️ Y el `AD02 - 3 LOOKS 3 FUNDAS - 22/8` recibió **$434 en dos días** porque se lo metió en un
conjunto que ya tenía un aviso instalado: **Meta concentra entre avisos.** Una pieza nueva al lado
de una con historial no recibe entrega. **Conjunto propio o no se testeó nada.**

## ✅ El ADVANTAGE+ no está reprobado — corrige la lectura del 22-ago

Su **día 1** gastó $25.189 por **1 compra** e inflaba toda comparación que lo incluyera.

| ventana | ADV+ | GIRLHOOD FRIO |
|---|---|---|
| con el día 1 (18-23) | $6.807 | — |
| **sin el día 1 (19-23)** | **$6.262** (93% del techo) | **$5.389** (80%) |

Lo sólido, porque no depende de compras: **el click de la misma pieza sale $47 adentro del ADV+ y
$36 afuera (+31%)**. 🔴 Se le baja **de a 20%** y no de un salto: Meta dice que un cambio de
presupuesto reinicia el aprendizaje **según su magnitud** (*«de 100 a 101 es muy poco probable; de
100 a 1.000 es muy probable»*) ⇒ de $25.000 a $12.000 cae del lado probable; −20% no.

## La foto ya no se saca a las 4 de la mañana (23-ago-2026)

**Dos cortes: ~08:00 y ~20:00** (y `meta-reglas` se movió con la de la mañana, porque depende de
ella). El de las 03:30 no era para nadie: estaba ahí para que el motor de reglas la encontrara
hecha, y dejaba el día EN CURSO con 4 horas de gasto adentro.
🔑 **Y se puede cortar a pedido: `gh workflow run meta-snapshot.yml`, ~40 s, idempotente** (cada
corrida reescribe los últimos 4 días). Con `-f backfill=N` para más atrás.
🔑 **El scheduler de GitHub dispara 35-59 minutos TARDE** (medido sobre 8 corridas seguidas) ⇒ el
cron pide 07:20 y 19:20 para aterrizar a las 8 y a las 20.

## 🆕🏁 26-ago-2026 (2ª tanda): EL TECHO ENGANCHADO, y el corte que manda YA CORRE

**El motor de reglas dejó de correr en vacío.** Lo que faltaba no era prender nada: era que el número
contra el que se corta **llegara** hasta las reglas.

🔑 **El techo de costo por compra ya no se pide dos veces.** Se firma en la ficha de rentabilidad de
la marca (`meta_ads_rentabilidad`) y de ahí sale, solo, el umbral `cpa_maximo`. Es una tercera
categoría de umbral y está declarada como tal en `UMBRALES` (`desdeFicha`), al lado de las dos que ya
había:

| categoría | de dónde sale | ejemplo |
|---|---|---|
| `derivable: true` | de medir los 90 días que ya están | `gasto_minimo`, el CPA real de la línea |
| `desdeFicha` 🆕 | de una decisión **ya tomada en otra pantalla** | `cpa_maximo`, el techo de la ficha |
| ninguna | hay que elegirlo en el dial | `roas_objetivo`, `frecuencia_maxima`, `techo_diario_crudo` |

⛔ **No es una tercera forma de inventar un número**: sin ficha no hay techo, y la regla que lo pide
queda apagada **mandando a la ficha, no al dial** — «Falta definir CPA máximo» sobre un número que
nadie tiene que definir a mano manda a la persona a la pantalla equivocada.

🔴 **Y `leerTechos()` es UNA lectura para los cuatro que la necesitan** (la zona de Rendimiento, las
automatizaciones, el calibrador y el guardarraíl de los escalones). Estaba escrita adentro de
`api/_meta-rendimiento.js` y era el cuarto lugar que iba a recalcular una economía unitaria: cuatro
copias del cálculo son cuatro techos que un día no coinciden, y el día que no coinciden **la pantalla
dice «rinde» y el cron propone apagarlo**. Devuelve el techo de **GANANCIA**, ⛔ nunca el de caja: ese
incluye el recupero del saldo de IVA, que es plata real pero que la venta sólo LIBERA.

🔴 **Una fila sin `precio` NO es una ficha: es la economía de BDI con otro nombre.** `normalizar()`
arranca de `DEFAULTS` —las fundas de BDI— y le pisa encima lo que la fila traiga, así que unos
supuestos vacíos devuelven el techo de BDI **para la línea que sea**. Para la pantalla eso está bien
y está dicho; para una regla que APAGA es un techo inventado —y de otro negocio— decidiendo plata.

### 🆕 El preset nuevo: «Compra muy arriba del techo» (`costo-alto`)

El corte que manda, el que la lista de los seis cortes marcaba como **🔴 no existe**. Conjunto,
ventana **5 días**, propone **pausar**.

🔑 **Es a propósito MÁS EXIGENTE que la pantalla, y la diferencia es quién decide.** La zona de
Rendimiento dice «pausar» apenas el costo pasa el techo (100%): ahí hay una persona mirando, con el
desgaste y el aprendizaje al lado, y equivocarse cuesta una lectura. La regla corre sola todas las
mañanas y deja un renglón que propone escribir en Meta ⇒ corta en **1,5× el techo**, que es la banda
donde caía `GIRLHOOD FRIO - INTERESES 1` el 25-ago (185%, ~$10.000/día). Un hallazgo por cada celda
que pasó el techo un día sería ruido diario, y **una regla que grita todos los días se deja de mirar,
y ahí se pierde también la que tenía razón**.

Y **no pide ningún dial**: `gasto_minimo` se deriva y `cpa_maximo` sale de la ficha ⇒ se prende el
día uno en toda marca que tenga su ficha cargada.

### 🔴 La escalada cortaba por ROAS, que es la vara equivocada

`ganador-escalar` pedía `roas_objetivo` a secas. El ROAS que reporta Meta **se mueve ±12% con el mix
de medios de pago** y el techo por compra ±0,7% ⇒ subir plata contra el ROAS es subirla contra un
número que cambia cuando cambia cómo paga la gente. Ahora el preset declara `requiereUno:
['cpa_maximo', 'roas_objetivo']` —**una vara u otra, ⛔ nunca las dos**— y `hayRacha()` corta por
costo si la marca tiene ficha.

Con la vara del costo se piden **dos cosas**, porque un escalón es la única acción del módulo que
manda más plata sin que nadie mire:
1. la **racha** de días confirmados comprando debajo del techo, y
2. que el costo de la ventana entera esté debajo del **75% del techo** (`CON_AIRE`, el mismo número
   que usa la zona, importado y ⛔ no copiado). Subir algo que compra al 98% del techo es comprarse
   el problema: el escalón casi siempre encarece antes de asentarse.

🔴 **Los tres estados de un día no son dos.** `OK` confirma y suma; `ALTO` corta; **`MIDIENDO` —gastó
menos que un cliente y todavía no compró— ni suma ni corta**. Si sumara, una celda que gotea $500 por
día y no vende nunca acumularía siete días de «racha» y terminaría con una propuesta de SUBIRLE
plata. Es el defecto que este archivo tendría escrito de otra forma si no se hubiera probado.

🔑 **Y el guardarraíl de los escalones hereda el cambio por compartir `hayRacha()`**, que es
exactamente para lo que esa función existe: si `decidirEscalon()` cortara por ROAS mientras el Panel
propone por costo, la marca con ficha vería la propuesta de subir y el motor la saltearía pidiendo un
número que nadie eligió — el Panel ofreciendo y el motor frenando por una condición que no se ve.

### Verificado

- **10 mutantes, 10 muertos** sobre la lógica nueva (la tolerancia en 1×, el corte de 0 compras, el
  piso de gasto, el `MIDIENDO` que suma, el `MIDIENDO` que corta, el aire, el techo en cero, la vara
  alternativa que pide las dos).
- 🎯 **Contra la pauta REAL, con el calibrador** (⛔ no con un fixture): el 26-ago, sobre 7 días,
  `costo-alto` da **9 saltos sobre 3 objetos** en BDI y **0 en Zattia**, y el primero de la lista es
  `GIRLHOOD FRIO - INTERESES 1 - 7/8` a **$12.576 = 189% del techo** sobre 5 días — **el mismo número
  que se midió a mano el 25-ago por otro camino** ($50.301/4 = $12.575).
- Stunned, que no tiene ficha, queda apagada diciendo *«Faltan definir «CPA máximo», que sale de la
  ficha de rentabilidad de la marca, y «Gasto mínimo para juzgar»»*.

### 🆕🔴 El piso derivado de UNA SOLA COMPRA: la regla figuraba prendida y no podía saltar

Encontrado el 26-ago-2026 calibrando marca por marca **antes** de prender nada.

`gasto_minimo` —el piso de gasto que hace falta para que un resultado signifique algo— se **deriva**
del CPA real de la línea: `gasto ÷ compras` sobre los 90 días. Es el único umbral que se autocompleta
y está bien que lo haga: gastar lo que sale un cliente y no traer ninguno es un hecho, no una opinión.

🔴 **Pero con UNA compra, «el CPA» de una línea es TODO SU GASTO.** Stunned llevaba 1 compra en 90
días y $330.528 gastados ⇒ el piso derivado era **$330.528**: el freno de emergencia pedía quemar la
cuenta entera sin vender para abrir la boca. Con un piso puesto a mano encuentra **2 avisos y 4
saltos en la última semana** (`AD002 - BAJAMOS LOS PRECIOS VIDEO LOCAL`, `AD001 - BAJAMOS LOS PRECIOS
30% - BROAD`).

🔑 **Y el modo de fallar es el peor que hay: CALLADO.** Una regla a la que le falta un umbral se
apaga **diciendo qué le falta**. Ésta no: el umbral existía, así que la regla figuraba **prendida** y
contestaba «0 hallazgos» — que se lee «acá está todo bien» sobre la marca que más plata quema. Peor
todavía, **fue la primera compra la que la rompió**: con 0 compras el piso daba `null` y la regla se
apagaba con el motivo escrito, que era lo correcto. Una sola venta la pasó de *honestamente apagada*
a *muda*.

⇒ `COMPRAS_MINIMAS_CPA = 5`. Debajo de eso el CPA no significa y `derivarUmbrales()` devuelve `null`,
o sea que la regla vuelve a apagarse **diciéndolo**, y el piso pasa a ser una decisión de dial en vez
de una división. **Cinco y no dos**: una compra de más o de menos mueve el piso `1/n`, y recién en 5
esa sacudida (20%) baja de la tolerancia con la que corta el propio módulo (`TOLERANCIA_COSTO`, 50%).
⛔ No toca a BDI ni a Zattia, que llevan más de 200 compras cada una en la ventana.

🔑 **La lección general, y no es sobre este umbral**: *un guard que mira si el número EXISTE no
protege de un número que no SIGNIFICA*. La categoría `derivable: true` de la tabla de arriba tiene
que declarar también **con cuántas observaciones** vale la derivación — igual que `sumarDias()`
devuelve `null` y ⛔ nunca 0 cuando no hubo una fila que lo midiera.

**4 mutantes, 4 muertos** (volver a `compras > 0`, bajar el piso a 2, subirlo a 6, cambiar `>=` por `>`).

### 🆕🔴 La fatiga miraba UNA semana, y en una semana el desgaste no se ve

Encontrado el 26-ago-2026 **corriendo el simulacro con las reglas ya prendidas** (`node
scripts/evaluar-reglas-meta.mjs --simulacro`), ⛔ no con un test: el primer renglón que la regla
produjo decía textual *«La misma gente lo vio hasta 1,4 veces en un día y el CTR cayó de 3,9% a 3,8%.
**Está quemado**»* — un 2% de caída sosteniendo un veredicto.

El detector confirmaba con `despues < antes`, o sea **la dirección sin la magnitud**. Medido sobre la
cuenta entera con `scripts/medir-ctr-fatiga.mjs`:

| ventana | mayor caída de la cuenta | `AD02 - GIRLHOOD COLLECTION` | avisos que caen >20% |
|---|---|---|---|
| **7 días** | −14% | **−2%** (3,90 → 3,83) | **0** |
| **21 días** | −58% | **−31%** (5,87 → 4,05) | 7 |

🔴 🔑 **La ventana de 7 días no puede ver lo que la regla dice medir.** El desgaste tarda semanas, así
que comparar la primera mitad de una semana contra la segunda compara **dos mitades ya gastadas**. A
7 días la pieza que este repo tiene identificada como el desgaste que traba todo se movía **menos que
el ruido** —había avisos SUBIENDO 2% y 4% esa misma semana— y aun así se llevaba el cartel.

⇒ `VENTANA_FATIGA = 21` (propia, como `VENTANA_COSTO = 5`) y `CAIDA_CTR_MINIMA = 0,20`. El 20% no es
por gusto: a 21 días deja 7 avisos en la cuenta, y **cruzado con el dial de frecuencia deja uno solo**
—el que hay que mirar—; a 10% entrarían 12 y vuelve a ser una lista que nadie abre.

🔑 **Y la frecuencia sigue siendo de la ÚLTIMA SEMANA aunque la ventana sea de tres**: el desgaste es
una **tendencia** y la sobreexposición es un **estado**. Un pico de hace tres semanas no dice que hoy
se le esté repitiendo a nadie. Es la misma distinción que ya tomó la zona de Rendimiento —las
métricas son de la ventana, la configuración es de hoy—, aplicada a dos métricas en vez de a una.

🔑 **`compararCtr()` MIDE y ⛔ no decide**: devuelve `caida` (relativa, negativa si subió) y el corte
lo aplica el detector. Medio punto de CTR es el 10% de un aviso al 5% y el 25% de uno al 2%: lo único
comparable entre avisos es lo relativo.

**Verificado contra prod, por otro camino que el arreglo**: el simulacro pasó de decir «cayó de 3,9%
a 3,8%» a decir **«el CTR cayó 31%, de 5,9% a 4,1%, en 20 días»**, que es exactamente lo que había
medido el script aparte. Y **se cayó un falso positivo de Zattia**: `AD 1 - SWEATERS & FITS SEMANA`
(frecuencia 1,71 sobre un dial de 1,6) tenía el CTR **SUBIENDO 10%**. **5 mutantes, 5 muertos.**

⚠️ **Zattia corta contra un techo que hoy no aplica**: su ficha está cargada a precio de LISTA
($32.416) y la tienda está en liquidación. La regla hereda la ficha —que es como tiene que ser— así
que **arreglar la ficha arregla la regla**, y hasta entonces `costo-alto` en Zattia va a gritar de
menos, ⛔ no de más.

▶️ **Lo que sigue faltando del motor**, y por qué no entró en esta tanda:
- **las tres puertas del test** (`$10.000 en un día · 0 muere · 1 sigue · 2+ aprobado`): necesita
  poder **marcar una celda como test**, que hoy no existe en ninguna tabla. ⚠️ Y la lista de cortes
  de más abajo tiene los números viejos (2 días, 0-1/2-3/4+): los buenos son los del 23-ago.
- **el CPM del núcleo +15%**: es un tripwire **de la línea**, y todos los detectores son por objeto.
  Meterlo con esta forma sería un hallazgo por celda diciendo lo que la zona ya muestra al lado de
  cada una.
- **pedidos de Tienda Nube contra la meta de Norte**: cruza fuera de la foto, y las reglas reciben
  filas de `meta_ads_snapshot_dia` y nada más. Es lo que las hace correr sin token y sin cupo.

## 🆕🏁 26-ago-2026: LA ZONA DE RENDIMIENTO, y el menú de once entradas a cuatro

Pedido de Bruno, textual: *«tengo cambios estructurales tanto en función como en disposición, pq esa
sección no se usa de análisis. Pensar en una zona de rendimientos, donde se pueda tener toda la
información importante al alcance de la mano»*. `/meta-ads` deja de ser el Panel y pasa a ser la
zona; el menú queda en **Rendimiento · Producir · Analizar · Configurar**, y las once rutas viejas
siguen andando como alias (bookmarks y `<Link>` del propio repo).

🔑 **La decisión que ordena todo lo demás: la zona sale de la FOTO, ⛔ no de Graph.** Esto resuelve
la tensión que este mismo documento tenía declarada contra el pendiente P3 del `PENDIENTES.md` —la
ficha defendía que el parte fuera un botón *«son cinco llamadas a Graph y el cupo es un porcentaje»*
y P3 pedía que el parte fuera la pantalla—. Las dos tenían razón: **la pantalla no es el parte, es la
foto** (se pide sola al entrar, es barata, tiene 90 días y contesta con el token vencido) y **el
parte trae el día EN CURSO**, que es lo único que sólo existe en Graph.
⚠️ **Corregido el 26-ago (7ª tanda)**: el parte tampoco es ya un botón — se pide solo y se dibuja
como banda arriba de la zona. El motivo por el que no podía —el cupo— se midió y era 1-3%. Ver «El
parte del día».

## 🆕🏁 26-ago-2026 (7ª tanda): LOS AVISOS ADENTRO DE LA CELDA

Bruno: *«tampoco sé qué creativo está dentro»*, con tres usos: identificar cuál es cuál, mirar la
pieza **antes de pausarla o escalarla**, y ver **qué se está gastando la guita**.

- 🔴 **El docblock de `TablaCeldas` prometía textual «abriendo la fila están sus avisos» y el detalle
  mostraba el embudo y el día a día, ni un aviso.** Se arregló **haciendo cierto el comentario, ⛔ no
  borrándolo**. 🔑 Un comentario que promete lo que la pantalla no hace es la misma familia que el
  cartel clavado de `silencioDeReglas`: se le deja de creer al archivo entero.
- 🔑 **Los avisos no cuestan una sola llamada.** La foto guarda los CUATRO niveles y
  `_meta-rendimiento.js` la lee sin filtrar por nivel: las filas de `aviso` con su `adset_id` ya
  estaban en memoria y hasta hoy sólo las miraba `concentracionDe()`. `avisosPorCelda()` las cuelga
  de su caja.
- 🔴 🔑 **Y todo el cuidado de esa función es UNO: se parte por `adset_id` ANTES de agrupar.**
  `agruparAvisos()` agrupa por `objeto_id` a secas —le alcanza, porque la Biblioteca es de la cuenta
  entera—, así que un mismo aviso en tres cajas colapsaría en una fila con la suma de las tres. **Y
  el caso no es hipotético: `AD02 - GIRLHOOD COLLECTION` corre en tres conjuntos y es el 52% del
  gasto de BDI.** Sin partir primero, cada caja mostraría los números de las otras dos: **miente con
  cara de dato**. Es el mutante que hay que ver caer.
- ⛔ **El aviso NO trae `estado`, y el TIPO lo sostiene**: `AvisoDeCelda` es
  `Omit<AvisoBiblioteca, 'estado' | 'configurado' | 'pieza' | 'favorito'>`. La configuración se
  escribe sólo en la fila del día en que se sacó la foto ⇒ en una ventana vieja diría «pausado» para
  todo. El estado que se muestra es el VIVO, el que llega con la pieza.
- **Las caras**: `GET ?recurso=piezas&cuenta=<id>`, exportado desde `api/_meta-biblioteca.js` (⛔ sin
  archivo nuevo en `api/`: no gasta una de las 12 funciones). Son **2 llamadas por CUENTA** más una
  de rescate, contra 3-4 **por campaña** de `?recurso=creativos` — que además **no devuelve
  `adset_id`**, que es justo la llave para colgarlas de cada caja. 🔑 **Se piden al ABRIR la primera
  fila, ⛔ no al montar**: así sigue siendo cierto que mirar la tabla no gasta un peso de cupo, y
  abrir cinco filas cuesta lo mismo que abrir una.
- 🔴 **El TTL de las caras es corto (10 min) por una razón que no es de rendimiento**: las URLs de
  `scontent`/`fbcdn` vienen firmadas y **caducan**. Una guardada de ayer ⛔ no es una foto vieja, es
  una imagen rota. Por eso tampoco van a `sessionStorage`.
- **El corte por línea se hace contra `leerAsignaciones()`**, ⛔ no contra lo que mande el cliente:
  la cuenta publicitaria es UNA para las tres marcas y Graph no sabe de líneas.
- ⚠️ **El video sigue sin reproducirse**: va el póster con la chapita `▶ video` y un link a la
  publicación. El iframe de `/previews` lleva el access token del system user adentro del `src`.

### 🔴 Tres cosas que aparecieron al construirla y no estaban escritas en ningún lado

1. **`cpa_maximo` era un umbral que NO CONSUME NINGÚN PRESET.** Está en `UMBRALES`
   (`reglas.core.js:66`), tiene columna en `meta_ads_umbral` y tiene su dial en la pantalla
   (`Automatizaciones.tsx:315`) — y ninguno de los seis lo lee. **Se podía mover el dial y no pasaba
   nada**, justo con el corte que manda. ⇒ **corrige lo que dice más abajo este documento** («prender
   el motor no es código, es mover el dial»): prender los seis presets que existen, sí; cargar los
   seis cortes que se usan a mano, no — cuatro de ellos **no tienen preset** (CPA contra el techo,
   las tres puertas del test, el CPM del núcleo, y pedidos de TN contra Norte).
   ✅ **Cerrado ese mismo día, en la 2ª tanda (arriba)**: `cpa_maximo` ahora sale de la ficha de
   rentabilidad y lo consumen dos presets. De los cuatro cortes sin preset quedan **dos**, y los dos
   por un motivo de FORMA que está escrito arriba, ⛔ no por falta de tiempo.
2. **`sumarDias()` no sumaba el embudo.** `carritos`/`checkouts`/`lpv` existen en la tabla desde el
   23-ago y la función que suma días las tiraba, así que cualquier ventana perdía el embudo en
   silencio. Se sumaron **con contador propio**: si ninguna fila de la ventana lo medía vuelve
   `null` y ⛔ nunca `0` —esas filas no pueden afirmar «no hubo ni un carrito»— y `diasConEmbudo`
   dice sobre cuántos días se sumó cada paso.
3. 🔴 **La concentración por pieza medida por NOMBRE se queda 20 puntos corta.** La foto no guarda
   el `creative_id`, así que `concentracionDe()` agrupa por nombre de aviso: sobre la semana 18→24
   da **«AD02 - GIRLHOOD COLLECTION - ADV+ -18/8» = 32% en 1 caja**, y lo real —el mismo video en
   tres cajas con tres nombres— es **52% en 3**. ⇒ **es un PISO de la concentración, nunca un techo**,
   y la pantalla lo dice. ▶️ El arreglo es sumarle `creative{id}` a la lectura de configuración de
   `snapshot-meta.mjs` y una columna; es **hacia adelante** (el backfill no lo tiene), igual que el
   historial de estado.

### 🔑 El último día CERRADO se deriva del dato, ⛔ no de un `new Date()`

El corte de las ~20:00 escribe la fila de HOY con medio día de gasto, y `DIAS_RELECTURA` la reescribe
cuatro días seguidos ⇒ **la foto puede tener el día en curso a medias**, y leído como entero muestra
la mitad del gasto contra la mitad de las compras: el costo sale plausible y lo que sale mal es todo
lo que compara ventanas. Los días los corta Meta en la zona de la CUENTA y esto corre en UTC —
calcular «ayer» del lado del servidor ya falló dos veces acá. La definición que sí se lee de la
tabla: **un día cerró si alguna de sus filas fue capturada un día posterior**. Conservador a
propósito: si el cron no corrió hoy devuelve anteayer, y un día de menos se ve.

### 🔴 El techo se muestra CONTRASTADO contra el ticket real, y es una cicatriz

El 25-ago el `parte` imprimía «Techos por compra: zattia 6046» con cara de certeza y esa fila estaba
cargada a precio de **lista** con la tienda en liquidación. Se le creyó toda una tarde. 🔑 **Una regla
no protege de una ficha mal cargada**, así que la cabecera compara el ticket de la ficha contra
`revenue/compras` de la misma ventana y grita arriba del 15%. Medido el 26-ago: **zattia −36%**
(ficha $48.196 · real $30.854) y **bdi +22%** (ficha $23.246 · real $28.327, o sea que el techo real
es MÁS alto que el que muestra). ⚠️ Y el error ⛔ no es proporcional: el costo de la mercadería no
baja con el precio, así que cada punto de descuento se lleva casi tres de techo.

### 🔴 Las MÉTRICAS son de la ventana; la CONFIGURACIÓN es de HOY

Defecto encontrado **ejerciendo el endpoint ya deployado contra prod**, ⛔ no por un test.
`TEST UNBOXING x SIMILAR` se había pausado el 25, la ventana cerraba el 24, y la celda salía
`ACTIVE` con el botón «Pausar» y el veredicto «apagala» encima de **algo que ya estaba apagado**.
La causa está escrita más arriba en esta misma ficha y no la vi: *la foto se arma desde los
`insights` y la configuración se escribe **sólo en la fila del día en que se sacó*** ⇒ el último día
de la VENTANA la tiene congelada al día que la ventana termina.

⇒ `configDeHoy()` toma estado, nombre y diario de la fila **más nueva de toda la foto**, ⛔ no de la
ventana ni de la serie larga —las dos están cortadas en el cierre, y ése fue mi primer arreglo, que
el test tumbó—. Y `veredictoDeCelda()` estrena la clase **`apagada`**, que va PRIMERO y ⛔ no propone
nada: cuenta qué hacía mientras entregaba, que es lo que sirve para saber si la pausa fue buena.

🔑 **Proponer una acción ya hecha es el ruido que hace que se le deje de creer a la pantalla** — y
peor: el que la creyera la volvería a apretar. Medido en la semana 18→24, el arreglo saca **5 celdas
de las 6 que la zona proponía apagar**: ya estaban apagadas.

### Cómo se verificó, y por qué así

⛔ Los tests no alcanzan y en esta sección está probado: cuatro de los defectos más caros pasaron las
cuatro del CI. **El oráculo fue correr el núcleo sobre los datos REALES y cotejarlo contra números
medidos el 25-ago por otro camino** (consultas sueltas y `psql`, sin abrir el monitor):
`scripts/medir-rendimiento-celdas.mjs --linea bdi --dias 5 --hasta 2026-08-24` da **GIRLHOOD FRIO
$50.304 / 4 compras = $12.576 = 189% del techo** contra los $50.301 / $12.575 anotados a mano, y con
el mismo diagnóstico (CTR −16% con el CPM clavado ⇒ la pieza). `COPY B $21.734 / 3 = $7.245` y
`TEST 3 LOOKS $10.487 / 3 = $3.496` coinciden exactos. ⚠️ Los pedidos de TN de la semana dan **96 y
no 98**: es la misma regla que usa el parte (`channel = 'Tienda Nube'`, ⛔ sin filtro de estado), así
que la diferencia es del dato y no de la cuenta. **31 mutantes, 31 muertos** entre el núcleo y el
despacho; el que había que ver caer es **la firma del desgaste dada vuelta** — si sobrevive, la
pantalla dice «está caro Meta» justo donde el problema es el creativo.

⚠️ **Con `linea=zattia` desde local, `pedidos de la tienda: permission denied for table ventas`**: la
`ZATTIA_SUPABASE_KEY` del `.env` no tiene permiso sobre `ventas` (ya conocido). El handler prefiere
`ZATTIA_SUPABASE_SERVICE_KEY`, así que en Vercel puede andar — y si no, **la zona igual se dibuja con
el motivo en `problemas[]`**: media zona con el motivo al lado sirve, una pantalla en blanco porque
la tienda no contestó, no.

🔴 ▶️ **La pantalla NO se caminó**: el login pide contraseña. Lo verificado es el servidor entero
—permisos, ventana, techo, pedidos, meta de Norte y los tres 400— con un `res` de mentira contra la
base real.

## 🆕🏁 26-ago-2026 (4ª tanda): LA PRIMERA CORRIDA REAL, y el cartel que afirmaba lo que no había mirado

🏁 **`meta_ads_hallazgo` pasó de 0 a 4. Es la primera vez que el motor escribe una fila.** Se corrió
el reloj de verdad —`gh workflow run meta-reglas.yml`, no `--simulacro`— y quedó verificado leyendo
prod por la puerta del API (`recurso=hallazgos&estado=nuevo`): los cuatro renglones existen con su
motivo redactado y su `sugerencia` armada, y **las 11 reglas quedaron con `ultima_corrida`** (antes
las 11 en `null`).

| # | línea | preset | objeto | qué dice |
|---|---|---|---|---|
| 1 | bdi | `costo-alto` | `GIRLHOOD FRIO - INTERESES 1 - 7/8` | compra a $10.426 contra un techo de $6.668 —**156%**— en 5 días ⇒ propone **pausar** |
| 2 | bdi | `atribucion-tardia` | `AD01 - UNBOXING LOCAL - 19/8` | pausado hace 2 días y **igual registró 2 compras por $49.948** |
| 3 | bdi | `fatiga` | `AD02 - GIRLHOOD COLLECTION` | frecuencia 1,4 sobre un dial de 1,3 y **el CTR cayó 31%, de 5,9% a 4,1%, en 20 días** |
| 4 | zattia | `atribucion-tardia` | `SWEATERS - REEL COLORES - 07/05 - Copia` | pausado hace 1 día y registró 1 compra por $84.478 |

🔑 **Correrlo un día antes no adelanta nada ni duplica nada**: el `unique(regla_id, fecha, objeto_id)`
con `ignoreDuplicates` hace que el cron de mañana a las 07:50 sea idempotente sobre el mismo día, y
para el día siguiente los renglones son otros por fecha. Lo que sí cambia es que **el motor dejó de
ser una promesa**: hasta hoy nada había ejercido el camino de escritura, y en este módulo es la
cuarta vez que lo que la suite no ve lo encuentra ejercer.

### 🔴 El cartel del bloque vacío AFIRMABA algo que nunca había preguntado

`ZonaRendimiento` dibujaba el bloque «Qué hay que decidir» vacío **y con el motivo clavado en el
texto**: *«no significa "está todo bien" — significa que **no hay reglas cargadas**»*, con un link a
cargarlas. Era cierto la mañana en que se escribió y **dejó de serlo esa misma tarde**, cuando
`meta_ads_regla` pasó a 11 filas: la pantalla siguió mandando a prender reglas a alguien que acababa
de prender once.

🔑 **Y el defecto no es el número desactualizado: es la forma.** Un cartel que explica un silencio
tiene que **medir** ese silencio, porque el que va adonde lo manda y no encuentra qué tocar es el que
deja de creerle a la sección. Es la misma familia que «una pantalla que no pregunta igual afirma».

⇒ `silencioDeReglas(reglas, ahora)` en `reglas.core.js` —con `ahora` como parámetro obligatorio, ⛔
sin `Date.now()` adentro, para que el texto se pueda probar— separa **las tres causas del silencio, y
sólo una es buena noticia**:

| clase | qué pasó | qué dice |
|---|---|---|
| `sin-reglas` | ninguna prendida | el silencio no dice nada de la pauta ⇒ **el link a prenderlas aparece SÓLO acá** |
| `nunca-corrio` | prendidas y el reloj todavía no pasó | tampoco dice nada — es el estado exacto del día en que se prenden: se cargan a la tarde y el cron es a las 07:50 |
| `todo-bien` | corrieron y no encontraron nada | **el único caso en que «vacío» significa que está todo bien**, y lleva la fecha |
| `no-se-sabe` | todavía no se leyeron las reglas | ⛔ no se afirma nada |

🔴 🔑 **Y en `todo-bien` se miran las DOS puntas, no la más reciente.** Con sólo el máximo, diez
reglas que corrieron esta mañana tapan a la que quedó atrás hace cinco días y el cartel diría
«corrieron hace 1 hora» sobre una que no corrió. Cuando las dos puntas no coinciden lo dice: *«la más
reciente hace 1 hora, la más atrasada hace 5 días»*. Es la misma trampa que `updated_at` para medir
una espera: **el número existe y no significa**. Las que nunca corrieron no se promedian con nada —
se cuentan aparte, en la cola de la frase.

**9 mutantes, 9 muertos** (los que había que ver caer: el que confunde `activa` con apagada, el que
lee una fecha basura como corrida, y los dos de las puntas).

## 🆕🏁 26-ago-2026 (5ª tanda): LOS HALLAZGOS SALEN A BUSCAR A BRUNO

🔴 **El agujero está medido, ⛔ no supuesto.** El motor escribió sus primeros cuatro hallazgos a las
07:50 —uno de ellos un conjunto comprando al **156% del techo**— y a media tarde los cuatro seguían
en `nuevo`: **nadie abrió la sección en todo el día**. Es el P4 del `PENDIENTES.md` y la conclusión
del punto 4 de ese archivo: con un solo operador, **lo que no le llega no existe**.

⇒ Los hallazgos entran como **el noveno aviso derivado** (`avisosDeHallazgo` en
`lib/notificaciones/derivar.ts`), o sea al badge del sidebar y al bloque de Inicio.

🔑 **Y esto ⛔ NO contradice el «no hay pantalla nueva de alertas» de más arriba: lo cumple.** Ese
párrafo dice que un *segundo lugar al que hay que acordarse de entrar* es uno al que no se entra.
Esto no es un lugar nuevo: es el contador que ya está arriba en **todas** las pantallas del monitor.
El hallazgo se sigue viendo y accionando en un solo lado —`/meta-ads`—, y lo único que cambia es que
**deja de hacer falta acordarse**. La ruta del aviso lleva la línea puesta (`/meta-ads?linea=bdi`),
que `ContextoMeta` lee al montar: sin eso el renglón queda a dos filtros de distancia.

- **Uno por hallazgo, ⛔ no agrupados** (como los reclamos y las firmas de canjes, y a diferencia de
  los entregables vencidos): cada renglón es una plata distinta sobre un objeto distinto, y
  «4 cosas para decidir» escondería que una de las cuatro está al 156% del techo. Son ~4 por mañana.
- **El tono sale de lo que PROPONE, ⛔ no del preset**: pausar es `danger` —hay plata quemándose
  ahora—, reactivar y subir presupuesto son `brand` —plata que se deja de ganar—, y sin sugerencia
  es `warning`, que es el que más fácil se queda quieto porque nadie sabe qué apretar.
- **El permiso lo contesta `lineasQueVe(perfil)`**, la MISMA función con la que el servidor devuelve
  403 — ⛔ no una copia. Por eso se pregunta por LÍNEA y no por marca: `stunned` no es una `Marca`.
- **Sale de la base**: `recurso=hallazgos` está arriba del guard del token, así que el aviso llega
  igual el día que el token se venza — que es el día en que más importa saber qué quedó sin decidir.

### 🔴🔑 Y al construirlo se cayó un número que existía y no significaba (el tercero de la familia)

`veces` decía **«cuántos días seguidos lleva»** y contaba **filas**. Un conjunto que cruzó el techo
el lunes, aflojó el martes y volvió a cruzarlo el miércoles tenía dos renglones en `nuevo` y la
pantalla afirmaba una racha de dos días **que no existió**. Es la misma familia que el piso derivado
de una sola compra y que la ventana de fatiga más corta que el fenómeno: un número que se puede
imprimir y no quiere decir lo que dice.

Y de la misma cuenta sale lo que este aviso necesitaba: **`desde`, cuándo EMPEZÓ**. Con la fecha del
último renglón —que es la de hoy, todas las mañanas— el aviso se leería «apareció hoy» para siempre:
el «NUEVO» del badge no se apagaría nunca y el «trabado hace N días» de Inicio no saldría jamás. Es
la trampa de `updated_at` para medir una espera, la segunda vez en este módulo en dos días.

⇒ `agruparHallazgos()` bajó de `api/_meta-reglas.js` —donde eran doce líneas sin test— a
`reglas.core.js`: camina hacia atrás desde el día más reciente y **corta en el primer hueco**.
⚠️ El precio: **una mañana sin cron parte la racha** y el hallazgo se lee más joven de lo que es. Es
la dirección barata del error —subestimar hace que el aviso grite de menos, ⛔ nunca que grite por
algo que no pasó— y se ve en `ultima_corrida` de la regla.

### Cómo se verificó

- **Ejercido contra las filas REALES de prod**, ⛔ no un fixture: se leyó `meta_ads_hallazgo` con la
  service key y se le pasaron las 4 filas a `agruparHallazgos`, y la respuesta del endpoint de prod
  a `avisosDeHallazgo`. Salen los 4 avisos con su frase y su tono: `GIRLHOOD FRIO` en `danger`, los
  dos de atribución tardía en `brand`, `AD02 - GIRLHOOD COLLECTION` en `warning`.
- ⚠️ **Lo que ese ejercicio NO pudo probar es justamente la racha**: el motor corrió una sola vez, así
  que las 4 filas son del mismo día y las 4 dan `veces=1`. El primer caso real de `veces>1` lo trae
  la corrida de mañana, y es lo que hay que mirar.
- **16 mutantes, 16 muertos** (6 del agrupado, 10 del derivador). Los que había que ver caer: el que
  borra el corte por hueco, el que pone `fecha` en vez de `desde` en el `ts`, el que le mete la fecha
  al `id` —que prendería el badge de nuevo cada mañana por el mismo problema— y el que usa
  `Date.parse(iso)`, medianoche UTC, que corre el día uno en Argentina.
- 🏁 **El deploy quedó verificado ejerciendo prod, ⛔ no leyendo un `success` de GitHub**: el endpoint
  de producción ya devuelve `desde` en los 4 hallazgos. Es el oráculo que importa en este repo,
  donde un push a main puede no llegar a Vercel **callado**.
- ⚠️ **La pantalla sigue sin caminarse**: el login pide contraseña. Falta que Bruno abra el monitor y
  vea el badge — que es, otra vez, la única mano que queda.
- ⚠️ **El CI de main sigue en ROJO por `recepciones`** (`e454c26`, la otra sesión), ⛔ no por esto: las
  cuatro del CI se corrieron a mano acá y las cuatro pasan. Y al pushear, Actions estaba con la cola
  trabada —dos corridas encoladas hacía 20 minutos—, así que la corrida de este commit ni arrancó.

## 🆕🏁 26-ago-2026 (6ª tanda): EL MAIL DE LA MAÑANA — la otra mitad de P4

El badge arregla la mitad del agujero: **sólo se ve si se abre el monitor**. Ahora el reloj de las
07:50, después de escribir los hallazgos, manda un mail.

### 🔑 LA DECISIÓN QUE ORDENA EL MAIL ENTERO: van los ABIERTOS, ⛔ no los de hoy

Lo natural sería mandar lo que la corrida acaba de escribir. **Sería el mismo agujero con otra
forma:** un hallazgo del lunes que nadie accionó desaparecería del mail del martes — y el que más
importa es justamente el que lleva días sin que nadie lo toque. El mail lista **todo lo que está en
`nuevo`** y dice de cada uno **hace cuánto** (de `desde`, la racha de la 5ª tanda). ⇒ **La lista se
vacía accionando, ⛔ no dejando pasar un día.**

✅ Y eso quedó **verificado ejerciendo, no razonando**: la segunda corrida del mismo día imprimió
`0 hallazgos nuevos` y a la vez `Había para mandar: «Pauta · 4 cosas para decidir, 1 quemando
plata»`. Con la otra decisión, esa corrida habría mandado un mail vacío.

### 🔑 Con cero hallazgos ⛔ NO se manda nada

Un mail diario que dice «no hay nada» enseña a no abrirlo, y el día que traiga algo llega a una
bandeja donde ese remitente ya se saltea. El silencio del mail significa «no hay nada que decidir»
**porque es la única razón por la que no llega**; el que quiera confirmarlo tiene el cartel de la
pantalla, que sí separa las tres causas (`silencioDeReglas`).

### El asunto se lee en la pantalla bloqueada

`Pauta · 4 cosas para decidir, 1 quemando plata`. Las dos cosas que deciden si se abre ahora o
después: **cuántas** y **si alguna está costando plata mientras se la mira**. El cuerpo va ordenado
igual: primero lo que quema, después lo que no propone nada —que es lo que más fácil se queda
quieto, porque nadie sabe qué apretar— y último la oportunidad; a igual gravedad, **el más viejo
arriba**.

🔑 **La gravedad bajó a `reglas.core.js` (`gravedadDeHallazgo`) porque ahora la leen DOS**: el badge
del sidebar, que la convierte en su `Tone`, y el mail, que ordena y arma el asunto. Copiada, el día
que se agregue una acción nueva se entera una sola — es el bug del mismo número con dos
implementaciones.

### 🔴 El proveedor: SES, porque la empresa YA lo usa

⛔ **La primera versión de esto daba de alta Resend, y estaba mal.** Lo corrigió Bruno: *«uso ses,
fijate que mailer usa ses»*. `areben-mailer` manda por **SESv2 en `us-east-1`** con
`bdiaccesorios.com.ar` y `zattia.com.ar` **verificados como DOMINIO**, DKIM andando, cuenta fuera del
sandbox y **50.000 mails por día de cuota** (229 usados el 26-ago) ⇒ un mail diario no se nota.
🔑 **No hacía falta ni una cuenta, ni un servicio, ni verificar un dominio.** La lección no es sobre
mail: **antes de proponer algo que pida un acceso o una cuenta, mirar qué ya está andando** — acá la
respuesta estaba a un repo de distancia.

- **Se firma a mano con SigV4** (`scripts/lib/ses.mjs`, 40 líneas con el `crypto` de Node) y ⛔ no con
  `@aws-sdk/client-sesv2`: son ~10 MB que `npm ci` bajaría en **cada corrida de cada cron** de este
  repo para usar un endpoint.
- 🔴 **Sin `ConfigurationSetName`, y es a propósito.** El del mailer (`areben-mailer`) alimenta sus
  eventos de SNS y sus métricas de entregabilidad; un mail interno de una sola persona metido ahí
  adentro **le ensucia los números al producto** con un destinatario que no es un cliente.
- 🔴 **Sale de `monitor@bdiaccesorios.com.ar` y ⛔ NO de `@arebensrl.com`**: de aquél SES tiene
  verificado el DOMINIO —con DKIM, y calentado todos los días por el mailer—, y de éste sólo la
  CASILLA, o sea que saldría sin DKIM propio y con la alineación de DMARC floja. A un buzón de
  Workspace, eso es la carpeta de spam.

### 🔑 Las tres respuestas del envío son distintas, y confundirlas apaga un aviso en silencio

`scripts/lib/mail.mjs`, **sin dependencia nueva**:

| respuesta | qué es | qué hace el reloj |
|---|---|---|
| sin credenciales de AWS | ⛔ **no está configurado**, ⛔ no está roto | lo dice fuerte en el log y **sale VERDE**: el trabajo del reloj son los hallazgos, el mail es un rider |
| con credenciales y falla | alguien pidió el mail y no llegó | `anotar()` ⇒ **el workflow sale ROJO** |
| mandado | — | imprime el `MessageId` |

Es la misma distinción de `ventana.core.js`: **ausente ⛔ no es lo mismo que roto**, y las dos ramas
se ejercieron de verdad (exit 0 y exit 1).
🔑 **Y este contrato sobrevivió entero al cambio de proveedor**: se escribió para Resend y ⛔ no se
tocó una línea al pasar a SES. Es la señal de que la decisión estaba del lado correcto de la
frontera — lo que cambió fue el transporte, ⛔ no qué significa cada respuesta.

### Cómo se verificó la firma

🔴 **Una firma ⛔ no se revisa leyéndola**: sale bien, o sale un 403 que dice *«signature does not
match»* y **no dice cuál de los diez pasos falló**. Tres oráculos, ninguno solo alcanza:

1. **Un cálculo independiente**, escrito en el test desde la especificación de AWS. Si los dos
   coinciden, o los dos están bien o los dos están mal del mismo modo — por eso no alcanza solo.
2. **El SES real, primero leyendo**: `GET /v2/email/identities` contestó **200** con las cuatro
   identidades. Una lectura ⛔ no manda nada y prueba la firma entera.
3. **Un mail de verdad**, con los 4 hallazgos reales: salió con su `MessageId`.

**8 mutantes, 8 muertos** — ⚠️ y el primer barrido dejó uno **vivo por casualidad**: borrar el
`.sort()` de los headers no cambiaba nada, porque el literal ya estaba en orden alfabético. ⇒ los
headers se declaran **a propósito desordenados**, así el `sort` es el que hace el trabajo y se puede
probar. Es lo que va a importar el día que alguien sume un header, porque lo va a sumar al final.

### Cómo se prende, y qué falta

🏁 **PRENDIDO Y VERIFICADO EN EL WORKFLOW** (26-ago-2026). Bruno cargó los tres secrets
(`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, los mismos del `.env` de
`areben-mailer`) con `!` — ⚠️ **el clasificador de esta Mac corta `gh secret set`**, igual que el
POST que prende una regla.

🔑 **Y la verificación que vale es la del WORKFLOW, ⛔ no la de la Mac.** Que el mail salga desde
acá sólo prueba que la firma anda con un `.env` local; lo que hay que probar es que **los secrets
llegan a la corrida**. Se lanzó `gh workflow run meta-reglas.yml` de verdad y el log dice:
`Mail mandado a brunoarevalo@arebensrl.com: «Pauta · 4 cosas para decidir, 1 quemando plata»` con su
`MessageId`. ⚠️ Y el `--simulacro` **⛔ no sirve para esto**: sale antes de tocar las credenciales, así
que un simulacro en verde ⛔ no dice nada del envío.

▶️ **Lo único que queda es que Bruno confirme que el mail LLEGÓ** —y a la bandeja, ⛔ no a spam—:
`monitor@bdiaccesorios.com.ar` le escribe por primera vez, y eso es lo único que desde acá no se
puede ver.
⚠️ **Lo limpio sería un usuario de IAM con permiso `ses:SendEmail` y nada más**, en vez de reusar la
clave del mailer, que puede hacer bastante más. Es una tarea de consola de AWS y queda anotada: hoy
la alternativa era que el aviso siguiera apagado.
⚠️ Mientras tanto **el reloj sale verde y lo dice en el log en cada corrida**, así que no se olvida
en silencio. `MAIL_HALLAZGOS_A` es opcional: el default es la casilla de Bruno, porque ésta es la
sección de una sola persona (`PENDIENTES.md` § 4) y una tabla de suscriptores sería mantener algo
para un registro.

**15 mutantes, 15 muertos en el mensaje** (+8 en la firma). El que más importaba: el que hace que todo diga «pausalo» — un mail que
manda a apagar un aviso que hay que **reactivar** es el error más caro que este archivo puede
cometer, y el primer barrido lo dejó **vivo**.

## Pendiente

### ▶️ ZATTIA — los cambios de conjuntos que quedaron decididos y SIN HACER (22-ago-2026)

Se deciden en Ads Manager a mano: **la API no cambia creativos ni sube videos**, y apagar un conjunto
sí se puede desde el monitor.

1. 🏁 **HECHO — lo apagó Bruno el 26-ago-2026.** ⚠️ **La foto de hoy es de las 03:30, o sea de ANTES**:
   lo confirma la de mañana, y `atribucion-tardia` va a proponer reactivarlos si alguno sigue
   registrando compras — es dato, ⛔ no una orden. Lo que decía este renglón, para el registro:
   ~~**Apagar los 3 conjuntos de `ZATTIA - TRAFICO - 21/-05` que entregan**~~ — `TEST INTERESES 1
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
- 🏁 **Stunned: lo apagó Bruno el 26-ago-2026.** ⚠️ Igual que Zattia, **la foto de hoy es anterior** y
  lo confirma la de mañana. 🔑 **Y apagarlo ⛔ no contesta la pregunta, la archiva**: gastó $428.421
  en 90 días sin una sola compra atribuida **con los tres píxeles vivos**, así que ⛔ no era «no hay
  píxel». El día que se vuelva a prender, **eso sigue sin saberse** — si es la medición o es la
  pauta— y es lo primero que hay que mirar.
  ⛔ **Corrige lo que decía este renglón** —«su freno de emergencia queda apagado solo»—: no quedaba
  apagado, quedaba **prendido y mudo**. Ver «El piso derivado de una sola compra», más arriba.
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
