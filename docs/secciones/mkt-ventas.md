# Ventas (Marketing) — ficha de sección

Sección `mkt-ventas`, área `marketing`. El objetivo de venta del sector con su barra de avance, y el
contador diario de ventas online con flechas para caminar los días anteriores. Lo pidió Bruno el
18-ago-2026: *«un objetivo que tenemos como sector, arriba, con barra que se completa… como si fuese
un proyecto»*. Hasta acá **Marketing no veía una sola pantalla de ventas** —su función hereda
`marketing` y `meta`, y todo el análisis de venta es del área `analisis`, que es de Dirección—.

## Dónde vive

- `components/mkt-ventas/` — `MktVentas.tsx` (la pantalla) · `Objetivo.tsx` (la barra) ·
  `ContadorDiario.tsx` (las flechas) · `useMetas.ts`.
- `lib/mkt-ventas/core.ts` — `serieDiaria`, `escalonVigente`, `techoDeLaRampa`, `medirElDia`.
- **Handler propio no tiene.** Las ventas salen del ETL que la sección ya tiene por
  `useDatosMonitor()`, y los objetivos de `api/_norte.js` con `?metas=1` (ver abajo).
- Tabla: `norte_metas` (`sql/migrate-norte.sql`), que es de Norte. Acá **sólo se lee**.
- Tests: `tests/mkt-ventas.test.ts`.

## ⛔ Lo que comparte con otras secciones

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
- ⚠️ **La serie son 34 días, no 90.** El techo lo pone `desdeVentas` (`lib/datos.ts`): quien no es
  admin baja **35 días** de ventas. Pedir más devolvería días en cero que no son cero, son «no bajó».
  La flecha que se acaba **dice por qué**.

## Lo que ya se rompió acá

- **El lint rechaza `setState` síncrono en un `useEffect`** (`react-hooks/set-state-in-effect`) y
  dejó el CI en rojo en la primera versión de `useMetas`. El patrón bueno es el de `useMarketing` y
  `useTnImages`: caché a nivel de módulo, **leído en el render**; el effect sólo dispara el fetch.

## Pendiente

- ▶️ **El botón «Actualizar ventas»** (tanda 3 del plan): el trabajo ya existe en
  `api/_liquidacion.js` (`action:'sincronizar-ventas'`, 1,2 s medidos) pero pide `admin` **y un id
  de campaña**, porque su antirrebote vive en `datos.ventasSync`. Sale a `api/_ventas-hoy.js`.
- ▶️ **El resultado de la liquidación** (tanda 4) y **abrir Por producto / variante / mensuales /
  colores / talles a Marketing** (tanda 5), que arrastra dos 🔴: la ventana de ventas tiene que
  colgar del permiso y no del flag de admin, y **el caché de IndexedDB necesita sello de ventana**
  (`claveCache` es sólo la marca ⇒ la entrada corta de un usuario se le sirve al siguiente, callada).
- ⚠️ **Nada se ejerció a mano todavía**: falta abrir la pantalla en prod con un perfil de Marketing.

## Cómo se prueba

```bash
npx vitest run tests/mkt-ventas.test.ts --reporter=dot
```

- **13 mutantes, 13 muertos con `AssertionError`** (baseline en 0 antes de mutar). Los que hay que
  ver caer si se toca el núcleo: `compras += 1 → += 0`, el `!==` del canal, `[...futuras].sort()[0]`
  → el último, y `>= 0 → > 0` en la fecha del escalón (el día del vencimiento todavía cuenta).
- 🔑 **El oráculo de la serie es `psql`, no un fixture.** Se exportan las ventas de 34 días y el
  `GROUP BY` de SQL, y se compara contra `serieDiaria` — dos implementaciones distintas del mismo
  corte. Medido el 18-ago sobre **851 ventas y 5.354 renglones**: idénticas, y **el oráculo se
  verificó mutando** (`compras += 2` lo pone en rojo), o sea no pasa por vacío.
- Los últimos 10 días de BDI, para volver a cotejar: **16 · 11 · 8 · 12 · 5 · 14 · 10 · 14 · 3 · 9**
  compras online (17-ago hacia atrás).
