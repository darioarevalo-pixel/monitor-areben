# PENDIENTES — legibilidad del monitor

**Lo dijo Bruno el 25-ago-2026, y es el pedido que abre este archivo:**

> «los sectores en monitor no se entienden qué hace ni qué ejecutan, está mal armado, tiene
> funciones pero no las usa nadie»

Este archivo NO es una lista de features. Es el análisis de **por qué una app con 55 secciones
terminadas se usa poco**, y los pendientes que salen de ahí. Lo que se arregle, se borra de acá.

⚠️ Antes de tocar: hay **otra sesión trabajando en este repo**. Rutas explícitas, `git fetch` al
arrancar, `git commit -F msg -- <rutas>`, ⛔ nunca `git add -A`.

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
| celda de test (**$10.000 en UN día · 0 muere · 1 sigue · 2+ aprobado**) | 🔴 **no existe**, y antes hace falta poder **marcar una celda como test** — no hay dónde guardarlo |
| CPM del núcleo +15% contra la semana previa | 🔴 **no existe**, y con esta forma no debería: es un tripwire **de la línea** y todos los detectores son por objeto |
| pedidos de Tienda Nube/día contra la meta de Norte | 🔴 **no existe**: cruza fuera de la foto, y correr sólo sobre la foto es lo que hace que las reglas anden **sin token y sin cupo** |

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
