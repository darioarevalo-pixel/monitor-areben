# Ventas mensuales — ficha de sección

Sección `ventas-mensuales`, área `analisis`, BDI + Zattia. **Dos pestañas**, y son dos fuentes
distintas: *Por mes* es el legacy portado (el ETL del navegador, sin plata) y *Día a día* es del
23-ago-2026 (una consulta al servidor, con plata).

Contesta *cómo viene la venta*. La pregunta que la pestaña nueva agrega es la de la semana en curso:
un mes cerrado se ve recién el día 1, y una campaña que arranca un martes vive entera adentro de una
barra.

## Dónde vive

| pieza | archivo |
|---|---|
| Pantalla y pestañas | `components/ventas-mensuales/VentasMensuales.tsx` |
| Día a día | `components/ventas-mensuales/VentasDiarias.tsx` + `useVentasDiarias.ts` |
| La regla (por mes) | `lib/ventas-mensuales.ts` — paridad con el legacy, **no se toca** |
| La regla (por día) | `lib/ventas-diarias/core.js` (puro) · `index.ts` tipado · `cliente.ts` |
| Handler | `api/_ventas-diarias.js`, por `datos.js?recurso=ventas-diarias`. ⛔ Sólo GET |
| Tests | `tests/ventas-diarias.test.ts` (21) · `tests/handlers-autorizacion.test.ts` |

⛔ **No hay tabla propia ni migración.** Todo sale de `ventas` y `venta_detalles` del espejo.

## ⛔ Lo que comparte con otras secciones

- **`lib/liquidacion/canal.core.js`** — `canalDe`, `CANALES` y `ETIQUETA_CANAL`. El rótulo se mudó
  acá el 23-ago-2026: estaba escrito en el JSX de `components/mkt-ventas/VentaGeneral.tsx` y por eso
  cubría sólo tres de los cinco canales.
- **`lib/norte/contribucion.core.js` → `facturadoDeVenta`** — la plata del día es *mercadería −
  descuento + envío*, **la misma cascada que usa Dirección**. Salió afuera de `cascadaDeVenta` para
  que esta pantalla la use sin arrastrar IVA ni comisiones. ⛔ Escribir la cuenta de nuevo acá sería
  el segundo número para la misma pregunta.
- **`lib/etl/tecnica.core.js` → `esVentaTecnica`** — el mismo criterio de exclusión que el ETL,
  Norte y el CRM.
- **`lib/fechas/dia.core.js`** — `sumarDias` bajó a `.js` plano el 23-ago-2026 para que el handler
  pueda enumerar los días; `lib/fechas/dia.ts` quedó de re-export y ningún import cambió.

## Reglas que el código no dice

- 🔑 **Es una PESTAÑA y no una sección nueva, decisión de Bruno (23-ago-2026).** Es la misma pregunta
  en otra granularidad. Una sección nueva habría estrenado permiso propio, y **un permiso que nadie
  tilda es una pantalla que no ve nadie**: acá quien ya mira las ventas mensuales encuentra el día
  sin que haya que otorgarle nada.
- 🔴 **La plata NO puede salir del ETL, y no se lo va a hacer bajar.** Su `select` de
  `venta_detalles` es `sale_id, product_id, size_id, size, quantity` — sin `unit_price` ni `total`.
  El razonamiento entero está en `lib/liquidacion/ventas.ts`: es la tabla más grande, el payload de
  BDI ya pesa ~14,7 MB en IndexedDB, y dos columnas más las pagarían las 42 secciones. Por eso las
  dos pestañas tienen fuentes distintas y **cada una trae su propio control al header**.
- 🔴 **El último día del gráfico casi siempre está a medias, y si no se dice se lee como una caída.**
  El sync llena el espejo a las 6 UTC (~4 de la mañana acá): lo que se vende después no está.
  `medidoHasta` sale de `sync_state` —**la más reciente de las dos filas**, porque el botón «Traer
  las ventas de hoy» de Ventas de Marketing llena la misma tabla— y el día de esa lectura sale con
  `completo: false`, barra más clara y la palabra «midiéndose». Medido el 23-ago-2026 en BDI: el 22
  cerró en 18 compras y el 23 iba en 3.
- 🔴 **«Otros canales» existe porque Mercadolibre existe.** `canalDe` manda a `otro` todo lo que no
  reconoce: en BDI son *Mercadolibre* (13 ventas, $195.644 en 37 días) y *Otro Canal* ($336.760).
  Dibujar sólo online/local/mayorista **no se vería como un error: se vería como menos venta**. Por
  eso los canales salen de los que tuvieron movimiento y el pie dice qué nombres crudos hay adentro.
- 🔑 **La comparación es contra el MISMO día de la semana anterior, no contra ayer.** La venta tiene
  semana: el domingo 9-ago de BDI hizo 4 ventas y el viernes 14 hizo 58. Contra ayer, cada lunes es
  un derrumbe. Por eso el handler pide **siete días de más hacia atrás** que no se muestran: existen
  sólo para ser el término de comparación del primer día visible.
- 🔴 **`previo` en `null` no es cero.** `null` es «no se preguntó» (el día −7 quedó fuera de la
  consulta) y cero es una respuesta. Y con la semana anterior en cero **no hay porcentaje**: la
  pantalla escribe «sin comparación» en vez de un ∞ o un 100 % inventado.
- 🔑 **El tope de ventana son 90 días y no es una preferencia.** Cada corrida del sync relee
  completos los últimos `DIAS_REPASO` = 90 días y purga lo que Gestión Nube ya no tiene
  (`scripts/lib/purga-ventas.mjs`). Más atrás, una venta quedó como estaba el día que se cargó: si
  después se anuló o le cambiaron el importe, el espejo no se enteró.
- 🔑 **El oráculo de la plata viaja en la respuesta.** `facturado` se arma de tres columnas; `total_price`
  es el total que Gestión Nube ya calculó y guardó en la venta — otro camino que el hecho. Medido
  el 23-ago-2026 sobre 37 días: coinciden al peso en 1.006 de 1.016 ventas de BDI y 739 de 751 de
  Zattia, y las que no difieren $10 a $42 por redondeo. El pie de la pantalla lo dice **siempre**,
  también cuando cierra: callarse cuando está bien enseña a no leer el pie.
- ⚠️ **Las líneas negativas no se filtran.** Una devolución entra como `quantity: -1` con su plata en
  negativo y **tiene que restar**: el día que se devolvió una prenda se vendió una menos. En Zattia
  son 29 de 399 renglones en 7 días (23-ago-2026), así que no es un caso de borde.
- ⚠️ **`channel_id` sólo se pide en BDI.** La tabla de Zattia no tiene esa columna y PostgREST
  rechaza **el select entero** por una columna que no existe. Mismo recaudo que `api/_norte.js`.

## Lo que ya se rompió acá

- Todavía nada de la pestaña nueva. Lo que sí se rompió en la vecina y de lo que ésta copió el
  recaudo: el store del ETL **publicaba los datos de una marca bajo el nombre de la otra**
  (18-ago-2026). Por eso `useVentasDiarias` **vacía la serie antes de pedir la nueva** al cambiar de
  marca: acá lo que queda dibujado son barras y totales, que no se leen como «está cargando».

## Pendiente

- ▶️ **Nadie con perfil no-admin lo caminó**: todo se ejerció con admin.
- ⚠️ **Ventas de Marketing sigue perdiendo «Otros canales»**: `CANALES_DEL_RESUMEN` de
  `lib/mkt-ventas/core.ts` son tres, así que sus porcentajes son sobre online+local+mayorista y
  Mercadolibre no aparece. No se tocó en esta sesión — ahora hay rótulo (`ETIQUETA_CANAL`) para
  arreglarlo cuando alguien entre ahí.
- ▶️ **La pestaña *Por mes* sigue sin plata** (es del ETL). Si alguna vez la pide, el camino ya está
  abierto: la misma puerta con otra ventana.

## Cómo se prueba

```
npx vitest run tests/ventas-diarias.test.ts        # 21, la regla
npx vitest run tests/handlers-autorizacion.test.ts # el 403 antes de tocar la base
```

- 🔑 **Los números NO se prueban con vitest: se cotejan contra `psql`.** El camino real se ejerció el
  23-ago-2026 corriendo la misma consulta y el mismo núcleo contra la base de prod, y el resultado
  se comparó con SQL puro sobre la ventana visible de BDI (25-jul al 23-ago): **832 compras, 8.737
  unidades y $37.204.857 por los dos caminos, al peso**. El `.env` tiene `DATABASE_URL_BDI` y
  `_ZATTIA`.
- 🔴 **Zattia no se puede ejercer desde esta Mac**: sin `ZATTIA_SUPABASE_SERVICE_KEY` local, la anon
  contesta `permission denied for table ventas` (la Fase S le revocó el `select`). En Vercel la
  service key está. Los números esperados de Zattia para 14 días al 23-ago-2026, sacados con `psql`:
  **394 compras, 600 unidades, $12.661.703** y 4 ventas técnicas.
- 🔑 **12 mutantes, 12 muertos.** El que hay que ver caer es `f.completo === false` → `=== true` en
  `totalDelTramo`: salió **vivo** la primera vez porque el fixture tenía dos días completos y dos
  incompletos, y contar unos o los otros daba el mismo número. Un tramo de prueba necesita los dos
  lados **desparejos**.
