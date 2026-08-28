# Post-venta de punta a punta — auditoría del 28-ago-2026

Reclamos · Cambios · Retornos, caminados **estado por estado y rol por rol** el día en que el módulo
empezó a tener casos reales adentro.

⛔ **Esto NO es una ficha de sección.** Las fichas (`docs/secciones/reclamos.md`,
`docs/secciones/retornos.md`) cuentan **cómo está hecho** y se mantienen. Esto es una foto con fecha
de **qué no cierra**, y envejece: lo que se vaya arreglando se tacha acá y se cuenta allá.

## Cómo se caminó, y qué dio cada pierna

| pierna | qué se ejerció | resultado |
|---|---|---|
| **código** | `lib/reclamos/*` (6.300 líneas), `api/_reclamos.js`, `api/_reclamo.js`, las cuatro pantallas, `lib/permisos.core.js`, `lib/nav.datos.ts` | leído entero; cada hallazgo de abajo lleva su `archivo:línea` |
| **base** | PostgREST con la service key contra los dos Supabase, ⛔ **sin escribir nada** | **BDI: 2 filas · ZATTIA: 0** (contado dos veces, 13:30 y 13:37) |
| **pantalla** | producción: `/postventa?tab=reclamos`, `/reclamos-local`, `/retornos` | Retornos **vacía en los tres andenes**; los dos reclamos dibujados, y el detalle de R-0022 abierto |

🔑 **Y algo que valió más que cualquier fixture: a las 13:36:41, mientras se caminaba, `Lorena Reyes`
apretó «Aceptó» sobre R-0022.** Eso ejerció **en vivo** la rama que se había construido esa misma
mañana (`retencion-respuesta`) y confirmó tres de los hallazgos de abajo sobre una fila de verdad. La
firma está en el `historial` de la fila.

### Las dos filas reales

| | R-0022 (orden #21033) | R-0023 (orden #21100) |
|---|---|---|
| caso · escenario | `no_esperaba` · `coincide` | `no_esperaba` · `coincide` |
| estado | `resuelto` (era `en_revision` a las 13:30) | `borrador` |
| resolución | `plata_parcial` $13.491 — **la puso el local al aceptar la oferta** | ninguna |
| oferta de retención | $13.491 · plata · **aceptó** (sellada 28/8 01:41) | ninguna |
| pendientes | anular la venta en GN · devolver la plata · descontar 2 productos | — |
| `costo_caso` | **$20.682** ← de la decisión vieja | null |
| `mensajes` | **`[]`**, después de tres mensajes mandados | `[]` |

---

## 1. La matriz: estado × rol

Cuatro roles con puerta propia: **LOCAL** (`reclamos-local`, `cambios-local`, `retornos`) ·
**ADMINISTRACIÓN** (`postventa` → pestañas Reclamos / Fallas / Cambios) · **DEPÓSITO** (`retornos`,
`postventa-deposito`) · **CLIENTE** (el portal abierto `/reclamo/<token>`).

**Lo que el local NUNCA ve** (recorte del 27-ago, verificado en pantalla): la columna *A devolver*,
las tres líneas de plata del resumen, y *Qué se encontró* (el escenario).
**Lo que el local SÍ aprieta sin ser admin**: los cinco mensajes · `Aceptó` / `No aceptó` ·
`Despaché` · `Dar de baja en GN` · `¿De qué venta salió?` · el detalle `⋯`.

| estado | LOCAL: qué ve · qué aprieta · qué mensaje | ADMINISTRACIÓN: además | DEPÓSITO | CLIENTE |
|---|---|---|---|---|
| **`borrador`** *(sin decidir)* | «Borrador» · pend. *decidir qué se hace* — **Msj: pedir fotos** · ⏱ a los 2 d | `Decidir` / `Continuar — N de 3`, `Borrar`, los 4 KPI | — | el portal **abre** |
| **`borrador`** *(cambio ya decidido)* | «Borrador» · los pendientes del cambio — **Msj: resolución** | Cambios: `Editar`, `Crear venta` (si está pagado), `Cobré la diferencia`, `Cerrar` | — | 🔴 **el portal SIGUE abriendo** (D16) |
| **`esperando_cliente`** | «Esperando al cliente» — **Msj: pedir fotos** · ⏱ a los 10 d | `Decidir` | — | el portal abre |
| **`en_revision`** *(con fotos, sin oferta)* | «Para revisar» — 🔴 **ningún mensaje en la columna**: sólo *Msj: pedir más fotos*, adentro del `⋯` · ⏱ a los 3 d | `Continuar — N de 3` | — | el portal abre |
| **`en_revision`** *(oferta esperando)* | «Para revisar» — **Msj: la propuesta** + `Aceptó` / `No aceptó` · ⏱ a los 3 d | `Continuar` | — | el portal abre |
| **`resuelto`** | «Resuelto, en curso» — **Msj: resolución** (+ *plata enviada* si ya salió) · `Despaché`, `Dar de baja en GN`, `¿De qué venta salió?` | `Volver a decidir`, `Anulé en GN`, `Devolví la plata`, `Cargar el cupón`, `Reclamo al correo`, `Descontar reemplazo`, `Pasar a Fallas`, `Descontar lo que se queda`, `Cerrar` | andén **Falta despachar** → 🔴 el botón contesta **403** (D3) | 404 |
| **`en_transito`** *(sin etiqueta)* | **«Falta mandarle la etiqueta»** — resolución + **la etiqueta va en camino** · ⏱ a los 2 d, rojo | `Cargar seguimiento`, `Volvió` | andén **Esperando**, traba *«Falta la etiqueta»* | 404 |
| **`en_transito`** *(con etiqueta)* | «En camino de vuelta» — resolución + **Msj: etiqueta** · ⏱ a los 15 d, amarillo | `Cargar seguimiento`, `Volvió` | **Llegó** (de a una unidad, o todas juntas) | 404 |
| **`recibido`** | «Recibido» — Msj: resolución | `Pasar a Fallas`, `Cerrar` | **Reingresado**, sólo si el pendiente está | 404 |
| **`cerrado`** | «Cerrado» — sale del tab *Abiertos* | — | — | 404 |
| **`anulado`** | «Anulado» | 🔴 **ninguna pantalla lo puede poner** (D13) | — | 404 |

**Los agujeros** (casillero sin acción ni mensaje): `en_revision` con fotos y sin oferta, y `resuelto`
para Depósito. **El ruido** (acción donde no corresponde): en `resuelto` el local lee *«anular la
venta original · devolver la plata»* en la columna de pendientes y ⛔ no tiene botón para ninguna de
las dos. Que lo lea está bien —le sirve para contestarle al cliente—; lo que falta es que se lea como
*«lo está haciendo Administración»* y no como una tarea suya.

---

## 2. Lo que no cierra — ordenado por lo que cuesta

### 🔴 D1 · Aceptar la oferta manda a ANULAR la venta, y a la vez a descontar el producto

**Plata, y está pendiente en producción.**

- **Evidencia** (pantalla, 28/8 13:37): los pendientes de R-0022 dicen *«anular la venta original en
  Gestión Nube · devolver la plata · **descontar de Gestión Nube los 2 productos que se queda el
  cliente**»*, y el KPI marca *Ventas sin anular en GN: 1*.
- **Causa**: `EFECTOS_RESOLUCION.plata_parcial.anulaVenta = SIEMPRE`
  (`lib/reclamos/efectos.core.js:67-70`), con un comentario que razona **sobre la falla** («la unidad
  vuelve al stock y la falla la vuelve a sacar»). Desde el 27-ago `plata_parcial` es **también** la
  salida de aceptar la retención sobre un producto **sano** (`salidaAlAceptarRetencion`,
  `lib/reclamos/casos.core.js:508-510`), y ahí ese razonamiento ⛔ no aplica.
- **Lo que es defecto seguro**: se piden **dos movimientos manuales en GN que se cancelan** — anular
  devuelve +2 al stock, la venta técnica saca −2. Cualquiera de los dos alcanza.
- **Lo que es decisión** → **B2**: anular la venta deja a Gestión Nube diciendo que **no vendimos
  nada**, cuando la clienta se quedó con los dos productos y puso $7.191 netos.
- **Costo**: una fila más en `EFECTOS_RESOLUCION` (partir `plata_parcial`) o una condición por
  destino. ⚠️ Toca la tabla de la que cuelga todo el final del chasis: va con mutantes.

### 🔴 D2 · `costo_caso` no se recalcula cuando el cliente acepta

**El único número que dice cuánto cuestan los errores propios queda mintiendo.**

- **Evidencia** (pantalla, en la misma caja del detalle de R-0022): *«Se le devuelve **$13.491**»*
  junto a *«Lo que nos costó **$20.682**»*. En la base: `monto_total: 13491`, `costo_caso: 20682` —
  el de la decisión vieja, que incluía $6.500 de envío que ya no existe.
- **Causa**: `camposAlContestarLaOferta` (`lib/reclamos/casos.core.js:691-722`) escribe
  `monto_total`, `monto_acordado`, `destino_prenda`, `estado` y los pendientes, y **⛔ no
  `costo_caso`**. El único que lo calcula es la pantalla (`components/reclamos/DecidirReclamo.tsx:337-350`),
  y esta rama ⛔ no pasa por ahí.
- **Por qué duele**: la retención existe para **abaratar** el caso. Si funciona y el costo no baja,
  el número que la justifica ⛔ no se puede leer nunca — y como el error va siempre para arriba, la
  retención va a parecer más cara de lo que es.
- **De la misma línea**: `retorno_sugerido` queda en el `true` viejo ⇒ el resumen dice *«¿Se pidió
  que vuelva? **No — en contra de lo que sugería la cuenta**»* sobre algo que el sistema apagó solo
  (`casos.core.js:717`).
- **Costo**: bajo. `costoDelCaso` (`lib/reclamos/tipos.ts:1865`) ya es puro: se muda a `.core.js`
  —igual que `destinoDe` el 28-ago— y lo llama el handler.

### 🔴 D3 · «Despaché» de Retornos le contesta 403 a Depósito

**Cuarta vuelta del agujero propio del módulo: el botón quedó del lado equivocado de la puerta.**

- **Evidencia, leyendo los dos lados**:
  - `api/_reclamos.js:87` → `ACCIONES_DE_LA_BANDEJA = ['recibir', 'reingreso']`
  - `api/_reclamos.js:160-168` → sólo pasa `verReclamos || (verRetornos && esDeLaBandeja)`
  - `components/retornos/Retornos.tsx:326` → botón `Despaché` → `lib/reclamos/cliente.ts:296` →
    `action: 'despachado'`, **que ⛔ no está en la lista**
  - `lib/permisos.core.js:155` → `deposito: { areas: ['deposito'], keys: ['solicitudes'] }`, y
    `SECCIONES_RECLAMOS` (`:429`) = `['reclamos-local','cambios-local','postventa']` ⇒ Depósito ⛔ no
    tiene ninguna ⇒ `verReclamos: false`.
- **Por qué importa**: el tercer andén se construyó el 26-ago **exactamente porque Depósito ⛔ no
  puede abrir Reclamos**. El botón se mudó; el permiso ⛔ no.
- **Por qué no se vio**: la bandeja está vacía en los tres andenes (verificado en pantalla) y el
  Local sí puede, porque tiene `reclamos-local`. Muerde el día que Depósito abra la primera caja.
- ⚠️ **La ficha se contradice a sí misma**: `docs/secciones/retornos.md:55` dice *«y **dos** acciones
  (`recibir`, `reingreso`), nada más»*, y `:81-83` cuenta que el botón de despachar se trajo acá
  justamente por esto.
- ⚠️ **Medido leyendo los dos lados, ⛔ NO ejercido con un usuario de Depósito** (no hay ninguna fila
  en un estado que aparezca en la bandeja).
- **Costo: una línea** (`'despachado'` a la lista) **+ un test que ate las acciones de la bandeja a
  los botones de `Retornos.tsx`** — el mismo guard que ya existe entre `RetornoRow` y `COLS_RETORNO`.

### 🔴 D4 · «No aceptó» sobre un reclamo sin decidir deja la columna MUDA

**Cliente sin respuesta, y la premisa escrita es falsa en el único caso real que hubo.**

- **Evidencia**: a las 13:30 R-0022 estaba `en_revision`, con `compensacion: null` y una oferta de
  $13.491 esperando. Si en vez de «Aceptó» se apretaba «No aceptó»: `camposAlContestarLaOferta`
  escribe **sólo** `retencion_respuesta` (`casos.core.js:705-707`) ⇒ `ofertaEsperandoRespuesta` pasa
  a `false` y `estaDecidido` sigue en `false` ⇒ `mensajesDeLaFila`
  (`lib/reclamos/botones.ts:118-131`) ⛔ no devuelve `propuesta` **ni** `resolucion`, y `pedir_fotos`
  tampoco, porque ya hay una foto. **Queda sólo `mas_fotos`, que vive adentro del `⋯`.**
- **La premisa que se cayó**: *«Cuando la oferta salió, Administración ya decidió LAS DOS RAMAS… la
  salida "por si dice que no" es la resolución que ya está guardada en la fila»*
  (`casos.core.js:660-663`, y `docs/secciones/reclamos.md` § *La respuesta del cliente cierra la
  rama*). R-0022 tenía la oferta **y la decisión soltada**: el `liberar-decision` del 27/8 20:35
  borró `compensacion` y dejó la oferta en pie.
- **Decisión detrás** → **B1**.
- **Costo**: bajo si se elige frenar la oferta sin resolución; medio si se elige devolver el reclamo
  a «hay que decidir» con un mensaje propio.

### 🔴 D5 · El mensaje del reenvío existe, está probado, y no tiene botón

**Cuando le mandamos algo, el cliente ⛔ no se entera por el sistema.**

- **Evidencia**: `mensajeSeguimiento(…, 'reenvio')` (`lib/reclamos/mensajes.ts:260-263`) usa
  `seguimiento_ida`. `grep mensajeSeguimiento` devuelve sólo `Reclamos.tsx:956` (`'etiqueta'`) y
  `:959` (`'plata'`); el tercero aparece **únicamente** en `tests/reclamos-mensajes.test.ts:106`.
- `mensajesDeLaFila` ⛔ no tiene ningún momento para *«ya te despachamos lo tuyo»*, aunque
  `envio_nuevo_estado: 'hecho'` y `seguimiento_ida` existen y Retornos ya los muestra.
- **Afecta a las TRES resoluciones que mandan algo**: cambio, reposición y reenvío.
- **Costo**: bajo — un momento más en `botones.ts`, su botón, y los dos tests (la regla **y** el cable).

### 🔴 D6 · El cupón se puede prometer sin que exista

- **Evidencia**: `mensajesDeLaFila` ofrece `resolucion` con sólo `estaDecidido` (`botones.ts:126`), y
  `mensajeResolucion` con `compensacion: 'cupon'` y `cupon_codigo` nulo sale *«Te dejamos un cupón de
  descuento para tu próxima compra»* **sin código** (`mensajes.ts:180-181`). El pendiente
  `cupon_estado` ⛔ no frena el mensaje.
- Es el mismo agujero que `cupon-emitido` vino a tapar el 25-ago, **entrando por la puerta del texto**.
- **Costo**: bajo — o el mensaje espera al código, o dice que va aparte.

### 🔴 D7 · Los asteriscos SE VEN en WhatsApp

- **Evidencia**: `mensajes.ts:192` y `mensajes.ts:240` mandan `**El envío lo pagamos nosotros.**`.
  WhatsApp pone negrita con **uno solo** ⇒ el cliente ve los cuatro asteriscos. Es la única frase del
  sistema que intenta ponerse en negrita.
- Anotado el 26-ago y **sigue igual** (releído el 28).
- **Costo: dos caracteres por línea.**

### 🔴 D8 · Dos resoluciones caen en el default y no dicen nada

- **Evidencia**: `mensajes.ts:183-184` — `otro_producto` (el cambio) y `ninguna` comparten *«Ya lo
  revisamos y te contamos cómo seguimos»*, que promete una novedad que ⛔ no viene. Y `ninguna` es
  justo el caso donde hay que explicar **por qué no se compensa** (la demora fue del transporte, el
  pedido ya llegó).
- **Costo**: bajo, texto puro con tests.

### 🔴 D9 · La columna `mensajes` está en el `select` y no la escribe nadie

- **Evidencia**: aparece **una sola vez** en todo el módulo, en `COLS` (`api/_reclamos.js:108`).
  R-0022 la trae `[]` después de que se le mandaron el link, la propuesta y la resolución. El
  docstring de `mensajes.ts:6` afirma *«queda registrado qué se le dijo y cuándo»*, y el tipo
  `MensajeEnviado` (`:273`) ⛔ no lo usa nadie.
- **De la resolución —donde se promete la plata— ⛔ no queda rastro.** Del único que queda es de la
  apertura, y **de rebote**: el historial anota el cambio de estado, no el texto.
- **Costo**: medio. Los cinco `CopyButton` ya están centralizados; falta una acción que apile.

### 🟠 D10 · «A devolver» afirma un monto sobre reclamos sin decidir

- **Evidencia** (pantalla, 13:30): R-0022 en «Para revisar», con el detalle diciendo *«Decisión:
  **Todavía sin decidir**»*, y la columna **A devolver: $20.682**. R-0023 en «Borrador», con
  `monto_total: null` en la base, mostrando **$23.564** (cae en `monto_producto`).
- **Causa**: `components/reclamos/Reclamos.tsx:880` hace `d.monto_total ?? d.monto_producto ?? 0` sin
  mirar `estaDecidido`; y `liberar-decision` (`api/_reclamos.js:336-356`) suelta `compensacion` y los
  seis pendientes pero **deja** `monto_total`, `monto_acordado`, `costo_caso`, `destino_prenda`,
  `via_retorno` y `retorno_sugerido`.
- Es *un dato que existe ⛔ no es una decisión tomada*, tercera vuelta en este módulo.
- **Costo**: bajo para la columna. Lo de `liberar-decision` es **B3**.

### 🟠 D11 · Cerrar y anular no piden permiso ni miran los pendientes

- **Evidencia**: `api/_reclamos.js:845-849` acepta los ocho estados; `DE_ADMIN` (`:291`) ⛔ no incluye
  `estado`; `faltantesParaCerrar` lo mira **sólo la pantalla** (`Reclamos.tsx:591-595`).
- Cualquiera con `reclamos-local` puede cerrar un reclamo con la plata sin devolver y la venta sin
  anular. Hoy ⛔ no hay botón — y ésa es exactamente la regla que este módulo tiene escrita tres veces
  en ese mismo archivo: *«una pantalla que esconde un botón es una sugerencia, no una regla»*.
- **Costo**: bajo — `cerrado` y `anulado` piden administración y `faltantesParaCerrar` vacío, con 409
  y la lista, igual que ya hacen `decidir` y `descontado`.

### 🟠 D12 · El aviso del sidebar deja de ver los viejos a partir de 200

- **Evidencia**: `vista=avisos` baja `.order('created_at', desc).limit(200)`
  (`api/_reclamos.js:198-204`); `leerReclamos` ⛔ no manda `estado` ni `limit`
  (`lib/reclamos/cliente.ts:42-53`) ⇒ el listado cae en el default de 200 (`:219`, tope 500). Los
  tres tabs (Abiertos / Durmiendo / Todos) filtran **en el cliente**, sobre lo que bajó.
- Con 200 reclamos por mes, al segundo mes **el reclamo que duerme deja de contar en el badge** — que
  es exactamente para lo que la alerta existe.
- **Costo**: medio. ⚠️ El comentario de `vista=avisos` dice **a propósito** que ⛔ no filtra estados
  para no duplicar la lista: se resuelve **importando `ESTADOS_ABIERTOS` del núcleo**, ⛔ no copiándola.

### 🟡 Los seis chicos

| | qué | evidencia |
|---|---|---|
| **D13** | **`anulado` ⛔ no lo puede poner ninguna pantalla** | `grep -rn anulado components lib` → en post-venta sólo lecturas: `ArmarCambio.tsx:485,493`, `ESTADO_TONE`, `faltantesParaCerrar` (`tipos.ts:2411`), `lib/notificaciones/derivar.ts:155` |
| **D14** | **«Despaché» de un CAMBIO necesita dos pantallas** | todo cambio deja `envio_nuevo_estado: 'pendiente'` (`efectos.core.js:74-78`); `ArmarCambio.tsx:836` escribe *«Falta despachar lo que se le manda»* y ⛔ **no tiene el botón**: hay que ir a Reclamos o a Retornos |
| **D15** | **Sin fotos ⛔ no se puede registrar una oferta hecha por teléfono** | `mostrarRetencion = ofreceRetencion(…) && hayFotos` (`DecidirReclamo.tsx:447`), y el link *«Se lo ofrecí igual»* vive **adentro** de esa rama (`:1146`) |
| **D16** | **El link del cliente sigue vivo en un cambio ya decidido** | `ABIERTO` (`api/_reclamo.js:26`) incluye `borrador`, y un cambio decidido vuelve a `borrador` a propósito. La lista ya ⛔ no lo ofrece (`linkVivo && !estaDecidido`), pero **un link mandado antes sigue abriendo y aceptando fotos**. Es el único portal del módulo expuesto a internet |
| **D17** | **La acción `cambio` apila un evento «borrador» sin mover la fila** | `api/_reclamos.js:580` apila `{estado:'borrador'}` y `campos` ⛔ no lleva `estado` ⇒ `desdeQueEsta(d,'borrador')` devuelve un instante en el que la fila nunca estuvo ahí |
| **D18** | **`gn-baja` deja en el historial «stock corregido en TN»** | `api/_reclamos.js:841`, cuando la columna hace rato que es la baja en **GN** (`tipos.ts:1950-1960`). El historial es lo que se lee después |

---

## 3. Decisiones de Bruno que faltan (⛔ no son defectos)

| | la pregunta | por qué no la contesta el código |
|---|---|---|
| **B1** | ¿Se puede registrar una oferta sobre un reclamo **sin decidir**? Hoy sí, y así quedó R-0022 | de la respuesta sale si el freno va en `registroDeRetencion` o si hace falta un mensaje nuevo (D4) |
| **B2** | ¿La venta original **se anula** cuando el cliente se queda el producto y se le devuelve una parte? | hoy sí (D1): GN queda diciendo que no vendimos nada, con $7.191 netos cobrados |
| **B3** | ¿«Volver a decidir» tiene que borrar también los **montos**? | hoy deja `monto_total`, `costo_caso`, `retorno_sugerido`, `destino_prenda` y `via_retorno` |
| **B4** | **`PISO_RETORNO`**, por marca: por debajo de cuánto ⛔ no vale la pena traer un producto | `tipos.ts:2096`, en `null` en las dos **desde que existe** ⇒ nunca cambió una cuenta |
| **B5** | ¿El techo de la oferta suma el **costo operativo** de recibir, revisar y reingresar? | `cuentaDescuento` lo acepta (`tipos.ts:1816`) y la pantalla ⛔ nunca se lo pasa (`DecidirReclamo.tsx:437`). Subirlo **agranda las ofertas posibles** |
| **B6** | ¿Cuánto vale el **cupón** frente al reembolso? (la reunión decía ×2) | sin regla, el monto se tipea libre y ⛔ no se puede auditar si estuvo bien |
| **B7** | Los **cuatro plazos que son propuesta y no medida**: `oferta: 3`, `etiqueta: 2`, `despacho: 2`, `sinMandar: 2` | `tipos.ts:2081`. Con los primeros casos reales ya se pueden confirmar o corregir |
| **B8** | ¿Un **cambio** sale por cadete? | `VIAS_CAMBIO` (`ArmarCambio.tsx`) lo sigue ofreciendo; Reclamos lo sacó el 27-ago (`VIAS_VIGENTES`) |

---

## 4. Simplicidad: qué sacaría, y qué ⛔ no

- **Ocho estados → siete.** `anulado` ⛔ no lo pone nadie (D13).
- **`borrador` significa DOS cosas** —«ni lo miré» y «cambio decidido esperando el pago»— y eso se
  parchea **tres veces por separado**: `!d.compensacion` en `alertasDe` (`tipos.ts:2274`),
  `!estaDecidido` en `mensajesDeLaFila` (`botones.ts:122`) y `rehaciendo` en `pasoGuardado`
  (`tipos.ts:1468`). Un estado propio para el cambio que espera el pago borra los tres guards.
- **`en_transito` también significa dos cosas** — pero eso ya está resuelto **derivándolo del dato**
  (`faltaMandarLaEtiqueta` / `laEtiquetaEstaDebida`), con dos relojes y dos tonos. ⛔ No tocar.
- **Siete resoluciones → posiblemente seis.** `otra_unidad` y `reenvio` tienen **exactamente la misma
  fila** de `EFECTOS_RESOLUCION` (`efectos.core.js:82-91`); lo único que las separa es el texto y que
  `laFallaDescuentaStock` mira `otra_unidad`. ⚠️ Fusionarlas **pierde la señal de por qué salió el
  paquete** — es la misma discusión que `talle` / `arrepentimiento` / `no_esperaba`, donde la
  respuesta fue que no. Queda como pregunta, ⛔ no como recomendación.
- **Once casos: ninguno sobra.** Los tres que son el mismo flujo miden tres cosas distintas (la guía
  de talles, la ficha de producto, nada), y está argumentado en `casos.core.js:43-47`.
- **Seis pendientes: ninguno sobra.** `stock_estado` y `reingreso_estado` parecen el mismo movimiento
  manual en GN pero van **en direcciones opuestas**, y revisando `EFECTOS_RESOLUCION` fila por fila
  ⛔ nunca se encienden juntos.
- **Cinco mensajes → seis:** falta el del reenvío (D5). Ninguno de los cinco sobra.

## 5. Escalabilidad: qué se rompe con 200 reclamos por mes en vez de 2

1. **Los dos `limit` de 200** (D12): el badge deja de ver los viejos y la lista se corta **callada**.
2. **`apilar()` es read-modify-write sobre `historial` sin transacción** (`api/_reclamos.js:130-136`),
   documentado como *«no pasa en la práctica»*. Con 200/mes y tres personas trabajando a la vez, dos
   gestos sobre el mismo reclamo **pierden un evento en silencio**.
3. **Todo el filtrado y todos los totales son del cliente**: `visibles`, `totales` y `conAlerta`
   recorren las 200 filas con `items`, `historial` y `fotos` adentro **en cada render**.
4. **`buscarOrden` pega a `bdi-catalogo` sin caché** en cada alta y en cada apertura de Decidir.
5. **El trabajo manual por fila, hoy**: anular la venta en GN · reingresar en GN · dar de baja en GN ·
   crear el cupón en la tienda · abrir el faltante de la otra venta · emitir y cargar la etiqueta ·
   presentar el reclamo al transportista · **tipear la contraseña del Monitor en cada venta técnica**.
   Con dos casos es una tarde; con 200 son **~200 entradas manuales en Gestión Nube por mes**, y el
   sistema hoy sólo se ocupa de que nadie se olvide.

---

## Lo que ⛔ NO se caminó, y se dice como no caminado

- 🔴 **D3 ⛔ no se ejerció con un usuario de Depósito**: está medido leyendo el gate del servidor
  contra el botón, que es determinístico, pero ⛔ no se mandó el POST.
- 🔴 **Retornos está vacía**: sus tres andenes, y los gestos `Llegó`, `Reingresado` y `Despaché`,
  ⛔ **no se caminaron nunca con una fila real** — ni ahora ni desde que existe la sección.
- 🔴 **Zattia tiene 0 reclamos**: todo lo de acá está medido contra BDI.
- ⚠️ El portal del cliente (`/reclamo/<token>`) ⛔ no se abrió en esta pasada: **nada de lo que hace
  el portal se prueba desde el monitor** (lo prueba un teléfono).
