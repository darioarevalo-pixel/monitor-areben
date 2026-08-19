# Ventas (Marketing) — ficha de sección

Sección `mkt-ventas`, área `marketing`. El objetivo de venta del sector con su barra de avance, el
contador diario de ventas online con flechas para caminar los días anteriores, y **el resultado del
sale**. Lo pidió Bruno el
18-ago-2026: *«un objetivo que tenemos como sector, arriba, con barra que se completa… como si fuese
un proyecto»*. Hasta acá **Marketing no veía una sola pantalla de ventas** —su función hereda
`marketing` y `meta`, y todo el análisis de venta es del área `analisis`, que es de Dirección—.

## Dónde vive

- `components/mkt-ventas/` — `MktVentas.tsx` (la pantalla) · `Objetivo.tsx` (la barra) ·
  `ContadorDiario.tsx` (las flechas) · `ResultadoSale.tsx` (monta el Resultado de Liquidación) ·
  `useMetas.ts`.
- `lib/mkt-ventas/core.ts` — `serieDiaria`, `escalonVigente`, `techoDeLaRampa`, `medirElDia`.
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
- 🔴 **`api/_liquidacion.js` tiene CINCO llaves desde el 18-ago-2026** (eran cuatro). La quinta es
  ésta, y son **dos caminos distintos**: `?resultado=1` en un **GET** —campañas e ítems, pasados por
  `sinPlataDeCosto()`— y las actions `ventas-campania` / `stock-campania` en un **POST**. ⚠️ Las dos
  del POST van **por el nombre de la action y no por un flag de query**, al revés que `etiquetado`,
  y la diferencia es que son **lecturas**: `etiquetado` pedía las dos condiciones porque escribe una
  fila. Cualquier otra action con esta llave cae en la rama de siempre y contesta 403.
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
- 🔑 **`sinPlataDeCosto()` borra en vez de elegir qué copiar.** Saca `foto.costo`, `foto.sinCosto`,
  `decision.margen` y `decision.markup`, y deja pasar todo lo demás. Una lista **blanca** dejaría
  afuera lo que alguien agregue después —la pantalla pierde un dato y nadie sabe por qué—; la negra
  deja pasar de más sólo si aparece un campo de costo **nuevo**, que es un cambio que se nota al
  escribirlo. ⚠️ Si aparece uno, va ahí.
- 🔑 **El Resultado se MONTA, no se reescribe.** `lib/liquidacion/resultado.ts` y
  `components/liquidacion/Resultado.tsx` **no leen costo, margen ni markup** —grep en las dos puntas
  da cero, medido antes de escribir la llave—, así que la pantalla sale idéntica y el payload deja
  de llevar el costo. Una segunda versión sería garantizar que algún día las dos pantallas contesten
  distinto sobre la misma campaña.
- ⚠️ **`puedeSincronizar` va en `false` y no es un olvido**: traer las ventas del día al espejo
  escribe en producción y hoy pide admin.
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
- 🔴 ⚠️ **AL CAMBIAR DE MARCA, LA PANTALLA MUESTRA UNOS SEGUNDOS LOS NÚMEROS DE LA OTRA CON EL
  RÓTULO DE ÉSTA** — y **no es de esta sección**: es del store del ETL, o sea de las ~22 pantallas
  que usan `useDatosMonitor`. Visto caminándola el 18-ago-2026: con «BDI Accesorios» arriba, el
  contador decía **6/6** (Zattia) y el sync **17/8 03:34** (Zattia), cuando BDI daba 7/11 y 18/8
  03:55. 🔑 **La causa**: `cargar()` hace `set({ marca })` **antes** de `await leerCache(marca)`
  (`store/useMonitorStore.ts`), así que durante ese await `marcaCargada` ya es la nueva y `estado`
  sigue en `'listo'` de la anterior ⇒ el guard `listoParaEstaMarca` de `useDatosMonitor` —que existe
  exactamente para esto, y su docstring lo dice— **da `true` con los datos viejos**. Se cuela sólo
  cuando la marca nueva tiene caché (el caso normal); sin caché el `estado` pasa a `'cargando'` y el
  guard sí frena. ⛔ **No se arregló acá**: es un store compartido y esto es una sección de
  Marketing. ▶️ Lo decide Bruno.

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
- Los últimos 10 días de BDI, para volver a cotejar: **16 · 11 · 8 · 12 · 5 · 14 · 10 · 14 · 3 · 9**
  compras online (17-ago hacia atrás).
- ✅ 🔑 **El resultado del sale, caminado y con el oráculo EN EL PAYLOAD, no en lo dibujado**
  (18-ago-2026, Zattia, «Sale Invierno Agosto 2026»). Dos mitades:
  1. **Los mismos cuatro números en las dos pantallas** —Liquidación → Resultado (payload con costo)
     y Ventas de Marketing (sin costo)—: vendido **205** (10% del stock) · facturado **$4.753.250** ·
     resignado **$2.730.700** · levante **2,2×** (34,2/día vs 15,4), más los 4 descartados en 0 y los
     **6 agotados de 23**.
  2. 🔴 **El cuerpo servido, capturado enganchando `fetch`**: la llave vieja trae `costo`, `sinCosto`,
     `margen` y `markup` (**203 KB**) y la de Marketing **no trae ninguno de los cuatro** (**181 KB**),
     con `precioNormal` presente en las dos. ⇒ el cero no es un payload vacío: es el filtro haciendo
     algo. ⛔ Mirar sólo la pantalla no lo habría probado —los cuatro campos no se dibujan— y mirar
     sólo la llave nueva tampoco: **hace falta la mitad que SÍ los trae**.
- ⚠️ **BDI no tiene ninguna campaña** (medido: `select count(*) from liquidaciones` da 0) ⇒ ahí lo
  que se ejerció es el cartel de vacío, no el resultado.
- ✅ **Caminada en producción el 18-ago-2026**, con `psql` al lado en cada paso: hoy **1/3**, la
  flecha atrás a 17-ago **16/28** (barra 64 % contra el escalón de 25), el piso en **jue 16-jul**
  **7/11** con la flecha apagada y el cartel que dice por qué, y **Zattia sin objetivo cargado**
  dibujando el cartel y **no una barra en 0 %** (su 16-jul, 6/6, también cotejado). Los cuatro
  números salieron del `GROUP BY` de psql, no de la misma pantalla.
