# Ventas (Marketing) — ficha de sección

Sección `mkt-ventas`, área `marketing`. El objetivo de venta del sector con su barra de avance, el
contador diario de ventas online con flechas para caminar los días anteriores, y **el resultado del
sale**. Lo pidió Bruno el
18-ago-2026: *«un objetivo que tenemos como sector, arriba, con barra que se completa… como si fuese
un proyecto»*. Hasta acá **Marketing no veía una sola pantalla de ventas** —su función hereda
`marketing` y `meta`, y todo el análisis de venta es del área `analisis`, que es de Dirección—.

## Dónde vive

- `components/mkt-ventas/` — `MktVentas.tsx` (la pantalla) · `Objetivo.tsx` (la barra) ·
  `ContadorDiario.tsx` (las flechas) · `VentaGeneral.tsx` (por canal + los que más salieron) ·
  `useMetas.ts`.
- `lib/mkt-ventas/core.ts` — `serieDiaria`, `escalonVigente`, `techoDeLaRampa`, `medirElDia`,
  `resumenPorCanal`, `losQueMasSalieron`, `unidadDeLaMeta`.
- `lib/mkt-ventas/persistencia.ts` — el cliente del botón.
- **Handler:** `api/_mkt-ventas.js`, por `/api/datos?recurso=mkt-ventas`. **Un solo verbo**
  (`traer-ventas-hoy`). Todo lo demás sale del ETL que la sección ya tiene por `useDatosMonitor()`,
  de `api/_norte.js` con `?metas=1`, y de `api/_liquidacion.js` con `?resultado=1`.
- `api/_gn.js` y `api/_ventas-hoy.js` — el `fetch` a Gestión Nube y el trabajo de traer las ventas
  del día. **Salieron de `api/_liquidacion.js` sin cambiarles una línea**, porque los comparten los
  dos botones. ⚠️ Ninguno de los dos es función de Vercel (prefijo `_`; el techo son 12 y hay 7).
- Tabla: `norte_metas` (`sql/migrate-norte.sql`), que es de Norte. Acá **sólo se lee**.
- Tests: `tests/mkt-ventas.test.ts`.

## ⛔ Lo que comparte con otras secciones

- 🔴 **La ventana de ventas del ETL cuelga de esta sección, y toca a TODA la app.**
  `veVentasHistoricas` (`lib/permisos.core.js`) decide si alguien baja la historia completa o 35
  días, y lo decide por `SECCIONES_ANALISIS_VENTAS`. `desdeVentas` (`lib/datos.ts`) traduce el
  booleano al corte, y **ese mismo string sella el caché** (`lib/cache.ts`). Tocar cualquiera de las
  tres le cambia el payload a las ~22 pantallas que usan `useDatosMonitor`.
- 🔴 **`api/_gn.js` lo comparten `_liquidacion.js` y `_ventas-hoy.js`.** ⛔ **No es
  `crearClienteGN`** (`scripts/lib/gn-fetch.mjs`) y no hay que unificarlos: aquél espera **hasta 300
  segundos por corte, hasta cinco veces**, que está bien para un job de Actions con 20 minutos y se
  come entera una función de Vercel de 30 s. El de acá corta en 5-30 s × 3.
- 🔴 **`api/_norte.js` tiene DOS llaves desde el 18-ago-2026.** `?metas=1` contesta **sólo
  `norte_metas`** y elige `['norte', 'mkt-ventas']` **antes** del `puedeVerAlguna`. Tocar ese gate
  le cambia el acceso a Dirección. El porqué está comentado ahí mismo — y **antes de tocar el
  handler hay que leer `docs/secciones/norte.md`**.
- **`canalDe` es de `lib/liquidacion/canal.core.js`** y la usan también Norte (la contribución) y
  Liquidación (el resultado). Un cambio ahí mueve el contador de esta pantalla.
- `Barra` (`components/ui/Paginacion.tsx`) nació acá y `MiniBar` pasó a delegar en ella: son once
  llamadores de tabla los que dependen del 4×60 fijo.
- `hoyIso`/`sumarDias` viven en `lib/fechas/dia.ts`, que salió del barril de Calendario para esto.

## Reglas que el código no dice

- 🔴 🔑 **ZATTIA NO VENDE FUNDAS, y ésta es la PRIMERA pantalla cross-marca que nombra la unidad.**
  El contador decía «Fundas online» sobre Zattia, que vende ropa: hablaba del negocio de al lado.
  Lo cazó Bruno mirándola. 🔑 **Hasta acá el repo lo esquivaba scopeando la sección**:
  `fundas-modelo` es `brands: ['bdi']`, así que la única pantalla que nombraba la unidad no existía
  en Zattia. ⇒ el sustantivo sale de **`articuloDe(marca)`** (`lib/cuentas.ts`, donde ya vive
  `nombre`): **funda** / **prenda**. ⚠️ El catálogo de `MEDIDORES` también está escrito en BDI
  («Fundas por día que salen») ⇒ **`unidadDeLaMeta` lo traduce en la PANTALLA y no en el catálogo**,
  porque esa `unidad` es la que Norte **escribe en la base** como espejo de la fila y no puede
  depender de quién esté mirando. ⚠️ **Límite conocido y con test**: los medidores de plata siguen
  diciendo `$/funda` — hoy no se ve (son de Dirección y Zattia no tiene metas).
- 🔴 ⛔ **EL RESULTADO DEL SALE NO VA ACÁ, y llegó a estar.** Se montó el 18-ago-2026 —era la
  segunda tarjeta del tablero de Bruno— y **lo sacó él mismo mirándolo, esa misma noche**: *«esto en
  la vista marketing borralo, sólo sirve en análisis»*. 🔑 **Con el bloque se fue la quinta llave de
  `api/_liquidacion.js`** (el `?resultado=1` y las dos lecturas del POST): una puerta de permisos
  **sin consumidor es peor que no tenerla**, porque nadie la mira y sigue abierta. ⇒ volver a
  montarlo pide **reabrirla a propósito**, y hay un test en rojo esperando
  (`_liquidacion · Ventas de Marketing no entra`, 4 mutantes).
- 🔑 **El orden de la pantalla va de lo PERMANENTE a lo EXCEPCIONAL**: el objetivo · el día de hoy ·
  **cómo viene la venta**. Lo excepcional —el sale— se mira en Liquidación, que es donde se decide
  el precio.
- 🔴 🔑 **La ventana de «cómo viene la venta» la decide `cortesDeVentas`, NO un `hoy − 30` propio.**
  La primera versión recortaba por su cuenta y quedaba **desfasada un día** del `sales30` del ETL,
  que es de donde sale el ranking de al lado ⇒ **dos ventanas de 30 días adentro de una tarjeta que
  dice «Últimos 30 días» una sola vez**. Se cazó cotejando contra `psql`: CORSET FRANK daba **24**
  por un lado y **22** por el otro, y la diferencia eran el día del borde y las ventas técnicas. Es
  justo lo que ese helper existe para impedir —«una sola definición de los últimos 30 días»—.
- ⛔ **La venta general llega hasta 30 días y NO hay 90.** Quien no ve el análisis fino baja 35 días
  (`desdeVentas`) ⇒ un «90 d» le mostraría 35 bajo un rótulo que dice 90, sin un error.
- ⚠️ **Los tres canales del resumen NO suman el total de la marca**: el canal vacío cae en `tecnica`
  por `canalDe` —sesión de fotos, fallas— y ésas no son venta. Hay un test que lo fija con los dos
  números al lado.
- ⚠️ **El ranking «los que más salieron» es de TODOS los canales**, no sólo online, y **la pantalla
  lo dice**: el ETL guarda `sales7/30/90` por producto sin partir por canal, y partirlo acá sería
  una segunda cuenta sobre las mismas filas que podría contradecir a la de arriba.
- 🔴 🔑 **FUNDAS ≠ COMPRAS, y por canal la brecha es brutal.** Bruno escribió «100 fundas diarias» y
  las tres metas que cargó ese mismo día son de **compras** (`medidor: ventas-dia`). Medido en BDI a
  30 días: online **1,9 fundas por compra**, local 1,5, **mayorista 76,9**. Un objetivo cargado en
  una unidad y leído en la otra da un avance plausible y falso. Se eligió compras, con los dos
  números adelante, y **la pantalla muestra las dos cifras juntas** para que no se lea una por otra.
- 🔑 **El título dice el techo de la rampa y la barra mide el escalón vigente.** La rampa de BDI son
  25 al 8-sep · 50 al 30-sep · 100 al 31-oct. Contra el 100 el mejor día del mes (16 compras
  online) llena **16 %** y la barra queda muerta todo el trimestre; contra el escalón llena **64 %**.
  Los dos números están escritos, así que ninguno se esconde detrás del otro.
- 🔑 **Sin objetivo cargado NO se dibuja una barra en 0 %.** Misma regla que `avanceDeMeta`, que
  devuelve `null` y no cero: un 0 % afirma «no avanzamos» —una frase sobre el negocio— y lo que pasa
  es que nadie cargó la meta, que es una frase sobre el dato. **Zattia y Stunned no tienen ninguna**
  (medido el 18-ago: las 3 filas de `norte_metas` son de BDI).
- 🔴 🔑 **El botón «Traer las ventas de hoy» son DOS pasos, y los dos hacen falta.** El primero le
  pide a GN las ventas del día y las escribe en el espejo; el segundo **vuelve a bajar el ETL**,
  porque lo que dibuja el contador está en IndexedDB y no en el espejo. Sin el segundo, el botón
  escribiría en la base y la pantalla no se movería —que se lee como «no anduvo»—. ⚠️ El segundo
  cuesta ~20 s (~14,7 MB por marca) y por eso el botón dice lo que va a hacer.
- 🔴 **El antirrebote de acá es lo ÚNICO que frena el gasto de cupo de Gestión Nube.** El
  `concurrency: gestion-nube` que comparten los ocho workflows **no alcanza a una función de
  Vercel**. Vive en una fila propia de `sync_state` (`ventas-hoy-mkt`) y es **por marca**. ⛔ No se
  fundió con el de Liquidación, que vive en `datos.ventasSync` de **la campaña**: son dos preguntas
  distintas y fundirlas haría que apretar en una pantalla frene la otra sin que nada lo diga.
- 🔴 🔑 **La línea de «leído hace X» y la del botón son DOS hechos, y van los dos.** Aquélla sale
  del último run del workflow diario (`fetchUltimoSync`, o sea GitHub Actions) y **después de
  apretar el botón sigue teniendo razón**: el reloj de la madrugada corrió cuando corrió. Lo que
  faltaba era la otra mitad. Se vio caminándola: el contador saltó de **1 a 15 compras** y la línea
  seguía diciendo «hace 17 h» — un número de hace dos minutos bajo un rótulo de hace diecisiete.
  ⇒ el GET de `api/_mkt-ventas.js` contesta `traidoEn` y la frase suma «las de hoy, traídas a mano
  hace N min». 🔑 **Las dos mitades comparten un solo `new Date()`**: dos relojes en la misma frase
  son dos instantes.
- 🔑 **`ventas-hoy-mkt` es una fila PROPIA, no la de `diario`.** Los cinco lectores de `sync_state`
  filtran por `clave = 'diario'` (medido con grep antes de escribirlo): pisarla haría que «el sync
  corrió hace 3 minutos» lo diga un botón y no el sync, que es otra cosa.
- 🔴 **El dato de hoy llega mañana, y por eso la línea «leído hace X» va SIEMPRE.** El único reloj
  agendado es `sync-diario.yml` (`0 6 * * *`, o sea ~3 de la mañana acá); `sync-ventas-hoy.yml`
  existe pero es `workflow_dispatch` puro. Medido el 18-ago a las 16:52 ART: el espejo tenía **1
  sola venta online de ese día**. Sin esa línea, un sync muerto se ve idéntico a un día flojo.
- ⚠️ **Mercadolibre NO cuenta como online.** `canalDe` lo manda a `otro` (no dice tienda, nube ni
  online). Medido: **7 pedidos en 30 días** en BDI, o sea hoy no mueve el objetivo. El test que lo
  fija está escrito para el día que crezca.
- 🔑 **Una venta de cero unidades igual es una compra.** `compras` cuenta filas de `ventas` y no se
  deriva de los renglones: deducirlo contaría de menos y no fallaría nada.
- ⚠️ **El día lo decide el navegador**, que está en Argentina — el mismo criterio de la Agenda. ⛔ No
  se usa `diaArgentino` (`lib/envios/portal.core.js`): ésa existe porque el **servidor** corre en
  UTC. Lo que sí está mal en las dos es `toISOString().slice(0,10)`, que da el día UTC.
- ⚠️ **La serie son 34 días, no 90**, y eso NO cambió al abrirle Análisis a Marketing: el techo lo
  pone `desdeVentas` para quien no ve el análisis fino, y **quien sí lo ve baja desde 2025-01-01**.
  Se dejó en 34 porque es el piso garantizado para cualquiera que abra la sección. Pedir más
  devolvería días en cero que no son cero, son «no bajó»; la flecha que se acaba **dice por qué**.
- 🔴 🔑 **Marketing abre CINCO secciones de Análisis por `keys`, no el área.** `productos` ·
  `variantes` · `ventas-mensuales` · `colores` · `talles`. ⛔ Lo que el área arrastraría y queda
  afuera **a propósito**: `margenes` y `comisiones` (costo y markup), `verif-ventas`, `resumen` y
  `liquidacion` entera. Decisión de Bruno.
- 🔴 🔑 **Y eso obligó a mover DOS piezas compartidas, o el dato salía truncado y callado**:
  1. **La ventana dejó de colgar de `esAdmin`.** Con el flag, «Ventas 90 d» habría mostrado **35
     días bajo una columna que dice 90** y la comparación contra el año anterior habría salido
     vacía, las dos **sin un error**. ⇒ `veVentasHistoricas(perfil, store)`, y `userRole()` —cuyo
     único llamador era éste— se fue.
  2. **El caché de IndexedDB necesitaba sello de ventana.** `claveCache` es **sólo la marca**: con
     dos ventanas conviviendo, la entrada corta de un usuario se le servía al siguiente. Es el mismo
     modo de falla que ya había cerrado el sello de marca, y se cierra igual.
  ⚠️ **Gerencial lee el caché SIN pedir ventana, a propósito**: mira agregados que las dos ventanas
  contestan igual, y exigirle el sello lo mandaría a bajar 14,7 MB por marca cada vez que el usuario
  de al lado dejó una entrada más corta.

## Lo que ya se rompió acá

- **El lint rechaza `setState` síncrono en un `useEffect`** (`react-hooks/set-state-in-effect`) y
  dejó el CI en rojo en la primera versión de `useMetas`. El patrón bueno es el de `useMarketing` y
  `useTnImages`: caché a nivel de módulo, **leído en el render**; el effect sólo dispara el fetch.
- 🏁 🔴 **AL CAMBIAR DE MARCA, LA PANTALLA MOSTRABA LOS NÚMEROS DE LA OTRA CON EL RÓTULO DE ÉSTA
  — CERRADO** (18-ago-2026). Lo destapó caminar esta sección pero **no era de acá**: era del store
  del ETL, o sea de las ~22 pantallas que usan `useDatosMonitor`. Con «BDI Accesorios» arriba, el
  contador decía **6/6** y el sync **17/8 03:34**, los dos de Zattia. 🔑 **Eran DOS puertas, no una**
  —la segunda apareció recién al escribir el test—: (1) `cargar()` hacía `set({ marca })` **antes**
  del `await leerCache`, así que durante ese await el guard `listoParaEstaMarca` daba `true` con los
  datos viejos; (2) **la carrera**: volver a la marca anterior mientras la primera bajada seguía en
  vuelo hacía que ésa publicara **tarde y encima**, y ahí se quedaba. ⇒ el `set` que cambia de marca
  baja `estado` a `'cargando'` y limpia `datos`, y **todo lo que publica pasa por un `publicar()`
  que descarta si el store ya está en otra marca**. ⚠️ El **guardado del caché no** se descarta: la
  bajada ya se pagó. 📌 `tests/store-marca.test.ts`, **9 mutantes, 9 muertos**.

## Pendiente

- 🔴 ▶️ **Nadie con perfil de Marketing caminó esto todavía**: todo se ejerció con admin, así que
  lo que NO se ejerció es justamente el camino nuevo —`veVentasHistoricas` dando `true` por la
  función y no por el flag de admin, y las cinco secciones de Análisis apareciéndole en el menú—.
  Los usuarios de prueba los crea Bruno.
- ✅ 🏁 **EL BOTÓN SE EJERCIÓ A MANO EN PRODUCCIÓN** (18-ago-2026 21:22 ART, BDI), con `psql` de
  oráculo: online del 18-ago **1 → 15 compras** y **3 → 35 fundas** —idéntico a lo que dibujó la
  pantalla, que pasó de 4 % a 60 %—, el **17-ago intacto en 21** (el upsert de «ayer y hoy» no
  duplicó nada) y `sync_state.diario` **sin moverse**. ✅ Y el **antirrebote también**: el segundo
  toque contestó `{"ok":true,"salteado":true,…}` con 200 y `sync_state` **no se movió**.
  ⚠️ Se ejerció a las 21:22 de Argentina, o sea con `current_date` de Postgres ya en el día
  siguiente — el caso exacto que la ventana en hora AR existe para cubrir.
- ⚠️ **Se caminó en prod con perfil ADMIN, no con uno de Marketing.** Lo que el admin no ejerce es
  el `puedeVerAlguna` de la llave `?metas=1` con la función `marketing` — los usuarios de prueba los
  crea Bruno. ▶️ Falta eso.

## Cómo se prueba

```bash
npx vitest run tests/mkt-ventas.test.ts --reporter=dot
```

- **13 mutantes en el núcleo + 7 en la llave de `_liquidacion`, los 20 muertos** (baseline en 0
  antes de mutar). ⚠️ Dos de los 7 no mueren con `AssertionError` sino con **«LLEGÓ A LA BASE — el
  gate no cortó»**, que es la señal que ese arnés existe para dar: el 403 tiene que salir **antes**
  de tocar la base. Los dos que hay que ver caer ahí son abrir la llave a todas las actions y
  hacer que `leeVentasDeProductos` acepte cualquier POST.
- **13 mutantes del núcleo + 11 de la ventana, el caché y los permisos, todos muertos con
  `AssertionError`** (baseline en 0 antes de mutar). Los que hay que ver caer si se toca eso:
  `veVentasHistoricas` volviendo a `esAdmin(perfil)` solo, el sello de ventana que no corta, y
  `DIAS_SIN_HISTORIA` de 35 a 30.
- **11 mutantes más sobre el botón y la ventana de GN, los 11 muertos**: el antirrebote que no
  frena, el borde del minuto (`>=` → `>`), el gate que ignora la marca, y —el que más importa— la
  ventana de fechas pasando de la hora de Argentina a UTC, que a las 21:30 pediría las ventas de
  mañana justo cuando el local cierra. Los que hay que
  ver caer si se toca el núcleo: `compras += 1 → += 0`, el `!==` del canal, `[...futuras].sort()[0]`
  → el último, y `>= 0 → > 0` en la fecha del escalón (el día del vencimiento todavía cuenta).
- 🔑 **El oráculo de la serie es `psql`, no un fixture.** Se exportan las ventas de 34 días y el
  `GROUP BY` de SQL, y se compara contra `serieDiaria` — dos implementaciones distintas del mismo
  corte. Medido el 18-ago sobre **851 ventas y 5.354 renglones**: idénticas, y **el oráculo se
  verificó mutando** (`compras += 2` lo pone en rojo), o sea no pasa por vacío.
- ✅ **La venta general, cotejada contra `psql` en Zattia** (18-ago): por canal **local 389 compras /
  541 prendas · online 110 / 179 · mayorista 0**, idéntico. Y el ranking **22 · 17 · 17** — que sólo
  cierra con la ventana del ETL (desde el 21-jul) **y sin las técnicas**: con la ventana ingenua
  daba 24 · 19 · 17, y ésa fue la pista de las dos ventanas.
- Los últimos 10 días de BDI, para volver a cotejar: **16 · 11 · 8 · 12 · 5 · 14 · 10 · 14 · 3 · 9**
  compras online (17-ago hacia atrás).

- ✅ **Caminada en producción el 18-ago-2026**, con `psql` al lado en cada paso: hoy **1/3**, la
  flecha atrás a 17-ago **16/28** (barra 64 % contra el escalón de 25), el piso en **jue 16-jul**
  **7/11** con la flecha apagada y el cartel que dice por qué, y **Zattia sin objetivo cargado**
  dibujando el cartel y **no una barra en 0 %** (su 16-jul, 6/6, también cotejado). Los cuatro
  números salieron del `GROUP BY` de psql, no de la misma pantalla.

## El selector de línea (22-ago-2026)

Esta pantalla es una de las cinco que llevan **selector de línea** en Zattia: `Zattia` · `Stunned`,
arrancando en Zattia. ⇒ **el contador del día y el «cómo viene la venta» son de UNA línea**, nunca de
la mezcla. ⛔ El día que se estrenó, los números de Zattia bajaron ~3 % respecto de lo que mostraba
antes (28 productos, 195 unidades, $619.710 en 30 días, que ahora están en la pestaña de al lado).

📌 El porqué, el costo medido y lo que el corte **no** puede hacer están en `docs/lineas.md`.
⚠️ Las metas (`?metas=1`) **no se cortan por línea**: se cargan por marca y ninguna es de Stunned.
