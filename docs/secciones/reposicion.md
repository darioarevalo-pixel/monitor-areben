# Reposición — ficha de sección

Sección `reposicion`, área `administracion`. Qué llevar del depósito al local y qué devolver. **Dos
mundos en la misma pantalla:** BDI sigue con el mínimo fijo por categoría/modelo (`core.ts`, fundas);
**Zattia repone según ventas** desde el 11-oct-2026 (`ReposicionZattia.tsx` + `porVentas.ts`), con
selector **Zattia / Stunned**. Las reglas de Zattia las decidieron Darío y su socio ese día, medidas
contra las ventas reales; la conversación entera está en la nota viva de Darío (Claude Docs).

## Dónde vive

- `components/reposicion/Reposicion.tsx` — BDI (y el modal viejo de mínimos/topes). Para Zattia
  monta `ReposicionZattia.tsx`: dos pestañas, la config por línea y la tabla con el porqué.
- `lib/reposicion/porVentas.ts` — el cálculo de Zattia (puro). `pdf.ts` — la hoja A4 (compartida con
  BDI). `rollo.ts` — el rollo de 80 mm de «Devolver al depósito». `cliente.ts` — inventario, ventas
  (`ventasLocal(marca, días)`), hora del sync, guardado.
- Config: KV de **bdi-catalogo** (`/api/reposicion` → `api/ingresos.js?kind=reposicion`), una clave
  por marca. Zattia guarda `ventas` y `ventasStunned` adentro del mismo objeto.
- **Armar con el lector** (Zattia, 12-oct-2026): `components/reposicion/ArmadoLector.tsx` (la
  pantalla de Lorena) · `lib/reposicion/armado.ts` (qué hacer con cada código + cliente) ·
  `lib/reposicion/armado.core.js` (sanear y qué se transfiere, compartido con el servidor) ·
  `api/_repo-armado.js` por `api/datos.js?recurso=repo-armado` · tabla `repo_armado` en la base de
  ZATTIA (`sql/migrate-repo-armado.sql`, se corre en el SQL Editor: no hay `DATABASE_URL` en `.env`).
- Tests: `reposicion-ventas` (Zattia) · `reposicion-core` (BDI) · `reposicion-sync-reloj` · `repo-armado`.

## ⛔ Lo que comparte con otras secciones

- **La config la leen también Conteo (`catsOff`) y Sesión de fotos / Solicitudes (`prioridadRetiro`)**
  vía `lib/reposicion/cfg.ts`. 🔴 La pantalla guarda la config **ENTERA** que leyó: un campo que
  `leerRepoConfig` no mapea **se borra en el próximo guardado**. Campo nuevo → sumarlo ahí (lo cubre
  un test).
- `pdf.ts` es de las dos marcas: `FilaA4` **sin `local`** = papel sin columnas de stock (Zattia).

## Las palabras de la pantalla (Darío, 12-oct-2026)

«Se usa mucho texto y pocas palabras formales.» Pestañas **Reposición** / **Devolución**; columnas
**Venta semanal · Stock ideal · Motivo**; botones **Iniciar armado · Finalizar · Transferir N
prendas · Actualizar stock · Imprimir A4 / ticket**. El **Motivo** dice sólo lo que las columnas
no dicen (vacío en el caso normal). **Una sola tabla** con el producto como separador: antes era una
tabla por producto con los encabezados repetidos. Antes de sumar un texto, ver si ya lo dice otra
columna.

## Reglas que el código no dice

- 🔑 **«Local» en GN = lo colgado + el depósito del local.** Con 1 en Local, ese 1 es la exhibida, y
  descolgarla cuesta (precio, alarma, lugar). Por eso nunca menos de 1 exhibida + 1 de reserva.
- 🔑 **El mínimo depende de lo que vende** (en 60 días): 2 si vende menos de 1 por semana, 3 si vende
  más. Medido: 2.055 u en el local contra 2.507 con 3 parejo, y 29 variantes en riesgo contra 91 con
  2 parejo. La última semana **sólo sube la reserva** de lo que se disparó; ⛔ no decide el piso
  (una venta suelta le subía el mínimo a todo).
- 🔑 **Se repone todos los días y de a una** (`loteMin` 1, «estructura chica»): reserva para 2 días.
- 🔑 **Los «topes por producto» de la pantalla vieja NO se aplican en Zattia** («anticuados»): se
  pusieron para el mínimo fijo y pisaban a las ventas. Siguen guardados porque BDI los usa. Los
  **apagados sí** se respetan.
- 🔑 **Devolver al depósito es la mitad que faltaba**: el local se llenó porque sólo existía el
  camino de ida. Tope diario (30) porque armar el carro es lo lento; la **limpieza grande** (todo de
  una, ~600 u el 11-oct) se hace con el escaneo de la parte 3, por eso existe «Ver la lista entera».
- 🔑 **Los papeles llevan sólo lo que se hace** (Darío): ⛔ ni stock ni ventas ni «para exhibir». El
  A4 de Lorena: producto · talle · cuánto · una casilla (tilde / cruz / número, **en palabras**:
  Helvetica no tiene ✓ ni ✗). El rollo de Camila: SKU · «PRODUCTO - variante» · Cant. · Listo.
- 🔑 **Orden:** Camila (local) **por SKU**, que es como está ordenado el depósito del local. Lorena
  **por ubicación** del depósito (la observación de GN, hoy vacía en Zattia) y sin ubicación por SKU.
- 🔑 **OUTLET («SIN CAMBIO») y ACCESORIO** son «todo exhibido» por el nombre: no tienen categoría en
  GN. Una marca por producto les gana. «Por categoría» se sacó de la pantalla (TN mezcla «BEST
  SELLERS» y «(sin categoría)»); el cálculo la entiende igual (`modosCat`).
- ⚠️ **Stunned tiene su config propia** (`ventasStunned`) pero hoy con los mismos valores: sus
  condiciones quedaron para más adelante.
- ⚠️ **Configurar y Recargar los VEN sólo Darío y Bruno** (`puedeEliminarTn`, la regla de Caducados;
  Darío 12-oct-2026: pantalla más simple para quien arma). El POST a bdi-catalogo lo acepta
  cualquiera del equipo: el freno es la pantalla.
- Si «Actualizar stock» tarda, ⛔ no se pide tocar Recargar: la pantalla mira `sync_state` cada 30 s
  (hasta 10 min) y se pone al día sola.
- ⚠️ Un día sin stock en el local cuenta como día sin venta: el sistema no guarda el stock día por día.

## Armar con el lector (tanda 1 del escaneo, 12-oct-2026)

Lorena escanea en la **COMPU** del depósito, con lector, contra la lista de «Llevar al local»
**congelada al empezar**; al terminar, el Monitor hace la transferencia depósito → local en GN
(`POST /inventario/transferencia`, Zattia: depósito 18210 → local 11780).

- 🔑 **La transferencia sale al final y SÓLO con lo escaneado**, cortado en lo pedido (lo corta el
  servidor también). Lo no escaneado se contesta «no estaba» / «para después» y no se mueve.
- 🔴 **Nunca dos transferencias del mismo armado**: `en_curso → transfiriendo` con un update
  condicionado antes de llamar a GN, índice de «uno abierto por lista», y ⛔ **el POST a GN no se
  reintenta** salvo 429. Un 500 o un corte quedan en `revisar`: alguien mira GN y contesta.
- 🔴 **Recién transferido, la lista sigue igual hasta el próximo sync**: «Armar» queda bloqueado
  mientras el stock sea anterior a la transferencia (si no, se pide dos veces lo mismo).
- Lo que sobra o no estaba pedido **frena la pantalla** (cartel rojo, ⛔ no el `Modal`: el Enter del
  lector lo cerraba), igual que Conteo. La primera de una «para exhibir» se canta y se marca.
- El cartel rojo se cierra con **Esc o la barra espaciadora** (Darío, 12-oct-2026). ⛔ **Enter no**: el
  lector manda Enter después de cada código y lo cerraría sin que nadie lo lea. Dice «Artículo NO
  solicitado» + «Este producto no se encuentra en la reposición de hoy.» (sin «dejalo en el estante»).
- 🔈 **La voz calla en el caso normal** (Darío, 12-oct-2026: repetir cada producto «lo hace extenso»):
  prenda bien escaneada = sólo pitido (uno si faltan, dos al completarse). Habla sólo «Para exhibir» y
  los errores («Excedente», «No solicitada», «Código desconocido»).
- **Historial** (pestaña, `HistorialArmados.tsx`, `?action=historial`): un renglón por armado (sin
  los descartados) con horario, duración, pedidas/escaneadas/no encontradas y el detalle; arriba,
  **«Más veces no encontradas»** = la señal de stock mal cargado. Sólo cuenta armados transferidos.
- 🔴 **Que no quede trabada** (revisión del 12-oct-2026): a GN se le esperan como mucho 20 s
  (`PLAZO_GN_MS`, reintentos de 429 incluidos) porque el servidor se corta a los 30 s; si no contesta,
  queda `revisar`. Un `transfiriendo` de más de 90 s (`trabado`, el servidor se cortó o no pudo anotar)
  muestra los mismos botones que `revisar`. La lista lo vuelve a mirar cada 30 s.
- 🔴 **Que nadie la repita a mano**: si la respuesta no llega (internet, servidor cortado, «ya se
  cerró»), la pantalla mira cómo quedó el armado antes de mostrar un error: transferida → «realizada»;
  sin confirmar → «⛔ no la hagas a mano» y vuelve a la lista. Reintentar «Transferir» es seguro: el
  candado no deja que salga dos veces.
- 🔑 **Qué buscar en GN**: la descripción lleva el código del armado (`… · Monitor #K3X9AB (12 u)`,
  `codigoArmado`) y el cartel rojo lo muestra con la hora y las prendas. «No está: transferir de nuevo» pide confirmación (botones renombrados por Darío, 12-oct: «figura» no se entendía).
- Lo escaneado vive en `localStorage` (`monitor_repo_armado_<id>`) y se sube cada 1,5 s.
- GN es atómico: un 422 no movió nada; la pantalla muestra los renglones rechazados y ofrece
  sacarlos (quedan `rechazada`: diferencia de stock para la tanda 3).

## Devolución con el lector (tanda 2, 12-oct-2026)

Camila escanea en la **compu del local** la lista de «Devolución» y al **Finalizar** el Monitor
transfiere **local → depósito** (decisión de Darío: la opción A, sin re-escanear al recibir). Aviso
fijo: **«Retirar solo de la reserva, nunca la exhibida.»** Lo que sobra está en el depósito del local
(la trastienda, ordenada por SKU), no colgado.

- 🔑 **La limpieza grande** = la misma pantalla con «Ver todo» (sin tope diario) + **«Transferir y
  continuar»**: pasa lo escaneado hasta ahí y la lista sigue abierta, para hacerla en varios viajes del
  carro o en varios días. Una sola compu (Darío).
- 🔴 **Cada tanda manda SÓLO la diferencia**: lo ya transferido vive en `transfer.transferido` y cada
  tanda en `transfer.tandas`. El servidor no deja que lo escaneado baje de lo transferido (`conTransferido`),
  ni descartar un armado con tandas (esas prendas ya cambiaron de depósito). Un `revisar` a mitad de una
  tanda guarda lo que iba en `transfer.enCurso` y `resolver` lo suma.

## La Zebra en el armado (tanda 4, 12-oct-2026)

La Zebra está en la **misma compu** donde Lorena escanea (Darío). Sólo en la Reposición, no en la Devolución.
`components/reposicion/EtiquetasArmado.tsx` + `lib/reposicion/etiquetasExhibir.ts` (puro, `tests/reposicion-etiquetas*.test.ts*`).

- 🔑 **Qué etiqueta sale lo decide el estado de la VARIANTE** (Darío): en la **campaña elegida en
  Configurar** (`campaniaEtiqueta`, el 12-oct «Feria Septiembre 2026») → SÓLO la etiqueta de la
  campaña, con su precio (el dibujo de Etiquetas → Precio de campaña, `dibujoDeCampania`); precio
  regular → precio + formas de pago; en oferta en TN fuera de la campaña → precio rebajado + formas de pago.
  ⛔ Precio de campaña sin confirmar o sin precio: no imprime.
- 🔴 **Con una campaña elegida, si sus precios no se leen ⛔ no se imprime nada**: la prenda saldría
  con el precio regular. Una campaña que terminó también bloquea → cambiarla en Configurar.
- **Impresión rápida**: buscar por nombre / talle / SKU y reimprimir la etiqueta de información de
  producto (código de barras, sin precio), para una prenda mal etiquetada. Una o dos letras sueltas
  son el talle (palabra entera).
- Precios y formas de pago son los de Etiquetas: TN con caché de 30 min, y las formas de pago **de
  esa compu** (se editan en Etiquetas → Precio).
- 🔑 **La lectura de campañas la abre también Reposición** (`api/_liquidacion.js`, `?etiquetas=1`
  GET): quien arma puede no tener Etiquetas. ⛔ La escritura sigue siendo sólo de Etiquetas.
- `campaniaEtiqueta` viaja en `leerRepoConfig` (si no, el próximo guardado la borra).
- ⛔ «feria» en pantalla no: se dice «campaña» (VOCABULARIO §5); en el papel sale el título de la campaña.
- ⏭️ Imprimir de verdad no se ensaya desde una sesión de IA: se prueba en la compu del depósito.

## Sin etiqueta de precio (Darío, 12-oct-2026)

Configurar → «Sin etiqueta de precio»: productos que van a una caja de precio único (las bikinis «todo
a $5.000»). Al escanear, **cada unidad** sale «Con alarma · sin etiqueta de precio» (voz: «Alarma»),
y ninguna sale «para exhibir» ni con botón de etiquetas. ⛔ No cambia cuánto se lleva. Con fecha
«hasta» se apaga sola. Guardado en `ventas.sinPrecio` (`{ pid: { hasta? } }`); la marca viaja en el
pedido congelado (`soloAlarma`), así que un armado empezado antes del cambio no la tiene.

## El correo de las 10:00 (tanda 3, 12-oct-2026)

A las 10:00 abre el local y la reposición tiene que estar ahí (Darío). Un correo a Darío
(`vars.MAIL_REPOSICION_A` lo pisa) con cada armado del día: estado, hora y quién, pedidas /
llevadas / no encontradas, el número de transferencia en GN y **sólo los renglones que no salieron
completos**, con «ya faltó N veces en 14 días».

- `lib/reposicion/correo.core.js` (puro, `tests/reposicion-correo.test.ts`) ·
  `scripts/reposicion-correo.mjs` (sólo lee `repo_armado`) · `.github/workflows/reposicion-correo.yml`.
- ⛔ **Sin la devolución** («por ahora no», Darío 12-oct): el correo es sólo depósito → local.
  El asunto avisa sin iniciar / sin transferir / transferencia **sin confirmar**. Antes de
  Finalizar los números dicen **Escaneadas** (no se movió nada); después, **Transferidas**.
- ⏱️ **La duración** = de «Iniciar armado» a «Finalizar» (`creado_en` → `cerrado_en`): si se abre la
  lista y se empieza a juntar más tarde, la duración sale inflada.
- 📅 **Lunes a sábado** (Zattia; BDI repone de lunes a viernes, pero no usa el armado con lector).
  Los feriados no se saltean: ese día llega «sin iniciar».
- Stunned aparece sólo si tuvo un armado ese día: no tiene rutina propia todavía.
- 🔴 **El reloj es de Maketa** (`/api/cron/reposicion-monitor`, 13:00 UTC de lunes a sábado), igual que el parte de la
  mañana: los crons de GitHub de este repo llegan horas tarde.
- Para mirarlo sin mandarlo: `gh workflow run reposicion-correo.yml -f simulacro=true` (deja el HTML
  como artefacto `correo-html`). Desde la Mac ⛔ se puede: el `.env` tiene sólo la clave anon de Zattia.

## La foto guardada (12-oct-2026)

Al abrir, la pantalla pide la config y la **huella** (`huellaDatos`: la hora de cada sync de
`sync_state` + el día). Si coincide con la foto guardada en la compu (`reposicion_foto_<marca>`, en
el almacén del Monitor), muestra eso **sin bajar el stock ni las ventas** (1,3 MB, 16 pedidos →
2 pedidos chicos). Si cambió —sync de la mañana, «Actualizar stock», transferencia de un armado, o
cambió el día—, baja todo como antes, en paralelo. «Recargar» y «Reintentar» fuerzan la bajada.

## Lo que ya se rompió acá

- 4-sep-2026: «Actualizado» con el stock de ayer → la hora es la del **sync**, no la de la lectura
  (comentado en `Reposicion.tsx` y `cliente.ts:ultimaSincronizacion`).
- `venta_detalles` ordenado sólo por `sale_id` pisaba empates entre páginas: va con desempate único.

## Pendiente

- ▶️ **Parte 2:** la lista de Lorena por correo a administración a las 7:00 (falta la dirección) (el de las 10:00 ya está: ver arriba).
- ▶️ **Parte 3, en tandas** (Darío, 12-oct): ✅ T1 Lorena escanea + transferencia · ✅ T2 Camila
  (devolver) + la limpieza grande · ✅ T3 correo de las 10:00 (⛔ «no estaba» → Conteo: descartado por Darío, 12-oct) · ✅ T4
  (Zebra: etiquetas para exhibir + impresión rápida, ver arriba).
- ▶️ Condiciones de Stunned. ▶️ Ubicaciones del depósito de Zattia (la sección Ubicaciones es sólo BDI).

## Cómo se prueba

`npx vitest run tests/reposicion-ventas.test.ts`. Los papeles se miran **generando el PDF** (A4:
`reposicionPDFFilas` con `compartirODescargarPDF` mockeado; rollo: `armarDevolucion` +
`pintarDevolucion`) y abriéndolo: la geometría no la cubre ningún assert.
