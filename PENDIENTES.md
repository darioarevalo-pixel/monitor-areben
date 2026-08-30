# PENDIENTES — legibilidad del monitor

**Lo dijo Bruno el 25-ago-2026, y es el pedido que abre este archivo:**

> «los sectores en monitor no se entienden qué hace ni qué ejecutan, está mal armado, tiene
> funciones pero no las usa nadie»

Este archivo NO es una lista de features. Es el análisis de **por qué una app con 55 secciones
terminadas se usa poco**, y los pendientes que salen de ahí. Lo que se arregle, se borra de acá.

⚠️ Antes de tocar: hay **otra sesión trabajando en este repo**. Rutas explícitas, `git fetch` al
arrancar, `git commit -F msg -- <rutas>`, ⛔ nunca `git add -A`.

---

## 0. La corrida de VOCABULARIO — 28-ago-2026 (pedido de Bruno)

> «no me están gustando los títulos y los términos de los mensajes: lo que falta tendría que ser
> pendiente, sacar tiene que ser eliminar»

📌 **La regla vive en [`VOCABULARIO.md`](./VOCABULARIO.md)** —el MISMO archivo en este repo y en
`areben-marketing`, versión `2026-08-29`— y la clava `tests/vocabulario.test.ts`. ⛔ Antes de escribir
un botón, un título o un cartel de vacío, se lee. El nombre del trabajo, para pedirlo afuera: es
**UX writing**; lo que se pide es un **glosario de producto con vocabulario controlado** más una
**guía de estilo de contenido**, y después la **auditoría de contenido** que los aplica.

### 🏁 Hecho

- **Los rótulos del menú.** 15 nombres en `lib/nav.datos.ts`: `Objetivo de ventas` · `Fotos y
  descripciones` · `Importaciones` · `Conteo de depósito` · `Posventa` · `Fallas del local` ·
  `Fallas de depósito` · `Productos` · `Variantes` · `Clientes` · `Iniciar un reclamo` ·
  `Retornos a depósito` · `Solicitudes de todas las marcas` · `Cola de fotos`.
  🔑 **Las nueve palabras que significaban dos cosas las cerró Bruno**: `Faltantes` se la queda
  Compras · `Importaciones`/`Ingresos` · `Conteo de depósito` · `Solicitudes` queda (es la misma
  pantalla vista desde cuatro lugares) · `Canjes` y `Talles` ⛔ **no se tocan, decisión suya** ·
  Posventa es **una cadena** (local → depósito → el motor), ⛔ no tres nombres de lo mismo.
- 🔴 **Una descripción que MENTÍA.** El `info` de `marketing` en `PERM_CAT` decía «Armado de
  publicaciones para redes y TiendaNube» — esa pantalla no existe: es una auditoría de fichas de TN.
  Y ese texto sale como **tooltip en la matriz de permisos** (`components/usuarios/MatrizPermisos.tsx`),
  así que quien repartía permisos leía la descripción de otra cosa. ⚠️ Había **dos** descripciones por
  sección (`PERM_CAT.info` y `DESCRIPCIONES` de `lib/nav.ts`) y sólo una estaba bien.
- 🔑 **El rename destrabó un eyebrow.** `categoriaDe('marketing')` daba `null` **porque la sección se
  llamaba igual que su grupo**: era el síntoma, no una decisión. Era la única pantalla que no decía
  de qué grupo venía.
- **Familia *eliminar*: 330 textos.** `borrar` → **Eliminar**, `quitar` → **Sacar**, decidiendo cada
  uno con *¿la cosa sigue existiendo después?*.
- **Familia *publicar*: 25 gestos** a `Enviar`. Se terminó el caso de las dos puntas del mismo flujo
  diciéndose distinto («Mandar a sesión de fotos» / «Enviar a Marketing»).
- **`tests/vocabulario.test.ts`**, con el mecanismo de MAKETA (saca comentarios, junta identificadores,
  allowlist de 94 símbolos) más las **34 pantallas destructivas que TIENEN que decir la palabra** —sin
  eso el test se cumple perfecto en una app sin ningún botón—. **Mutado tres veces y murió las tres.**

### 🔴 Lo que ya mordió y no hay que repetir

- **Tres claves de datos se rompieron con la barrida**: `'quitado'` (estado de un ítem de canje),
  `'quitar'` (union de acción de Tienda Nube) y la firma de `lib/tncat/categorias.ts`. ⛔ **Un string
  que es CLAVE no es texto**: la regla es del texto que lee una persona. Lo cazó el `typecheck`, que
  es el oráculo barato para esto.
- ⚠️ **Y una era las dos cosas**: en Sesión de fotos el historial **guarda el verbo y lo dibuja tal
  cual** (`{c.por} {c.accion} {c.detalle}`). Ahí `quitó` → `sacó` es correcto, y **las filas viejas
  siguen diciendo `quitó`**: van a convivir un tiempo. Decidido con el costo delante.
- 🔴 **La regla de `Mandar` estaba MAL ESCRITA y hubo que corregirla.** Prohibía la palabra; medido,
  de **99 apariciones sólo 17 nombraban un gesto**. Las otras son prosa al cliente («Te mandamos la
  etiqueta», que en castellano está bien) y **otro verbo que se escribe igual**: «el corte que manda»,
  «Gestión Nube es quien manda sobre el precio» son *gobernar*. ⇒ la regla ahora dice **sólo como
  nombre del gesto**.

### 🏁 Hecho el 29-ago — las otras cuatro familias

- **Las seis familias, clavadas, y `tests/vocabulario.test.ts` pasó de 3 tests a 12.** Una prueba por
  familia sobre **el nombre del gesto**, más un piso de cuántos rótulos vio el extractor y la lista de
  pantallas que tienen que aportar alguno. 🔑 **Es el MISMO bloque que `areben-marketing`**, byte a
  byte salvo los números medidos.
- 🔴 **Y ese test nació con un PUNTO CIEGO que dejó vivo a un mutante.** La primera versión parseaba
  las etiquetas contando llaves para saltarse el `>` de `onClick={() => x()}`, y llegaba **hasta tres
  niveles**: un `<Button>` con `onClick={async () => { try { … } catch { … } }}` ⛔ no matcheaba, así
  que su rótulo era invisible — y ésos son justo los botones que escriben. Medido: devolver un
  «Sumar» a `components/canjes/BloqueEntregables.tsx` **no puso nada en rojo**.
  ⇒ **el extractor ya no parsea nada**: toma todo el texto JSX y los atributos de texto, y se queda
  con **lo que puede ser un rótulo** (hasta cinco palabras, sin `(`, `:`, `;` ni `=`). 🔑 **El tope de
  palabras es lo que separa el rótulo de la PROSA**, que es la lección de `Mandar` resuelta con una
  medida en vez de una lista de excepciones. Con el cambio aparecieron **cuatro rótulos más** que
  ninguna versión anterior veía.
- **Familia *agregar*: 30 rótulos.** `Anotar`/`Sumar` repartidos con la pregunta de §1.3 — **Crear**
  lo que nace al escribirlo (una idea, una decisión) y **Agregar** lo que ya pasó afuera y acá queda
  registrado (un faltante, un movimiento, un intento de entrega, un pedido de insumos).
- **Familia *guardar*.** ⚠️ Y confirmó lo que este archivo ya avisaba: **«Aplicar ajuste» no era
  guardar**… pero tampoco era aplicar. Relee el stock y **arma un Excel** ⇒ quedó **«Generar el
  ajuste»** (los dos conteos y el instructivo). Lo que sí escribe afuera se queda con `Aplicar` **y
  ahora nombra dónde**: «Aplicar en Tienda Nube», «Aplicar en TN».
- **Familia *publicar*.** `Mandar a Drive` · `Mandar a sesión de fotos` · `Mandar` · `Sin mandar` →
  **Enviar**.
- **Familia *editar*: ⛔ no había ni uno.** `Modificar` y `Retocar` no aparecen en ningún rótulo.
- 🏁 **Se cerró la deuda de `Borrar` y `Quitar` a secas en la allowlist**, que estaba escrita acá como
  debilidad conocida: los dos últimos usos vivos eran **texto** —«Borrar … de esta computadora» y
  «Quitar el elegido», cuyo propio diálogo ya decía «Sacar»— y con ésos arreglados la lista quedó
  **sólo con nombres que ninguna pantalla podría decir**. 🔑 **Lo cazó el test de al lado**, el que
  exige que la lista se vacíe sola.
- **El glosario subió a `2026-08-29c`** y está byte a byte en los dos repos. Entraron dos carve-outs
  medidos, los dos con la misma forma: la palabra se queda **cuando el gesto escribe en OTRO sistema y
  el rótulo nombra cuál** (`Aplicar en …`, `Dar de baja en GN` — es la palabra del sistema de
  destino, y traducirla manda a buscar un botón que allá no existe).

### ▶️ Lo que falta

- 🔴 **`components/crm/CRM.tsx` quedó SIN COMMITEAR a propósito.** El cambio de vocabulario está
  hecho en el archivo (`+ Sumar` → `+ Agregar`), pero **la otra sesión tiene ese archivo a medio
  editar** —le sacó el import de `vistaTemp` y está tocando `components/crm/temperatura.ts`—, así que
  commitearlo publicaría su trabajo por la mitad. 📌 [[feedback_areben_checkout_compartido_no_hay_merge]].
  ▶️ **Entra en el próximo commit que toque CRM**, o se vuelve a aplicar si se pierde.
- 🏁 **Los dos homónimos se cerraron** (29-ago, decisión de Bruno: la palabra se la queda el sentido
  que ya la tenía). `Faltantes` queda en Compras y en **Exhib** pasó a **«Sin escanear»**; en
  Recepciones ya decía «Unidades que faltaron» y ⛔ no hubo nada que tocar. `clavado` queda para el
  **producto sin rotación**, y la cuenta atada a una marca pasó a **«el que tiene una sola marca»**.
  🔑 **Los cuatro homónimos de los dos repos se cerraron SIN bautizar una palabra nueva.**
- 🏁 **La jerga de §3 tiene test** (`corrida` · `copy` · `moodboard`), y salió de los 8 textos que lee
  una persona. 🔑 **El oráculo de que una palabra es jerga es que alguien no la entienda**, y pasó:
  Bruno leyendo el pendiente de MAKETA — *«no sé lo que es corrida de un reloj»*. ⇒ ⛔ no se le busca
  un sinónimo, **se dice qué pasa**: «no hay ninguna corrida exitosa reciente» → **«hace rato que no
  termina bien»**.
- 🏁 **Y de las tres que iban a preguntarse, DOS no eran una decisión: eran un resto.**
  - **`Sembrar`** ya ⛔ no era el nombre de ningún botón —el de la Agenda dice **«Cargar los
    pendientes»**— y sólo sobrevivía en el **mensaje de error**, que decía otra cosa que el botón que
    lo dispara. ⇒ «No se pudieron cargar los pendientes.»
  - **`Bitácora`**, la pestaña de Liquidación, es la MISMA palabra que el menú de MAKETA ya había
    resuelto como **Actividad**.
  🔑 **Antes de mandar a decidir una palabra, mirar si el gesto ya se llama de otra manera en su
  propio botón, o si la otra app ya la resolvió.**
- ⛔ **`padrón` NO entra al test, y ⛔ no es un olvido**: sus 13 apariciones son todas de **Canjes**,
  que Bruno dejó afuera de la corrida. Es una decisión suya **ya tomada**, ⛔ no una pendiente. Está
  escrita en el test como **lista de archivos** —y con un segundo test que exige que la excepción
  siga excusando algo— para que el día que se levante se vea exactamente qué entra.
- 🏁 **La novedad está cargada, y queda de BORRADOR: `n1788020491323_anup1v`.** ▶️ **La publica Bruno
  de un click**, en `/novedades` → «Sin publicar». Le llega a **todos**, y ⛔ **no va como importante**:
  📌 medido, las 17 publicadas están las 17 en importante, así que un cartel bloqueante más no
  distingue nada — y un renombre ⛔ no frena el trabajo de nadie hoy.
- 🔑 **Lo que la disparó no fue la lista de renombres, sino una novedad YA PUBLICADA**: *«Lo que te
  piden y no tenemos: **anotalo** desde Atención»* nombra un botón que hoy dice **«Agregar un
  faltante»**. 📌 Es la regla de la ficha leída al revés, y por eso esa línea es la segunda de la
  novedad: quien siga la vieja va a buscar una palabra que ya no está.
- ⚠️ **`tests/crm-paridad.test.ts` sigue con 13 tests en rojo, y ⛔ no son de esta corrida**: se midió
  guardando los cambios aparte y dieron los mismos 13. Estaban rotos de antes.

---

## 1. La evidencia, medida — no es impresión

Contado contra la base de producción el **25-ago-2026**, módulo de Meta Ads:

| tabla | filas | qué significa |
|---|---|---|
| `meta_ads_regla` | ~~0~~ → **11** | 🏁 **prendidas el 26-ago** (P2). Los diales y el porqué, en el desplegable de P2 |
| `meta_ads_umbral` | **0** | y está bien: de los dos cortes que corren, uno se deriva y el otro sale de la ficha de rentabilidad. Sólo se llena para pisar un derivado o para las marcas sin ventas |
| `meta_ads_hallazgo` | ~~0~~ → **4** | 🏁 **los primeros de la historia, el 26-ago**: se corrió el reloj de verdad (`gh workflow run meta-reglas.yml`) y las 11 reglas quedaron con `ultima_corrida` |
| `meta_ads_favorito` | **0** | el botón de favorito de la Biblioteca no se tocó nunca |
| `meta_ads_informe` | 2 | y los dos **sin publicar** |
| `meta_ads_plan` | 4 | 2 `duplicar` (8-ago) + 1 `piezas` (10-ago) + 1 del 25-ago |
| `meta_ads_accion` | 37 | **todas de UNA persona**, del 6 al 25 de agosto |

🔑 **Lo que esto decía el 25-ago: el módulo se usa para EJECUTAR, nunca para DECIDIR.** Las tres
tablas que convertirían datos en «qué hago hoy» —reglas, umbrales, hallazgos— estaban las tres en
cero. 🏁 **La primera dejó de estarlo el 26.**

✅ **Al 26-ago-2026 la zona de Rendimiento contesta esa pregunta** (P3, abajo). Las tres tablas de
reglas siguen en cero: eso es P2, y resultó ser más que mover un dial.

🔴 **Y la prueba más incómoda:** el 25-ago se hizo una sesión entera de análisis de la pauta
—cruce con pedidos reales, elasticidad, techo re-medido, veredicto por conjunto— y **no se abrió
el monitor ni una vez**. Se contestó con ~20 consultas directas a la base y a la API. *Si la
pantalla contestara la pregunta, se habría abierto.*

## 2. El diagnóstico

### 2.1 🔴 No se entiende qué hace ni qué EJECUTA cada sección

Es el pedido literal de Bruno y es el problema raíz. Hoy, para saber qué hace una sección hay que
**abrir el código**. Concretamente:

- `docs/mapa-secciones.md` dice **dónde vive el código** de cada pantalla. Es una tabla de
  ubicaciones para quien programa.
- `docs/secciones/*.md` son **25 fichas sobre 55 secciones**, y su plantilla dice textual que se
  leen «ANTES de abrir los archivos» y que su trabajo es «decir qué mirar con cuidado».

⇒ **Toda la documentación del monitor está escrita para quien lo CONSTRUYE.** No existe una sola
línea escrita para quien abre la pantalla y no sabe qué va a pasar si aprieta.

Y el caso peor es el de los botones que **escriben afuera**: pausar, presupuesto, duplicar, piezas,
planes. Ahí «no entender qué ejecuta» no es incomodidad, es **miedo justificado**: son botones que
mueven plata en Meta y la pantalla no dice ni qué va a tocar, ni si es reversible, ni quién se
entera.

### 2.2 Está armado para ejecutar, no para decidir

Todo lo que funciona —accionar, planes, la foto, la Biblioteca, el Parte— **presupone que ya sabés
qué querés hacer**. Ninguna pantalla contesta *«¿qué apago, qué escalo, qué testeo hoy?»*.

El «Parte del día» es lo más cerca que hay, **y es un botón que copia texto para pegar en otro
lado**: la herramienta admite que la decisión se toma afuera.

### 2.3 Todo es *pull*

Hay que acordarse de entrar y de mirar. Un conjunto que compra al doble del techo tres días
seguidos, el catálogo de Meta parado, un sync en rojo: nada de eso sale a buscar a nadie.

### 2.4 Las pantallas hablan en el idioma del sistema, no del negocio

`conjunto`, `objeto_id`, `estado_real`, «efectivo vs configurado», `OPT_IN`. Quien decide piensa en
«esta pieza compra caro» y «este público está agotado».

### 2.5 Hubo un motivo real para desconfiar de los números

El techo de costo por compra de BDI estuvo semanas calculado con **2,6 unidades por pedido** cuando
lo medido eran 1,93-1,99: **26% de sobrestimación**, o sea conjuntos que la app daba por rentables y
no lo eran. Si el número con el que la app juzga está mal, se deja de creerle a la app entera —y no
vuelve sola cuando el número se arregla.

## 3. Los pendientes, en orden

### 🆕 ▶️ P0 — Lo que queda de la Agenda partida en seis (29-ago-2026)

La sección se partió en seis entradas de menú y las tres poblaciones de `agenda_items` se separaron
(ficha: `docs/secciones/agenda.md` § «SEIS pantallas»). Lo que queda es **de Bruno**:

- ▶️ **Publicar la novedad**, que quedó cargada como borrador: *«La Agenda, ahora por partes»*
  (`n1788054663959_yw2xuq`), en `/novedades` → «Sin publicar». El deploy **ya está en la calle**
  (verificado el 29-ago con la cadena nueva adentro del chunk del nav).
- ▶️ **Caminar a mano lo que ningún test alcanza**, listado al final de la ficha: las seis entradas
  con los dos perfiles, el modal de una actividad, y el `offset` al pasar de Mes a Semana.

### 🆕 🏁 P0b — Horas extras: HECHO Y CAMINADO (30-ago-2026)

Pedido de Bruno: *«en agenda de monitor, que esté el link de dashboard para que puedan cargar sus
horas extras; y la alerta de fin de mes, que sea sólo para las personas que tienen autorizadas las
horas extras»*. La ficha: `docs/secciones/agenda.md` § «la quinta forma de destino».

🔴 **El agujero era de DATOS y estaba a la vista sólo si se medía: `0 de 11` empleados activos tenía
el link generado.** La rutina les caía desde el 23-ago y **no había nada que abrir**.

✅ **Cerrado el 30-ago, con Bruno mirando**: se generaron los links de las **cuatro que él nombró**
—**Camila Budek, Candela Luis, Josefina Batter y Camila Quintana**— en el dashboard, se pegaron en
sus perfiles de `/usuarios`, y la rutina `it178752572363714_6wxkmp` pasó de los tres nombres a
`destino: {tipo:'horas-extras'}`.

- ⚠️ **Sofi quedó AFUERA a propósito** (no estaba en la lista de Bruno). Hasta el 30-ago la rutina la
  nombraba: era justo el caso que el pedido venía a arreglar.
- ⛔ **Gerardo Tamayo no tiene cuenta en el monitor**: si algún día hace horas, el link se le pasa
  por afuera, porque no hay perfil donde tildarlo.
- **Los oráculos que se corrieron** (⛔ ninguno es «lo vi en la pantalla»): el padrón quedó en
  **16 usuarios y 16 con contraseña**, igual que antes de guardar —es lo único que detecta el borrado
  silencioso de contraseñas—; cada link se cruzó contra la fila de esa persona en la base del
  dashboard; el `manual_id` de la rutina quedó **intacto**; y `/horas/<token>` se abrió **en el
  navegador, sin sesión** (salió «Hola, Camila» con su carga vieja del 31/07).
- **El control de dos lados en la ficha de Organización**: a **Cami Budek** (tildada) la rutina le
  aparece; a **Sofi** (sin tildar) ⛔ no —con una rutina suya visible en el mismo barrido, que es lo
  que prueba que la lista no estaba ciega—.
- ✅ **La novedad ya está escrita y cargada como BORRADOR**: `n1788116275709_u56o8j`, «Tus horas
  extras las cargás vos», destino `horas-extras` (⇒ le llega **sólo a las cuatro**, y la lista se
  ajusta sola) y **sin `importante`** —las 15 publicadas están las 15 en importante, y si todas
  frenan, ninguna frena—. ▶️ **Queda el click de Bruno en Publicar.**
- ✅ **Y el botón se renombró a «Cargar horas extras»** (era «Cargar mis horas») y pasó a ser un
  botón de verdad: ver el 🔴 de `ButtonLink` en la ficha de la Agenda.

### 🆕 🔴 ▶️ El modal de la Agenda dice «— sin manual —» en 75 de 75 rutinas (30-ago-2026)

Salió de caminar lo de arriba. El desplegable **«Cómo se hace»** de `ModalItem.tsx` sólo lista los
manuales **publicados** (`publicados = manuales.filter((m) => m.publicado)`), y hay **1 publicado de
12**. ⇒ **medido: las 75 rutinas activas que tienen manual abren el modal diciendo que no tienen.**

- ✅ **No borra nada solo**, y se verificó: `manualId` vive en el estado y el `onChange` sólo dispara
  si alguien toca el desplegable, así que guardar otro campo lo conserva. Se comprobó guardando el
  destino de «Cargar las horas extras» y releyendo `manual_id` de la base: intacto.
- 🔴 **Pero si lo tocás, no lo podés volver a poner**: el manual que la rutina tenía **no está entre
  las opciones**. ⇒ ⛔ hasta que se publiquen los manuales, editar una rutina y **no tocar «Cómo se
  hace»**.
- ▶️ Se arregla solo el día que se **publiquen los 11 manuales** (ya estaba en la lista de manos de
  Bruno). La alternativa, si eso tarda: que el desplegable incluya el manual que la fila ya tiene,
  aunque esté en borrador, marcado como «sin publicar».

### ▶️ P1 — Cada sección declara, EN LA PANTALLA, qué hace y qué ejecuta

Lo mínimo, en el encabezado de cada sección: **una línea de qué resuelve** y, si tiene botones que
escriben, **qué toca cada uno, dónde, y si se puede volver atrás**.

Cómo hacerlo sin escribir 55 textos sueltos:
- El registro de secciones ya existe y ya está amarrado por `tests/agents-mapa-secciones.test.ts`.
  **Sumarle dos campos obligatorios: `queHace` y `queEscribe`** (este último `null` si la sección
  sólo lee). Un test que exija los dos, igual que hoy exige que la sección figure en el mapa.
- Las acciones de Meta ya tienen la mitad hecha: `lib/meta-ads/acciones.core.js` tiene `rotulo`
  («pausar o activar», «cambiar el presupuesto diario») y `reintentable`. **Falta que eso se lea en
  la pantalla ANTES de apretar**, no sólo en el modal de confirmación. ▶️ Sigue pendiente: la zona
  monta los botones en la fila pero el rótulo y el «¿se puede volver atrás?» se siguen leyendo recién
  adentro del modal. Y en el de presupuesto falta el aviso de si el paso **reinicia el aprendizaje**
  —el dato ya lo calcula `aprendizajeDe()` y se muestra en el «por qué» de la celda, pero no en el
  modal, que es donde se decide.

⚠️ **Esto es lo primero porque es lo que pidió el usuario**, y porque sin esto ninguna de las otras
mejoras se descubre.

### 🏁 P2 — HECHO (26-ago-2026): el motor de reglas está PRENDIDO

**`meta_ads_regla` pasó de 0 a 11 filas.** Las prendió Bruno con el script, verificado por relectura.
El cron de las 07:50 ya no corre en vacío: el simulacro del mismo día deja **4 hallazgos** —
`GIRLHOOD FRIO - INTERESES 1` al 156% del techo, `AD01 - UNBOXING LOCAL` vendiendo dos días después
de pausado, `AD02 - GIRLHOOD COLLECTION` con el CTR 31% abajo, y el radar de Zattia.

🔴 **Y prenderlas destapó dos defectos que ningún test veía, los dos del mismo tipo: un número que
existe pero no significa.** Están contados en `docs/secciones/meta-ads.md`:
1. el **piso derivado de UNA sola compra** ($330.528 en Stunned) dejaba la regla **prendida y muda**;
2. la **fatiga miraba una semana**, donde el desgaste no se ve, y confirmaba con la dirección sin la
   magnitud ⇒ decía «Está quemado» sobre una caída del CTR del **2%**.

🔑 **Los dos los encontró EJERCER —calibrar marca por marca y correr el simulacro—, ⛔ no la suite.**
Es la tercera vez seguida en este módulo.

▶️ **Lo que queda del motor** son los 3 cortes de la tabla de abajo que siguen en 🔴, y **los dos
presets que quedaron afuera a propósito**: `gastos-hormiga` (pide `roas_objetivo`, la vara que este
repo decidió no usar) y `ganador-escalar` (pide `techo_diario_crudo`, que es plata y la firma Bruno).

<details><summary>Cómo se prendieron, y con qué diales</summary>

**El detalle de la calibración (26-ago)**

🔑 **El techo quedó enganchado**: sale de la ficha de rentabilidad de la marca (`desdeFicha`), así
que `cpa_maximo` ya no es un dial huérfano y **el corte principal se prende sin que nadie elija un
número**. Y `leerTechos()` es una sola lectura para los cuatro que la usan. El detalle, la
verificación contra la pauta real y por qué la regla es más exigente que la pantalla:
**`docs/secciones/meta-ads.md`**. Los cortes:

| corte | ¿hay preset? |
|---|---|
| 3 días de gasto con **0 compras** → apagar | ✅ `freno-emergencia` (ventana 3 + `gasto_minimo`) |
| CPA > techo × 1,5 en 5 días → apagar | 🆕✅ `costo-alto` — **el corte principal, ya corre** |
| ≥95% del tope **y** CPA < 75% del techo → escalar +20% | ✅ existe (`ganador-escalar`, corta por COSTO si la marca tiene ficha) — ⛔ **sin prender**: pide `techo_diario_crudo`, que es plata |
| celda de test — **ver «La regla del test» abajo**, corregida por Bruno el 26-ago | 🔴 **no existe**, y antes hace falta poder **marcar una celda como test** — no hay dónde guardarlo |
| CPM del núcleo +15% contra la semana previa | 🔴 **no existe**, y con esta forma no debería: es un tripwire **de la línea** y todos los detectores son por objeto |
| pedidos de Tienda Nube/día contra la meta de Norte | 🔴 **no existe**: cruza fuera de la foto, y correr sólo sobre la foto es lo que hace que las reglas anden **sin token y sin cupo** |

### 🔑 La regla del test — LA VERSIÓN VIGENTE (26-ago-2026, la fijó Bruno)

⛔ **Deroga a la de «$10.000 en UN día · 0 muere · 1 sigue · 2+ aprobado»**, que estuvo escrita en
la memoria de las sesiones y en este archivo. Bruno: *«para mi son dos dias la puerta. 2/3 sigue
4/5 aprobado / 6 escalar»*.

**Plata: $10.000/día × 2 días = $20.000.** Se lee **el 2º día** — el 2º día es el que habla de la
pauta. 🔴 **Manda el TOTAL, no el diario**: se puede bajar el diario estirando los días
($5.000 × 4 días = los mismos $20.000, mismas puertas). ⛔ **Lo que no se puede es bajar el total**,
porque las puertas son cuentas de compras. Medido con Poisson contra el techo de BDI ($7.641):

| presupuesto | total | mata una pieza que está JUSTO en el techo |
|---|---|---|
| $2.000/día × 2 | $4.000 | **90%** — no es un test, es una lotería |
| $5.000/día × 2 | $10.000 | 62% |
| $7.500/día × 2 | $15.000 | 42% |
| **$10.000/día × 2** | **$20.000** | **26%** ← el piso |

**Las puertas, por compras acumuladas al 2º día: 0-1 muere · 2-3 sigue otra tanda · 4-5 aprobado ·
6+ escalar.** Cómo se porta (Poisson, $20.000, techo $7.641):

| lo que la pieza REALMENTE cuesta | muere | sigue | aprobado | escalar |
|---|---|---|---|---|
| $3.400 (44% del techo) | 2% | 14% | 30% | **54%** |
| $5.000 (65%) | 9% | 34% | 35% | 21% |
| **en el techo, $7.641** | **26%** | 47% | 22% | 5% |
| 2× el techo | 62% | 33% | 4% | 0% |
| 3× el techo | 78% | 21% | 1% | **0%** |

🔑 **Un desastre de 3× el techo escala el 0% de las veces** — la regla vieja lo aprobaba el 39%.
✅ **El `1` MUERE — cerrado por Bruno el 26-ago**: *«si es 20mil de gasto y hizo 0 o 1 venta,
muere»*. Se evaluó mover el `1` a «sigue» (bajaba los falsos muertos del 26% al 7%, a cambio de que
una pieza de 2× el techo se llevara una 2ª tanda el 38% de las veces) y **se descartó**. ⇒ **la
regla está COMPLETA: no queda nada abierto en las puertas.** El 26% de falsos muertos es el precio
aceptado, y es el error barato: matar una pieza buena cuesta la oportunidad, escalar una mala quema
plata todos los días.

🔴 **El 1er día de una celda creada ESE MISMO día es PARCIAL y no cuenta.** `TEST IP AZUL BROAD` se
creó el 25-ago y gastó $3.612 de sus $10.000 (36%): su primer día completo fue el 26. Leerlo como
«dos días, 0 compras ⇒ muere» es matarlo antes de que corra el test.

🔑 **«6 compras» y «$2.000 por compra» NO son la misma puerta, y gana la de las compras.** A
$20.000, 6 compras = $3.333 (44% del techo) y $2.000 = 10 compras (26%). Una pieza que de verdad
cuesta $2.000 llega a 6+ el **93%** de las veces pero a 10+ sólo el **54%** ⇒ cortar por
«$2.000 observado» se pierde la mitad de las piezas que hay que escalar. **El costo por compra del
test no es una puerta: dice cuánto AIRE tiene la celda para escalar.** Con la elasticidad medida
(0,54 ⇒ el costo sube con el gasto^0,46), una celda a $2.000 aguanta **18× su presupuesto** antes de
tocar el techo — y el `TOPE_ESCALONES = 6` del código la frena en 3× ($3.308, 43% del techo).
⚠️ Ese 18× es optimista: la elasticidad se midió sobre la cuenta entera, y **una celda sola satura
su público más rápido**. ▶️ Vale revisar el tope para celdas que arrancan muy abajo.
### 🔑 La FORMA del test — cuántos avisos por conjunto (28-ago-2026)

La sección de arriba dice **cuánta plata y qué puertas**. Ésta dice **cómo se agrupan los avisos**.
⛔ **No deroga nada de arriba**: el total de $20.000 y las puertas por compras siguen mandando.

**De dónde salió.** El 28-ago la consultoría que paga Bruno propuso **testear 3 avisos dentro de un
mismo conjunto** y, si uno se lleva todo el presupuesto, **aislar a los otros dos**. La primera
respuesta de la sesión fue que eso no servía, apoyándose en el *«Meta no reparte: la pieza #1 se
lleva el 80%»* del 26-ago. **Bruno lo objetó: *«esos testeos los hicimos luego de tener aprendizaje
en el CDA, no los arrancamos al mismo momento»*. Tenía razón y la medición vieja estaba
contaminada** — mezclaba dos casos que se portan al revés. Es, además, la misma regla que traía la
consultoría: *«los testeos son siempre en paralelo, nunca meter en uno que ya tenga aprendizaje»*.

🔑 **Re-medido el 28-ago con `scripts/medir-reparto-conjunto.mjs`** —queda para volver a correrlo,
es la partición y no el promedio— sobre `meta_ads_snapshot_dia`, nivel aviso, 11-may→28-ago. De 23
conjuntos con 2+ avisos se descartan **8 censurados** (arrancaron en el 1er día de la foto o antes:
no se sabe cuándo empezaron de verdad). Quedan 15, partidos por **cuándo arrancó cada aviso**, y
mirando **los 2 primeros días**, que es la ventana del test:

| | conjuntos | cuota de la #1 (mediana) | #1 ≥90% | la #2 se quedó con |
|---|---|---|---|---|
| **escalonado** — el aviso se sumó a un conjunto que ya gastaba | 10 | **100%** | **10/10** | **$0 en 8 de 10** |
| **arrancaron juntos** — misma cohorte inicial | 5 | **79%** (min 62%) | 1/5 | ~20% del gasto |

🔴🔴 **El caso escalonado es total: en los 10 conjuntos el incumbente se lleva el 100% de los dos
primeros días.** Poner una pieza nueva al lado de una que ya corre ⛔ **no la testea: no sale al
aire**, y después se concluye «no funcionó» cuando nunca corrió. Casos: la segunda pieza recibió
**$0** en 8 de 10, y **$47** en otro. Precedente: *«el duelo del 15-ago NO OCURRIÓ»*.

✅ **Arrancando juntos es otra cosa: la #1 se lleva 79% y la #2 se queda con ~20%.** ⚠️ Y la
concentración **se agrava con los días**: a 7 días la mediana sube de 79% a 83%. ⇒ **la ventana
corta del test juega a favor.**

🔑🔑 **PARA QUÉ SIRVE EL CONJUNTO COMPARTIDO — lo fijó Bruno el 28-ago, y es lo que ordena todo lo
de arriba:** *«testear de a 2 o 3 sólo sirve para encontrar al ganador, y aislarlo. El resto va a
tener su oportunidad más adelante cuando se cree otro CDA, porque poco presupuesto gastado no quiere
decir que va a morir ahí»*.

⇒ **Es un BUSCADOR, ⛔ no un juez.** La sesión venía tratándolo como un descarte —«¿alcanzan las
impresiones de la #2 para leerle el CTR?»— y esa pregunta **no hay que hacérsela**: a la #2 no se la
lee. La concentración de Meta **es** la selección: se queda con la que puede entregar mejor, esa se
aísla, y las otras vuelven al banco sin veredicto.

**⇒ Lo que queda decidido:**

1. ⛔ **NUNCA sumar un aviso a un conjunto que ya gasta.** Medido: 100% al incumbente, 10 de 10. Esto
   vale para cualquier prueba, no sólo para las formales. Lo que se prueba se arranca **a la par**.
2. ✅ **2 o 3 piezas en un conjunto nuevo, arrancadas el mismo día**, a los $20.000 / 2 días de
   siempre. Con 3 hay más chances de que asome la buena, y ⛔ **no importa** que la #3 se lleve el
   6%: no se la va a leer.
3. 🔑 **El ganador sale con su lectura HECHA.** Se lleva el 79-100% ⇒ **$16.000-20.000 de los
   $20.000**: es prácticamente la celda entera. ⇒ **el buscador no cuesta una celda extra, ES la
   celda** — y a la salida ya tiene compras acumuladas contra las puertas. Después se aísla, y ⛔
   **sin subirle el presupuesto**.
4. 🔴🔑 **Las que no gastaron ⛔ NO MUEREN Y NO SE ANOTAN COMO PROBADAS.** Gastar poco ⛔ no es un
   resultado: vuelven al banco de piezas y les toca **su propio conjunto** más adelante. ⚠️ El
   riesgo operativo es que queden registradas como «testeadas y no funcionó» —ya pasó: *«el duelo
   del 15-ago NO OCURRIÓ»*— ⇒ **al cerrar la tanda hay que dejar escrito que no tuvieron veredicto**,
   no dejar que el silencio se lea como fracaso.
5. ⚠️ **n = 5.** Es lo que hay. Vale para decidir, ⛔ no para dar por cerrado; se re-mide cuando haya
   más conjuntos arrancados a la par.

▶️ **Lo que queda ABIERTO y es la pregunta de fondo del método: ¿la que Meta elige temprano es la
que más vende?** La concentración se decide en las primeras horas con señal de **clicks**, ⛔ no de
compras. Que eso sea un buen proxy es **plausible acá** —el desgaste medido en esta cuenta aparece
como CTR cayendo con el CPM clavado— pero ⛔ **no está medido**. Se puede medir hacia adelante:
anotar a quién eligió Meta en cada tanda y comparar con el costo por compra que esa pieza saca
después, ya aislada.

**El rescate** — para el que quiera darle su turno a una pieza que no gastó, ya sea en la tanda de
arriba o en un conjunto viejo que quedó con varios avisos adentro:

- El **ganador se queda donde está** y ⛔ **sin subirle el presupuesto** — subirlo le resetea el
  aprendizaje.
- El que no gastó **sale a conjunto propio**. ⛔ Si son dos, **NO van juntos al mismo conjunto
  nuevo**: se repite el reparto y uno vuelve a quedar mudo. **Uno por conjunto.**
- ⚠️ Y esto ⛔ no es urgente: la pieza que no gastó **no perdió nada**, sigue entera en el banco. El
  turno se le da cuando haya presupuesto libre, no para «cerrarle el caso».
- 🔴🔑 **El aislado ⛔ NO se pauta «con el mínimo».** La consultoría dice mínimo y eso **choca con la
  puerta**: a $3.000/día junta $6.000 en 2 días, saca 0-1 compras y «muere» — **muerto por falta de
  plata, no por malo**, que es el defecto que se está reparando. O va a **$20.000 totales** y le
  corre la puerta, o **se acepta que no tiene veredicto**. Las dos cosas juntas, no. (Mismo
  invariante de arriba: **manda el TOTAL**.)
- 🔴 **Duplicar el conjunto le prende el CATÁLOGO solo** ⇒ chequearlo **antes** de contar el
  resultado, o el aislado no mide la pieza, mide otra cosa.
- 🔴 Vale igual **el 1er día parcial**: el día en que se crea la celda no cuenta.

⚠️ **Lo que la forma ⛔ no arregla: cuánto se le puede creer al ganador.** Sale del conjunto con
$16.000-20.000 encima, así que **sí** tiene lectura contra las puertas — pero $20.000 compran 0-4
compras y la diferencia entre 1 y 3 sigue siendo ruido. Eso ⛔ no lo causa el agrupamiento, lo causa
el **TAMAÑO DE MUESTRA**, y sin más plata por celda no hay forma que lo arregle. Lo que sí baja la
exposición diaria es **estirar el diario** ($5.000 × 4 días, mismos $20.000).

🔴 **Y para el escalado (CBO con los ganadores):** CBO reparte entre conjuntos, pero **adentro de
cada uno sigue valiendo el 79/21**. Además reparte hacia el que ya gana, y hoy **una sola pieza
(`AD02 GIRLHOOD`) es el 52% del gasto de BDI** ⇒ acelera el desgaste de la única pieza que sostiene
la cuenta. Si se va a CBO: 5-6 avisos y **al menos 3 piezas nuevas adentro**.

🔑 **El marco: la forma del test no fabrica piezas.** El cuello medido son las PIEZAS —CTR −42% con
CPM clavado, ninguna pieza virgen, ~$38.000/día libres y ninguna celda nueva esperando—. Ninguna
grilla reemplaza tener **4-6 piezas nuevas con ángulos distintos**.

**Los once renglones que se prendieron**, calibrados contra la pauta real antes de tocar nada. La
columna que importa es **7 días**, que es el ruido que iba a llegar por la mañana; los 90 son casi
todos objetos que ya están apagados:

| línea | preset | dial | saltos 7d | 90d / objetos |
|---|---|---|---|---|
| bdi | `costo-alto` | — | **8** | 25 / 7 |
| bdi | `freno-emergencia` | — | **10** | 59 / 8 |
| bdi | `atribucion-tardia` | — | **10** | 12 / 3 |
| bdi | `fatiga` | `frecuencia_maxima 1.3` | 5 ⚠️ | 15 / 1 |
| bdi | `sin-avisos` | — | 0 | 0 |
| zattia | `freno-emergencia` | — | **6** | 54 / 2 |
| zattia | `atribucion-tardia` | — | **2** | 2 / 1 |
| zattia | `fatiga` | `frecuencia_maxima 1.6` | 4 ⚠️ | 15 / 1 |
| zattia | `costo-alto` | — | 0 | 6 / 2 |
| zattia | `sin-avisos` | — | 0 | 62 / 1 |
| stunned | `sin-avisos` | — | 0 | 8 / 1 |

⇒ **~5 hallazgos por mañana entre las tres marcas.** Es una lista que se lee, ⛔ no un tablero que se
ignora. ⚠️ **Las dos filas de `fatiga` son de ANTES del arreglo de la ventana** —eran casi todas
falsos positivos por caídas del tamaño del ruido— y hoy dan menos: en la corrida del 26-ago queda
**una sola**, `AD02 - GIRLHOOD COLLECTION`, y la de Zattia se cayó sola porque su CTR venía SUBIENDO.

🔑 **Los diales de `fatiga` no son un número elegido: son el CODO de la curva de frecuencia.** En BDI,
`1,2` arrastra 8 avisos y `1,3` deja **exactamente uno — `AD02 - GIRLHOOD COLLECTION`**, que es el 52%
del gasto de la marca. En Zattia la curva es plana de `1,3` a `1,6` ⇒ va `1,6`, el más alto que no
pierde nada.

</details>

▶️ Y una segunda, en la otra pantalla: **Zattia corta contra un techo que hoy no aplica** —su ficha
está cargada a precio de LISTA y la tienda está en liquidación— ⇒ la regla hereda la ficha, que es
como tiene que ser, y **arreglar la ficha arregla la regla**.

🏁 **Y el cartel del bloque vacío dejó de mentir** (26-ago, 4ª tanda): decía «no hay reglas cargadas»
con el texto clavado y siguió diciéndolo la tarde en que se prendieron las once. Ahora el motivo se
**mide** (`silencioDeReglas`): sin reglas · prendidas pero todavía sin correr · corrieron y no
encontraron nada — **sólo la última significa «está todo bien»**, y lleva la fecha de las dos puntas.
El detalle, en `docs/secciones/meta-ads.md`.

### 🏁 P3 — HECHO (26-ago-2026): la zona de Rendimiento

`/meta-ads` es la zona: veredicto por celda contra el techo, el desgaste, el aprendizaje, el cruce
con los pedidos reales y los botones en la fila. El menú bajó de **once entradas a cuatro**
(Rendimiento · Producir · Analizar · Configurar). Detalle y verificación en
`docs/secciones/meta-ads.md`.

🔑 **Y quedó resuelta la tensión que este archivo tenía con la ficha**: aquélla defendía que el parte
fuera un botón (cinco llamadas a Graph, el cupo es un porcentaje) y esto pedía que fuera la pantalla.
**La pantalla no es el parte: es la FOTO** —se pide sola, es barata, tiene 90 días y contesta con el
token vencido—, y el parte quedó siendo el botón que trae el día EN CURSO, que es lo único que sólo
existe en Graph.

### 🏁 P4 — HECHO (26-ago-2026): los hallazgos salen a buscar a Bruno

**Los hallazgos entran al badge del sidebar y al bloque de Inicio**, como noveno aviso derivado
(`avisosDeHallazgo`). ⛔ No hace falta acordarse de entrar a `/meta-ads`, y el clic lleva a la zona
**con la línea puesta**.

🔴 **El agujero estaba medido:** el motor escribió sus primeros cuatro hallazgos a las 07:50 —uno, un
conjunto comprando al **156% del techo**— y a media tarde los cuatro seguían en `nuevo`. Nadie abrió
la sección en todo el día. Es exactamente lo que dice el punto 4 de este archivo: con un solo
operador, **lo que no le llega no existe**.

🔑 **Y ⛔ no contradice el «no hay pantalla nueva de alertas» de la ficha: lo cumple.** No es un
segundo lugar al que entrar — es el contador que ya está en todas las pantallas. Accionar sigue
pasando en un solo lado.

🔴 **Construirlo destapó el tercer «número que existe y no significa» del módulo en dos días:**
`veces` decía «días seguidos» y contaba **filas**, así que un hueco en el medio se leía como racha. De
arreglarlo sale `desde` —cuándo EMPEZÓ—, que es el `ts` del aviso: con la fecha del último renglón el
aviso diría «apareció hoy» todas las mañanas y el «NUEVO» no se apagaría nunca. Detalle en
`docs/secciones/meta-ads.md`. **16 mutantes, 16 muertos.**

🏁 **Y el mail también** (26-ago, 6ª tanda). El reloj de las 07:50 manda un mail después de escribir
los hallazgos. 🔑 **Lleva los ABIERTOS y ⛔ no los de hoy** —si no, un hallazgo del lunes que nadie
accionó desaparece del mail del martes—, y **con cero ⛔ no manda nada**, porque un mail diario que
dice «no hay nada» enseña a no abrirlo. Detalle en `docs/secciones/meta-ads.md`.

🔴 **Va por el MISMO SES que ya usa `areben-mailer`** —lo corrigió Bruno—: dominio verificado, DKIM,
fuera del sandbox, 50.000/día de cuota. ⛔ No hizo falta cuenta nueva ni verificar nada. **El mail ya
se mandó de verdad** con los 4 hallazgos reales.

🏁 **PRENDIDO.** Bruno cargó los 3 secrets y **se verificó CORRIENDO EL WORKFLOW**, ⛔ no la Mac: el
log de la corrida dice `Mail mandado` con su `MessageId`. ⚠️ El `--simulacro` ⛔ no sirve para esto
—sale antes de tocar las credenciales—, así que la prueba tenía que ser una corrida real.
▶️ Falta que Bruno confirme que **llegó a la bandeja y ⛔ no a spam**: es lo único que desde acá no se
puede ver.
⚠️ Lo limpio sería un usuario de IAM con `ses:SendEmail` y nada más, en vez de reusar la clave del
mailer. Es consola de AWS y queda anotado.

### ▶️ P5 — Traducir el idioma

Glosario mínimo y consistente en pantalla: conjunto → «celda/público», `estado_real` → «¿está
entregando?», etc. Barato y se nota enseguida.

### 🆕 ▶️ P6 — Lo que queda de las seis tandas de Meta (30-ago-2026)

Bruno caminó `/meta-ads` entero y salieron seis tandas, **todas en prod y verificadas** (el relato
completo, en `docs/secciones/meta-ads.md`; acá sólo lo que **falta**).

**🔴 Manos de Bruno — caminar la pantalla.** El login pide contraseña, así que esto ⛔ no lo puede
hacer nadie más. Cinco cosas que sólo se ven abriéndola:
1. Que la marca **venga preseleccionada** con la del sidebar, y que si elegís «Todas» a mano **se
   quede** (es el caso que el default en `'todas'` hacía imposible).
2. Que `Hoy •` cambie los **números** y ⛔ no el **veredicto**, y que el cartel de arriba lo diga.
3. Que la fila mida **un renglón**, que el «⋯» cierre con Escape y clickeando afuera, y que la cara
   del anuncio aparezca (**tarda ~6 s la primera vez**: son 257 piezas).
4. Que el hallazgo de `AD01 - UNBOXING LOCAL` —que es de nivel **aviso**— aparezca **adentro de la
   fila de su conjunto**. Es el caso que prueba el reparto.
5. Que Producir ya ⛔ no te explique Rendimiento.
6. 🆕 **El aire de la ficha de Rentabilidad, que desde el 30-ago sale de la foto**: que BDI diga
   **~1,2× de aire** y ⛔ no 2,7×, que Zattia muestre su ventana terminando el **26** y ⛔ no el 29
   (cada línea tiene su último día cerrado), y que **Stunned muestre el costo SIN aire** —su techo
   es el prestado de BDI—. Y que el aviso «la ficha quedó vieja» aparezca en las dos, con el botón
   **«Emparejar la ficha»**.

**▶️ Lo que queda escrito y ⛔ sin hacer:**
- **`link` → `enlace`: 23 rótulos** en Atención, Canjes y Envíos. 📊 Medido. Está prohibido en
  `VOCABULARIO.md` §1.6 y ⛔ **no** en el test — son tres secciones que esta tanda ⛔ no tocó, y
  barrerlas a medias es peor que no barrerlas.
- **§3 (título = sustantivo, ⛔ no frase) sigue SIN test**, y ⛔ no es un olvido: «¿esto es una
  frase?» ⛔ no lo decide un regex. El proxy barato —un `?` en el rótulo— da **46 casos y la mayoría
  son legítimos** (ayudas en voz de pregunta: «¿De qué marca?»). Un test así **nace rojo sobre lo que
  está bien**, y ése es el que alguien apaga.
- **El puente MAKETA → «Anuncio nuevo»**: una pieza terminada allá ⛔ no llega sola acá. Hoy el camino
  es Drive → arrastrar. ⛔ No lo cubre ninguna de las dos apps.
- ⛔ **El Embudo NO estaba pendiente, y este renglón estaba mal leído** (corregido el 30-ago-2026).
  Decía *«📊 `meta_ads_etapa` en 0 filas»* como si fuera un módulo que nace mudo. 📌 **Esa tabla es
  el OVERRIDE MANUAL**, y lo dice su propio núcleo (`lib/meta-ads/etapas.core.js`): la clasificación
  sale del `objective` de cada campaña vía `ETAPA_POR_OBJETIVO`, y la tabla sólo guarda **las
  correcciones a mano**. ⇒ **0 filas = nadie corrigió ninguna clasificación**, que es lo esperable y
  ⛔ no un agujero. 🔑 **El cero afirma, y acá afirmaba lo contrario de lo que se le leyó**: el
  tripwire —«que esa tabla se mueva»— sigue en pie, pero mide **cuándo el objetivo miente**, ⛔ no si
  el Embudo tiene datos.
  🏁 **Y al medirlo aparecieron DOS cosas que sí eran trabajo, hechas el 30-ago** (relato en la
  ficha): la **premisa del módulo estaba al revés** —decía que toda la pauta es de la primera etapa
  y el 84% del gasto es de la de compra; el agujero real es **MOFU, en cero**— y el Embudo **se
  moría con el token vencido**, cuando el dato ya estaba en la foto. Ahora tiene respaldo y la
  pantalla dice de dónde salió.
  ▶️ **Lo que queda es una mano**: ejercitar el respaldo **con el token caído de verdad** (se probó
  el núcleo contra la foto real, ⛔ no el handler) — y que el cartel «Esto sale de la foto diaria»
  aparezca en el Embudo **y** en Campañas.
- **Informes**: 2 filas, las dos **sin publicar**. Se quedó como pestaña y ⛔ no subió al menú. Si en
  un mes sigue en dos, se elimina.
- **«Hoy + ayer + anteayer» como una suma sola** ⛔ no se ofrece: pediría cruzar Graph con la foto por
  celda, y ese gesto ya lo contesta la **tira de días**.

⚠️ **Y un rojo que ⛔ NO es de esta tanda**: `tests/seccion-header.test.ts` falla porque
`organizacion` se registró en `SECCIONES` sin entrada en `DESCRIPCIONES` (commit `e0f4eff`).
Verificado: ya fallaba en `HEAD` antes de tocar nada. ⛔ No se arregló desde acá para ⛔ no pisarle el
texto a la sesión que la está escribiendo — **es una línea en `lib/nav.ts`**.

## 4. ✅ CONTESTADO: se construye PARA BRUNO

**Lo contestó Bruno el 25-ago-2026: «todo para Bruno».** El módulo se construye para que **una sola
persona experta decida más rápido**, ⛔ no para que el equipo pueda operar la pauta sin ella.

🔑 **Y eso reordena la lista de arriba**, porque lo escaso pasa a ser el TIEMPO de esa persona, no
su comprensión:

- **P2 (motor de reglas) y P3 (el parte como pantalla) SUBEN a lo primero.** «Qué hago hoy» es
  exactamente lo que le falta a alguien que ya sabe leer los números.
- **P4 (que salga a buscarte) sube también**: si hay un solo operador, lo que no le llega no existe.
  🏁 **Hecho**: el badge del sidebar y el mail de las 07:50. ▶️ Falta la mano de la key.
- **P1 se angosta**: de las dos mitades —«qué hace» y «qué ESCRIBE»— la que sigue valiendo es la
  segunda. No hace falta enseñarle qué es un conjunto; hace falta que antes de apretar sepa **qué
  se toca, dónde, y si se puede volver atrás**. Es lo que pidió textual.
- **P5 (traducir el idioma) BAJA casi a cero.** Era para un lector no experto y no lo hay.

⚠️ Si algún día entra otra persona a operar la pauta, **P5 vuelve y P1 se ensancha**. Anotarlo acá
antes de rehacerlo.

## 5. Fricción concreta ya detectada (chica, y se arregla sola)

- **`prepararPiezas` exige un aviso modelo en Meta para tomar el copy** (`api/_meta-planes.js`,
  `copyDeCreativo` en `lib/meta-ads/pieza.core.js`). Para estrenar un copy nuevo hay que ir a Ads
  Manager a crear un aviso — que es exactamente la fricción que el usuario señala. ⇒ **Aceptar el
  copy en el pedido** (título, mensaje, descripción, destino, CTA) y dejar el aviso modelo sólo para
  la página y el Instagram.
  📊 **Medido el 26-ago-2026 con `TANDA VIDEOS 26-8` (4 videos)**: la tanda salió con el copy del
  modelo en las 4 y hubo que **editar las 4 a mano en Ads Manager**. Lo que más costó no fue el
  texto: fue el **destino**, que viaja adentro del copy — las 4 nacieron apuntando a
  `/fundas/girlhood-collection/` y dos de ellas iban a otra página (`/productos/stellar-case/` y
  `/new-in/`). ⇒ **el campo que más se paga por no poder mandar es el `link`, no el `message`.**
  🔴 Y las ediciones **quedaron en BORRADOR**: releyendo Graph, Meta seguía teniendo el copy del
  modelo cuando ya se las daba por editadas. ⇒ si el plan aceptara el copy, no habría paso manual
  que se pueda olvidar de publicar.

- ✅ **El memo mostraba el estado de la semana ANTERIOR al cambiar de semana** (reportado por Bruno
  el 29-ago-2026, arreglado el mismo día). El chip, la firma del cierre y el botón «Cerrar la
  semana» viven fuera del esqueleto de carga, así que durante los segundos de la lectura quedaba el
  título de una semana con el estado de otra. ⇒ el dato viaja sellado con su semana (`deLaSemana`)
  y el encabezado acepta `estado: null` = "no lo sé", que dice «Leyendo la semana…» y ⛔ no ofrece
  cerrar. 3 mutantes, 3 muertos. El relato está en `docs/secciones/memo.md`.

- ✅ 🔴 **El post-venta ⛔ no tenía UN SOLO NÚMERO que dijera si está midiendo bien** (30-ago-2026).
  Salió el medidor: **reclamos registrados por cada 100 ventas online**, seis meses, por marca, en
  Reclamos (Administración). El relato entero está en `docs/secciones/reclamos.md` § «El medidor».
  📊 **Lo que se ve al prenderlo, medido contra las dos bases**: BDI tiene **2 reclamos sobre 283
  ventas online de agosto** y **Zattia ⛔ NUNCA registró ni uno** (167 ventas online en agosto, 0
  reclamos, y ninguno en toda la tabla). ⚠️ Eso ⛔ **no es una tasa baja: es que el reclamo que se
  resuelve en un chat ⛔ no deja fila** — y por eso el número sale con los meses de atrás diciendo
  *«todavía no se registraban reclamos»* en vez de un cero, que afirmaría lo contrario.
  ▶️ **Lo que sigue estando trabado por falta de datos**: los cuatro diales de la válvula (§5 del
  plan) y las tres decisiones de Bruno (§6) — el piso del retorno, cuánto vale un cupón y el costo
  operativo. Se destraban con un mes de volumen del alta pública, que es la mitad de Darío.

- ✅ 🔴 **El paso 1 del alta pública: la llave orden + mail** (30-ago-2026). Está en `bdi-catalogo`
  (`api/_verificacion-orden.js`), no acá; el relato entero en `docs/secciones/reclamos.md` § «La
  llave del alta pública». 🔑 **No hubo que traer ningún dato nuevo**: Tienda Nube ya mandaba el mail
  del comprador y `mapOrdenTN` lo tiraba una línea después. ✅ Confirmado en las dos órdenes reales
  de BDI (`?mail_diag=1` → `tiene_mail: true`) y caminado en prod: el mail correcto abre, una letra
  cambiada da 404.
  ✅ **Y se cerró el `GET ?orden=N`**, que estaba abierto a internet: devolvía nombre del comprador,
  lo que pagó, forma de pago, envío, seguimiento y cada producto, por un número **correlativo**, con
  el repo público en GitHub. No era una decisión sino un olvido de una migración ya hecha (quedaban
  dos llamadores). Caminado en prod: sin credencial 403, con credencial 200 como siempre.
  ✅ **Caminado en el navegador el mismo día**: `/postventa?tab=reclamos`, orden 21033, aparece con
  sus 2 productos. Nada que hacer acá.

- ✅ **BKL-01: «Borrador» era un mal nombre y encima tapaba DOS estados** (30-ago-2026). El informe
  pedía llamarlo «Pendiente» ⛔ **y esa palabra ⛔ no se podía usar**: en la misma fila, la columna de
  al lado dice *«Pendientes: anular la venta · devolver la plata»*. Y «Sin revisar» tampoco, porque
  `en_revision` es «Para revisar».
  🔴 🔑 **Y abajo estaba lo que el informe ⛔ no vio**: un **cambio decidido vuelve a `borrador` a
  propósito**, esperando que el cliente pague — las dos poblaciones mostraban el mismo cartel, así
  que renombrarlo plano dejaba el defecto intacto con otro nombre. El discriminador **ya existía**
  (`compensacion`, el mismo que usa `alertasDe`). ⇒ «Sin escribirle» / «Esperando que pague», ⛔ sin
  tocar la base. **5 mutantes, 5 muertos + 1 control vivo.** Relato en
  `docs/secciones/reclamos.md` § «BKL-01».
  ⇒ 🏁 **con esto el informe de post-venta del 30-ago queda CERRADO ENTERO: los 10 BKL contestados.**

- ✅ 🔴 **BKL-05, lo último que quedaba del informe de post-venta: el texto largo rompía la tabla**
  (30-ago-2026). El informe señalaba la columna de **pendientes** —que ya estaba arreglada— y el
  desborde real estaba en la **primera columna**, y ⛔ no lo produce el nombre del cliente: **es la
  alerta**. `<Td>` hereda `white-space: nowrap`, así que sale en una línea indivisible y empuja la
  tabla entera.
  🔴 🔑 **Y lo empeoró un arreglo del MISMO DÍA**: el aviso de D4 pasó a ser el texto más largo del
  módulo —**77 caracteres medidos**, 20 más que el anterior— ⇒ arreglar una cosa alargó el texto
  que rompía otra, y los dos salieron verdes por separado.
  ⚠️ **La barra de acciones ⛔ NO desbordaba**: su div es un flex con `flexWrap` y ahí corta
  flexbox, ⛔ no `white-space` — la primera versión del test la daba por rota.
  ✅ `tests/reclamos-tabla-desborde.test.tsx` lo cuida sobre **toda celda** · **3 mutantes, 3
  muertos + 1 control vivo** · el relato en `docs/secciones/reclamos.md` § «BKL-05».

- ✅ 🔴 **La auditoría de post-venta quedó CERRADA: 19 de 19** (30-ago-2026). El último era **D4**,
  y estaba trabado en **B1**, que Bruno contestó ese día: *«se parte en dos — armar la oferta exige
  la decisión, contestarla siempre se puede»*. El relato entero en `docs/secciones/reclamos.md`
  § «D4».
  🔴 **Lo que estaba vivo**: `liberar-decision` borra la resolución y **deja la oferta en pie a
  propósito**, así que existe la fila con oferta viva y ninguna rama guardada (así quedó R-0022).
  Ahí apretar «Registrar que no aceptó» **apagaba las tres formas que el caso tenía de aparecer** —
  el aviso de la oferta, la columna de mensajes, y el reloj de «hay que decidir», que contaba desde
  `updated_at` y **el propio gesto de anotar el «no» lo ponía en cero**.
  🔑 **Y la premisa falsa estaba escrita en tres lugares**: el núcleo, la nota del historial y **el
  confirm de la pantalla**. ⛔ Sin migración · **18 mutantes, 18 muertos** (2 controles inocuos
  vivos) · **18 de 18 caminado contra la base real de BDI**, 3 filas sembradas y borradas y las 2
  reales intactas.
  ▶️ **Lo que queda de post-venta ⛔ no es código**: son las **decisiones de Bruno** (`PISO_RETORNO`,
  cuánto vale un cupón, el costo operativo, y los cuatro plazos), y **que alguien lo apriete**: el
  módulo tiene **2 filas en BDI y 0 en Zattia**, así que casi nada de esto lo tocó una persona.

- ✅ 🔴 **El alta pública, paso 2 y paso 3: la puerta que CREA, y LA PANTALLA** (30-ago-2026). El
  núcleo (`lib/reclamos/alta-publica.core.js`) y el servidor (`api/_reclamo.js`, acción `alta`) están
  y probados; el relato entero en `docs/secciones/reclamos.md` § «El alta pública, paso 2».
  🔑 **Lo que hay que saber**: la verificación del mail corre **en el servidor, adentro del mismo
  pedido que crea la fila** —hacerla en el navegador es no hacerla— y los productos salen de la orden
  verificada, ⛔ nunca del body: el cliente manda **índices**. Las cinco opciones son **familias** de
  motivos y entran por el que ⛔ no afirma lo que el cliente no sabe ni enciende un pendiente (por eso
  «todavía no me llegó» entra por `demora` y ⛔ no por `no_llego`).
  🔴 **Y destapó una CUARTA copia de la regla del portal**: `reemitir-token` acuñaba un link nuevo
  para un cambio ya decidido y contestaba «listo», y el portal después le daba **404 al cliente**.
  ⛔ Sin migración · **31 mutantes, 31 muertos** (2 controles inocuos vivos) · ✅ **caminado contra
  PRODUCCIÓN, 16 de 16** (`node scripts/caminar-alta-publica.mjs`), con una fila sembrada y borrada y
  **las 2 reales intactas**.
  ✅ **Y la pantalla salió el mismo día** (`10fc671` + `a468879`): la puerta es **`/reclamo?m=bdi`**
  (o `m=zattia`), **caminada en el navegador contra producción** con la orden real 21148, 1 fila
  sembrada y borrada. 🔑 Fue **la primera pantalla de postventa que se pudo caminar sin Bruno**, y
  ⛔ no por suerte: **el portal ⛔ no pide login**.
  ⚠️ **STUNNED ⛔ no tiene puerta pública, y ⛔ no es un olvido**: sus reclamos vivirían en la base de
  Zattia, donde el freno «un reclamo abierto por orden» compara `(store, orden_tn)` ⇒ dos órdenes
  con el mismo número le contestarían a una persona **el token del reclamo de otra**.
  ✅ **Y por dónde le llega el link, contestado por Bruno el mismo día**: *«mandan la consulta a
  algún canal de comunicación, y le enviamos el link»* ⇒ **lo pega una persona**, ⛔ no un
  automatismo. La puerta estaba abierta y **⛔ no estaba en ninguna pantalla**: quien contesta el
  canal tenía que saberla de memoria, y ⛔ no había mensaje para mandarla —era el único momento del
  circuito sin texto, porque los doce mensajes **cuelgan de una fila** y acá todavía no hay
  reclamo—. Ahora hay dos botones arriba de «Nuevo reclamo», en Reclamos **y en la pantalla del
  local**, que es quien atiende el canal.
  🔴 🔑 **La mitad útil del mensaje es decir qué le va a pedir la puerta**: el número de pedido **y
  el mail con el que compró**. Sin las dos ⛔ no entra, y el link a secas deja a la persona
  rebotando en el primer paso creyendo que no anda.
  **9 mutantes, 9 muertos** + 1 control vivo. El relato entero en `docs/secciones/reclamos.md`
  § «Por dónde le llega el link».
  ▶️ **De Bruno, más adelante**: sumar el canal de reclamos **al mail de la venta o al de
  post-venta** — decidió dejarlo para después.
