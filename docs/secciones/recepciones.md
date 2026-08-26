# Lo que entró — ficha de sección

Sección `recepciones`, área `compras`. **Las órdenes de compra que el sistema de Ingresos confirma
como recibidas**: proveedor, artículos, unidades pedidas contra contadas, las diferencias renglón
por renglón y el cumplimiento acumulado de cada proveedor.

⛔ **No es «Ingresos proyectados»** (`docs/secciones/ingresos.md`), que es la importación de fundas
*que viene* —sólo BDI, en el KV de bdi-catalogo—. Ésta es la que *llegó*, para las dos marcas, y no
se carga a mano: **entra sola por webhook**.

🔑 **Nadie escribe acá desde la pantalla.** No hay alta, ni edición, ni borrado. Lo único que
escribe estas tablas es `api/_oc-webhook.js`. Si un dato está mal se corrige del otro lado y se
vuelve a confirmar la OC: el evento nuevo pisa la fila.

## Dónde vive

`components/recepciones/` (`Recepciones.tsx` la lista, `DetalleOC.tsx` una orden) ·
`lib/recepciones/core.ts` (lo derivado, puro) · `lib/recepciones/webhook.core.js` (el contrato del
webhook, puro) · `lib/recepciones/cliente.ts` · handlers `api/_oc-webhook.js` (escribe, **abierto**)
y `api/_recepciones.js` (lee, con sesión) · tablas en `sql/migrate-recepciones.sql`
(`scripts/apply-recepciones.mjs`) · tests: `tests/recepciones-webhook.test.ts`,
`tests/oc-webhook-handler.test.ts`, `tests/recepciones.test.ts`.

**Ninguna función nueva de Vercel**: los dos handlers entran por `api/datos.js` con `?recurso=`.
Siguen siendo **7 de 12**.

## La URL y el secreto

```
POST https://monitor.arebensrl.com/api/datos?recurso=oc-webhook
```

Es exactamente lo que tiene cargado el emisor. ⚠️ **Renombrar el recurso apaga el envío** sin que
falle nada de este lado: el emisor empieza a recibir 400 y a los seis reintentos marca fallido.

El secreto compartido va en la variable **`INGRESO_WEBHOOK_SECRET`** de Vercel (base64, con o sin
el prefijo `whsec_`). **Sin ella el endpoint contesta 503**, que es a propósito: el 503 hace que el
emisor reintente, y sus reintentos cubren casi 17 horas — o sea que cargar la variable tarde no
pierde los eventos de ese rato. Un 401 los habría perdido.

## ⛔ Lo que hay que saber antes de tocar

- 🔴 **`_oc-webhook.js` NO pide sesión, y por eso está solo en su archivo.** Es el mismo criterio que
  `disenos-rondas`/`votacion` y `reclamos`/`reclamo`: un verbo abierto no convive con verbos con
  login en el mismo archivo, que es como se cuela el que se olvidó de pedir la sesión. La lectura
  vive en `_recepciones.js`, que sí exige usuario y el permiso `recepciones`.
- 🔴 **El cuerpo se lee del STREAM, no de `req.body`.** La firma es sobre los bytes exactos:
  parsear y volver a serializar la rompe, y falla con «firma inválida», que no se parece en nada a
  su causa. Se puede leer aunque el runtime ya lo haya consumido porque `@vercel/node` lo **repone**
  con un `PassThrough` parcheando `req.on('data')`/`req.on('end')` — por eso `leerCrudo` usa esos
  dos eventos y ⛔ **no** `for await (const c of req)`, que va por `on('readable')` y ese no está
  parcheado. Lo fija `tests/oc-webhook-handler.test.ts`, donde el `req` falso trae un `req.body`
  **distinto** del cuerpo: un handler que leyera de ahí no valida nunca.
- 🔴 **Los tres códigos de rechazo significan cosas distintas para el emisor** y no son
  intercambiables: `400` mensaje viejo o mal formado (reintentar no lo arregla), `401` firma
  inválida (hay dos secretos distintos), `503` no tenemos secreto cargado (**el reintento sí
  sirve**). Y un **tipo de evento desconocido se acepta con 200**: el emisor no puede arreglar
  reintentando que su evento no nos interese, y serían 17 horas de ruido.
- 🔑 **La idempotencia cuelga de `webhook_id`, que es la clave primaria del evento.** Un reintento
  trae el mismo id, choca y se contesta 200 sin reprocesar. ⚠️ **Salvo si el evento anterior quedó
  en `error`**: ése sí se reprocesa, porque si no el reintento —que es justo lo que arreglaría una
  caída de la base— chocaría con la fila del intento fallido y se perdería para siempre.
- 🔑 **La clave de la OC es `(store, oc_id)`, no el evento.** Una orden que se vuelve a confirmar
  **pisa** su fila y sus renglones se reemplazan enteros: son la foto del último conteo, no un
  historial. El `delete` de renglones va **antes** del `insert`.
- 🔑 **Las tres tablas viven en UNA sola base (la de BDI) con columna `store`**, al revés que
  `pedidos_clientes`. Un webhook no puede elegir base: si la credencial de una marca no estuviera
  cargada, el POST daría 500, el emisor reintentaría 17 horas y después marcaría fallido — **y no
  hay quién lo vuelva a mandar**. El espejo de GN sí se lee de la base de cada marca, pero eso pasa
  después de guardar y su falla no se lleva puesto el evento.

## Reglas que el código no dice

- 🔴 **`diferencia_unidades` es un NETO y un neto esconde el caso caro.** 2 de menos en un talle y 2
  de más en otro dan cero, y no es cero. Por eso se guardan `unidades_faltantes` y
  `unidades_sobrantes` por separado, sumadas renglón por renglón.
- 🔴 **La diferencia de cada renglón se RECALCULA, no se copia.** Es un derivado de otros dos datos
  del mismo renglón: si las tres no cierran, gana la que se puede verificar. Copiarla dejaría un
  renglón que se contradice a sí mismo.
- 🔑 **El cruce con GN tiene TRES estados, no dos**: está / no está / **no se pudo preguntar**
  (`null`). Colapsar el tercero en «no está» convierte un espejo caído en una lista de altas
  pendientes inventada. Por eso `espejo_consultado` es una columna y no se deduce del conteo.
- 🔑 **El cruce guardado es una FOTO y la pantalla lo rehace en vivo.** El caso normal de una
  importación es que el producto todavía no exista en Gestión Nube — se da de alta después. Sin el
  segundo cruce, la lista de «falta darlo de alta» no se vaciaría nunca y en una semana no la
  miraría nadie.
- ⚠️ **Que los totales del evento no cierren contra sus renglones NO es un error del webhook.** Se
  guarda igual, con `totales_coinciden` en false, y la pantalla lo dice. Rechazar el POST lo pondría
  a reintentar 17 horas por algo que no se arregla reintentando. Y sólo se compara **si vinieron
  todos los renglones** (`lineas_recibidas` vs `totales.lineas`): un emisor que los recorta no está
  mintiendo en los totales, y marcarle discrepancia haría que todas las OC se vean rotas.
- ⛔ **Un cumplimiento sin nada pedido es `null`, no 0 ni 100%.** El cero afirma.
- 🔑 **El agregado por proveedor suma UNIDADES, no promedia los porcentajes de cada OC.** Un
  promedio le da el mismo peso a una orden de 4 unidades que a una de 900, y el proveedor que falla
  en las grandes sale mejor que el que falla en una chica.
- 🔑 **El renglón «último evento» va aunque la lista esté vacía.** Una lista vacía sin él afirma «no
  entró ninguna orden», cuando lo que puede estar pasando es que el envío nunca se prendió — dos
  problemas distintos, de dos personas distintas.

## Qué NO viaja

El costo con IVA, los descuentos, el flete y el margen **se quedan del lado de Ingresos**, por
decisión del emisor. Si algún día hacen falta, se agregan allá y se avisa antes: no aparecen solos.
⚠️ Y si aparecieran, esta tabla pasaría a tener plata adentro y el permiso de la sección dejaría de
alcanzar — hoy no la tiene, y por eso `recepciones` es un permiso de Compras a secas.

## Cómo se prueba

```bash
npx vitest run tests/recepciones-webhook.test.ts --reporter=dot   # firma, ventana, normalización
npx vitest run tests/oc-webhook-handler.test.ts --reporter=dot    # el handler entero: bytes → base
npx vitest run tests/recepciones.test.ts --reporter=dot           # lo que deriva la pantalla
node scripts/apply-recepciones.mjs                                # ejerce los candados de la base
node scripts/caminar-oc-webhook.mjs                               # el handler contra la base REAL
```

La última no es un test: **invoca el handler tal cual —firma, stream, cruce con el espejo— contra
la base de BDI**, con un secreto de prueba propio, y el oráculo es la base leída por otro camino.
Siembra la OC `bdi:999999901`, que no puede chocar con una real, y la borra al final verificando
que los tres contadores vuelvan a donde estaban. Caminada el 26-ago-2026: **34 de 34**.

**El oráculo de la firma en los tests es el emisor, no nosotros**: se firma con `node:crypto`
siguiendo el estándar y se verifica con el núcleo. Si las dos puntas usaran la misma función, el
test no probaría nada.

## Pendiente

- ▶️ **Un POST real firmado contra producción** — es lo único que ejerce que `@vercel/node` reponga
  el cuerpo en el runtime de verdad (los tests imitan ese parche; no lo prueban). ⚠️ **No se puede
  hacer desde acá**: el secreto es el del emisor. Lo que sí quedó ejercido es todo lo demás —ver
  `caminar-oc-webhook.mjs`— y, en producción, que el cuerpo crudo llega (3 MB → 400 por el techo).
  El primer evento firmado del emisor es el que cierra esto.
- ▶️ **La primera OC confirmada de verdad**, que es lo único que ejerce el contrato del emisor:
  hasta ahí, la forma del `data` sale de la documentación, no de un mensaje que llegó.
- ▶️ **Reprocesar un evento en `error`**: hoy se ve en la pantalla y se arregla volviendo a
  confirmar la OC del otro lado. El botón que lo re-corre desde `recepcion_evento.payload` no está
  hecho — la tabla ya guarda todo lo que hace falta.
