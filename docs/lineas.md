# Líneas de negocio: Stunned adentro de Zattia

> ⛔ **Leer esto antes de tocar `lib/lineas.core.js`, `lib/etl/linea.ts` o de agregarle el selector de
> línea a una pantalla.** Es la única explicación de por qué una marca y una línea no son lo mismo.

## Qué es una línea

El monitor tiene **dos marcas** (`lib/nav.datos.ts`) y cada una **es una base de Supabase**:
`bdi` y `zattia`. **Stunned no es una tercera.** Está cargada adentro del Gestión Nube de Zattia:
comparte su base, sus permisos, su depósito y su local.

Medido el 22-ago-2026 contra producción:

| | |
|---|---|
| Productos con SKU `STU` | **28** de 2.676 (los 28 activos) |
| Unidades en inventario | **195** de 6.218 (**3,1 %**) — 178 en `Local`, 17 en `Deposito` |
| Venta 24-jul → 22-ago | **19 ventas · 19 u · $619.710** (Zattia sola: 621 · 908 u · $22.381.563) |
| STU con costo cargado | 25 de 28 |

🔑 **El stock NO está separado**: los 195 viven en los mismos `Deposito`/`Local` que Zattia. **Lo
único que separa a las dos líneas es el prefijo de SKU.**

⛔ **No se convierte en `Marca`.** `CUENTAS` es `Record<Marca, Cuenta>` y pediría una tercera base de
Supabase que no existe; `bdi | zattia` son 514 apariciones en 143 archivos, más los `brands` de las
~40 secciones y el padrón.

## Dónde vive la regla

**Una sola vez, en `lib/lineas.core.js`** (`.js` plano porque `api/*.js` no puede importar
TypeScript; `lib/lineas.ts` es el re-export tipado). Ahí están `LINEAS`, `ETIQUETA_LINEA`,
`baseDeLinea`, `lineasDeMarca`, `esStunned` y `lineaDe`.

Antes del 22-ago-2026 estaba repartida, y las copias ya se habían despegado:

- **«STU ⇒ Stunned», 3 copias haciendo 3 cosas distintas**: clasificaba en `lib/memo/foto.core.js`,
  clasificaba sobre variantes en `lib/conteo-estandar/core.ts`, y **excluía** en `lib/margenes.ts`.
- **«de qué marca cuelga», 5 copias, dos con modos de falla OPUESTOS**: `baseDeLinea` devolvía `null`
  ante lo desconocido y `marcaDePermisos` devolvía `'zattia'` **por descarte** — o sea que un
  `?store=` inventado salía con permisos de Zattia. Hoy las dos son la misma función y `null` corta:
  `puedeVerAlguna` niega.

Los archivos viejos re-exportan, así que ningún import cambió.

## El corte por línea en las pantallas

`useDatosMonitor({ porLinea: true })` (`components/fundas/useDatosMonitor.ts`) devuelve los datos de
**una sola línea**. El corte es `filtrarPorLinea` (`lib/etl/linea.ts`) sobre el payload **crudo**,
antes de `computarDatos`.

- **No baja nada ni cambia la clave del caché**: el caché sigue siendo uno por marca y la línea se
  computa encima de lo que ya está en memoria.
- **Es derivado y sincrónico** (`useMemo`), no un segundo estado que se publica. Por eso no puede
  repetir el defecto de agosto —publicar tarde los datos de una marca bajo el rótulo de la otra—:
  entre el payload y la línea no hay un solo `await` donde meterse.
- **Una venta entra si TIENE UN RENGLÓN de la línea.** La mixta queda en las dos —el ticket no se
  corta al medio, mismo criterio que Norte y el Memo—, y de 634 ventas en 30 días 620 tienen renglón
  de Zattia y 19 de Stunned, **5 en las dos**. ⚠️ La venta **sin ningún** renglón de producto activo
  no es de ninguna línea y no se le regala a ninguna: **1 de 634** (0,16 %).

  🔴 **La primera versión no filtraba `ventas` y estaba mal.** «Una venta mixta es de las dos, así
  que no se filtra» confundía dos cosas: dejarlas todas no es dejar las mixtas en las dos, es dejar
  también las que no tienen nada de la línea. **Lo encontró caminar la pantalla con los 4.246 tests
  en verde**: «Cómo viene la venta» de Stunned mostraba **1 prenda online con 140 compras** y 17 en
  el local con 463, porque `serieDiaria` (`lib/mkt-ventas/core.ts`) cuenta las compras recorriendo
  `ventas` y las unidades desde `detalles`. Una cifra de la marca entera al lado de una de la línea,
  sin rótulo — justo lo que el selector existe para que no pase. 📌 El test que lo cubría **afirmaba
  el defecto**: decía «las ventas NO se filtran» y estaba verde.

### Lo que cuesta, medido (22-ago-2026, payload real de Zattia)

667 productos · 3.518 filas de inventario · 21.686 ventas · 35.947 detalles:

| | ms |
|---|---|
| `computarDatos` mezclado (lo de hoy) | **221** |
| `filtrarPorLinea` + `computarDatos`, Zattia sola | **140** |
| ídem, Stunned sola | **11** |

🔑 **El corte sale más barato que la mezcla**: filtrar saca trabajo. Por eso cambiar de pestaña no
lleva estado de carga — se decidió con este número, no a ojo.

Y la partición no pierde ni repite: **639 + 28 = 667 productos** y **6.023 + 195 = 6.218 unidades**,
que es exactamente lo que dice `psql`.

### 🔴 El mutante que sale solo: filtrar productos y NO el inventario

`computarDatos` llama **huérfana** a la fila de stock cuyo producto no está en `productos` —una
variante recién cargada en GN—. Si se filtran los productos sin filtrar el inventario, las filas de
la otra línea se convierten en huérfanas fabricadas. Medido contra producción: **112 huérfanas donde
hay 0**. En la app se verían como variantes sin producto en las pantallas que las dibujan, sin que
falle nada. Lo defiende `tests/lineas.test.ts`.

### 🔴 Es opt-in por pantalla, y eso es la mitad del diseño

Un filtro global **no se puede**. Las pantallas **operativas** —Exhibición, Etiquetas, Liquidación,
Reposición, Caducados, Sesión de fotos— tienen que seguir viendo la mercadería del local **entera**:
partirlas haría desaparecer las prendas de Stunned del trabajo del local, que es lo contrario de lo
que se pidió. Sin el flag, `useDatosMonitor` devuelve exactamente lo de siempre.

### 🔴 «Ventas mensuales» no puede llevar selector

Sus números salen de **vistas materializadas ya agregadas por mes** (`vmMes`, `vmCat`, `vmFundas`):
no traen producto, así que no hay con qué separarlas. `filtrarPorLinea` las pasa intactas a propósito.
Ponerle el selector sin tocar eso mostraría el total de la marca con el rótulo de una línea.

## Quién conoce la línea hoy

| dónde | cómo |
|---|---|
| Meta Ads | eje de la sección (`SelectorMeta`), asignación por campaña |
| Memo semanal · Norte (P&L) | `lineaDe(store, sku)` sobre `venta_detalles` |
| Conteo Stunned | sección propia (`conteo-estandar-stunned`), por variantes |
| Canjes · sync TN→GN · `sku_map` | `store = 'stunned'` |
| Etiquetas | fusiona el catálogo de TN de Stunned |
| **Resumen · Ventas de Marketing · Por producto · Por variante · Márgenes** | **selector de línea** (22-ago-2026) |

## ⚠️ Lo que el separador no puede hacer

El prefijo de SKU es la única señal y **no está siempre**: 96 productos activos de Zattia tienen
`sku` NULL (47 vendieron $3,1M en la ventana de 30 días). Para todos ellos `esStunned` sólo puede
contestar «no». Hoy ninguno es de Stunned —0 productos con «stunned» en el nombre y sin SKU STU—,
pero **el día que carguen uno de Stunned sin SKU, su plata cae en Zattia sin que falle nada**. No hay
otra columna en la base con la que cruzarlo.

## El oráculo, y su trampa

Se cotejan los números de la pantalla contra `psql "$DATABASE_URL_ZATTIA"`, que es otro camino que el
hecho. 🔴 **El rango de fechas va fijo, nunca `current_date`**: `current_date` en la base es **UTC**,
así que a las 21:00 de Rosario la ventana de 30 días se corre sola y la misma consulta contesta
distinto sobre el mismo hecho. Pasó midiendo esto: 21 ventas a las 20:55 y 19 a las 21:06 — la
diferencia era el 23-jul saliendo de la ventana (2 ventas, 8 u, $254.520), no un bug.

```sql
with d as (
  select vd.quantity, vd.total, vd.sale_id, coalesce(p.sku ilike 'stu%', false) stu
  from venta_detalles vd join ventas v on v.id = vd.sale_id join productos p on p.id = vd.product_id
  where v.date_sale::date between date '2026-07-24' and date '2026-08-22'
)
select count(distinct sale_id) ventas, sum(quantity) u, round(sum(total)) plata from d where stu;
```

### ⚠️ La segunda trampa: la ventana de la pantalla no es la de tu `select`

`resumenPorCanal` recorta con `cortesDeVentas` (`lib/etl/helpers.ts:177`), que hace `today - 30 días`
sobre un **instante**, no sobre una medianoche — y compara contra `new Date('2026-07-24')`, que
JavaScript parsea como **UTC**. En Rosario (UTC−3) eso cae 3 h antes del corte, así que **a partir de
las 21:00 el primer día de la ventana se cae solo**.

Medido el 22-ago a las 22:10: la pantalla decía Stunned **local 17 · online 1** y el `select` de
24-jul a 22-ago daba **18 y 1**. La de más era la venta del 24-jul. Con la ventana real —25-jul a
22-ago— el `select` da **17 y 1**, al peso. **No era un defecto del corte por línea**, y perseguirlo
como si lo fuera cuesta media hora.

⚠️ Y el `coalesce` no es cosmético: `p.sku ilike 'stu%'` da **NULL** en los 96 sin SKU, así que sin
él ni `stu` ni `not stu` los agarra y el total de Zattia sale corto.
