# Envíos del día — ficha de sección

Sección `envios`, área `local`. En prod desde el 13-ago-2026. Reemplaza la planilla de Google
`ENVIOS ZATTIA / BDI`. Incluye el **portal público del cadete** (`/cadete/<token>`).

## Dónde vive

| qué | archivo |
|---|---|
| Pantalla interna | `components/envios/Envios.tsx` (**74 KB — leer por rango**) + `useEnvios.ts` |
| Portal del cadete | `components/envios/PortalCadete.tsx` + `lib/envios/portal.core.js` |
| **La cuenta de la puerta** | `lib/envios/reglas.core.js` |
| Lo de la pantalla | `lib/envios/core.ts` · `cliente.ts` · `tipos.ts` · `ticket.ts` (rollo de 80 mm) |
| Handlers | `api/_envios.js` (por `datos.js?recurso=envios`) · `api/_cadete.js` (cuelga de `postventa.js`) |
| Tablas (base de **BDI**, como Canjes) | `envios_reparto` · `envios_dia` · `envios_movimientos` · `envios_portal` |
| Migraciones | `scripts/apply-envios.mjs` · `sql/migrate-envios-*.sql` |
| Tests | `tests/envios-core.test.ts` · `envios-cliente.test.ts` · `cadete-portal.test.ts` |

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
- 🔑 **El día del reparto lo confirma el CLIENTE, no la orden.** Las órdenes de TN caen en la bandeja
  «Sin fecha», que **no es una bandeja de entrada: es la lista de trabajo** (`fecha is null` OR
  `estado='no_entregado'`). `fecha` y `turno` van los dos o ninguno (check `envios_fecha_turno_juntos`).
- 🔑 **La grilla de turnos NO se valida en el servidor**: la pantalla ofrece los que existen y avisa
  si se fuerza otro. Un envío especial un sábado tiene que poder salir sin tocar código.
- 🔑 **La cuenta son MOVIMIENTOS con signo, sin columna `tipo`** — el signo va adentro del dato.
  Positivo = el cadete tiene plata nuestra. **Rinde cuando pasa**, no por día de reparto. No se
  guarda ningún total: el saldo se arrastra y un día congelado haría mentir a todos los siguientes.
- 🔑 **`cobrado: null` («no dijo nada») NO es `false` («no me pagó»)** — se saldan al revés, y todas
  las filas anteriores al portal son `null`. La tarifa se le paga igual: llevó el paquete.
- 🔴 **El envío del cadete llega de TN SIEMPRE en $0** (18 de 18 medidos). El precio no viaja en la
  orden: está escrito en el nombre de la opción, por zona. **Se tipea** (sin tabla de zonas):
  Rosario $3.000-4.300 · Fisherton $4.300/5.500 · Funes $8.000 · Roldán $11.000 · VGG $6.500.
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

- ▶️ **`node scripts/apply-envios.mjs --cerrar-tanda-g`** (dropea `trajo` + `pagado_aparte` detrás de
  un guard de huérfanos) y **`--cerrar-tanda-a`** (`pago_cadete`, 0 filas). Van **después** del deploy.
- ▶️ **G0 y G7, frenados por la térmica real**: extraer `lib/rollo80.ts` y el recibo imprimible en
  rollo de 80 mm, dos copias. Plan: `~/.claude/plans/envios-en-vez-de-drifting-planet.md`.
- ▶️ **Imprimir una tanda con la térmica del local.** El PDF se miró página por página con `qlmanage`
  (⚠️ `pdftoppm` no está instalado), pero **nunca salió por la impresora real**.
- 🔴 **Agujero de ida y vuelta**: si la clienta paga después, desde la pantalla interna **no hay forma
  de sacar el «no cobró»** — sólo el cadete, desde su portal. El KPI no baja solo.
- ▶️ **Medir antes de decidir el filtro de la traída** (`envio_estado='fulfilled'` / `estado_orden=
  'closed'`): TN no tiene «entregado», y si en el local marcan «despachado» al empaquetar, agregarlo
  haría que el paquete no salga y nadie se entere.
- ▶️ Ejercer a mano en prod: bonificado que imprime PAGADO, no entregado en los dos lados,
  reprogramar, el modal del pedido, y `cerrar-dia` (la sesión se cayó en el medio la última vez).
- ▶️ **Publicar la novedad**, que quedó en borrador (`n1786736641432_bgbqg9`, destino `seccion:envios`).
- ⚠️ `ESTADOS_LEGADO` quedó como red de seguridad pero la base ya rechaza `despachado` y `reintento`:
  se puede borrar. Ojo que un **preview viejo** de otra rama que intente escribirlos recibe un error.
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
- **Pegarle a TN**: el token vive **sólo en Vercel** y `env pull` lo baja vacío ⇒ hay que medir desde
  el navegador logueado, o desde un endpoint deployado. Sonda permanente en `?ordenes=1`: `&campos=1`
  prueba cada `fields` solo y bisecta; `&llenado=campo,campo&pp=N` caza el campo que viene **vacío
  adentro** de una lista completa. ⚠️ **Medir de más te gana el 429**, y la respuesta degradada miente.
