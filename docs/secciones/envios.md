# Envíos del día — ficha de sección

Sección `envios`, área `local`. En prod desde el 13-ago-2026. Reemplaza la planilla de Google
`ENVIOS ZATTIA / BDI`. Incluye el **portal público del cadete** (`/cadete/<token>`).

## Dónde vive

| qué | archivo |
|---|---|
| Pantalla interna | `components/envios/Envios.tsx` (**74 KB — leer por rango**) + `useEnvios.ts` |
| Portal del cadete | `components/envios/PortalCadete.tsx` + `lib/envios/portal.core.js` |
| **La cuenta de la puerta** | `lib/envios/reglas.core.js` |
| Lo de la pantalla | `lib/envios/core.ts` · `cliente.ts` · `tipos.ts` |
| **La ayuda de la pantalla** | el **manual** vive en la base (`seccion: envios`, se edita sin deploy) · el **tour** en `lib/envios/guia.ts` + `lib/guia/core.ts` + `components/ui/Guia.tsx` + `store/useGuia.ts`, y las anclas `data-guia` adentro de `Envios.tsx` |
| **El mensaje a la clienta** | `lib/envios/mensajes.ts` — puro y con tests, molde de `lib/canjes/mensajes.ts`. Lo abre el botón de WhatsApp de la fila (`Direccion`), **sólo en la bandeja «Sin fecha»** |
| **Los dos papeles** | `lib/envios/ticket.ts` (el que va pegado al paquete) · `lib/envios/recibo.ts` (el del movimiento de la cuenta), los dos sobre **`lib/rollo80.ts`** — la geometría del rollo, el medidor y el dibujo de textos y reglas. ⛔ **Las medidas del rollo no se copian**: `lib/sesionfotos/ticket.ts` es un tercer papel de 80 mm que **no está migrado a propósito** (su interlineado es 0.42 contra 0.38) |
| **El mapa de zonas** | `lib/envios/zonas.core.js` — ⛔ **no traer turf**: son 30 líneas copiadas con su misma semántica, cotejadas contra él en 195.428 puntos · pantalla en `components/envios/ZonasDeReparto.tsx` (4ª pestaña) · tabla `envios_zonas` |
| **De la dirección al punto** | `lib/envios/direccion.core.js` (el limpiador y **el candado**) + `api/_georef.js` (el geocoder del Estado, por lote). Entra por `action: 'zonas-sugerir'` y **no escribe nada** |
| Handlers | `api/_envios.js` (por `datos.js?recurso=envios`) · `api/_cadete.js` (cuelga de `postventa.js`) |
| Tablas (base de **BDI**, como Canjes) | `envios_reparto` · `envios_movimientos` · `envios_portal`. ⚠️ **`envios_dia` quedó vestigial**: ver «Cerrar el día se sacó» |
| Migraciones | `scripts/apply-envios.mjs` · `sql/migrate-envios-*.sql` |
| Tests | `tests/envios-core.test.ts` · `envios-cliente.test.ts` · `cadete-portal.test.ts` · `envios-mensajes.test.ts` |

**Cero funciones nuevas de Vercel**: los dos handlers son `_*.js` y cuelgan de puertas existentes.

⛔ `reglas.core.js` es `.js` plano **a propósito**: la leen el handler y el portal, que no pueden
importar TypeScript. El papel, la pantalla y el teléfono salen de UNA implementación. Lo mismo vale
para `CAMPOS`, `CAMPOS_CUENTA` y `FILTRO_BANDEJA`: viven ahí porque en el handler no se pueden afirmar.

## Reglas de negocio que el código no dice

- 🔑 **La hoja del día NO tiene marca; la bandeja SÍ.** Van al revés a propósito: el cadete sale con
  BDI y Zattia en la misma mochila y la rendición es una, pero cotizar y acordar el día lo hace el
  equipo de una marca mirando su tienda. La hoja las separa con el chip de color, no con un filtro.
- 🔴 **`monto_envio` es el COSTO DEL REPARTO, siempre**, y nunca se pone en 0 para decir que no se
  cobra. Quién paga lo dicen dos tildes separadas: `envio_pagado` (plata que entró) y
  `envio_bonificado` (plata que no entró nunca). ⇒ `tarifaCadete` = `monto_envio`, punto.
- 🔑 **En el bonificado la clienta paga $0 y el cadete cobra igual** (lo decidió Bruno).
- 🔑 **Bonificar es un botón de la columna «Pago del envío», no del precio** (17-ago-2026, lo pidió
  Bruno). Colgaba de `Cotizar`, debajo del monto, y lo que dice no es cuánto sale el reparto sino
  **quién lo paga**: es la misma pregunta que Pendiente/Pago. `pagoDelEnvio` devuelve la lista de
  acciones con su `campo` y su `siguiente`, así que la pantalla no elige a quién le escribe — el
  mutante caro es un botón que dice «Bonificar» y marca el envío como pago, que son dos verdades
  opuestas sobre la misma plata y no falla nada. ⛔ **Desde Pago no se ofrece bonificar** (también lo
  decidió Bruno): habría que devolver plata que ya entró, así que se pasa por Pendiente.
  🔴 **Y va SÓLO en la bandeja** (lo corrigió Bruno el mismo día, viéndolo): bonificar se decide antes
  de que el paquete salga, y en la hoja del día la columna «Cobra» ya tiene tres cosas apiladas —un
  botón más **alarga cada fila** de la única pantalla que se lee de un vistazo cargando la moto—. Lo
  dice `pagoDelEnvio(e, conBonificar)`, **no un `filter` en el JSX**: lo que se ofrece en cada lugar es
  una regla. ⚠️ **Sacar** la bonificación sí se ofrece en las dos: es la salida de un estado ya
  escrito, y sin ella una fila bonificada por error y agendada después no se corrige desde ningún lado.
  🔑 **Y `donde` es UN prop, no dos booleanos**: la pastilla y el botón se apagan en el mismo lugar y
  por la misma razón; con dos flags sueltos, un llamador nuevo los cruza y queda una pantalla que no
  es ninguna de las dos. 🔴 Los botones van **`outline`, no `ghost`**: sin borde ni fondo se leían como
  texto suelto y la columna quedaba una lista de frases — **un botón que no parece un botón es una
  función que no existe**.
- 🔑 **El primer mensaje a la clienta lo arma el sistema** (17-ago-2026, lo pidió Bruno). Es el
  contacto que sigue a la orden —cuánto sale el envío y cuándo pasa la moto— y se tipeaba de memoria,
  con los dos datos que más caro salen mal. **Se precarga, no se manda**: `wa.me` abre el chat con el
  texto y lo revisa una persona. Las reglas que no se pueden aflojar:
  · ⛔ **DESDE EL 18-ago el mensaje NO nombra ningún total** (decisión de Bruno, abajo) ⇒ la regla
  vieja —«el número de "al recibir" sale de `aCobrar`»— **ya no aplica acá**: no hay número de la
  puerta en el texto. Sigue viva y sin aflojar **en el ticket**, que es donde ese número se promete;
  · 🔴 **sin precio no hay mensaje** (devuelve `null` y el botón vuelve a abrir el chat vacío, como
  antes): un mensaje de coordinación sin el número obliga a un segundo mensaje con la plata, que es el
  ida y vuelta que esto viene a sacar, y callarse el precio adentro de un texto que habla de plata es
  peor que no mandarlo;
  · 🔑 **saldado cambia el texto, no lo borra**: «ya está pago» / «va sin cargo», nunca un costo — el
  mismo error que el KPI que mandaba a reclamarle plata a quien ya había pagado;
  · 🆕 **EL TEXTO LO REESCRIBIÓ BRUNO** (18-ago-2026): la introducción queda igual **hasta el número
  de pedido** y de ahí abajo va el suyo — «El costo del envío a … es de $X.» · «Podríamos enviar …» ·
  «¡Esperamos tu confirmación!». Tres decisiones suyas, las tres fijadas con tests porque **ninguna
  se puede deducir del código**:
  · 🔴 **dice SÓLO el envío, sin el total** (*«dejalo que diga solo el envío, sin el total»*).
  ⚠️ **La consecuencia, escrita para que nadie la «arregle» de vuelta**: en una fila con saldo del
  pedido el mensaje nombra $ 4.200 y el cadete cobra $ 16.342 — está aceptado, el número entero vive
  en el **ticket** y `aCobrar` sigue siendo la única cuenta, pero **el mensaje ya no es el lugar
  donde ese número se promete**;
  · 🔴 **NO nombra la forma de pago** (*«depende mucho de qué seleccionó en la compra, entonces no
  nos metamos en eso»*) ⇒ ⛔ una línea «efectivo o transferencia» es una **afirmación sobre lo que la
  clienta ya eligió en el checkout**, y este archivo no tiene ese dato. No se vuelve a agregar sin
  traerlo 📌 [[feedback_areben_pantalla_que_no_pregunta_igual_afirma]];
  · 🔴 🔑 **la marca es la LARGA — «BDI Accesorios», no «BDI» — y sale del MISMO lugar que el
  ticket** (`nombreDeMarca` en `core.ts`, que lee `CUENTAS`). Antes cada papel tenía **su propia
  tabla escrita al lado de donde se usaba**: el ticket decía «BDI Accesorios» y el WhatsApp «BDI»,
  o sea **los dos papeles que recibe la misma clienta con nombres distintos**. ⚠️ **Ninguna de las
  dos estaba mal sola**, no fallaba un test, y lo cazó **Bruno leyendo el mensaje**. ⛔ La tercera
  copia (`components/usuarios/Resumen.tsx`) dice «BDI» **a propósito**: es una grilla interna de
  permisos donde el nombre largo no entra y no lo lee nadie de afuera;
  · 🔴 **«¡Esperamos tu confirmación!» viaja PEGADA a la línea de los días** — sola es un pedido sin
  objeto: le pide que confirme algo que el mensaje nunca ofreció;
  · **12 mutantes, 12 muertos** (18-ago), entre ellos los tres que devuelven el texto viejo: la forma
  de pago, el total a la puerta y la tabla de marca propia y corta;
  · 🔴 **va SÓLO en la bandeja «Sin fecha», y SIEMPRE propone** (lo corrigió Bruno el mismo día,
  viéndolo): es **la primera comunicación**, la que abre la conversación. En la hoja del día el envío
  ya está acordado y el que escribe desde ahí es el cadete, con su propio mensaje
  (`mensajeParaLaPuerta`, el del portal) — dos textos para dos momentos, y meter el primero en el
  segundo reabre algo ya cerrado. Hubo una versión que **confirmaba** el día cuando la fila lo tenía,
  y en la bandeja habría sido un defecto: 🔴 **un `no_entregado` vuelve a la bandeja con la fecha de su
  intento fallido puesta**, así que le habría confirmado a la clienta el día en que no la encontraron.
  ⚠️ El default de `Direccion` es **sin** mensaje: una pantalla nueva que la monte no le manda a nadie
  un texto que nadie decidió mandar;
  · 🔑 **los días arrancan MAÑANA**: cuando se manda el primer mensaje la mochila de hoy ya está
  armada. Y salen de `proximoDiaDeReparto` + `diaDeRepartoVecino`, no de sumar días corridos — el
  jueves ofrecería **sábado**, y ése fue un mutante que sobrevivió hasta que el test se paró en un
  jueves. 🔑 **Medir donde el defecto se ve**: con el caso en un lunes daba verde.
  · 🔴 **`encodeURIComponent`**, o el texto se corta en el primer `&` o `#` — y el `#` del número de
  orden va en la primera línea, así que llegaría partido **siempre**.
- 🔑 **El día del reparto lo confirma el CLIENTE, no la orden.** Las órdenes de TN caen en la bandeja
  «Sin fecha», que **no es una bandeja de entrada: es la lista de trabajo** (`fecha is null` OR
  `estado='no_entregado'`). `fecha` y `turno` van los dos o ninguno (check `envios_fecha_turno_juntos`).
- 🔑 **La grilla de turnos NO se valida en el servidor**: la pantalla ofrece los que existen y avisa
  si se fuerza otro. Un envío especial un sábado tiene que poder salir sin tocar código.
- 🏁 **«Cerrar el día» SE SACÓ** (17-ago-2026, lo pidió Bruno después de preguntarme para qué servía).
  Escribía una fila en `envios_dia` con `cerrado_por` y una nota, y **no cambiaba ningún número**: la
  cuenta sale de los envíos entregados y de los movimientos, así que un día cerrado o abierto daba
  exactamente lo mismo. Sólo producía el KPI «Días sin cerrar» y una línea diciendo quién lo apretó.
  🔴 **Y nadie lo apretó nunca: `envios_dia` quedó vacía desde el 13-ago**, o sea que el sistema
  funcionó un mes sin ese paso. Había perdido su razón en la tanda G, cuando la plata del día
  (`trajo`) se mudó a `envios_movimientos`; de ahí en más era «alguien lo revisó».
  🔑 **Su caso propio —un día sin reparto en el que igual se movió plata— lo cubren los movimientos**,
  que tienen fecha propia: por eso `cuentaDelCadete` pasó de tres fuentes de días a dos sin perder
  ninguna fila.
  ⛔ **La TABLA no se dropea, y es una decisión.** Tres migraciones la crean, así que dropearla
  obligaría a volver a poner un guard condicional en cada una — que es exactamente el trabajo que
  costó `2adcd30` («un `add column if not exists` después de un `drop column` no es idempotencia, es
  una resurrección»). Una tabla vacía que nadie lee no cuesta nada; el guard mal puesto sí.
- 🔑 **La hora de la entrega la escriben los DOS lados y la decide una sola función**
  (`selloDeEntrega`, 17-ago-2026, lo pidió Bruno). La marca el que toca «Entregado»: la pantalla
  interna y el portal del cadete, que es el que la toca de verdad en la puerta.
  · 🔴 **Volver atrás la BORRA**: un `entregado` corregido a `no_entregado` con la hora puesta es el
  registro —con hora exacta, que es lo que lo vuelve creíble— de una entrega que no pasó. Por eso la
  función devuelve **siempre** el campo, con la hora o con `null`: así no hay que acordarse de limpiar.
  · 🔴 **No se deduce de `updated_at`**: esa columna se mueve con cualquier escritura, así que
  corregir el precio de un envío entregado la semana pasada le cambiaría la hora de entrega. Un dato
  que parece bueno y envejece mal es peor que no tenerlo.
  · 🔑 **La pone el SERVIDOR**, no el teléfono: el reloj del celular del cadete puede estar corrido y
  esto no se corrige después. Y el sello va **sólo** con las acciones que mueven el estado — `cobrado`
  y `no_cobrado` son sobre la plata y se tocan al día siguiente.
  · ⚠️ **Las filas anteriores quedan en `null` y la pantalla dice «sin hora»**: rellenarlas habría
  dado una hora plausible y falsa para siempre. Mismo criterio que `cobrado: null`.
- 🔑 **El `+` de la cuenta abre los envíos de ese día** (17-ago-2026, lo pidió Bruno). «3 de 4» era la
  fila que más se mira y la que más preguntas dejaba —cuál no llegó, a qué hora pasó por cada puerta,
  quién cobró—: estaba todo en la base y no se podía ver sin cambiar de pestaña y buscar el día a
  mano. Por eso `DiaDeCuenta` lleva `filas` con **todos** los envíos del día, no sólo los entregados.
  ⛔ **No salen al portal**: `paraElCadeteCuenta` arma su respuesta campo por campo y lo afirma un test
  de lista cerrada — que es exactamente para lo que se escribió.
- 🔑 **La cuenta son MOVIMIENTOS con signo, sin columna `tipo`** — el signo va adentro del dato.
  Positivo = el cadete tiene plata nuestra. **Rinde cuando pasa**, no por día de reparto. No se
  guarda ningún total: el saldo se arrastra y un día congelado haría mentir a todos los siguientes.
- 🔑 **En el papel NUNCA va un número con signo: va el VERBO y el monto en positivo.** «Rindió
  $10.000» y «Le pagamos $10.000» son lo contrario con el mismo número, así que el recibo saca las
  dos cosas de `claseDelMovimiento` —la misma que la pantalla— y nunca imprime el crudo. Lo mismo
  vale para el saldo: `rotuloDeSaldo` da la frase («el cadete tiene plata nuestra» / «le debemos») y
  el monto en positivo. 🔑 **Vive en `reglas.core.js` y no en el KPI**, que es donde estaba: de las
  dos copias, la que no se puede recargar es la que quedó impresa en la mano del cadete.
- 🔑 **El recibo lleva el saldo FECHADO al instante de impresión** («Saldo al imprimir · lun 17-ago
  19:04»), y ésa es toda la idea del papel. Como no se guarda ningún total, el saldo cambia solo
  cuando alguien corrige el precio de un envío de la semana pasada: un «Saldo: $47.000» a secas
  envejece en silencio y **dos reimpresiones del mismo movimiento se contradicen** sin que ninguna
  esté mal. Con el sello, las dos son ciertas y hablan de momentos distintos — y el invariante de no
  guardar totales queda intacto. El sello usa el **mismo `OFFSET_AR_MS` del portal**, no la hora del
  navegador: una máquina mal configurada le pondría al papel una hora que no es la del local.
- 🔑 **El recibo es UNA copia y no lleva firma** (lo decidió Bruno): es el comprobante que se lleva
  el cadete, y el local ya tiene la fila. Sólo se imprime de un movimiento **vivo** — el papel de uno
  anulado sale idéntico a uno bueno y después no hay con qué distinguirlos.
- 🔴 🔑 **UN PEDIDO NO SE ENTREGA SI NO ESTÁ PAGO** (lo dijo Bruno el 17-ago-2026, y reordena todo lo
  de abajo): se paga **en el momento de entregar**, o al cadete o transfiriendo al local. ⇒ un
  `entregado` con `cobrado === false` **no es una deuda de la clienta: es una transferencia al
  local**. Si de verdad no paga, el paquete no se entrega y el envío es `no_entregado`. Por eso la
  función se llama `pagoAlLocal` y no `cobroPendiente`, y por eso el KPI dice «Pagado al local por
  transferencia» y no «Falta cobrarle a clientas» — **ese rótulo mandaba a reclamarle plata a una
  clienta que ya había pagado**, y en rojo.
- 🔑 **`cobrado: null` («no dijo nada») NO es `false`** — todas las filas anteriores al portal son
  `null` y la cuenta las lee como el caso normal: la cobró él. Los **tres** valores dicen **por dónde
  entró la plata**, no si entró. La tarifa se le paga igual: llevó el paquete.
- 🔑 **La partición de la cuenta es «quién tiene la plata», no «entró o no entró»**: `cobrado` (la
  mano del cadete, y por eso la trae en la rendición) contra `sinCobrar` (entró al local). Las dos
  suman lo mismo que antes; lo que cambió el 17-ago es lo que la pantalla dice de ellas.
- 🔴 **El envío del cadete llega de TN SIEMPRE en $0** (18 de 18 medidos). El precio no viaja en la
  orden: está escrito en el nombre de la opción, por zona. **Hoy se tipea**, pero el mapa de zonas ya
  está cargado (16 zonas en `envios_zonas`); falta **geocodificar la dirección** para poder proponer.
- 🔑 **El mapa de zonas tiene DOS fuentes y cada una manda sobre una cosa: el DIBUJO viene del mapa
  externo** (un HTML con Leaflet que vive fuera del repo, se exporta a JSON y se importa desde la
  pantalla) **y el PRECIO se edita en la app**. Re-importar actualiza el dibujo y **no pisa los
  precios** — sin esa asimetría, corregir un polígono revierte las dieciséis zonas al valor que el
  JSON tenía el día que se exportó, en silencio, y los precios se mueven seguido (entre el mapa de
  abril y el de junio hay $1.000 en todas). Una zona que está en la base y no viene en el archivo
  **no se borra**: se informa. Vive en `planDeImportacion`, y la previsualización sale del **mismo
  llamado** que la escritura (`confirmar: false`/`true`) para que no puedan divergir.
- 🔴 **El candado va ANTES del motor: sin altura no se pregunta, y sin altura en la respuesta no se
  propone.** Georef contesta igual sin número de puerta —con un punto cualquiera de la calle entera—
  y `precioSugerido` no puede distinguirlo, porque **un punto es un punto**. Medido: 66 de 100
  direcciones sin número salían con precio, y `"(2000)"` —vacía, sólo el CP— salía $4.800. Por eso la
  validación no puede vivir adentro del motor y está partida en dos mitades (`consultaDe` antes de
  gastar la consulta, `sugerenciaDePunto` después). 🔑 **Y el candado es lo que hace segura la
  escalera de variantes**: sola empeoraba todo (precisos 92→95, inventados 30→68), porque lo que más
  recupera son las calles peladas.
- 🔴 **Sin localidad no se pregunta, y NUNCA se reintenta sin ella.** `"Entre esmeralda y chacabuco"`
  vino así en una orden real y hace fallar la consulta con la calle bien. Preguntar sólo por la
  provincia recupera esa dirección y **rompe las de Funes**: la calle homónima de Rosario devuelve un
  punto **preciso** en la zona equivocada, $4.300 donde van $9.000.
- 🔴 🔑 **El código postal es la SEGUNDA señal, y va al lado de la localidad — nunca en su lugar.**
  Son dos mitades con reglas opuestas y las dos se decidieron con Bruno el 17-ago-2026:
  · **Se contradicen ⇒ no se propone nada** (`localidad_dudosa`), y el motivo dice **cuáles son las
  dos**: «el código postal dice Villa Gobernador Gálvez y la dirección dice Rosario». Sólo cuenta
  como contradicción cuando **los dos** nombran una localidad de reparto conocida. ⛔ **No se elige
  un ganador porque los dos mienten**: el CP lo tipea el cliente y cae en 2000 por defecto, y
  «Rosario» es como se llama en la calle a todo el Gran Rosario.
  · **La localidad no nombra nada reconocible ⇒ el CP entra como REINTENTO, después de fallar.** El
  orden es toda la seguridad que tiene: preguntar primero con el texto tal cual es lo que deja que un
  pueblo real que no es de reparto se vaya, bien, afuera del mapa. Así el reintento **no puede pisar
  un punto bueno**, sólo llenar un hueco — el mismo criterio que la escalera de variantes.
  🔑 **Y cuando se la reconoce, la localidad se manda CANÓNICA**: medido, `"vgg"` Georef no lo
  entiende y `"Villa Gobernador Gálvez"` sí; `"Rosario - Rosario"` es la forma que más manda TN.
  🔴 **La decisión del reintento vive en `pedidosDelReintento`, no en el handler**, por el mismo
  motivo que `enviosDelDia` y `valorDeCobro`: sus dos mutantes —correrlo antes, o correrlo también
  para las que ya resolvieron— dan una tanda que anda, contesta 200 y devuelve precios plausibles.
- 🔑 **La escalera para en la primera forma que conteste, aunque el punto salga impreciso.** Seguir
  despojando hasta conseguir uno con altura es conseguirlo **de otra calle**: "Av San Martin 1200" sin
  altura se tipea a mano, "Martin 1200" es un punto exacto y ajeno.
- 🔴 **La `nomenclatura` de Georef trae el DEPARTAMENTO, no la localidad, y no se muestra tal cual.**
  Roldán es del departamento San Lorenzo —que además es otro pueblo, a 25 km para el lado contrario—,
  así que una dirección de Roldán bien resuelta volvía como `"TUCUMAN 963, San Lorenzo, Santa Fe"`.
  Funes, Pérez, VGG, Ibarlucea y Soldini son del departamento Rosario y volvían diciendo «Rosario».
  🔑 **Costó caro porque el texto se estaba usando para revisar**: en la confirmación del mapa se
  marcaron como equivocadas direcciones que estaban perfectas — **el cartel corrompió la medición**.
  `encontrado` se arma con `localidad_censal` (28 de 120 cambiaron); la `nomenclatura` cruda queda
  sólo para detectar la esquina.
- 🔑 **Georef contesta NADA cuando conoce la calle pero no tiene el número** (`Minetti 2682` → nada,
  `Minetti` → `PJE MINETTI`): «no se pudo ubicar» **no** quiere decir que la calle no exista, y por eso
  volver a preguntar sin la altura es exactamente la trampa.
- 🔑 **«Coordinar» NO es un precio a convenir**: el paquete se lleva y se cobra lo de la zona; lo que
  se coordina es **cuándo se va**. Por eso es una marca al lado del precio, no un tipo de zona.
- 🔑 **Lo que proponga el motor se confirma a mano** (decidido con Bruno): un precio de la zona de al
  lado no lo caza nadie, mientras que la falta de precio ya bloquea agendar. Por eso `precioSugerido`
  devuelve `ambigua` **sin precio** cuando el punto cae en dos zonas empatadas que cobran distinto, y
  por eso el **nombre** de la zona viaja al lado del precio: «Zona 7 — $4.500» no se puede revisar.
- 🔑 **`dias`/`turnos` de una zona existen por Funes**, que sale sólo martes y jueves a la mañana. Se
  guardan y se preguntan los dos aunque hoy digan lo mismo (martes y jueves son los únicos días con
  turno mañana): deducir uno del otro convierte un cambio de grilla en un paquete que no sale.
- 🔴 **El filtro del correo es NEGATIVO a propósito** y mira dos señales (nombre `Envío Nube - …` y
  tracking). La positiva («que diga cadete») falla en silencio: `shipping_option` es **texto libre
  que la tienda edita**. El 59% de lo que pasaba el filtro viejo era Correo Argentino y Andreani.
- 🔴 **LA DIRECCIÓN MANDA, NO EL NOMBRE** — lo dijo el cadete, y vale para el papel y el teléfono.
- 🔑 El **CP** avisa «fuera de zona» pero va AL LADO de la localidad, no en su lugar: hay CP 2000 de
  Rosario a 100 km. Con CP vacío no avisa nada.
- 🔴 **Mandar a un día BLOQUEA sin precio**: un paquete en la calle con un ticket que no pide nada es
  un envío que nadie cobra y un cadete al que igual hay que pagarle.
- 🔑 El portal tiene **tres barreras y ninguna alcanza sola**: token de 64 hex con vencimiento (el
  inexistente y el vencido dan el mismo 404 pelado) · PIN corto con traba a los 10 fallos, chequeado
  ANTES de armar la lista · **el día acotado a ±1 del servidor, que es la más importante**. El PIN va
  **en claro a propósito**: quien lo manda por WhatsApp tiene que poder leerlo. Rotar mata el link
  anterior en el acto (no hay sesión del otro lado) ⇒ es también la revocación. Se rota el 1º de cada mes.
- 🔴 Los días que todavía no llegaron salen **sin dirección, teléfono ni `id`** (`paraElCadeteFuturo`):
  es lo que hace que mirar la semana no multiplique por siete lo que entrega un link filtrado.
- 🔑 **El cadete ve su CUENTA desde el mismo link** (`&vista=cuenta`, 17-ago-2026, lo pidió Bruno):
  saldo, los movimientos y el día por día, **de sólo lectura**. Quién movió la plata lo escribe el
  local, y los `id` no viajan, así que desde ahí no hay a qué apuntarle.
  · 🔴 **Es lo primero del portal que mira hacia atrás sin límite, y por eso las dos cosas van
  separadas**: el **saldo** se calcula sobre TODOS los días —se arrastra desde el primero, y recortar
  antes de acumular da un número plausible y falso— y el **detalle** se recorta a `DIAS_DE_CUENTA`
  (60). Lo que hace que se pueda recortar sin mentir es la línea **«antes de esto el saldo era $X»**:
  sin ella la primera fila muestra un acumulado que no se deduce de nada de lo que hay en pantalla.
  · 🔑 **Las ventanas de fecha no aplican acá y no es un olvido**: no se pide un día, y lo que sale son
  **agregados** — ni un nombre, ni una dirección, ni un número de orden. Es una vista más barata que la
  hoja del día, no más cara. 🔴 Lo que sí sigue igual es el orden: **la rama va DESPUÉS del PIN**.
  · 🔑 **El juego de campos se afirma como lista cerrada**, no por «lo que hoy parece sensible»: hoy un
  `{...dia}` filtraría la nota del cierre y el `id` de cada movimiento, y mañana la columna que alguien
  agregue. Misma doctrina que `VISIBLE_AL_CADETE`.
  · 🔴 **En el teléfono tampoco va un número con signo**: el verbo y el monto en positivo, de
  `claseDelMovimiento` y `rotuloDeSaldo` — las mismas del recibo que él ya tiene en la mano.
  · ⛔ **`cuentaDelCadete` vive en `reglas.core.js`**, no en `core.ts`: la necesitaban dos handlers y
  el portal no puede importar TypeScript. Copiarla era la otra salida y es la que este módulo prohíbe.
  `CAMPOS_CIERRE` se mudó por lo mismo — la usaban dos.

## La ayuda: un manual y un tour, que contestan cosas distintas

🔑 **El manual dice QUÉ hacés y qué pasa si sale mal; el tour dice DÓNDE se aprieta.** Separarlos es
lo que evita que se contradigan: dos textos que cuentan lo mismo derivan, y el día que cambie una
regla se corrige en un solo lado. Por eso en `lib/envios/guia.ts` **no hay una sola regla de
negocio** —ni el precio que nunca es $0, ni el entregado sin cobrar— y en el manual no hay ninguna
coordenada de pantalla.

- **El manual** es una fila de la tabla `manuales` con `seccion: 'envios'` (base de BDI, sin marca).
  Lo carga `scripts/manual.mjs` **sin publicar** y lo publica Bruno de un click, igual que las
  novedades. Publicado, aparece solo el botón «📘 Cómo se usa» del `SeccionHeader`.
  🔴 **`manual-guardar` es un `upsert` con `publicado: !!m.publicado`**: un cuerpo que no manda el
  campo **despublica** el manual en silencio y el botón desaparece de la pantalla. Por eso el script
  **lee la fila entera antes de pisarla** y conserva `publicado` y `orden`, y sin `--editar` no
  escribe nada.
- **El tour** lo lanza el mismo botón («Mostrame en la pantalla», en el pie del manual). Si la
  pantalla tiene tour y **no** tiene manual, el botón ES el tour: si no, la sección quedaría muda
  hasta que alguien publique un texto, y el tour no se podría ni ejercer en prod.
- 🔑 **Los pasos los registra la sección en `store/useGuia`, no un mapa del shell**: cada sección es
  un chunk aparte (`next/dynamic`), así que un registro estático le bajaría los pasos de las 42 a
  todo el mundo. `setPestania` viaja con ellos porque el paso sabe en qué pestaña vive el control,
  pero la pestaña es de la sección.
- 🔴 🔑 **EL ANCLA ESTABLE ES LA PESTAÑA, no la card de arriba** (lo corrigió Bruno caminándolo,
  19-ago): el paso que hablaba de la bandeja estaba anclado a la card de «Cargar uno a mano», o sea
  que **decía «Sin fecha» y resaltaba otro botón**. Señalar una cosa mientras se nombra otra enseña
  mal **y se ve perfecto en un test**. Las anclas de pestaña viajan en `TabItem.guia` → `Tabs` las
  escribe como `data-guia`, y el test afirma **esa línea también**: sin ella el campo queda puesto,
  el ancla no llega al DOM y el globo se para en el centro sin que nada falle.
- 🔴 🔑 **Y el globo hay que RE-MEDIRLO seguido, no sólo con scroll y resize** (mismo día, mismo
  origen): el último paso vive en «Cuenta del cadete», que trae sus datos por fetch — se medía el
  botón, llegaban los datos, la tabla empujaba todo para abajo **y el recorte quedaba arriba, sobre
  un rectángulo vacío**. Ningún listener se entera de eso. Va un latido de 200 ms (`CADA_MS`) que
  sólo re-renderiza si la caja cambió de verdad; adivinar qué va a mover el layout no es una
  estrategia.
- 🔴 🔑 **Cada paso tiene DOS anclas y por eso no envejece.** `ancla` es algo que está SIEMPRE en esa
  pestaña (la pestaña misma) y `anclaFina` es el control puntual, que
  puede no existir: «Sugerir precios (N)» **desaparece** si no hay filas sin cotizar, la tabla no
  está con la bandeja vacía, y la card del link del cadete se dibuja recién cuando vuelve su propia
  lectura. **Cuando el fino no está, el paso NO se saltea**: se para en el estable y el texto dice
  cuándo aparece. Un tour que saltea en silencio le enseña una pantalla que no es la suya y le
  esconde justo el botón que vino a buscar. Por eso en `lib/guia/core.ts` **no existe ninguna
  función que filtre pasos**, y `siNoEsta` es obligatoria por el TIPO (unión discriminada) cuando
  hay `anclaFina`.
- ⚠️ **`Th` no propaga props sueltas**, así que un `data-guia` puesto ahí se pierde sin fallar: el de
  la columna de precio va en un `<span>` adentro.
- ⚠️ El de WhatsApp va **sólo con `conMensaje`**: en la hoja del día ese botón es el chat pelado y el
  paso habla del PRIMER mensaje.
- **`tests/guia.test.ts`** afirma texto contra texto que cada ancla existe en el JSX, que no queda
  ninguna **huérfana**, y que las pestañas que los pasos nombran son las que `Tabs` tiene de verdad.
  **5 mutantes, 5 muertos**: usar el ancla fina aunque no esté · callarse el «si no está» · invertir
  siguiente/anterior · sacar el `data-guia` de «Sugerir precios» · renombrar una pestaña.
- 🔑 **Los cuatro estados los pidió Bruno mirando el tour**, y son un paso propio: el camino
  `pendiente → preparado → en_transito → entregado` está en el código, pero **«en tránsito es cuando
  se lo entregás al cadete» no se deduce de ningún lado**. Van también en el manual.
- ⛔ **El portal del cadete tiene su propio «¿Cómo uso esto?» escrito a mano** (`ComoSeUsa`, un
  `<details>` plegado): no puede usar `<Instructivo>` del kit porque **la regla de ese archivo es no
  importar componentes del kit** —se baja con datos del teléfono, arriba de una moto— y tampoco
  puede pedir un manual, porque `?recurso=sistema` exige usuario y él entra con token + PIN.
- ⛔ **El tour no arranca solo la primera vez.** El equipo ya tiene un cartel modal bloqueante (el de
  las novedades importantes); una segunda cosa que se pone adelante sin que la pidan es la que
  enseña a cerrar carteles sin leerlos.

## Lo que ya se rompió acá

- 🔴 **Un throw en el render NO deja un cartel: MATA la pestaña.** Pasó 3 veces en prod (`<input
  type="date">` pasa por vacío al tipear el primer dígito). El guard va en `rotuloDeDia`, **en el
  borde por donde entra lo tipeado**, no adentro de `rotuloFecha`.
- 🔴 **TN corta con HTTP 200 y `ok: true`**: no hay `throw` que lo cace. Daba tilde verde y media
  hoja. Lo que falta **se cuenta restando** (`ordenesQueNoLlegaron`), no leyendo `fallidas`.
- 🔴 **TN usa el MISMO 404 para «no hay más páginas» y «ese campo no existe»** — los separa la
  `description`, y la regla quedó positiva: sólo «Last page…» es el final.
- 🔴 **La columna existía, la escribía el portal y faltaba en el `select` del handler** ⇒ llegaba
  `undefined` y **nada fallaba**. Es el modo de falla que ningún test de lógica caza.
- 🔴 **El día en UTC dejaba al cadete sin hoja de 21:00 a 24:00.** Ahora `diaArgentino(ahoraMs)` con
  offset fijo UTC−3, no `toLocaleDateString` (un runtime sin la tabla de husos cambia el formato en
  silencio). La ventana está partida en **dos funciones**, leer (hoy−1 a hoy+7) y escribir (±1), no
  en un parámetro: un flag mal pasado dejaría marcar entregada la semana entera.
- 🔴 **Que la ORDEN esté paga no quiere decir que el ENVÍO esté pago.** Con `estado_pago === 'paid'`
  a secas la fila nacía PAGADO con el precio sin cargar. Se pide además `envio_costo_cliente > 0`.
- ⚠️ **Una migración se aplicó ANTES de deployar y prod comparte la base**: la pantalla vieja quedó
  leyendo una tabla que no existía. **El orden es deployar primero, migrar después.**
- ⚠️ **Al verificar en prod, confirmar primero que el bundle nuevo YA se sirve** (buscar una cadena
  nueva en los chunks): dos crashes se diagnosticaron contra el bundle viejo.
- 🔑 **Los ensayos se cazan mutando.** `textoDePlata` y `resumenDeTraida` están separadas del dibujo
  y del toast justo para poder mutarlas: un test que sólo verifique que el PDF se generó da verde con
  el bloque de plata afuera del papel. En el ticket el assert es `plata.y + plata.alto <= alto`.

## Pendiente

- ✅ **El precio por zona, tanda 4: EN LA PANTALLA** (16-ago-2026). En la bandeja «Sin fecha» hay un
  botón **«Sugerir precios (N)»** que manda **sólo las filas sin cotizar**, en un llamado, y deja al
  lado de cada una «Zona 7 · $4.500 — usar» o el motivo por el que no hay precio. **No escribe nada**:
  «usar» guarda con `action: 'costo'`, de a una, como siempre. Las propuestas viven en el estado de
  `Pendientes` y mueren al recargar — no son un dato de la fila, son la respuesta a una pregunta sobre
  la dirección de ese momento, y la dirección se corrige seguido.
  ✅ **Ejercido contra prod y contra Georef vivo** (no sólo con tests): las 16 zonas de la base y las 7
  filas de la bandeja → **5 con precio, 2 que se niegan** (`Garay Bis 47`, por la localidad rara, y
  `Minetti 2682`, que Georef no tiene numerada) en 307 ms. Y sobre 60 direcciones reales de clientas:
  **25 con precio, 27 frenadas por el candado sin gastar una sola consulta**, 8 sin ubicar, **0
  inventadas**. 🔑 Los 11 mutantes del candado caen (`tests/envios-direccion.test.ts`).
- ✅ **EL CONTRASTE, HECHO: 82 direcciones confirmadas y CERO equivocadas** (16-ago-2026, lo confirmó
  Bruno a ojo sobre el mapa). 🔑 **La idea de cómo hacerlo es de él y cambió el costo del problema**:
  en vez de cotizar 20 a mano —o de esperar la planilla vieja de OneDrive, que era el plan—, **ver los
  puntos dibujados sobre las zonas y confirmar mirando**. La herramienta es
  `~/Downloads/ConfirmarZonasAreben.html`, un visor **aparte y de sólo lectura** (las 16 zonas salen de
  la base, no del `localStorage` del mapa editable, y no tiene con qué dibujar ni exportar), con 120
  direcciones reales **repartidas por zona** y voto con B/M/N que salta solo al siguiente.
  Confirmadas 12/16 zonas, incluidas Roldán ($12.000) y Fisherton 1 ($5.600).
  🔴 **Lo que quedó sin confirmar y hay que decirlo: Funes ($9.000) y Villa Gobernador Gálvez
  ($7.500), las dos más caras después de Roldán**, porque sus votos se borraron al corregir el cartel
  del departamento. Y **20 de las 23 «afuera del mapa»**, que son las que dirían si falta dibujar una
  zona (Alvear y La Carolina son las candidatas).
  ✅ **Lo que el contraste NO podía ver, CERRADO** (17-ago-2026): la clienta de Funes que escribió
  «Rosario» en la orden. Se geocodifica sobre la calle homónima de Rosario, el punto cae sobre una
  calle **real**, se ve perfecto en el mapa y salía $4.300 en vez de $9.000 — aparecía cuando el
  cadete llegaba, no antes. Lo caza el código postal; ver el bloque de reglas.
  🔴 **Y no era una hipótesis: medido corriendo el camino real contra Georef vivo sobre las doce
  direcciones de `clientes` donde el CP y la localidad no coinciden, tres salían con precio y las
  tres estaban mal, siempre para el lado barato.** `Saenz peña 1813` (CP 2124) salía **$5.300** de
  una zona de Rosario siendo de Villa Gobernador Gálvez ($7.500); `Avenida Santa Fe 1283` (CP 2152,
  Granadero Baigorria) y `9 De Julio 1236` (CP 2121, Pérez) salían **$4.000 de Zona Centro** siendo
  de dos localidades **que ni siquiera están dibujadas en el mapa**. Como `tarifaCadete` es
  `monto_envio`, el viaje largo se lo termina comiendo el cadete.
  🔑 **En la base hay 57 clientas así** (12 con CP de Funes que escribieron «Rosario», 20 de VGG,
  15 de Baigorria, 8 de Pérez) sobre ~1.850 del área de reparto.
  ✅ **Y quedó medido que NO rompe lo que andaba**, que es la mitad que importa: sobre 120 direcciones
  reales de `clientes`, **116 preguntan y las 116 mandan a Georef exactamente la misma consulta que
  antes** (misma localidad, mismos intentos) ⇒ misma respuesta y mismo precio. 🔑 **Cotejar el texto
  de la consulta es más fuerte que comparar los precios de salida**, y de yapa no gasta cupo. En la
  bandeja real (las 11 filas de `envios_reparto`) no cambió una: 8 con precio antes y después, y
  **`Garay Bis 47` pasó de «no se pudo ubicar» a $4.300**.
  ⚠️ **`Miguel Ribetti 1370` es el contraejemplo que hay que conservar**: CP 2000 y localidad «San
  Martin de las Escobas», a 100 km. Hoy sale `sin_zona`, que es lo correcto, y preguntando con la
  localidad del CP saldría `no_ubicada` — o sea que **el CP miente y por eso no puede reemplazar a la
  localidad**. Está en prod y hay un test con su nombre.
- 📎 **La medición que fundó todo esto** (tanda 3, 16-ago-2026, 200 direcciones reales de `clientes`,
  scripts en `~/.claude/plans/envios-zonas-tanda3/`):
  - **El geocoder es Georef** (`apis.datos.gob.ar`, del Estado, gratis y sin clave). 🔴 **Nominatim
    quedó descartado en la primera prueba**: para `Rodriguez 1062, Rosario` devolvió una casa en
    **Álvarez, a 60 km**, con cara de resultado bueno.
  - 🔴 **HACE FALTA UN CANDADO ANTES DEL MOTOR: sin ALTURA (o esquina), no hay precio.** Georef
    contesta igual sin número de puerta, con un punto cualquiera de la calle entera — y
    `precioSugerido` no puede distinguirlo, porque un punto es un punto. Medido: de las **100
    direcciones sin número, 66 salen con precio** si no se las frena, y **`"(2000)"` —una dirección
    vacía, sólo el CP— sale $4.800** porque Georef la matchea a `PJE 2007`. Con el candado, 0.
  - 🔑 **Y afinar el geocoder EMPEORA eso**: al agregar reintentos, los puntos precisos subieron de
    92 a 95 y los precios inventados de 30 a 68. La escalera recupera sobre todo calles peladas.
  - ✅ **Cuando la dirección trae calle + número —que es lo que manda TN— resuelve el 95%** (95 de
    100; 93 con zona y precio, 2 `sin_zona` correctos, 3 que **se niegan** en vez de inventar). El
    candado además atajó dos donde Georef devolvió **otra calle** (`Calle 1331 2983` → `CALLE 1335`).
  - 🔑 **El string sucio hay que limpiarlo antes**: mandado tal cual resuelve 47,5%, cortado en
    `calle + altura` sube a 82,5%. ⚠️ El corte **no puede ser «el primer número»**: en Rosario hay
    calles que empiezan con número (9 de Julio, 27 de Febrero) y quedarían como calle «9».
  - 🔑 **Georef es caprichoso y hay que probarle variantes**: `Av Pellegrini` resuelve y
    `Av San Martin` no; `Moreno 1192` sí y `Mariano Moreno 1192` no; `Alem 1517` sí y
    `Leandro N. Alem 1517` no ⇒ los nombres de pila se sacan **de a uno**, no sólo el primero.
  - 🔴 **La `localidad` de TN rompe la consulta aunque la calle esté bien**: `Garay Bis 47` resuelve
    sola y falla con `localidad = "Entre esmeralda y chacabuco"` (que es lo que vino en la orden).
  - 🔴 **Los «~20 envíos ya cotizados» de la premisa no existen**: en prod hay 5 filas con precio a
    mano y **dos de esas cinco son de prueba** ($1.000). De ahí sale que el contraste esté abierto.
- ▶️ **Lo que falta en el mapa externo** (lo dibuja Bruno, entra por «Importar»): estirar Zona 8
  (Belgrano al norte, Godoy y Moderno al sur, medidos con reverse-geocoding), dibujar como
  **exclusión** las zonas tachadas del mapa de papel —incluidas **Alvear** y **La Carolina**, que hoy
  no existen como dato y por lo tanto reciben precio— y marcar los **coordinar**. Menor: renombrar
  las diez «Zona N» con su barrio.
- ✅ **Las dos tandas, CORRIDAS** (17-ago-2026): `envios_dia.trajo` y `pagado_aparte` se fueron
  (tanda G), `envios_turno` también, y ninguna tocó un dato.
- 🔴 🔑 **UN CIERRE DE TANDA NO ERA DURADERO: la corrida siguiente lo DESHACÍA.** `apply-envios.mjs`
  aplica su lista en **cada** corrida, y dos de esos archivos revertían lo que un cierre había hecho:
  `migrate-envios-estados.sql` hacía `drop constraint` + `add` del check **ancho** (siete estados) y
  `migrate-envios-cuenta.sql` hacía `add column if not exists pago_cadete` — que después de un
  `drop column` **no es idempotencia, es una resurrección**. Medido: corrió `--cerrar-tanda-a`
  (check en cinco, columna dropeada) y veinte minutos después **`--cerrar-tanda-g` dejó el check otra
  vez en siete y la columna de vuelta**.
  🔑 **El síntoma que lo cazó: dos corridas del MISMO comando contestando distinto sobre el mismo
  hecho** — «pago_cadete: se fue ✓» en una y «sigue» en la siguiente, pidiendo cerrar una tanda ya
  cerrada. ⇒ ✅ **Los dos archivos ahora preguntan antes de escribir**, leyendo la base y no un
  registro: el check se re-crea sólo si el cierre no corrió (`def not like '%despachado%'`), y
  `pago_cadete` sólo si todavía no existe `envio_bonificado`, que es la que la reemplaza y se agrega
  **después**. `tests/envios-migraciones-cierre.test.ts` lo afirma —incluido **el orden de los dos
  archivos en la lista, que es parte del guard**— y sus 3 mutantes caen.
  ✅ **Y se cerró de verdad, ejercido y no deducido**: se volvió a correr `--cerrar-tanda-a` y después
  **el script pelado —el caso que revertía—**, y el check quedó en **cinco** con **cero** columnas
  viejas (`pg_get_constraintdef` + `information_schema`, después de la corrida). 🔑 **La predicción
  del predicado no alcanzaba**: lo que había que ver era la corrida que antes rompía, no un `select`
  que dijera que no iba a romper.
- ✅ **G0 y G7, HECHOS** (17-ago-2026), que eran lo último de la tanda G. `lib/rollo80.ts` salió
  primero y en su propio commit, y el recibo se escribió encima. **Una copia, sin firma** — el plan
  decía dos copias y firma, y lo cambió Bruno: es un comprobante, no un documento que alguien selle.
  🔴 🔑 **Lo que se mudó en G0 no lo miraba ningún assert**: los tests de `armarTicket` prueban el
  layout y lo que cambió de archivo fue el **dibujo**. El oráculo fue grabar la **cinta de órdenes**
  que el ticket le manda a jsPDF —con el código viejo y con el nuevo, sobre cinco casos— y
  diferenciarlas: **229 órdenes idénticas**, con la cinta verificada moviendo un gris para que
  «idénticas» significara algo. 🔑 **La copia vieja se saca de `git show HEAD:` a un archivo aparte,
  no con `git stash`**: el árbol es compartido con otras sesiones.
  ✅ **8 mutantes del recibo, los 8 muertos por un `expect`** (`tests/envios-recibo.test.ts`): el
  verbo fijo, el monto sin `Math.abs`, el saldo sin sello, el sello en UTC, el alto de página fijo,
  el recuadro de alto fijo, el saldo recalculado en cero y `rotuloDeSaldo` dado vuelta. ⚠️ Uno no
  entró a la primera (el `${…}` del template se lo comió el `perl`) y **un mutante que no entra no
  vale**: se rehizo hasta verlo aplicado en el archivo.
  ✅ **Mirado en PDF con `qlmanage`**, seis casos: el único arreglo de aire —el autor pegado a una
  nota de tres renglones, que se leía como su cuarto renglón— **no lo dijo ningún test**.
- ▶️ 🔴 **Imprimir con la térmica del local: lo único que falta de los dos papeles.** El ticket y el
  recibo se miraron página por página con `qlmanage` (⚠️ `pdftoppm` no está instalado), pero
  **ninguno salió nunca por la impresora real**: falta ver el encuadre, si el negro del PAGADO sale
  limpio en papel térmico, y dónde corta la cuchilla. ⚠️ **El botón no se puede apretar desde el
  Chrome automatizado**: `imprimirPdf` hace `pdf.autoPrint()`, que mata el puente de la extensión.
- ✅ **El agujero de ida y vuelta, CERRADO** (17-ago-2026). Se abrió como «si la clienta paga después
  no hay forma de sacar el "no cobró"», y **la pregunta a Bruno lo dio vuelta**: como un pedido no se
  entrega impago, ese tilde nunca significó una deuda pendiente, así que **no había nada que saldar —
  había un rótulo que mentía**. Lo que quedó:
  · el rótulo, en tres lugares (el KPI, la línea del día y la fila), y los nombres (`pagoAlLocal`);
  · `action: 'cobrado'` en el handler + `marcarCobrado` + `QuienCobro` en la fila, que es la
  **corrección del tilde** —no un hecho nuevo—: el portal sólo escribe ±1 día y esa barrera no se
  afloja, así que pasado el día un tilde equivocado no lo podía arreglar nadie, y mueve plata en la
  rendición en las dos direcciones.
  🔴 🔑 **El mutante que importa vive en el handler**: `cobrado` es el único campo de **tres** valores
  entre dos vecinos de dos escritos con `!!b.<campo>`, y con el `!!` **un cuerpo sin el campo escribe
  «se pagó al local»** sobre un envío que el cadete sí cobró — 200, sin que falle nada, con la plata
  saliéndole de lo que tiene que traer. Por eso la decisión vive en `valorDeCobro` (afirmable) y hay
  un test **texto contra texto** que exige que el handler la llame: `tests/envios-cobrado-handler.test.ts`,
  del mismo molde que `blob-upload-sesion.test.ts`. **8 mutantes, los 8 muertos por un `expect`.**
  ✅ **EJERCIDO A MANO EN PROD, con el bundle nuevo confirmado** (el chunk de la sección pasó de
  `3fiua6nz20xy4` a `264aol6m6-iib`, «Falta cobrarle a clientas» **ya no está** y los dos textos nuevos
  sí): fila de prueba creada **en un día pasado y vacío** —el vie 14-ago, para no ensuciar la hoja de
  hoy, que tiene 2 envíos reales—, avanzada a `entregado`, y los **tres rótulos** vistos en pantalla:
  «Sin dato: cuenta como cobrada por él» → «Se pagó al local» → «La cobró el cadete». **Las dos
  direcciones escriben**, cotejado con `psql` y no sólo con la pantalla (`f` y después `t`). Borrada:
  la tabla quedó igual que antes (11 envíos, 0 con `cobrado`).
  ⚠️ **Lo que NO se vio en pantalla es el KPI**: el envío de prueba quedó en $0 —el clasificador
  bloquea tipear montos en prod— y la tarjeta sólo aparece con `sinCobrar > 0`. Su texto se verificó
  **en el bundle servido**, no dibujado.
- ⛔ **El filtro de la traída se MIDIÓ y quedó decidido que NO va** (17-ago-2026). Era la pregunta
  abierta desde la tanda 5: TN no tiene «entregado», así que la tentación es sacar de la hoja lo que
  TN da por terminado. Las dos formas fallan, y no por poco:
  · **`estado_orden === 'closed'` está refutado**. Sobre 30 días y las dos tiendas (184 órdenes de
  BDI + 110 de Zattia, nada truncado) marca **20 de las 23 órdenes de cadetería, el 87%** — y el
  número que cierra la discusión no es ése: de los **10 envíos que en ese momento estaban en
  `envios_reparto` sin entregar, 7 estaban `closed`, incluidos los 2 que salían ESE DÍA**. Con el
  filtro puesto, la hoja del 17-ago salía **vacía**. En el local cierran la orden cuando la
  empaquetan, no cuando llega: era exactamente el modo de falla que Bruno pidió medir antes de tocar.
  · **`shipping_status === 'fulfilled'` no excluye nada**: 0 de 23 en cadetería y **0 de las 78
  órdenes vivas** de los 30 días — ni siquiera las 13 del correo que sí tienen `shipped_at`. Es un
  filtro que hoy no hace **nada**, y que el día que alguien empiece a tildar «despachado» al
  empaquetar vacía la hoja en silencio. Por eso `envio_estado` no entra en `OrdenTN`: existe en el
  mapper de `tiendanube-audit` y se deja afuera a propósito.
  ⇒ **Lo que saca un envío de la hoja es que alguien lo entregue, no lo que TN opine de la orden.**
  Queda escrito en `vaAlReparto` y lo defiende un test que se pone rojo si alguien agrega el filtro
  (`tests/envios-core.test.ts`, «una orden CERRADA en Tienda Nube igual sale»; ejercido con el
  mutante puesto: `AssertionError`, no error del compilador).
  🔑 **Cómo se midió, que sirve para cualquier endpoint del Monitor**: la mitad barata sale sin
  navegador —`?orden=N&store=…` de `tiendanube-audit` **no exige usuario** y contesta `envio_estado`
  y `estado_orden`, así que los 10 envíos reales se cotejaron con `curl` contra los `orden_numero`
  que devuelve `psql`—. La otra mitad (`?ordenes=1`, 30 días) **sí** exige sesión, y el token de TN
  vive sólo en Vercel: se resuelve **desde la pantalla logueada**, reusando el objeto `init` que la
  propia app arma —no se lee la credencial, se la deja pasar— y devolviendo sólo los agregados.
- ▶️ **Con la localidad VACÍA se sigue sin proponer, aunque haya CP** — es un límite elegido, no un
  olvido. El reintento del código postal existe porque la consulta con el texto tal cual ya falló, y
  eso es lo que impide que un pueblo de afuera reciba un punto de Rosario; con la localidad vacía no
  hay primera consulta que falle, así que el CP quedaría solo y sin corroborar. Son **26 clientas**
  con CP 2000 y `city` vacío, y ninguna fila de `envios_reparto` hoy.
- ▶️ Ejercer a mano en prod: bonificado que imprime PAGADO, no entregado en los dos lados,
  reprogramar, y el modal del pedido.
- ✅ **La mitad que RECUPERA, ejercida a mano en prod** (17-ago-2026, con el bundle nuevo confirmado
  por el código servido: `LOCALIDAD_DEL_CP` minificado adentro del chunk `0l1jipe_p6h7s`). Bandeja de
  BDI, «Sugerir precios (6)» → **5 con precio y 1 que se niega**, y la que importa:
  **`Garay Bis 47 · Entre esmeralda y chacabuco` salió `Zona 3 · $4.300`**, donde antes decía «no se
  pudo ubicar». Es el reintento con la localidad del CP corriendo por el handler deployado, con la
  base y Georef de verdad. `Minetti 2682` sigue negándose, que es correcto: Georef no tiene ese
  número. **No se apretó «usar»** y la tabla quedó igual (11 filas, 3 con precio, sin un `updated_at`
  nuevo).
- ✅ **El alta a mano ya tiene campo de CP** (17-ago-2026). No era sólo para poder ejercer la mitad
  que protege: **todo lo que cargaba una persona nacía con `cp` nulo**, así que ni el aviso de «fuera
  de zona» ni la corroboración del precio se prendían nunca — y son justo las filas donde la localidad
  la escribe alguien de memoria. Sirve también para **corregir** el CP de una fila que vino de TN, que
  hoy decide si se propone un precio y hasta ahora no se podía tocar. Va **debajo** de Localidad,
  que es la misma regla de la sección puesta en el orden del formulario, y es `text` y no `number`
  porque el CPA es alfanumérico (`S2000ABC`).
  🔴 🔑 **La protección quedaba partida entre la pantalla y el handler, y las dos mitades fallan
  calladas**: sin el campo no hay dónde tipearlo, y sin `cp` en `filaDe` —que es una **lista blanca**,
  así que perder la línea es un descarte, no un error— la persona lo tipea, el POST contesta **200** y
  la columna queda en `null`. Es el mismo modo de falla de `cobrado`. Lo afirma
  `tests/envios-cp-alta-a-mano.test.ts`, texto contra texto sobre las dos puntas: **5 mutantes, los 5
  muertos por un `expect`** (campo borrado · CP arriba de la localidad · `type="number"` · `cp` fuera
  de `filaDe` · `e.cp || null`, que pierde el `''`), cada uno verificado que **entró** al archivo.
  ⚠️ La lógica no hacía falta escribirla: `consultaDe` con `localidad: 'rosario'` + `cp: '2124'` ya
  daba `localidad_dudosa` con los dos nombres en `tests/envios-direccion.test.ts`. Lo que faltaba era
  que una fila pudiera **tener** CP.
- ✅ 🏁 **Y con el campo puesto, la mitad que PROTEGE quedó EJERCIDA A MANO EN PROD** (17-ago-2026):
  era lo único del código postal que nunca se había podido probar contra la app deployada, porque las
  11 filas reales tienen CP 2000 y localidad «Rosario» y **ninguna dispara `localidad_dudosa`** —
  había que poder sembrar una, y hasta ahora no había con qué. Bandeja de **Zattia** (2 filas reales),
  fila de prueba `Saenz peña 1813 · Rosario · CP 2124` **sin precio y sin día**, «Sugerir precios (3)»
  ⇒ el toast dijo **«2 con precio propuesto · 1 se tipea a mano»**, las dos reales salieron
  «Zona 2 · $ 4.200 — usar» y la de prueba salió **sin pastilla de precio y sin «usar»**, con el
  motivo entero y los dos nombres: **«el mapa no propone: el código postal dice Villa Gobernador
  Gálvez y la dirección dice Rosario»**. Es `consultaDe` corriendo por el handler deployado, con la
  base y Georef de verdad.
  ✅ **Bundle nuevo confirmado por el CÓDIGO SERVIDO antes de medir nada**: la cadena del hint del
  campo («La segunda señal para el precio…») apareció dentro del chunk servido `3akoadnju3lnq.js`, y
  es un literal que el minificador conserva y que sólo existe en este commit.
  ✅ **Borrada al terminar y cotejado con `psql`, no sólo con la pantalla**: 11 filas, **0 de prueba**,
  3 con precio y el `updated_at` más nuevo **sin moverse** ⇒ la tanda de sugerencias no escribió nada,
  que es justo lo que promete el cartel («No lo guarda»). ⚠️ No se apretó «usar» en ninguna.
- 🔴 **El deploy de main dejó de llegar solo el 17-ago**: los tres commits del día quedaron **sin un
  solo status de Vercel** —los de la noche anterior sí tienen el suyo, o sea que el oráculo sirve— y
  producción estuvo **once horas** sirviendo `6e57911` con el CI en verde. Lo destrabó un **commit
  vacío**. 🔑 **El oráculo definitivo es el CÓDIGO SERVIDO** (buscar una cadena nueva en los chunks
  que carga la pantalla): la API de deployments de GitHub siguió mostrando `6e57911` **después** de
  que el build nuevo ya se estaba sirviendo, así que hoy esa integración no se puede usar para decir
  «no deployó». ⛔ Y el chunk viejo **sigue dando 200** (los assets son `immutable` y se retienen):
  «ya da 404» no sirve de señal.
- ▶️ **Publicar la novedad**, que quedó en borrador (`n1786736641432_bgbqg9`, destino `seccion:envios`).
- ✅ **`ESTADOS_LEGADO` se borró el 17-ago-2026, y recién cuando se pudo.** Esta ficha decía que ya
  se podía «porque la base los rechaza» y **era falso**: `pg_get_constraintdef` mostró el check
  admitiendo **los siete**, porque el que lo estrecha es `migrate-envios-estados-cierre.sql` y ese
  cierre no había corrido. O sea que la base aceptaba lo que la app iba a dejar de saber leer — el
  orden al revés. 🔑 **La condición la dice la base, no un documento**: corrió `--cerrar-tanda-a`, el
  check quedó en cinco, `select estado` dio 9 `pendiente` y 2 `en_transito`, y ahí sí salieron
  `ESTADOS_LEGADO`, `EstadoLegado`, sus dos rótulos, sus dos entradas del camino, `reintento` de
  `ESTADOS_EN_CASA` y el `|| 'despachado'` de `enLaCalle`.
  🔑 **Lo que los reemplaza es un test que mira los dos lados** (`🔴 los legados NO vuelven por la
  ventana`): 3 mutantes que los devuelven al camino, al rótulo o a «en casa» caen. Y en el portal
  quedó afirmado el **respaldo** en vez del rótulo viejo — un estado desconocido sale **crudo y nunca
  en blanco**, porque una tarjeta sin estado arriba de la moto se lee como un paquete que no salió.
- 🔴 **Hallazgo suelto, sin arreglar**: `bdi-catalogo/api/tiendanube-audit?orden=N` **no exige
  usuario** — contesta nombre, ítems y totales a cualquiera que sepa un número de orden. Sus dos
  consumidores (Reclamos y Canjes) le pegan con `fetch` pelado: ponerle el guard rompe las dos.
  Por eso la dirección y el teléfono viajan **sólo** con `conDireccion`, que pide `?ordenes=1`.
- **Datos que faltan y los tiene Bruno**: qué significa la columna `SHW`, la lista de vendedoras, y
  cuánto se le paga al cadete por turno.

## Cómo se prueba

- **El portal sin tipear el PIN**: las tres barreras se ejercen con `curl`
  (`?recurso=cadete&token=…&pin=…`, y el POST con `fecha`); para VER la pantalla alcanza con dejar el
  PIN en `localStorage['cadete.pin']` y recargar. ⚠️ Los envíos de prueba **hay que borrarlos**: uno
  agendado a un día futuro entra en la hoja real de ese día.
- **Pegarle a Georef sin gastar cupo**: el 17-ago-2026 una tanda de mediciones se ganó el **429**
  (`{"message":"API rate limit exceeded"}`). ✅ **Lo bueno: `pedir` TIRA** —se verificó corriendo el
  camino real justo mientras estaba limitado— así que en prod «Sugerir precios» corta con un error
  visible y **no devuelve «no se pudo ubicar» para todas**, que sería la mentira cara.
  🔑 **Casi todo lo que hay que medir del candado no necesita Georef**: `consultaDe` es pura, así que
  el antes/después se compara **cotejando el texto de la consulta** —misma localidad y mismos
  intentos ⇒ misma respuesta— en vez de los precios de salida. Es determinista y gratis.
  🔴 ⚠️ **Y el arnés miente igual que el código**: la primera corrida dio «0 de 120 con precio» en las
  dos versiones y no era el 429 — era `psql -F'\t'` **entre comillas simples**, que escribe los dos
  caracteres `\` y `t`; el script partía por un tab de verdad, leía una sola columna y las 120 salían
  `sin_localidad` **sin consultar nada**. Va `-F"$(printf '\t')"`, y el número que lo cazó fue mirar
  la distribución de estados en vez del total.
- **Pegarle a TN**: el token vive **sólo en Vercel** y `env pull` lo baja vacío ⇒ hay que medir desde
  el navegador logueado, o desde un endpoint deployado. Sonda permanente en `?ordenes=1`: `&campos=1`
  prueba cada `fields` solo y bisecta; `&llenado=campo,campo&pp=N` caza el campo que viene **vacío
  adentro** de una lista completa. ⚠️ **Medir de más te gana el 429**, y la respuesta degradada miente.
