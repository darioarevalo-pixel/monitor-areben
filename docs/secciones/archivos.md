# Archivos — ficha de sección

Sección `archivos`, área `sistema`, **admin-only y sin `store`**. Contesta tres preguntas sobre el
Blob —cuánto lugar queda, quién lo ocupa, qué se puede eliminar— y deja eliminarlo desde acá.

## De dónde salió: el día que el monitor dejó de aceptar archivos

**7-sep-2026.** Reportado como *«el link de Abril no le deja cargar más imágenes»*. No era su link
ni el tope de evidencias del canje (tenía 0 de 100): el store del Blob había llegado al **giga del
plan Hobby** y `Storage quota exceeded for Hobby plan (1GB maximum)` frenaba **toda** subida del
monitor — el link de las creadoras, las fotos de un reclamo, los diseños, las piezas de Meta.

🔴 **Y desde el monitor se veía todo sano**: el permiso de subida se firma igual (`puedeSubir: true`,
buzón abierto, token vivo) porque el que rechaza es el Blob, después. **El único oráculo es subir de
verdad**: pedir el permiso y hacer el PUT.

Lo que lo llenó fueron **532 MB de contenido de canjes que nadie había archivado en Drive** (el
botón «Enviar a Drive» existía desde el 21-ago y de 65 evidencias sólo 8 habían pasado). Para verlo
hubo que entrar al dashboard de Vercel, que vive en **otra cuenta** —el proyecto corre en el Vercel
de Darío—, y para eliminar hacía falta el `BLOB_READ_WRITE_TOKEN`, que Vercel ⛔ no deja ni copiar.
Esta pantalla es exactamente eso, adentro del monitor.

## Lo medido ese día (para tener escala)

| carpeta | archivos | peso |
| --- | --- | --- |
| `canjes` | 57 | 532 MB (3 canjes) |
| `piezas` | 7 | 232 MB |
| `disenos` + `reclamos` | 53 | 1,3 MB |
| **huérfanos** (no los nombra nadie) | ? | **~311 MB** |

Los huérfanos son el tercio del store que **ninguna consulta explica**: subidas que llegaron al Blob
y cuya fila nunca se escribió, y restos de la galería de Ingresos de antes de que aprendiera a
eliminar. ⚠️ Ese número salió por resta contra los 545 MB que informa el dashboard: la pantalla es
la primera vez que se pueden ver uno por uno.

## 🔴 La regla que hace que esto no borre algo vivo

Vive en `lib/blob/inventario.core.js` y la corre **el servidor otra vez** antes de eliminar: la
lista de URLs llega del browser, y obedecerla sería dejar que un botón equivocado pierda archivos.
Los estados son cinco a propósito — el docblock de ahí explica cada uno. Lo que hay que saber antes
de tocar:

- **Lo recién subido no se ofrece nunca** (`GRACIA_HORAS`). Los bytes llegan al Blob **antes** que su
  fila: así sube la creadora. Sin la ventana, el barrido se come el video que está subiendo.
- **Lo que no se pudo verificar ⛔ NO es «sin dueño»**, es `no-verificable`. Si una consulta falla,
  esa carpeta no se limpia y la pantalla lo dice.
- **`ingresos/` es el caso raro**: sus URLs viven en el **KV de bdi-catalogo**, no en Supabase. Las
  aporta la pantalla (`lib/blob/cliente.ts`), y si el KV no se pudo leer manda `null` —⛔ nunca una
  lista vacía, que diría «ninguno está en uso»— y la carpeta queda sin verificar.
- **`copia-en-meta`**: una pieza cuyo paso quedó `hecho` con su `resultado_id` ya vive adentro de
  Meta; la del Blob es una copia y se puede eliminar. 🔴 Alcanza con que **un** paso sin correr la
  nombre para que no entre: el 7-sep, `UNBOXING INFLUENCER 25-8.mov` colgaba de dos planes, uno hecho
  y otro sin ejecutar.

## Por dónde entra

⛔ **No tiene handler propio**: `api/blob-upload.js`, acciones `inventario` y `eliminar-huerfanos`, las
dos con `esAdmin` del lado del servidor (quedan 5 de las 12 funciones del plan y esta no gasta
ninguna). El cruce contra la base es `api/_blob-refs.js`, que busca las URLs **con una regex sobre la
fila entera y ⛔ no columna por columna**: hoy viven en cuatro formas distintas, tres de ellas dentro
de un jsonb, y olvidarse de una columna nueva costaría eliminar un archivo vivo.

## Lo que NO hace, y por qué

- ⛔ **No avisa en Inicio.** El aviso del 70 % vive en esta pantalla y no en la de todos, porque
  `list()` es una *advanced operation* del Blob y el plan Hobby trae 2.000 por mes: ponerlo en Inicio
  las gastaría en cargar una pantalla que casi siempre no tiene nada que decir.
- ⛔ **No limpia sola.** Todo borrado sale de un click, con el diálogo nombrando cuántos archivos y
  cuántos megas. Un cron que barre huérfanos es exactamente el que se lleva algo vivo el día que una
  fuente nueva no esté en la lista de `_blob-refs.js`.

## Pendientes

- El techo de 1 GB es del **plan Hobby de la cuenta de Darío**. La salida de fondo es transferir el
  proyecto **y el store** al team de Bruno, que ya está pago (⛔ nunca recrear el store: cambia el
  host de todas las URLs guardadas).
- La causa raíz de los 532 MB no es técnica: es que el contenido de canjes se archiva a mano. Mientras
  siga así, esta pantalla es el recordatorio y no la solución.
