# AREBEN — LO COMÚN: las palabras y la forma de trabajo de todos los sistemas

Versión: 2026-11-25 (en el repo `monitor-areben` desde el 23-nov; reemplaza a `VOCABULARIO.md`)
Dueño: **Areben Gestión** (el ERP; repo `monitor-areben`). Decidido por Bruno el 23-nov-2026: *«ordenar todo desde ERP para
el resto de los sistemas, y que sea uniforme la forma de trabajo»*.

🔑 **Este es EL archivo.** Reemplaza a `VOCABULARIO.md` (que queda adentro, entero, en la Parte 2) y al glosario/manual de
Darío (que se funde acá cuando llegue). Cada sistema lo **copia o lo lee de acá**; ⛔ ningún sistema tiene su versión propia.
Si una palabra o una regla cambia, cambia ACÁ primero y después se copia.

---

## A · A qué sistemas aplica

| sistema | repo / dónde | quién lo toca | cómo recibe este archivo |
|---|---|---|---|
| **Areben Gestión** (ERP + monitor) — **el dueño** | `monitor-areben` | Bruno, Darío, sesiones de Claude | es la fuente: `AREBEN-COMUN.md` en la raíz del repo (desde 23-nov) |
| **Maketa** (marketing: piezas, publicación, informes) | `areben-marketing` | Bruno, sesiones de Claude | copia idéntica (hoy `VOCABULARIO.md`) |
| **Catálogo / tienda** (lo que escribe en Tienda Nube) | `bdi-catalogo` | Darío | ❓ hoy ⛔ tiene copia: sumarla |
| **Lo de Darío** (su glosario/manual y «muchas otras cosas») | notas de sus sesiones + `~/Bruno/erp-textos/` | Darío | ✅ fundido en §E (23-nov) |
| **Logística** (la app de Ger) | ❓ | Ger | ❓ preguntar si se suma |
| **Producción / dashboard** | `areben-produccion`, `areben-dashboard*` | el hermano de Bruno | ❓ preguntar si se suma |

⛔ **HC Arévalo** (la app médica) ⛔ es de Areben: queda afuera.

---

## B · Cómo se cambia este archivo

1. **Cada corrección de Bruno (o de Darío, con el OK de Bruno) sobre una palabra o una regla es UNA FILA acá, en el
   momento** —⛔ un arreglo suelto en una pantalla ni una línea en el chat—. Si no se escribe acá, la próxima sesión la
   vuelve a escribir mal (Bruno, 12-oct: *«siempre que hago código, siempre tengo que estar arreglando eso»*).
2. Se sube la `Versión:` de arriba (fecha; si cambia dos veces el mismo día, con letra: `2026-11-23b`).
3. **El mismo día se copia a cada sistema de la tabla A** y se corre el `diff` contra la fuente. Una copia vieja es peor que
   ninguna: en ese momento las dos se creen la verdad.
4. Una regla que cambia **se reescribe** (⛔ se agrega otra al lado contradiciéndola) y se dice desde cuándo y quién.

---

## C · La forma de trabajo (la misma en todos los repos)

### C.1 · Dónde se anota cada cosa
- **`PENDIENTES.md`** (uno por repo o por área): **sólo lo abierto, UNA línea por cosa**, con su dueño. Al cerrar algo
  **se borra la línea** (la historia va a la bitácora). Es el ÚNICO lugar donde se pregunta «¿qué falta?».
  Leyenda: ▶️ hay que hacerlo · ⏳ espera a otro · ❓ decisión sin tomar · ✅ hecho (se borra pronto).
- **`bitacora.md`**: el relato largo (una medición, un oráculo, una decisión con contexto), al final, con fecha.
- **`reglas-vigentes.md`**: lo que Bruno (o Darío) decidió y **sigue valiendo**. Se lee al entrar.
- **Lo DICTADO por Bruno se anota en el momento**, con sus palabras entre comillas.

### C.2 · Cómo se le contesta a Bruno
- **En castellano**, corto (dos líneas cuando alcanza), sin jerga técnica.
- **Medir, no estimar**: cuánto tarda, cuántas son, dónde se va el tiempo. Un número dice qué se contó.
- ⛔ **Deducir una decisión**: si hay que elegir, se pregunta **con opciones** y una recomendada.
- ⛔ **Rondas de aprobación**: lo pedido se hace; se pregunta sólo lo que de verdad es de Bruno.
- Si hay que correr algo a mano: **el próximo comando completo, uno por vez**.

### C.3 · Antes de decir «anduvo», «está» o «no se puede»
- **Nombrar el oráculo antes**: qué se va a mirar para saber que anduvo, y que venga **por otro camino** que el cambio.
- **Medir el EFECTO en producción después de publicar** (⛔ el mensaje de «publicado»: el deploy viejo puede seguir
  sirviendo minutos después).
- **El cero afirma**: «0 errores» también lo contesta una pantalla vacía. Se mira que haya algo.

### C.4 · El código compartido (varias personas y sesiones en el mismo repo)
- **Puede haber otra sesión en el MISMO repo al mismo tiempo.** Cada trabajo va en **su propia copia (worktree) desde
  `origin/main`**; ⛔ se trabaja sobre el `main` local de otro.
- ⛔ **Push forzado, ⛔ pisar lo de otro.** Si `main` avanzó: rama nueva desde `main` con el commit encima.
- **Lint y tests antes de subir.** El CI corre typecheck, lint, tests y build: ⛔ se publica en rojo.
- **Publicar** el monitor/ERP: rama con CI verde ⇒ **Actions › Publicar** (`areben-motor`, `repo=monitor`), **primero
  seco, después «escribir»**. En Maketa, **pushear a `main` YA es publicar**.

### C.5 · Las pantallas
- La palabra la elige **el negocio** (Parte 2, §5), ⛔ quien lo programa. Botones en **infinitivo**; voseo sólo en ayudas.
- **Sin siglas** (Tiendanube, ⛔ TN; Nota de crédito, ⛔ NC) y **sin jerga de la construcción** (motor, espejo,
  homologación, sesión A…).
- Un nombre de pantalla que **no está** en la Parte 2 **se le pregunta a Bruno antes de publicar**.
- **Las novedades** cuentan **qué se incorporó y cómo se usa**, ⛔ cómo está hecho por detrás. Lo que es sólo para Admin
  ⛔ lleva novedad.

### C.6 · Datos: el ERP es la fuente
- **Ventas, stock, clientes y cobros viven en Areben Gestión.** Los demás sistemas **leen del ERP** (por su API), ⛔ de
  tablas espejo (Bruno 15-nov: *«hay que pasar todo al ERP… no podemos depender de los espejos»*).
- **El stock lo escribe el ERP y el ERP se lo manda a Tienda Nube** (9-nov: *«ese es el flujo»*).
- **Gestión Nube ya no se usa** (BDI cortada el 14-nov, Zattia el 22-nov; suscripciones canceladas el 23-nov). Lo viejo, si hace falta nombrarlo, es «Sistema anterior».
- Lo que **escribe** en un sistema vivo (stock, tienda, plata, facturas con CAE) se prueba sobre UNA cosa y se mide antes
  de hacerlo con todas.

### C.7 · Secretos, mails y plata
- **Contraseñas, tokens y llaves van a Bitwarden** (⛔ en el chat, ⛔ en el repo, ⛔ en un .md).
- **Los mails salen SIEMPRE por Amazon SES**, ⛔ Resend.
- Lo que **gasta plata** o pide un acceso nuevo se le pregunta a Bruno antes, con el costo.

---

## D · Lo que falta para que esté completo

- ✅ **Lo de Darío llegó: es la §E** (23-nov). Vivía en las notas de sus sesiones de Claude en su Mac y en los PDFs de
  textos del ERP (`~/Bruno/erp-textos/`). Bruno aprobó toda la §E el 23-nov.
- ❓ Si Logística (Ger) y Producción/dashboard se suman a la tabla A.
- 🔴 **Las copias de hoy ya no coinciden** (medido 23-nov):
  - `areben-marketing` está atrás: le falta lo que el ERP sumó después del 15-nov (`SKU`/`Código de barras` de Darío y
    4 filas: `Vista previa`, `Envío`, `Factura A/B`, `Eliminar ajuste`; además la fila de `Rutas` cambió) y **todavía dice «`código` ⛔ `SKU`»**, que
    Darío reemplazó el 20-nov.
  - El ERP sumó filas hasta el 23-nov **sin subir su `Versión: 2026-11-15`**.
  - En la Mac de Bruno, `areben-marketing` tiene cambios **sin guardar** de otra sesión (versión `2026-10-12c`), más
    viejos que los dos.
- ✅ 23-nov: este archivo entró al repo del ERP y reemplazó a `VOCABULARIO.md` (los tests de vocabulario y de términos
  lo leen igual: la Parte 2 conserva su forma). Lo editan Bruno y Darío ACÁ; ⛔ se pasa por mensaje. Bruno lo copia a MAKETA.

---

## E · Lo de Darío (23-nov-2026)

### E.1 · Palabras que Bruno ya aprobó (23-nov, con Darío al lado)

✅ **Tanda 1 (23-nov, Areben Gestión)**: Ubicación · Origen/Destino · Transferir · «Opcional» adentro · Sistema anterior
(⛔ Gestión Nube) · «Visitas y compromisos ↗» ya están en la Parte 2 §5, junto con las pantallas. ⏭️ Faltan: **Posición**
(tanda 2) y **Tiendanube** junto (tanda 3). Regla: la fila entra a la Parte 2 en la MISMA tanda que cambia las pantallas.

| se dice | ⛔ no se dice | qué es | quién |
|---|---|---|---|
| ✅ **Ubicación** | `Depósito` (como nombre del lugar) | Local · Depósito · Evento. Evita «Depósito: Depósito», y Local y Evento ⛔ son depósitos | Darío propone · Bruno ✅ |
| ✅ **Posición** | `Ubicación` (en la estantería) | el lugar exacto en la estantería del depósito (hoy «Ubicaciones depósito»). ⚠️ El chequeo de exhibición ⛔ cambia: habla de exhibidores | Darío propone · Bruno ✅ |
| ✅ **Origen** · **Destino** (dos columnas) | `De → A` · `Recorrido` | Transferencias (Destino ya se usa en Ingresos de mercadería). Reemplaza la nota «"Ruta" sigue siendo "De → A"» de la fila de Rutas | Bruno ✅ («recorrido no es claro») |
| ✅ **Transferir** | `Mover` | siempre | Darío 18-nov · Bruno ✅ |
| ✅ **«Opcional» adentro del campo** | `(opcional)` en el rótulo | reemplaza la fila de Bruno del 15-nov | Darío · Bruno ✅ |
| ✅ **Tiendanube** (junto, el nombre comercial) | `Tienda Nube` · `TN` | también en C.5 | Bruno: «definí vos» |
| ✅ (nada; o **Sistema anterior** si hace falta nombrarlo) | `Gestión Nube` · `GN` | pase hecho y **suscripciones canceladas** (23-nov). Reemplaza las filas que hoy lo dan por válido (`Tienda Nube · Gestión Nube · Mercado Libre`, y «el nombre de cada lado» en Diferencias) | Bruno ✅ |

🏁 **Pantallas por Gestión Nube** (Darío, 23-nov): **Stock › Diferencias se saca entera** (sólo compara contra Gestión
Nube; ⚠️ apagar también su cálculo diario, que lee Gestión Nube). **Comparación y Conciliación quedan** (comparan contra
Tiendanube y Mercado Libre: avisan de pedidos pagados sin venta y SKU que no existen) **sin la columna ni el cuadro de
Gestión Nube**. Lo que queda con Gestión Nube en Cajas, Facturación, ficha de venta, Transferencias viejas y Cambio: se saca.

### E.2 · La regla madre de Darío: **decir el dato, ⛔ explicarlo**

Darío, 16-nov: *«busca explicar todo muy profundo y no siento que se necesite; hay cosas que con una palabra se entiende»*.
Ya lo había pedido el 11/12-oct (*«usamos pocas palabras formales y muchas informales»*, *«mucho texto, muy repetitivo»*).
- Sin párrafos de ayuda; etiquetas de 1–3 palabras; ⛔ repetir lo que ya dice el botón, el título o una columna.
- ⛔ Ayuda debajo del campo ⇒ lo que va **adentro** del campo.
- ⛔ Cuadros de resumen que repiten las pestañas.
- ⛔ Un aviso fijo para lo normal: el cartel fijo es **sólo para lo raro**; lo normal se dice al confirmar.
- ⛔ Primera persona en avisos («No encontré» ⇒ «Ningún producto coincide con…»).
- ⛔ Ofrecer lo imposible: el sistema no deja hacer lo que no se puede (transferir sin stock en el origen).

### E.3 · Patrones que Darío ya eligió en las 6 pantallas del ERP (20 al 23-nov) — ✅ Bruno los aprobó (23-nov) · ✅ en la Parte 2 §5 desde el 23-nov

Salen de los PDFs aprobados de Inicio, Ventas, Productos, Stock, Clientes y Configuración (~500 textos), y ya están
publicados en esas pantallas. Escribirlos acá es para que **la sección nueva nazca así** y ⛔ vuelva a escribirse larga.

| se dice | ⛔ no se dice |
|---|---|
| «Ningún producto coincide con «X».» | «No hay productos con ese nombre…» · «Nada con esa búsqueda» |
| «Leyendo…» | «Leyendo el stock…» · «Cargando transferencias…» |
| «No se pudo: volvé a intentar.» · «Todavía no disponible.» (el detalle, sólo para Bruno) | texto técnico · «falta actualizar la base (026)» · «… inválido» |
| «Sin permiso para editar.» | «Tu rol no edita ventas» |
| «120 de 2.300» | «120 de 2.300 · el stock llega hasta… · leída…» |
| botones cortos: «Exportar» · «Actualizar» · «Ver venta» · «Imprimir ticket» · «Guardar» | «Exportar los elegidos» · «Volver a leer» · «Abrir la ficha» · «Guardar el WhatsApp» |
| enlace a otra sección: «Reposición ↗» · «Ingresos ↗» | «Abrir Reposición en el monitor ↗» |
| «Nueva regla» · «Nuevo ajuste» (el botón que crea) | «Agregar regla» |
| «Activa / Inactiva» · «Activar / Desactivar» | «Prendida / Apagada» · «Prender / Apagar» |
| columnas «Fecha» · «Ubicación» · «Saldo» · «Responsable» · «Estado» · «Unidades» | «Cuándo» · «Dónde» · «Queda» · «Quién» |
| «En camino» | «En tránsito» |
| «Descartado» (ajuste) | «Rechazado» |
| «A favor» · «Debe» · «Antigüedad» · «Movimientos» | «Con saldo a favor» · «Pendiente» (para plata) · «La más vieja» · «Mayor» |
| «—» en una celda vacía | «Ninguno» · «Sin historial» · «Sin cargar» |
| confirmación = una pregunta + el cambio: «¿Guardar el precio Local?» «$ 8.800 → $ 9.680» | «¿Seguro que querés…?» + explicación |
| éxito corto: «Cobro de $ X registrado.» · «No se deshace.» | la explicación de lo que pasó por detrás |
| «Visitas y compromisos ↗» | «Ver visitas y compromisos ↗» (cambia la fila de Bruno del 30-oct) |

### E.4 · La forma de las pantallas del ERP (Darío, desde 18-nov; molde: Transferencias)

- **Botones**: principal índigo sólido; secundarios blancos; eliminar/anular rojo de borde y separado. ⛔ Verde para
  confirmar (verde = completo). El botón dice **qué hace** («Recibir», ⛔ «Confirmar»).
- **Acciones de una ficha arriba a la derecha** (Editar índigo + Eliminar rojo de borde; el resto en ⋯).
- **El detalle en VENTANA** de dos columnas, ⛔ barra lateral.
- **Editar en la misma fila** (lápiz); formularios repetidos ⇒ **una tabla con un solo «Guardar N cambios»**.
- **Pestañas** subrayadas con número (rojo sólo si es problema); muchas ⇒ agrupar en «Para revisar».
- **Tablas mínimas**: la diferencia en rojo **sólo si no coincide**; ⛔ número grande que priorice una lista.
- **Ícono solo** cuando se repite por fila; si es uno, ícono + palabra (ya en Parte 2 §3.3).
- El ERP se piensa para **computadora**.
- Estética: la del Monitor (índigo, DM Sans; `app/tokens.css`).

---

# PARTE 2 · EL VOCABULARIO (completo, tal como está hoy en Areben Gestión)

# VOCABULARIO — el glosario compartido de MAKETA y el monitor

Versión: 2026-11-23b

🔑 **Este archivo es el MISMO en los dos repos** (`areben-marketing` y `monitor-areben`), byte a
byte. Si cambia acá, se copia allá en el mismo día y sube la `Versión:` de arriba. Cada repo tiene
un test que lee esa línea, así que una copia que queda vieja **se cae sola**.
🔴 **12-oct-2026: ⛔ se cayó sola.** Las dos copias decían `2026-08-30` y ya eran distintas: MAKETA había
sumado «título en infinitivo» (6-oct) y el monitor «la palabra formal» (11-oct), cada uno en su repo.
El test mira que la línea TENGA forma de fecha, ⛔ que sea la misma que la del otro repo (el CI de uno
⛔ ve el otro). ⇒ **Quien edita este archivo lo copia al otro repo en el mismo commit de trabajo, y
corre `diff` entre los dos** (§5 dice cómo).
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
| **Título de sección = sustantivo, ⛔ no frase** (🔑 Bruno, 12-oct-2026: *«más alineado a sustantivos»*) | `Pendientes` · `Promociones` · `Logo del ticket` · `Política de cambio` · `Billetes de la calculadora` | `Qué falta ahora` · `Lo que se viene` · `Elegir los productos en oferta` · `Cargar el logo de Zattia` |
| **Infinitivo SÓLO si es la acción propiamente dicha** (Bruno, 12-oct) | `Cobrar` · `Eliminar` · `Cerrar caja` | un título que describe lo que hay adentro puesto como verbo: `Ver el historial` · `Escribir la política de cambio` |
| **Mayúscula sólo en la primera palabra** | `Nuevo pendiente` | `Nuevo Pendiente` |
| **Sin jerga interna en pantalla** | la palabra del negocio | `sembrar` · `corrida` · `padrón` · `bitácora` · `copy` · `moodboard` |
| **La palabra formal del oficio, ⛔ no la coloquial** | `Exhibido` · `Retirado` · `Pendiente de exhibición` · `Variantes duplicadas` | `Colgado` · `Lo saqué` · `Falta colgar` · `Sobra (repetido)` |

🔴 **12-oct-2026, Bruno: ⛔ es una cosa o la otra, es un equilibrio — y queda «más alineado a sustantivos».**
Se probó en la Caja con el criterio «¿la sección es para mirar o para hacer?» y ⛔ era el suyo: «Logo del
ticket», «Política de cambio», «Billetes de la calculadora» y «Promociones» se quedaron en sustantivo aunque
se configuran. El infinitivo va cuando el texto ES la acción: *«eliminar es eliminar, como acción; cobrar
lo mismo»*. 🏁 **Y MAKETA también vuelve al sustantivo** (Bruno, 12-oct): «Pendientes», «Bajada», «Trabajo (3/5)»,
«Publicación», «Contenido», «Archivo», «Campaña», «Prioridad», «Aprobaciones», «Historial», «Temas
propuestos», «Mi bloc», «Participantes», «Grabación», «Reunión anterior», «Resumen»; los paneles de alta,
«Nueva campaña» / «Nueva pieza». ⛔ Volver a las FRASES de antes del 6-oct («Lo que se habló y lo que
pasó»): son palabras sueltas. Queda en infinitivo «Archivar la pieza» (la sección ES la acción) y todo
panel que abre UNA acción («Eliminar la idea»). Lo cuida `tests/titulos-sustantivo.test.ts` de MAKETA.
⇒ Lo que sigue es la historia del 6-oct:

🆕 **6-oct-2026 (MAKETA): el título de sección pasó de sustantivo a INFINITIVO** (Bruno: *«sumemos a todo esto
las terminaciones en infinitivo… lo que se habló no me convence como sección, y así un montón de
cosas»*). Lo cuidaba `tests/titulos-infinitivo.test.ts` de MAKETA (12-oct: pasó a `titulos-sustantivo`). ⛔ **Siguen en
sustantivo**: el título de cada PANTALLA (es el nombre del menú: `Tablero`, `Calendario`), las
agrupaciones de una lista (`Próximas`, `Se pasaron`), los títulos de un gráfico y los carteles de error.
🏁 **12-oct: ⛔ rige más, en ninguna de las dos apps** (ver arriba).

🔴 **Darío, 11-oct: *«usamos pocas palabras formales y muchas palabras informales»*.** Salió del
ticket del chequeo de exhibición. ⚠️ **⛔ No choca con «sin jerga»**: la palabra formal es la que
usa el negocio y entiende cualquiera (`Exhibido`), la jerga es la de adentro de la app (`corrida`).
Y ⛔ no toca el trato (3.1): lo que se formaliza es **la palabra**, ⛔ el voseo.

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

---

## 5 · Los términos del negocio — cada pantalla dice la palabra que eligió el negocio

🔴 **12-oct-2026, Bruno: *«siempre que hago código, siempre tengo que estar arreglando eso»*.** La §1
cuida los VERBOS de los botones; las palabras del negocio (`caja` y ⛔ `turno`, `oferta` y ⛔ `feria`)
⛔ estaban escritas en ningún lado que una sesión lea antes de escribir, y nada las controlaba: cada
corrección de Bruno quedaba en el chat y la sesión siguiente la volvía a escribir mal.

🔑 **Cada corrección de Bruno sobre una palabra es UNA FILA de esta tabla, en el momento** —⛔ un
arreglo suelto en la pantalla—. La fila la lee el test de términos de cada repo
(`tests/terminos.test.ts` en el monitor): saca del código **sólo el texto que lee una persona** (los
strings y el texto de JSX con forma de frase, con el parser de TypeScript; ⛔ los nombres del código) de
las carpetas de la fila, y falla con el archivo y la frase. Una fila nueva = el CI encuentra solo
todas las pantallas viejas que lo dicen mal.

🔑 **`outlet` ≠ `oferta`** (Bruno, 13-oct): **outlet son los productos de 2da** (con falla o de segunda
selección); **oferta**, los que están en una liquidación. ⛔ Usar una por la otra: en la política de
cambio van las dos, por separado. (Sin fila: las dos palabras valen, cada una para lo suyo.)

🔑 **`SKU` y `Código de barras`** (Darío, 20-nov-2026; reemplaza la fila «`código` ⛔ `SKU`» de Bruno, 26-oct): en
pantalla el SKU se llama **SKU** y el número de la etiqueta, **Código de barras**. «Código» a secas había quedado
para los dos (la ficha de stock decía «código» y «Código» uno al lado del otro). Sin fila: «código» sigue valiendo
para lo que no es del producto (cupón, seguimiento, caja) y para lo que se escanea.

| se dice | ⛔ no se dice | app | dónde | por qué / desde |
|---|---|---|---|---|
| `Publicidad` (el estado del POS: la persona y lo que tiene a favor, descontado del total) | `Canje` | monitor | `components/caja` · `lib/caja` | Bruno, 25-nov-2026: «una sesion de fotos que te pago en ropa no es canje». «Canje» sigue siendo la sección de las creadoras (Marketing, Cupones › Canjes) |
| `Registrar falla` (el estado «Falla» del POS: total $0, ⛔ cobro) | `Cargar falla` | monitor | `components/caja` | Bruno, 25-nov-2026: «estado de falla: escanea normal, total venta 0, registrar falla». En Post-venta sigue «+ Cargar falla» |
| `caja` (abrir, cerrar, cajas anteriores) | `turno` · `turnos` | monitor | `components/caja` · `lib/caja` · `api/_caja.js` · `components/erp` · `lib/erp` · `lib/nav.ts` · `lib/nav.datos.ts` | Bruno, 12-oct-2026: la cajera abre y cierra **la caja** |
| `Vista previa` · `Ver POS` (el POS sin caja propia: se ve entero y ⛔ cobra) | `Sólo para mirar` · `sólo mirar` · `Entrar a mirar` | monitor | `components/caja` · `lib/caja` | Bruno, 23-nov-2026: «sólo para mirar no me gusta nada, está recontra fuera de los vocabularios» |
| `oferta` · `productos en oferta` | `feria` · `ferias` | monitor | `components/caja` · `lib/caja` · `api/_caja.js` | Bruno, 12-oct: «feria» es un nombre COMERCIAL de una campaña, ⛔ una regla de la caja |
| `ingreso` · `+ Ingreso` | `aporte` · `aportes` | monitor | `components/caja` · `lib/caja` · `api/_caja.js` | Bruno, 12-oct: «+ Salida» y «+ Ingreso» |
| `Validar transferencia` · `Transferencia pendiente` | `Confirmar transferencia` · `Validando` · `por verificar` · `falta verificar` | monitor | `components/caja` · `lib/caja` · `components/erp` · `lib/erp` | Bruno, 12-oct; 13-oct: «validar» se entiende como el paso intermedio |
| `Ingresos de mercadería` (lo que entró por una orden de compra; Bruno 30-oct: «Ingresos» solo se confunde con el `+ Ingreso` de plata de la Caja) | `Recepciones` · `Recepción` | monitor | `components/erp` · `lib/erp` | Bruno, 20-oct: «en vez de recepciones, pondría ingresos así se entiende» (la pestaña de Stock del ERP; la dirección sigue `/erp/stock/recepciones`) |
| `Actualizar Ingresos` (el botón de ERP › Stock › Ingresos de mercadería: lee los productos de la app Ingresos) · `Listo` (el ERP ya lo tiene) · `Pendiente` (falta, se elige y se importa) | `Sincronizar Ingresos` | monitor | `components/erp` | Bruno, 3-nov: «boton de actualizar ingresos, ves lo nuevo, te aparece lo viejo como ya listo, y lo que no esta te aparece como pendiente» |
| `Contraentrega` (la forma de pago: el cadete cobra al entregar) | `a cobrar en la entrega` · `Cobrar en la entrega` · `Cobrado al entregar` | monitor | `components/erp` · `lib/erp` | Bruno, 20-oct: «¿contraentrega te parece?» (contrato §20 del motor) |
| `producto` · `productos` | `prenda` · `prendas` | monitor | `components/erp` · `lib/erp` · `api/_erp*` · `components/caja` · `lib/caja` · `api/_caja.js` | Bruno, 26-oct: el ERP vende productos, no sólo ropa (diseno.md §9). 10-nov, también la Caja: «no es prendas, es productos» (BDI vende fundas) |
| `variante` · `variantes` | `talle` · `talles` | monitor | `components/erp` · `lib/erp` | Bruno, 26-oct: la variante puede ser talle, color o medida |
| `Físico` (lo que hay en el local y el depósito) | `En estantería` · `estantería` | monitor | `components/erp` · `lib/erp` | Bruno, 26-oct |
| `Reservado` (lo que ya tiene dueño) | `En pedidos` · `Con pedidos` · `apartad*` · `retenid*` · `retiene` | monitor | `components/erp` · `lib/erp` | Bruno, 26-oct |
| `movimientos de stock` · `Areben Gestión` | `libro` · `el libro` | monitor | `components/erp` · `lib/erp` | Bruno, 26-oct: «libro» es jerga de quien lo construyó |
| `Tienda Nube` · `Mercado Libre` | `TN` · `GN` · `ML` | monitor | `components/erp` · `lib/erp` · `api/_erp*` | Bruno, 26-oct: sin siglas en pantalla. 23-nov: Gestión Nube ya ⛔ se nombra (fila de abajo) |
| (nada; o `Sistema anterior` si hace falta nombrarlo: «Sistema anterior», «del sistema anterior») | `Gestión Nube` · `Gestion Nube` | monitor | `components/erp` · `lib/erp` · `api/_erp*` | Bruno, 23-nov-2026: pase hecho y suscripciones canceladas. Stock › Diferencias (sólo comparaba contra Gestión Nube) se sacó; Comparación y Conciliación quedan sin su columna ni su cuadro |
| `Caja` | `Caja (POS)` · `POS` | monitor | `components/erp` · `lib/erp` | Bruno, 26-oct |
| `Ingreso de plata` · `Salida de plata` (los resúmenes y filtros de ERP › Cobros) | `Entró` · `Salió` · `Entró plata` · `Salió plata` · `Entró a` · `Salió de` | monitor | `components/erp/ventas/CobrosErp.tsx` · `lib/erp/cobros.core.js` · `components/erp/Facturacion.tsx` | Bruno, 9-nov: «le falta vocabulario a entró y salió» |
| `Ingresos y ajustes` | `Conteos y ajustes` | monitor | `components/erp` · `lib/erp` | Bruno, 26-oct |
| `forma de pago` · `formas de pago` | `medio de cobro` · `medios de cobro` · `medio de pago` · `medios de pago` · `medio` · `medios` | monitor | `components/erp` · `lib/erp` · `api/_erp*` | Bruno, 30-oct-2026: «forma de pago está perfecto» (eran tres palabras para lo mismo) |
| `Cobros` | `Cobranzas` | monitor | `components/erp` · `lib/erp` · `components/cobranzas` · `lib/cobranzas` · `lib/nav.datos.ts` | Bruno, 30-oct: Cobros en el ERP y en el monitor (la sección del monitor, 30-oct tanda 3) |
| `preparar` · `preparada` · `sin preparar` | `arm*` · `sin armar` | monitor | `components/erp` · `lib/erp` | Bruno, 30-oct: en Ventas ya decía «preparar»; las transferencias decían «armar» |
| el nombre de cada lado (`Areben Gestión`, `Tienda Nube`, `Mercado Libre`) | `En vuelo` · `Nuestro` · `Ellos` | monitor | `components/erp` · `lib/erp` | Bruno, 30-oct: en Diferencias no se entendía contra quién se compara (23-nov: Diferencias se sacó; la fila sigue para Comparación y Conciliación) |
| `Con falla` | `fallad*` | monitor | `components/erp` · `lib/erp` | Bruno, 30-oct |
| `¿A qué cuenta va?` · `La plata llega en` · `Descuento o recargo` | `Rutas` · `Ruta` · `ruta` · `rutas` · `Regla de cobro` | monitor | `components/erp/RutasCobro.tsx` · `components/erp/CuentasYEstructura.tsx` · `components/erp/ventas/FormasDePago.tsx` · `components/erp/ventas/GastosErp.tsx` · `components/erp/ventas/CobrosErp.tsx` · `components/erp/ventas/VentanasVenta.tsx` · `components/erp/clientes/FichaCuenta.tsx` · `components/erp/ventas/FichaVenta.tsx` · `lib/erp/estructura.core.js` · `lib/erp/gastos.core.js` · `lib/erp/rutas.core.js` · `api/_erp-rutas.js` | Bruno, 30-oct (tanda 3, dibujado): la ruta de cobro se nombra por lo que hace. En Transferencias, «Origen» y «Destino» (fila del 23-nov) |
| `Visitas y compromisos ↗` | `Ver en PRM` · `Abrir PRM` · `Ver visitas y compromisos` | monitor | `components/erp` · `lib/erp` | Bruno, 30-oct: sin siglas en pantalla. 23-nov (Darío · Bruno ✅): sin «Ver», como todo enlace a otra sección |
| `Productos` · `Clientes` (los grupos del menú del ERP) | `Productos y precios` · `Clientes y proveedores` | monitor | `components/erp/Erp.tsx` | Bruno, 30-oct: grupos cortos |
| `Se factura cuando se pague` | `Sin factura: todavía no es una venta` | monitor | `components/erp` · `lib/erp` | Bruno, 30-oct: decir qué pasa, no qué no es |
| `Sin promo` (la cuenta del crédito sin cuotas ni promo) | `Normal` | monitor | `components/erp` · `lib/erp` | Bruno, 30-oct |
| `producto sin código` | `Producto suelto` · `producto suelto` | monitor | `components/erp` · `lib/erp` | Bruno, 30-oct: «suelto» se confundía con «fuera de un pack» |
| `Caja Z-0040` · `Código de la caja` · `Revisar` · `Verificado` (el arqueo de caja) | `Código del sobre` · `Abrir el sobre` · `Tiene que haber en el sobre` · `Llegó bien` · `Llegó con diferencia` | monitor | `components/erp/ventas/CajasErp.tsx` · `lib/erp/cajas.core.js` | Bruno, 30-oct: «Caja Z-0040» y «en vez de contado, verificado»; el sobre se REVISA billete por billete (el «Contado» de la cajera, en El efectivo, sigue) |
| `En cartera` · `Depositado` · `Acreditado` · `Rechazado` (los estados del cheque recibido; `Anulado` si se cargó mal) | `Rebotado` · `Cobrado` | monitor | `components/erp/ventas/ChequesErp.tsx` · `lib/erp/cheque.core.js` | Bruno, 10-nov: «cuatro estados», la cartera completa (sesión cheques) |
| `Nueva venta` · `Guardar venta` (la venta a mano del ERP, fuera de la Caja) | `Cargar venta` | monitor | `components/erp` · `lib/erp` · `api/_erp*` | Bruno, 10-nov: «en vez de cargar venta sería nueva venta» |
| `Areben Gestión` (el sistema: «a Areben Gestión», «de Areben Gestión»; las direcciones `/erp/…`, el dominio, las tablas y los nombres del código siguen igual) | `ERP` | monitor | `components` · `app` · `lib` · `api` | Bruno, 14-nov-2026: ERP es la función, no el nombre (pedido de Ger del 8-nov) |
| `Envío` (lo que PAGA el cliente, en el pedido) · `Transporte` · `Incluir el envío` (la casilla al facturar) · `Envío: sin factura` | `Costo de envío` (eso es lo que el envío NOS cuesta: Gastos) · `Facturar el envío` · `sin facturar a propósito` | monitor | `components/panel` | Bruno, 15-nov-2026: el envío dentro del pedido mayorista (pedido de Darío) |
| `Opcional` adentro del campo que se puede dejar vacío (el `placeholder`: «Opcional», «Opcional · ej.: …»); el rótulo dice sólo el nombre | `(si lo tenés)` · `(si la tenés)` | monitor | `components` | Bruno, 15-nov-2026: «campo opcional». 23-nov (Darío · Bruno ✅): «Opcional» va adentro, ⛔ «(opcional)» en el rótulo (fila de abajo) |
| `Opcional` adentro del campo | `(opcional)` · `(obligatorio)` | monitor | `components/erp` · `lib/erp` | Darío · Bruno ✅, 23-nov-2026 (tanda 1: Areben Gestión; el resto del monitor, cuando se toque cada pantalla, y la carpeta de la fila se agranda) |
| `Ubicación` (el lugar: Local · Depósito · Evento; «Por ubicación», «Todas las ubicaciones», «Marcas y ubicaciones») | `depósitos` · `por depósito` · `ese depósito` · `Elegí el depósito` · `Depósito desconocido` · `Depósito Evento` | monitor | `components/erp` · `lib/erp` · `api/_erp*` | Darío propone · Bruno ✅, 23-nov-2026: evita «Depósito: Depósito», y Local y Evento ⛔ son depósitos. «Depósito» sigue siendo el NOMBRE de un lugar (y el rol de Inicio); el rótulo «Depósito» solo ⛔ se puede buscar (es también el nombre): se cuida al escribir |
| `Origen` · `Destino` (dos columnas; en el celular, «Origen y destino») | `De → A` · `Recorrido` | monitor | `components/erp` · `lib/erp` · `api/_erp*` | Bruno ✅, 23-nov-2026: «recorrido no es claro». Lo que antes era la columna «Origen» (Reposición · Devolución · A mano) es **Tipo** |
| `Transferir` · `Transferencia` | `Mover stock` · `Mover el stock` · `Mover y recibir` · `Movés` | monitor | `components/erp` · `lib/erp` · `api/_erp*` | Darío 18-nov · Bruno ✅ 23-nov-2026: siempre «Transferir». ⚠️ «Mover … arriba / abajo» (el orden de las columnas, §1) sigue valiendo |
| `Nota de crédito` · `Notas de crédito` (A o B) | `NC` | monitor | `components/erp` · `lib/erp` · `api/_erp*` | Bruno, 26-oct-2026: sin siglas en pantalla (fila del 15-nov: «NC» seguía en Facturación) |
| `Factura A` · `Factura B` (el tipo dicho así, y la condición al lado: «Factura B · consumidor final», «Factura A a nombre de …») | `sale factura` · `Sale factura` · `sale la factura` | monitor | `components` · `lib/erp` · `lib/caja` · `api/_erp*` · `api/_caja.js` | Bruno, 22-nov-2026: «sale factura A, no es término nuestro» |
| (nada: el estado se dice en palabras: «todavía no disponible», «modo de prueba de ARCA») | `motor` · `sesión A` · `espejo` · `homologación` · `ambiente de prueba` · `este ambiente` | monitor | `components/erp` · `lib/erp` · `api/_erp*` | Bruno, 26-oct: jerga de la construcción, ⛔ en pantalla |
| `Eliminar ajuste` · `Eliminado` (el ajuste APLICADO que Admin vuelve atrás: queda en la lista y el stock vuelve a como estaba; excepción a §1.1, donde «Eliminar» = deja de existir) | `Deshecho` · `Deshacer ajuste` | monitor | `components/erp` | Bruno, 18-nov-2026: «estaría bueno otro nombre» que «Deshecho» ⇒ «Eliminar / Eliminado» (PR «Eliminar un ajuste aplicado») |
| «Ningún producto coincide con «X».» · «Ningún movimiento coincide con el filtro.» | `No hay productos con` · `No hay movimientos con` · `No hay transferencias con` · `Nada con esa búsqueda` · `No encontré` | monitor | `components/erp` · `lib/erp` · `api/_erp*` | Darío (los PDFs de textos, 20 al 23-nov) · Bruno ✅ 23-nov-2026 (AREBEN-COMUN §E.3) |
| `Leyendo…` (sin decir qué: ya lo dice la pantalla) | `Leyendo el` · `Leyendo la` · `Leyendo los` · `Leyendo las` · `Cargando…` · `Cargando el` | monitor | `components/erp` · `lib/erp` | Darío (los PDFs de textos, 20 al 23-nov) · Bruno ✅ 23-nov-2026 (AREBEN-COMUN §E.3) |
| `No se pudo: volvé a intentar.` · `Todavía no disponible.` (el detalle técnico, sólo para Bruno: en el log o en el error del servidor) | `falta actualizar la base` | monitor | `components/erp` · `lib/erp` · `api/_erp*` | Darío (los PDFs de textos, 20 al 23-nov) · Bruno ✅ 23-nov-2026 (AREBEN-COMUN §E.3) |
| `Falta el monto.` (lo que falta, dicho) | `inválid*` | monitor | `components/erp` | Darío (los PDFs de textos, 20 al 23-nov) · Bruno ✅ 23-nov-2026 (AREBEN-COMUN §E.3). ⚠️ Sólo la pantalla: los errores del servidor («Marca inválida») son para Bruno y ⛔ los ve una persona si la pantalla anda |
| `Sin permiso.` · `Sin permiso para editar.` | `Tu rol` | monitor | `components/erp` · `lib/erp` · `api/_erp*` | Darío (los PDFs de textos, 20 al 23-nov) · Bruno ✅ 23-nov-2026 (AREBEN-COMUN §E.3) |
| botones cortos: `Exportar` · `Actualizar` · `Ver venta` · `Ver producto` · `Imprimir ticket` · `Guardar` | `Exportar los elegidos` · `Volver a leer` · `Abrir la ficha` · `Guardar el WhatsApp` | monitor | `components/erp` · `lib/erp` | Darío (los PDFs de textos, 20 al 23-nov) · Bruno ✅ 23-nov-2026 (AREBEN-COMUN §E.3) |
| enlace a otra sección: `Reposición ↗` · `Ingresos ↗` · `Caja ↗` · `Dashboard ↗` | `en el monitor ↗` · `Abrir Reposición` · `Abrir la Caja` · `Abrir en el dashboard` | monitor | `components/erp` · `lib/erp` | Darío (los PDFs de textos, 20 al 23-nov) · Bruno ✅ 23-nov-2026 (AREBEN-COMUN §E.3) |
| `Nueva regla` · `Nuevo ajuste` (el botón que crea) | `Agregar regla` · `Agregar ajuste` | monitor | `components/erp` · `lib/erp` | Darío (los PDFs de textos, 20 al 23-nov) · Bruno ✅ 23-nov-2026 (AREBEN-COMUN §E.3) |
| `Activa` · `Inactiva` · `Activar` · `Desactivar` | `Prendid*` · `Apagad*` · `Prender` · `Apagar` | monitor | `components/erp` · `lib/erp` · `api/_erp*` | Darío (los PDFs de textos, 20 al 23-nov) · Bruno ✅ 23-nov-2026 (AREBEN-COMUN §E.3) |
| `En camino` | `En tránsito` | monitor | `components/erp` · `lib/erp` · `api/_erp*` | Darío (los PDFs de textos, 20 al 23-nov) · Bruno ✅ 23-nov-2026 (AREBEN-COMUN §E.3) |
| `Descartado` (el ajuste que no se aplicó) | `Rechazado` · `Rechazada` | monitor | `components/erp/AjustesStock.tsx` · `lib/erp/ajuste.core.js` | Darío (los PDFs de textos, 20 al 23-nov) · Bruno ✅ 23-nov-2026 (AREBEN-COMUN §E.3). El cheque sigue diciendo «Rechazado» (fila del 10-nov) |
| `A favor` · `Debe` · `Antigüedad` · `Movimientos` | `Con saldo a favor` · `La más vieja` | monitor | `components/erp` · `lib/erp` · `api/_erp*` | Darío (los PDFs de textos, 20 al 23-nov) · Bruno ✅ 23-nov-2026 (AREBEN-COMUN §E.3) |
| `—` en una celda vacía | `Sin historial` · `Sin cargar` | monitor | `components/erp` · `lib/erp` | Darío (los PDFs de textos, 20 al 23-nov) · Bruno ✅ 23-nov-2026 (AREBEN-COMUN §E.3). «Ninguna» sigue valiendo como opción de un desplegable |
| confirmación = una pregunta + el cambio: «¿Guardar el precio Local?» «$ 8.800 → $ 9.680» | `¿Seguro` | monitor | `components/erp` · `lib/erp` | Darío (los PDFs de textos, 20 al 23-nov) · Bruno ✅ 23-nov-2026 (AREBEN-COMUN §E.3) |

🔑 **23-nov-2026 · lo de §E.3 que ⛔ se puede buscar en el código** (va igual, se cuida al escribir): los TÍTULOS de
columna `Fecha` · `Ubicación` · `Saldo` · `Responsable` · `Estado` · `Unidades` (⛔ `Cuándo` · `Dónde` · `Queda` · `Quién`:
en una frase esas palabras sí van); «120 de 2.300» sin agregados; el éxito corto («Cobro de $ X registrado.» · «No se deshace.»), ⛔ la explicación de lo que pasó por detrás.

🔑 **15-nov-2026 · raíces y prefijos** (Bruno: *«lo creo y no lo cuido»*). La frase exacta dejaba pasar las
flexiones («Armándose», «fallados», «el medio») y las carpetas angostas dejaban vivos los errores de `api/`, el
menú y la vista de Cajas. ⇒ una palabra con `*` es una RAÍZ (`arm*` = armar, armada, arman…) y una ruta con `*`
es un PREFIJO (`api/_erp*`). **Una fila nueva nace con raíz y con `api/`**, ⛔ con la frase de hoy sola.

⚠️ **Las excepciones van en el test, con su motivo, y se vacían solas**: un nombre que viene de otro
sistema y se muestra tal cual (la cuenta «Feria TC» de Gestión Nube) ⛔ es una palabra de la Caja. Si
la frase excusada deja de existir, el test pide sacar la excepción.

🔑 **Y la sesión se entera ANTES que Bruno**: un hook de Claude Code (`PostToolUse` sobre `Edit`/`Write`
de una pantalla) corre este test y el de vocabulario apenas se escribe el archivo, y además compara las
dos copias de este archivo (`diff ~/Projects/areben-marketing/VOCABULARIO.md
~/Projects/monitor-areben/VOCABULARIO.md`). Lo que el hook encuentra se arregla en el mismo turno.
