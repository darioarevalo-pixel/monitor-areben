# Por producto — ficha de sección

Sección `productos`, área de análisis. La tabla analítica principal (ventas 7/30/90, vida útil,
estado, stock) y desde el 17-sep-2026 la vista **«Ganadores por tanda»**, que sirve para elegir a
qué productos de un ingreso hacerles publicidad. Es también la puerta de entrada de Liquidación (el
tilde y «Enviar a liquidación») y del PDF de sale.

## Dónde vive

`components/productos/ProductosTable.tsx` (~720 líneas, leer por rango) · `GanadoresTanda.tsx` ·
`lib/productos.ts` (filtros, vida útil, **`conCanal`**) · `lib/ganadores/` (`core.js` + `tipos.ts` +
`cartel.ts`) · los datos salen del ETL (`lib/etl/computar.ts`, `allProductos`), sin handler propio ·
tests `tests/productos.test.ts`, `tests/ganadores.test.ts`, `tests/etl-paridad.test.ts`.

## ⛔ Lo que comparte con otras secciones

- 🔴 **`allProductos` lo leen casi todas las secciones de análisis** (Resumen, Gerencial, Marketing,
  Liquidación, Tienda Nube…). `sales7..90` y `totalSales` **suman mayorista y minorista** y quedan
  así: la paridad con el legacy los amarra. El corte vive **al lado**, en `ventasMin` / `ventasMay`.
- 🔑 **El criterio de canal es `ladoDeCanal` de `lib/liquidacion/canal.core.js`** (= `canalDe` +
  `CANALES_MINORISTA`), ⛔ no uno nuevo. Revendedor, Mercadolibre y WhatsApp son minorista; canjes
  (Influencer) y técnicas, de ningún lado.
- ⚠️ Liquidación y el PDF reciben **el producto de siempre** (los dos lados sumados), ⛔ no el del
  selector: congelan ventas en una foto y esa foto no puede depender de qué chip estaba apretado.

## Reglas que el código no dice

- 🔑 **El selector de canal arranca en «Minorista» en BDI y en «Todos» en Zattia** (`canalInicial`).
  En BDI el mayorista es el **88 % de las unidades**: «Todos» es en los hechos su ranking. Pedido de
  Bruno (17-sep-2026): *«sectorizar entre mayorista y minorista, así no se produce un sesgo»*.
- 🔑 **En «Mayorista» la vida útil es «—»**: el stock del análisis **excluye el Depósito Mayorista**
  (`computar.ts`, inventario), así que dividirlo por ventas mayoristas no describe nada.
  ⚠️ Y en «Todos» la vida útil sigue dividiendo stock minorista por ventas de los dos lados (sale
  más corta de lo real). Es el número de siempre; ver Pendiente.
- ⚠️ **«En sale 30d» se esconde fuera de «Todos»**: la arma `api/_liquidacion.js` sin canal y al
  lado de una columna minorista diría «9 de 3». El filtro de sale sí sigue andando.
- ⚠️ `phase` (el estado) ⛔ **no se parte por canal**: es de los dos lados en las tres vistas.
- 🔑 **Tanda = productos con la misma fecha de alta en GN** (≥ 3). Moods Collection es el alta del
  11-sep-2026 (26 modelos); Girlhood, la del 3-ago (19).
- 🔑 **Sin historia minorista, el mayorista es el ANTICIPO** (decisión de Bruno): en Girlhood el top
  12 del mayorista de la 1ª semana traía 11 de los 12 primeros del público. **Manda el minorista
  cuando la tanda junta `UMBRAL_MIN_POR_MODELO` × modelos** unidades minoristas, y el cambio es **de
  la tanda entera**: un ranking con dos fuentes mezcladas no se compara.
- 📊 **El umbral (10 u/modelo) está medido**, ⛔ no elegido: `scripts/calibrar-umbral-ganadores.mjs`
  (solo lectura) compara día a día contra el ranking minorista a 30 días en las 11 tandas de BDI con
  historia. El minorista le gana al anticipo desde 2,3 a 10,8 u/modelo; 10 es el extremo prudente.
  El detalle, en el docblock de `UMBRAL_MIN_POR_MODELO`.
- 🔴 **Un mayorista en cero ⛔ no es un anticipo**: pasó en 3 de las 11 tandas. Ahí manda el público
  aunque tenga poco, y el cartel lo dice en ámbar.
- 🔑 **El reloj del público arranca en su primera venta de la tanda, ⛔ no en el alta**: GN no guarda
  la fecha de publicación en TN, y Moods se dio de alta 4 días antes de publicarse.
- 🔑 **Los empatados comparten puesto** (1, 2, 2, 4): a pocas unidades casi todo empata, y un orden
  corrido inventaría una diferencia.

## Lo que ya se rompió acá

- 🔴 **El ranking de «más vendidos» era el del mayorista** y nadie lo veía: el número estaba bien, lo
  que faltaba era decir de quién. Lo destapó el análisis de Moods (17-sep-2026): CHERRY HEART iba
  **18ª en mayorista y 3ª en el público**, BAMBI 2ª y con 1 venta.

## Pendiente

- ▶️ **Que el resto del análisis use el corte** (vida útil y `phase` por defecto, Gerencial,
  Caducados, el `ritmoPrevio` de Liquidación, «Los que más salieron» de Marketing). Mueve números
  de otras pantallas: **lo decide Bruno**.
- ▶️ Las vistas materializadas de Fundas (`fundas_por_modelo_mes`) no tienen canal; `api/_prm.js`
  no filtra canal ni técnicas.
- ⚠️ Criterios de canal sueltos que no pasan por `canal.core.js`: `lib/fundas/demanda.ts`
  (`esMayorista`), `lib/marketing/core.ts` (mayorista cae en «local»), `lib/reposicion/cliente.ts`.
- ⚠️ `sales60` y `monthlySales` no se parten: el selector no los toca.

## Cómo se prueba

`npx vitest run tests/ganadores.test.ts tests/productos.test.ts tests/etl-paridad.test.ts`
(la paridad necesita `tests/fixtures/etl-*.json`, `npm run fixture-etl`). El test de paridad ata
**`ventasMin + ventasMay + sin lado = totalSales`** producto por producto.
Mutantes que tienen que caer: umbral `>` en vez de `>=` · `otro` fuera de minorista · técnicas
contadas · señal por modelo · reloj del público desde el alta · mayorista en cero como anticipo ·
empates sin compartir puesto.
📌 **El oráculo de la vista es Moods al 16-sep-2026**, medido a mano por PostgREST: 39 u al
público (36 TN + 3 local), 2.666 al mayorista, HALFTONE 8 · DUA 5 · CHERRY HEART 5 · ROSIE 4.
