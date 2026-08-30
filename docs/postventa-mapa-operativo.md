# Post-venta — el mapa operativo

**Cómo se OPERA** Reclamos · Cambios · Retornos, de punta a punta: en qué momento cambia el estado,
en cuál está el mensaje, en cuál la retención o el cupón, y qué aprieta cada uno.

⛔ **Esto no reemplaza a las fichas.** `docs/secciones/reclamos.md` y `docs/secciones/retornos.md`
cuentan **cómo está hecho** y son las que se leen antes de tocar código.
`docs/postventa-auditoria-2026-08-28.md` es una **foto con fecha** de lo que no cerraba. Esto es el
**recorrido**: se lee para entender la operación, y se mantiene cuando la operación cambia.

📌 Escrito el 29-ago-2026, sobre el módulo entero caminado por código. Al escribirlo la base tenía
**2 casos reales en BDI y 0 en Zattia**.

---

## 1 · La espina: siete tramos, iguales en los once casos

```
① ENTRADA        Reclamos (o Armar cambio) → action:'crear' → estado 'borrador'
                 Lo único obligatorio: items. ⚠️ la orden y el cliente son opcionales
                       ↓
② SE LE ESCRIBE  se copia el mensaje de apertura (o el acuse) → queda el rastro en el historial
                 con fotos → 'esperando_cliente' · sin fotos y con la pelota nuestra → sigue en 'borrador'
                       ↓
③ EVIDENCIA      el cliente abre /reclamo/<token> (vive 15 días), sube hasta 6 fotos y un relato
                 → el portal cierra la carga → 'en_revision'
                       ↓
④ DECISIÓN       Administración, en Decidir (3 pestañas, y el orden ES la regla)
                 escenario → perfil → resolución → destino → ¿vuelve? → ¿se le ofrece que se lo quede?
                 → action:'decidir' → escribe los 6 pendientes desde EFECTOS_RESOLUCION
                       ↓
                 estado = 'borrador' si es cambio · 'en_transito' si la unidad vuelve · 'resuelto' si no
                       ↓
⑤ LA VUELTA      la etiqueta la emite el correo A MANO → action:'editar' {seguimiento_vuelta}
                 Depósito, andén 1 → action:'recibir'    → 'recibido'
                 Depósito, andén 2 → action:'reingreso'  (Gestión Nube se carga A MANO)
                 Depósito, andén 3 → action:'despachado' (lo que sale hacia el cliente)
                       ↓
⑥ MOVIMIENTOS    seis verbos para los seis pendientes: reintegro (⛔ no antes de que
                 vuelva el producto) · anulacion · reingreso ·
                 cobrado · despachado · cupon-emitido   (+ gn-baja y el reclamo al transportista)
                       ↓
⑦ SALIDA         action:'estado' → 'cerrado'. El servidor contesta 409 con la lista si
                 `faltantesParaCerrar` ⛔ no está vacío. ⛔ No pide administración: lo que protege
                 la plata ⛔ no es el rol, es que no queden pendientes.
```

**Dónde entra la retención.** En ④, adentro de la decisión. Es la oferta de que **el cliente se
quede el producto** a cambio de una parte de la plata o de un cupón, en vez de que vuelva. Se puede
en **5 de los 11 casos** —talle, arrepentimiento, no era lo que esperaba, no es como en la
publicación y fallado—, y sólo si **hay producto en juego**: en la cancelación se apaga sola, porque
el pedido nunca salió. Se registran juntos el monto, la forma —plata o cupón— y la fecha; **media
oferta es un error**. Mientras no haya respuesta, ese momento **desplaza a
todos los otros mensajes**: ofrecer la propuesta y la resolución a la vez es prometerle dos cosas
distintas sobre el mismo reclamo. La respuesta la aprieta **el local**, ⛔ no Administración: cuando
la oferta salió, las dos ramas ya estaban decididas y lo único que agrega el cliente es cuál pasó.

**Dónde entra el cupón.** Dos puertas: como resolución, o como forma de una retención aceptada. Las
dos dejan el pendiente. **El cupón lo crea una persona a mano en la tienda**, y `cupon-emitido`
**exige el código** — es lo único que prueba que existe. Recién ahí aparece el mensaje que se lo pasa.

---

## 2 · Los once casos

| caso | la pregunta que decide | escenarios | ¿fotos? | ¿retención? | salidas posibles | destino típico |
|---|---|---|---|---|---|---|
| **Talle** | ¿Hay stock del talle que pide? | hay stock · sin stock · le llegó otro talle → *mal armado* | si quiere plata | ✔ | cambio · plata · cupón | stock |
| **Arrepentimiento** | ¿En qué estado está el pedido? | **se puede frenar** 💰 *(= cancelación)* · ya salió | si quiere plata | ✔ *(⛔ no si es cancelación)* | plata total · cupón · ninguna | stock / nunca salió |
| **No era lo que esperaba** | ¿Es objetiva la diferencia, o es una expectativa? | coincide · la información pudo confundir · diferencia objetiva → *no como publicado* | si quiere plata | ✔ | cambio · plata · cupón | stock |
| **No es como en la publicación** | ¿Coincide con lo que publicamos? | coincide → *no esperaba* · menor o esperable · **diferencia objetiva** 💰 · no es el producto → *mal armado* | siempre | ✔ | cambio · plata · cupón | stock / falla |
| **Fallado** | ¿Está a una reparación de poder usarse? | se recupera · no se recupera *(= la gravedad)* | siempre | ✔ | plata · otra unidad · cambio · cupón | **falla** |
| **Faltante** | ¿Faltó el producto entero o una parte? | no se preparó · descuadre · traslado · faltó un componente | de lo recibido | ✖ | reenvío · plata | nunca salió *(se reingresa)* |
| **Mal armado** | ¿Qué salió del depósito, y qué tendría que haber salido? | otro producto · otra variante · sin diferencia → *talle* | siempre | ✖ | reenvío · cambio · plata | stock |
| **Excedente** | ¿De qué venta es el producto que llegó de más? | de otra venta identificada · sin identificar · de nadie | de lo recibido | ✖ | **ninguna** | sale de stock / stock |
| **Demoras** | ¿La demora fue antes o después del despacho? | **antes del despacho** 💰 · del transporte *(→ reclamo al correo)* · el plazo estaba mal informado | **nunca** | ✖ | cupón *(sólo si fue nuestra)* · ninguna | — *(no hay producto en juego)* |
| **No recibido** | ¿Dónde está el paquete? | en tránsito · demorado · sin movimientos *(los tres: sólo seguirlo)* · dice entregado · extraviado · llegó tarde → *demora* | **nunca** | ✖ | reenvío · plata total | **perdida** |
| **Sin stock** | ¿Se repone, hay alternativa, o no hay nada? | se repone · hay alternativa · no hay | **nunca** | ✖ | cambio · plata total · cupón *(⛔ nunca reenvío)* | nunca salió *(baja en GN)* |

💰 **El escenario decide la plata en tres casos, y por eso es obligatorio** en todo lo que deriva
plata o stock. Los otros ocho lo usan para reclasificar o para el informe.

🔑 **«¿retención?» es «¿se le puede ofrecer que se lo quede?»**, ⛔ no qué pasa con el producto: es
la propuesta de dejárselo a cambio de una parte de la plata o de un cupón. ⚠️ En **arrepentimiento
se apaga si el pedido todavía no salió** —es una cancelación, ⛔ no hay producto en juego—, así que
ese ✔ depende del escenario.

🔑 **`faltante` y `sin stock` mueven el stock al REVÉS**: en el primero la unidad está en el depósito
y se reingresa; en el segundo no existe y se da de baja. Mismo *«nunca salió»*, movimiento opuesto.

### Las siete resoluciones y qué pendiente enciende cada una

| resolución | plata | anula la venta | reingreso | cobro | despacho | cupón |
|---|---|---|---|---|---|---|
| Se le devuelve todo | ✔ | ✔ | | | | |
| Se le devuelve una parte y se queda con el producto | ✔ | ✔ | | | | |
| Lo cambia por otro producto | si queda a favor | **nunca** | ✔ | si queda a cobrar | ✔ | |
| Se le manda otra unidad igual | | | | | ✔ | |
| Se le manda lo que corresponde | | | | | ✔ | |
| Se le da un cupón | | | | | | ✔ |
| Sin compensación | | | | | | |

El **cambio** es la única que ⛔ no anula la venta y la única con reingreso: Gestión Nube ⛔ no acepta
una venta negativa por API. Por eso ese paso es **una traza de algo que se hace a mano**, ⛔ no una
escritura del sistema — igual que anular y que dar de baja.

---

## 3 · Estado × mensaje × botón

Lo que ofrece la columna, y quién puede apretar qué. **A** = sólo Administración.

| estado | qué significa | mensaje que ofrece la columna | botones |
|---|---|---|---|
| `borrador` *(sin decidir)* | ni lo miró nadie | **el pedido de fotos**, o **el acuse** si el caso ⛔ no pide fotos | Decidir **A** |
| `borrador` *(cambio decidido)* | espera que el cliente pague | la resolución | Cobrar la diferencia · Crear venta |
| `esperando_cliente` | se le mandó el link | el pedido de fotos | Decidir **A** |
| `en_revision` *(sin oferta)* | ya mandó lo suyo, falta decidir | **el aviso de revisión** *(y el pedido de más fotos, en el detalle)* | Decidir **A** |
| `en_revision` *(oferta esperando)* | se le ofreció que se lo quede | **la propuesta** *(desplaza a las otras)* | Registrar que aceptó · Registrar que no aceptó |
| `resuelto` | decidido, sin nada que volver | la resolución *(+ los hechos que ya pasaron)* | Devolver la plata **A** · Anular en GN **A** · Cargar el cupón **A** · Despachar · Dar de baja en GN · Cerrar **A** |
| `en_transito` *(sin etiqueta)* | **falta mandarle la etiqueta** | la resolución + **el aviso de la etiqueta** | Cargar seguimiento **A** · Marcar recibido **A** |
| `en_transito` *(con etiqueta)* | en camino de vuelta | la resolución + **la etiqueta** | Cargar seguimiento **A** · Marcar recibido **A** |
| `recibido` | llegó todo lo esperado | la resolución + **el aviso de la llegada** | Pasar a Fallas **A** · Cerrar **A** |
| `cerrado` | terminado | *(sale del tab «Abiertos»)* | — |
| `anulado` | ⛔ **ninguna pantalla lo pone** | — | — |

**Los doce momentos de mensaje**, en el orden del recorrido: acuse · pedido de fotos · pedido de más
fotos · aviso de revisión · la propuesta · la resolución · el aviso de la etiqueta · la etiqueta · el
aviso del despacho · el aviso de la llegada · el cupón · el aviso de la devolución. *(El trece es el
ticket del cambio, que sale por la otra pantalla.)*

🔑 **La regla que los ordena: PROMESAS contra HECHOS.** Una oferta esperando respuesta **calla las
promesas** —la resolución, el acuse, el pedido de fotos, la etiqueta que va en camino— porque son
otra cosa que la que se está negociando. **⛔ No calla los hechos**: la etiqueta que ya existe, el
paquete que salió, el que volvió, el cupón emitido y la plata acreditada ya ocurrieron en el mundo, y
un hecho ⛔ no se contradice con una propuesta.

🔑 **Copiar cuenta como decirlo**, y el registro se apila **cuando el portapapeles aceptó**, ⛔ no
cuando se apretó el botón. Queda el momento, la fecha, quién y **el texto completo**, y se lee en el
detalle de la fila. ⛔ **No mueve `updated_at`**: contarle al cliente que la plata va a salir
reiniciaría el reloj de que la plata no salió.

### Quién aprieta qué

| | qué puede | qué ⛔ no |
|---|---|---|
| **LOCAL** | los doce mensajes · registrar la respuesta a la oferta · Despachar · Dar de baja en GN · Cargar la otra venta · el detalle de la fila · armar y cerrar un cambio | decidir · la plata · anular · el cupón · cargar el seguimiento |
| **ADMINISTRACIÓN** | todo lo anterior + Decidir, Volver a decidir, Devolver la plata, Anular en GN, Cargar el cupón, Cargar seguimiento, Marcar recibido, Pasar a Fallas, Descontar, Cerrar, Eliminar | — |
| **DEPÓSITO** | los tres gestos físicos de Retornos: **Recibir · Reingresar · Despachar** | ⛔ **abrir Reclamos**: la puerta angosta ⛔ no le trae ni el relato, ni los montos, ni el token |
| **CLIENTE** | subir hasta 6 fotos y escribir un relato, mientras el reclamo esté abierto | todo lo demás: el portal ⛔ no pide dirección, ni sucursal, ni DNI, ni CBU |

⚠️ **La plata se devuelve por el mismo medio con el que pagó**, así que ⛔ **no se le pide CBU ni
alias en ningún lado**. Lo único bancario del módulo es el comprobante que carga Administración al
tildar el reintegro.

🔴 **Y desde el 30-ago-2026 hay un ORDEN: la plata ⛔ no sale hasta que el producto vuelva.** El
servidor contesta **409** y nombra el producto que falta; el botón **sigue estando** —el freno no es
esconderlo— y si hay que pagar antes igual, se escribe **por qué** y queda en el historial. Mientras
la plata esté afuera con el producto sin volver, corre un aviso propio en rojo: *«la plata salió hace
N días y el producto todavía no volvió»*.

---

## 4 · La vuelta, en detalle

**Qué decide que el producto vuelve.** La cuenta —lo recuperable contra el envío de vuelta— **sugiere**
y queda registrada, pero **decide una persona**, y el default es **que NO vuelve**. ⚠️ Es una decisión
con plata que se toma por omisión: si nadie contesta, el producto se regala.

**Las vías vigentes son dos: Correo Argentino y Andreani.** El cadete y «la trae al local» se
retiraron el 27-ago-2026 —⛔ nunca se usaron— y con eso **todo retorno cuesta envío**. ⚠️ El servidor
todavía acepta las cuatro, porque **Cambios sigue ofreciendo el cadete**.

**La etiqueta ⛔ no tiene columna propia**: que exista lo dice el código de seguimiento. La emite el
correo **a mano**, fuera del sistema, y la carga Administración. De ahí salen los dos sub-estados:

| | qué pregunta | de qué cuelga |
|---|---|---|
| **¿falta la etiqueta?** | un hecho de la fila | **el rótulo del estado** |
| **¿es nuestro turno?** | falta **y** ⛔ no hay una oferta esperando | **el mensaje y el reloj** |

Con una oferta esperando, la etiqueta ⛔ **todavía no corresponde**: mandársela antes de que conteste
es dar por hecho que dijo que no. La espera, ahí, es del cliente.

🔴 **El código de seguimiento ⛔ no guarda un dato: mueve el caso.** Vacío, el estado se lee «Falta
mandarle la etiqueta» y el reloj que corre es el **nuestro** (rojo a los 2 días). Con algo adentro
pasa a «En camino de vuelta», se le manda el seguimiento al cliente y el reloj que corre es el del
**transporte** (amarillo a los 15). ⇒ un código mal tipeado **cambia a quién estamos yendo a buscar**.
Por eso tiene un **piso** —⛔ no un formato, que este repo ⛔ no midió— y lo aplican la pantalla **y**
el servidor.

⚠️ **Andreani es un portal y ⛔ no toma el código por URL**: el link abre una pantalla vacía, así que
al lado va el botón para copiarlo.

**Cómo nos enteramos de que llegó: alguien lo aprieta.** ⛔ No hay ninguna integración con
transportistas en todo el repo. Lo único que llega solo es el seguimiento de Tienda Nube, y es de la
**ida de la venta original**, ⛔ no del retorno. Lo que sí hay son los relojes, y ahora salen al
sidebar de quien tiene que actuar.

### Los tres andenes de Retornos

| andén | qué cae | gesto | reloj |
|---|---|---|---|
| **Esperando** | todo lo que está `en_transito` | **Recibir** *(de a una unidad, o todas juntas)* | 15 días sin aparecer → amarillo |
| **Para guardar** | llegó y ⛔ no volvió a stock ni a Fallas | **Reingresar** *(en GN, a mano)* | ⛔ ninguno, a propósito: está adentro del depósito |
| **Para despachar** | hay que mandarle algo y ⛔ no salió | **Despachar** | 2 días desde la decisión → rojo |

⚠️ **Un cambio está en dos andenes a la vez y ⛔ no es un error**: esperamos lo que devuelve *y* le
tenemos que mandar lo que se lleva.
🔑 **Se recibe de a una unidad**: el reclamo sigue en tránsito mientras falte una.

---

## 5 · Los ocho relojes

| reloj | plazo | tono | qué dice |
|---|---|---|---|
| abierto y nunca se le escribió | 2 d | rojo | ⚠️ se calla apenas se le escribe |
| el cliente no responde | 10 d | amarillo | |
| esperando una decisión | 3 d | rojo | |
| le ofrecimos y no contestó | 3 d | amarillo | corre desde la oferta, ⛔ no desde el último toque |
| no le mandamos la etiqueta | 2 d | rojo | **nuestro** |
| hace N días que no llega | 15 d | amarillo | **del transporte**, y ⛔ sólo si la etiqueta existe |
| la plata no sale | 5 d | rojo | |
| falta despachar | 2 d | rojo | cuenta desde la **decisión**, ⛔ no desde el último evento |

⚠️ **Los cuatro últimos plazos son una propuesta, ⛔ no una medida.** Se confirman con los primeros
casos reales.

🔑 **Ninguno cuenta desde `updated_at`**, y ésa es la lección más cara del módulo: el toque más
probable sobre algo que se demora es **ir a ver por qué se demora**, así que ocuparse del caso
apagaría la alarma. Todos cuentan desde el **evento** del historial.

---

## 6 · Lo que sigue abierto

**Decisiones que ⛔ no contesta el código** — están en la auditoría del 28-ago como B1 a B8, más dos
que salieron de escribir este mapa:

- el **piso del retorno** por marca: está sin poner desde que existe ⇒ la cuenta nunca frenó nada;
- que el default sea **que el producto NO vuelve**: hoy, si nadie contesta, se regala;
- **cuánto vale un cupón** frente al reembolso: sin regla, el monto se tipea libre y ⛔ no se puede auditar;
- si el techo de la oferta suma el **costo de recibir, revisar y reingresar**: subirlo agranda las ofertas;
- si se puede registrar una oferta sobre un reclamo **sin decidir**;
- si «Volver a decidir» tiene que soltar también **los montos**;
- los **plazos** de arriba;
- si un **cambio** sale por cadete — de eso depende apretar las vías en el servidor.

**Y un dato que falta, ⛔ no un defecto**: los productos tienen el costo en blanco, así que
*«lo que nos costó»* cuenta la mercadería **en cero** y hoy es sólo la plata. El número se mueve solo
el día que se carguen.

**Lo que ⛔ no se caminó nunca**: Retornos **no tuvo jamás una fila real** —ni sus tres andenes ni
Recibir, Reingresar y Despachar—, Zattia tiene **0 reclamos**, y el portal del cliente lo prueba un
teléfono, ⛔ no un test.
