# VOCABULARIO — el glosario compartido de MAKETA y el monitor

Versión: 2026-08-30

🔑 **Este archivo es el MISMO en los dos repos** (`areben-marketing` y `monitor-areben`), byte a
byte. Si cambia acá, se copia allá en el mismo día y sube la `Versión:` de arriba. Cada repo tiene
un test que lee esa línea, así que una copia que queda vieja **se cae sola**.
⚠️ **Si cambia DOS VECES en el mismo día, la versión lleva una letra** (`2026-08-29b`): una fecha
sola no distingue la copia de la mañana de la de la tarde, que es justo el día en que las dos se
creen la fuente de verdad.

⛔ **Es una REGLA y no una lista de botones.** Un `grep` a mano encuentra el renglón de hoy; lo que
hace falta es que el renglón de dentro de tres semanas —escrito por alguien que no leyó esto— caiga
solo. Por eso cada familia dice **la pregunta que decide**, no los casos.

⛔ **Los nombres del CÓDIGO no se tocan.** `borrarTarea`, `type Salida`, `href="/padron"`, la clave
`'no-salio'`: la regla es del **texto que lee una persona**. Renombrar símbolos es otra pasada, y
mezclarla acá hace un diff donde no se puede ver qué se le cambió a la gente.

🔴 **Y el caso que YA COSTÓ CARO, porque no se ve: un VERBO DE PROTOCOLO se escribe igual que una
palabra.** `action: 'borrar-promo'`, `accion: 'contenido-borrar'`, `?recurso=…` son **nombres**, ⛔ no
texto — y una barrida de vocabulario se los lleva puestos **sin que nada chille**: el typecheck no los
mira (son strings sueltos a los dos lados), el lint tampoco, y el CI sale verde.
📌 **28-ago-2026, medido: 19 verbos rotos en el monitor, commiteados y pusheados a main.** El cliente
mandaba `'eliminar-promo'` y el handler seguía esperando `'borrar-promo'`; la pantalla contestaba
«acción inválida» y no había un solo rojo.
⇒ **Lo que lo frena es un test de contrato**, ⛔ no acordarse: *los verbos que manda el cliente ⊆ los
que conoce el handler* (`tests/contrato-verbos.test.ts`). Y ese test tiene que llevar **un piso de
cuántos verbos encontró**, o el día que el barrido deje de matchear da verde mirando cero.

---

## 1 · Las seis familias

### 1.1 · Lo que SACA algo — la pregunta es: *después de esto, ¿la cosa sigue existiendo?*

🔑 Ésta es la única pregunta, y por eso se puede **verificar leyendo la acción**: si hay un `delete`
de la fila, es *eliminar*. ⛔ Estas cuatro palabras **no son sinónimos que se eligen por cómo suenan**.

| ✅ palabra | qué pasa con la cosa |
|---|---|
| **Eliminar** | **deja de existir.** Se va la fila (y su archivo). ⛔ Sin vuelta atrás |
| **Sacar** | **deja de estar acá, y sigue existiendo** en otro lado |
| **Archivar** | **sale del tablero y queda en la historia.** Se puede deshacer |
| **Descartar** | «decidimos que no». Queda la fila, con **quién y cuándo** adentro, y se puede volver |

⛔ **No se escribe: `borrar` · `quitar` · `remover` · `dar de baja`** —y como todas las de acá,
**la prohibición es del NOMBRE DEL GESTO**: botón, título, rótulo, `aria-label`, `placeholder`.
⚠️ *«dar de baja un servicio contratado»* —Metricool, una suscripción— ⛔ no es esto: no saca nada
de una lista de la app, y es la palabra que usa el que factura.
⚠️ **Y la misma excepción que §1.4: `Dar de baja EN <el sistema>`** —«Dar de baja en GN»— se queda,
porque **es la palabra del sistema de destino**: traducirla manda a buscar un botón que allá no
existe. ⛔ `Dar de baja` a secas, sobre algo de esta app, no pasa.

🔴 **Y la confirmación NOMBRA lo que va a dejar de existir, ⛔ nunca un pronombre.** «¿Sacarla?» no
dice **qué** ni **cuánto**: se lee igual arriba de una foto que arriba de una campaña con doce
piezas. Va **«¿Eliminar esta referencia?»**, **«¿Eliminar «Día de la Madre»?»** — y cuando eliminar
arrastra algo, la segunda línea dice qué (*«quedan sueltas las 3 piezas que la llevan»*).

### 1.2 · Lo que está por hacerse

| ✅ | ⛔ no se escribe |
|---|---|
| **Pendiente / Pendientes** (sustantivo) | como título: «Qué falta ahora» · «Lo que falta» · «Todo lo que falta» · «sin terminar» · «sin hacer» |

⚠️ **`falta` sobrevive, pero SÓLO como verbo adentro de una ayuda**: *«Falta el enlace.»* está bien.
Lo que no puede es ser el **nombre** de una sección ni el **título** de un bloque.

### 1.3 · Lo que ENTRA a una lista — la pregunta es: *¿de dónde viene la cosa?*

| ✅ palabra | de dónde viene |
|---|---|
| **Agregar** | ya existía y se suma acá (una línea, una etiqueta, una variante) |
| **Crear** | **nace ahora**, no existía antes (una campaña, una pieza, una tarea) |
| **Cargar** | **viene de afuera**: un archivo, una foto, un escaneo, una planilla |

⛔ **No se escribe: `Sumar` · `Anotar` · `Añadir` · `Darlo de alta` · `Traer`.**

🔴 **`Traer` entró el 30-ago-2026, y lo abrió Bruno leyendo una pantalla: *«traer de Google Drive…
¿traer?»*.** Es exactamente esta familia —algo que **viene de afuera**— así que la palabra es
**Cargar**. 📊 Y acá la palabra SÍ es el gesto, medido antes de prohibirla: **20 rótulos en 11
secciones y los 20 son lo mismo** (el stock de GN, las ventas de Tienda Nube, un producto, los
archivos de Drive). ⇒ ⛔ no hace falta ningún carve-out, y por eso entra como palabra y no como
gesto — que es lo contrario de lo que pasó con `Mandar` y con `Poner`.

🔴 **`Poner` se sacó de esa lista el 29-ago, y ⛔ no es una excepción tibia: la regla estaba MAL
ESCRITA.** Esta familia es *lo que ENTRA A UNA LISTA*, y `poner` casi nunca es eso: *«Ponele un
título»*, *«Poné el nombre del editor»*, *«Poner»* al lado de un campo de fecha son **pedirle un
valor a un campo**, que no es meter nada en ninguna lista. ⇒ `Poner` ⛔ no se escribe **cuando la
cosa entra a una lista** —ahí va `Agregar`, y por eso el botón de las etiquetas dejó de decirlo—, y
**se queda** cuando lo que se pone es el valor de un campo.
📌 Es la segunda vez que pasa lo mismo: `Mandar` (§1.6) también prohibía la palabra en vez del
gesto, y de 99 apariciones sólo 17 lo eran. **Una regla que nombra una palabra y no un gesto rompe
frases que estaban bien**, y el que la aplica no tiene cómo saberlo hasta que las lee todas.

### 1.4 · Lo que GUARDA

| ✅ palabra | cuándo |
|---|---|
| **Guardar** | los datos que se escribieron quedan escritos |
| **Confirmar** | se cierra una **decisión** (una idea pasa a pieza, se aprueban los 12 diseños) |

⛔ **No se escribe: `Grabar` · `Aplicar`** (los dos son **Guardar**).

🔴 **La excepción, y es una sola: `Aplicar EN <el sistema>`.** Un gesto que **escribe afuera** —el
ajuste que va a Gestión Nube, la categoría que va a Tienda Nube— ⛔ no es guardar, y llamarlo
«Guardar» promete que queda acá. Ahí `Aplicar` se queda **con una condición: el rótulo NOMBRA DÓNDE**
—«Aplicar en Tienda Nube», «Aplicar en TN»—, porque es la mitad de la pregunta que el usuario hace
antes de apretar un botón que toca otro sistema. ⛔ `Aplicar` a secas no pasa.
⚠️ **Y antes de escribirlo, mirar qué hace de verdad**: el «Aplicar ajuste» de los Conteos ⛔ no
aplicaba nada —relee el stock y **arma un Excel**—, así que quedó **«Generar el ajuste»**.

### 1.5 · Lo que CAMBIA algo escrito

| ✅ | cuándo |
|---|---|
| **Editar** | se abre la cosa para reescribirla |
| **Cambiar** | ⚠️ sólo con un objeto concreto que se **reemplaza entero**: «Cambiar la contraseña» |

⛔ **No se escribe: `Modificar` · `Retocar`.**

### 1.6 · Lo que SALE — la pregunta es: *¿quién lo recibe?*

| ✅ palabra | quién lo recibe |
|---|---|
| **Publicar** | **el público**: una red, la tienda, el sitio |
| **Enviar** | **una persona o un área**: un WhatsApp, un mail, «Enviar a Marketing» |
| **Subir** | ⚠️ **nadie**: es cargar un archivo a la app. ⛔ No se usa para "mover hacia arriba" |

⛔ **No se escribe: `Postear` · `salida` (en pantalla) · `sale` / `salió` / `salieron` /
`que salga`** — el verbo de estas apps es **publicar**, y ya está en el nombre de la pantalla y del
modelo. ⛔ **`link` tampoco**: es **enlace**.

🔴 **Y `sale` está prohibida SÓLO como nombre del gesto de publicar. Es la tercera vez que esta
regla nace nombrando una palabra en vez de un gesto** —ya pasó con `Mandar` (§1.6) y con `Poner`
(§1.3)—, y esta vez se midió antes de barrer. 📊 30-ago-2026: **32 rótulos con `sale`/`salió`, y casi
ninguno es publicar**:
- **`sale` es un SUSTANTIVO del negocio**: la campaña de liquidación. «Precio de sale», «Sale
  invierno ago-2026», «Sacar del sale». ⛔ Traducirlo rompe el nombre de una cosa que existe.
- **`salir` es DESPACHAR o VENDERSE**: «Cuándo sale» (un envío), «Los que más salieron» (unidades).
- **Y `sale de` es PROVENIR**: «Sale de la foto diaria, no de Meta». Nada que ver con publicar.
⇒ 🔑 **Antes de barrer una palabra de este archivo, contar cuántas de sus apariciones son el gesto.**
Si son pocas, la que está mal escrita es la regla.

🔴 **`Mandar` está prohibido SÓLO como NOMBRE DEL GESTO** —botón, título, rótulo— y ahí va
**Enviar**: «Enviar a liquidación», «Enviar a Drive», «Enviar el link». ⚠️ **En la prosa se queda**,
y esto ⛔ no es una excepción tibia sino la regla bien dicha: *«Te mandamos la etiqueta»* en un
mensaje a un cliente es castellano natural, y volverlo «Te enviamos» lo endurece sin ganar nada.
📌 Medido el 28-ago en el monitor: de **99 apariciones de «mandar», sólo 17 nombraban un gesto**.

⛔ **Y ojo con el otro verbo, que se escribe igual**: «el corte que **manda**», «Gestión Nube es quien
**manda** sobre el precio» son *gobernar*, ⛔ no *enviar*. Una barrida que no los distinga rompe
frases que estaban bien.

---

## 2 · Las palabras que hoy significan DOS COSAS

🔴 **Una palabra con dos significados es peor que dos palabras para lo mismo**: la segunda confunde
al que escribe, la primera confunde al que lee. ▶️ **Cada una necesita que Bruno bautice el otro
sentido**, y hasta entonces ⛔ no se toca el título.

| palabra | los dos (o tres) sentidos | dónde |
|---|---|---|
| **Ingresos** | la importación que **viene** (`ingresos`) · lo que **ya entró** (`recepciones`) | monitor: dos filas contiguas en Compras |
| **Actividad** | la **bitácora**: lo que ya pasó (MAKETA) · cada **paso de un evento** de la Agenda, con su dueña y su día (monitor) | una en cada app, ⛔ nunca en la misma pantalla |
| **sale** | la **campaña de liquidación** (sustantivo, del negocio) · el verbo **salir**: despachar, venderse, provenir · y el gesto **publicar**, que es el único prohibido | Liquidación · Comisiones · Envíos · Meta |

🏁 **«Actividad» se queda con LAS DOS acepciones — decisión de Bruno, 29-ago-2026.** Es el primer
homónimo que ⛔ **no** se cierra renombrando a uno de los dos, y el motivo es que **viven en apps
distintas y no se leen juntas nunca**: en MAKETA es el **nombre propio de una pantalla del menú**, en
el monitor un **sustantivo común adentro de la tarjeta de un evento** (`+ Actividad`). La alternativa
era **«Paso»** —es lo que dicen los manuales: *«los nueve pasos de la sesión de fotos»*— y se
descartó porque una actividad de la Agenda **tiene dueña y se tilda**: es trabajo asignado, ⛔ no el
renglón de un instructivo.
⚠️ **Está anotada acá justamente para que nadie la "arregle" sola.** Quien la encuentre y la lea como
un descuido, que lea esta línea antes de renombrar nada.

🏁 **`Faltantes` y `clavado` se cerraron el 29-ago, y los dos igual que en MAKETA: sin bautizar nada.**
La palabra **se la queda el sentido que ya la tenía en el menú**, y el otro se dice con las palabras
que la pantalla ya usaba:
- **Faltantes** queda para *lo que el cliente pide y no tenemos* (sección `pedidos-clientes`, decisión
  de Bruno). En **Exhib** era *lo que no se escaneó* ⇒ **«Sin escanear»**, que es lo que dice la
  pantalla dos renglones más abajo («todo escaneado ✅»). En **Recepciones** ya decía **«Unidades que
  faltaron»**, así que ⛔ no había nada que tocar.
- **clavado** queda para *el producto sin rotación* (`components/memo/`, decisión de Bruno). La
  *cuenta atada a una sola marca* pasó a decirse **«el que tiene una sola marca»**, que es lo que la
  ayuda quería decir. ⚠️ En `lib/permisos.core.js` la palabra sigue viva **en comentarios**, y ahí
  ⛔ no se toca: la regla es del texto que lee una persona.

🏁 **Los dos de MAKETA se cerraron el 29-ago, y ⛔ ninguno de los dos hizo falta bautizarlo**: los dos
tenían **un sentido que ya estaba prohibido por otra regla**, así que la palabra no era ambigua, era
incorrecta. ⇒ **antes de mandar a bautizar un homónimo, mirar si una de las dos acepciones ya está
decidida en la §1**.
- **a mano** — el segundo sentido vivía en un TÍTULO («Lo que se escribe a mano»), y §3 ⛔ no deja que
  un título sea una frase. Con el título en **«Título, enlaces y texto»**, «a mano» quedó queriendo
  decir *manualmente* y nada más.
- **Subir** — el segundo sentido eran los `aria-label` de dos flechas de orden, y §1.6 ya reservaba
  `Subir` para **cargar un archivo**. Quedaron **«Mover … arriba»** y **«Mover … abajo»**.

---

## 3 · Las reglas de forma

| regla | ✅ | ⛔ |
|---|---|---|
| **Botón = verbo en infinitivo** | `Eliminar` · `Guardar` · `Publicar` | `Eliminá` · `Sacalo` · `Dale` |
| **Título de sección = sustantivo, ⛔ no frase** | `Pendientes` · `Retornos` · `Novedades` | `Qué falta ahora` · `Lo que tiene que volver` · `Lo que se viene` · `Lo que se escribe a mano` |
| **Mayúscula sólo en la primera palabra** | `Nuevo pendiente` | `Nuevo Pendiente` |
| **Sin jerga interna en pantalla** | la palabra del negocio | `sembrar` · `corrida` · `padrón` · `bitácora` · `copy` · `moodboard` |

🔴 **La jerga no se traduce a otra palabra: se dice QUÉ PASA.** 29-ago, y el oráculo fue Bruno
leyendo el pendiente: *«no sé lo que es corrida de un reloj»*. Buscarle un sinónimo —«pasada»,
«vuelta»— deja la misma frase sin información. ⇒ *«se publica en la próxima corrida»* pasó a **«se
publica dentro de los próximos 5 minutos»**, *«se salteó al menos una corrida»* a **«se salteó al
menos un día»**, y *«lo renueva la corrida diaria de las 05:30»* a **«se renueva solo todos los días
a las 05:30»**. 🔑 **La frase de reemplazo dice más que la que tenía el nombre correcto.**
⚠️ **Y `padrón` → Equipo, `bitácora` → Actividad, `copy` → Texto salen del MENÚ**: si el menú ya le
puso nombre a la sección, la pantalla ⛔ no puede llamarla de otra manera adentro.

⛔ **Lo que imprime un SCRIPT no es una pantalla.** `lib/relojes/*` escribe en el log del job y en el
JSON que contesta el cron: lo lee quien va a arreglar el reloj, no quien usa la app — la misma
categoría que un comentario. Ahí `corrida` se queda. ⚠️ Y es **una carpeta y no un total**: el día
que un reloj le escriba a una persona, ese texto va a otro lado. Cada repo lo clava con un test que
además exige que **la excepción siga excusando algo**, o se saca.

### 3.1 · Las cuatro voces, y cuándo va cada una

🔴 **⛔ NO se saca el voseo. Formalidad es la palabra, no el trato.** Una app que empieza a tratar de
usted a tres personas que se conocen suena peor, no mejor.

| voz | dónde vive | ejemplo |
|---|---|---|
| **infinitivo** | botones y títulos de acción | «Guardar» · «Eliminar la campaña» |
| **voseo imperativo** | ayudas, estados vacíos, mensajes de error | «Cargá al menos una cantidad.» |
| **descriptivo** | descripciones de sección, subtítulos | «Ventas por color y análisis de agotamiento» |
| **primera persona, en pasado** | ⚠️ sólo la confirmación de un **hecho que ya ocurrió** | «Sí, ya lo despaché» · «Ya la publiqué» |

⚠️ **La cuarta es legítima y por eso está escrita**: confirma que algo **pasó afuera** de la app, no
pide una acción. Sin esto, alguien la "corrige" a infinitivo y el cartel pasa a prometer que la app
va a despachar el pedido.

### 3.2 · Los vacíos NOMBRAN de qué están vacíos

⛔ «No hay nada.» · «No queda nada.» ✅ «No queda ninguna publicación pendiente.»

Un cartel de vacío es la única frase de la pantalla que se lee **cuando no hay con qué compararla**:
si no nombra de qué está vacío, se confunde con una consulta que se cayó.

### 3.3 · Cuándo un gesto va SÓLO CON EL ÍCONO

🔑 Un ícono ⛔ no es un sinónimo del verbo: es el mismo verbo dibujado. Por eso la palabra **se muda
al `aria-label`**, ⛔ no desaparece.

| | con la palabra al lado | sólo el ícono |
|---|---|---|
| **cuándo** | el gesto es **uno** en toda la pantalla | el gesto se repite **una vez por fila** |
| **por qué** | ahí la palabra es lo único que dice qué hace ese botón rojo | acá diez «Eliminar» apilados pesan más que la lista que hay que leer |

🔴 **Y el rótulo NOMBRA la cosa**: `aria-label="Eliminar"` repetido en diez filas son diez botones
idénticos para quien no ve la pantalla. El rótulo va entero, con las comillas angulares:
**Eliminar «el nombre de la cosa»**. Es lo mismo que ya dice la pregunta del diálogo, aplicado al
disparador.

---

## 4 · Cómo se verifica

Cada repo tiene su test, y ⛔ ninguno de los dos puede nacer en verde:

```
# MAKETA
npx vitest run --silent=true tests/vocabulario.test.ts
# monitor
npx vitest run --silent=true tests/vocabulario.test.ts
```

🔑 **El mecanismo, y por qué no es un `grep`**: se sacan los comentarios y después se juntan **todos
los identificadores** que contienen la raíz prohibida. Un símbolo de código es un identificador; una
frase de pantalla también parte en identificadores (`borrarla`, `Borrar`, `borran`), y por eso
**cualquiera de las dos cosas nuevas rompe el test**: un texto nuevo, porque no está en la lista; una
función nueva `borrarX`, porque tampoco — y ahí quien la escribe agrega el nombre a mano, que es un
gesto deliberado y de una línea.

⛔ **Los comentarios quedan afuera a propósito**: cuentan la historia («decía Borrar y estaba mal») y
esa historia no se puede reescribir sin perderla.

🔴 **Y una lista de prohibidos NO alcanza sola: el cero afirma.** «Cero `borrar`» es exactamente lo
que contesta una app **sin ningún botón**. Por eso cada test lleva además la lista de **las pantallas
donde algo deja de existir**, que tienen que **decir** la palabra. ⚠️ Y es una lista de archivos, ⛔
no un total: un piso de «diez en todo `components`» deja que una pantalla entera se quede sin la
palabra sin que nada falle.
