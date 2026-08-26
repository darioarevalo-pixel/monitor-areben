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
| `meta_ads_regla` | **0** | el motor de reglas nunca se cargó |
| `meta_ads_umbral` | **0** | ni sus cortes |
| `meta_ads_hallazgo` | **0** | ⇒ el cron corre **todas las mañanas y no produce nada** |
| `meta_ads_favorito` | **0** | el botón de favorito de la Biblioteca no se tocó nunca |
| `meta_ads_informe` | 2 | y los dos **sin publicar** |
| `meta_ads_plan` | 4 | 2 `duplicar` (8-ago) + 1 `piezas` (10-ago) + 1 del 25-ago |
| `meta_ads_accion` | 37 | **todas de UNA persona**, del 6 al 25 de agosto |

🔑 **Lo que esto dice: el módulo se usa para EJECUTAR, nunca para DECIDIR.** Las tres tablas que
convertirían datos en «qué hago hoy» —reglas, umbrales, hallazgos— están las tres en cero.

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

### ▶️ P2 — Cargar el motor de reglas (el corazón muerto)

🔴 **CORREGIDO el 26-ago: NO es sólo «mover el dial».** Medido al construir la zona: `cpa_maximo`
está declarado como umbral, tiene columna y tiene su dial en la pantalla, y **no lo consume ningún
preset** — se puede cargar y no pasa nada, justo con el corte que manda. De los seis cortes de abajo,
**dos se cargan con lo que hay y cuatro necesitan un preset nuevo**. Y antes que eso: **enganchar el
techo**, que hoy vive en `meta_ads_rentabilidad` y no llega a las reglas. Los cortes:

| corte | ¿hay preset? |
|---|---|
| 3 días de gasto con **0 compras** → apagar | ✅ `freno-emergencia` (ventana 3 + `gasto_minimo`) |
| ≥95% del tope **y** CPA < 75% del techo → escalar +20% | ⚠️ `ganador-escalar` existe pero corta por ROAS, no por CPA |
| CPA > techo × 1,5 en 5 días → apagar | 🔴 **no existe** — es el corte principal |
| celda de test a 2 días (**0-1 muere · 2-3 sigue · 4+ aprobado**) | 🔴 **no existe**, y no hay cómo marcar una celda como test |
| CPM del núcleo +15% contra la semana previa | 🔴 **no existe** (hay `compararCtr`, para fatiga) |
| pedidos de Tienda Nube/día contra la meta de Norte | 🔴 **no existe** (cruza fuera de la foto de Meta) |

⚠️ La zona ya dibuja el bloque «Qué hay que decidir» **vacío y diciendo que está vacío porque no hay
reglas cargadas** — un bloque que sólo aparece con malas noticias deja sin saber si el silencio es
«está todo bien» o «no se miró».

Con esto el cron de la mañana deja de correr en vacío.

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

### ▶️ P4 — Que salga a buscar a la gente

Los 3 hallazgos del día por mail o al buzón, a la mañana, después de la foto.

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
