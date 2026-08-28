# Insumos — ficha de sección

Sección `insumos`, área `administracion`. **Lo que la empresa consume y no vende**: bolsas, rollos
de etiquetas, ribbon, cajas, papel, yerba. Qué hay en cada lugar, cuánto se paga por unidad, a qué
ritmo se gasta, cuántos días dura — y el aviso cuando queda el anteúltimo.

Reemplaza a WhatsApp: **80 avisos de insumos en 2026** medidos sobre los chats del grupo
(*«estamos usando el último rollo de etiquetas zebra»*, *«no hay más bolsas de despachos de
zattia»*), más la rutina #5 del análisis del puesto — *avisar el insumo antes de que se acabe, por
umbral, 25 días distintos*. ⛔ **No podía vivir en la Agenda**: la Agenda dispara por día del
calendario y esto dispara por un hecho.

## Dónde vive

`components/insumos/` (`Insumos.tsx` la lista, `FichaInsumo.tsx` la ficha + el libro,
`useInsumos.ts`) · `lib/insumos/core.core.js` (listas cerradas y validación, **lo importa el
handler**) · `lib/insumos/core.ts` (todo lo derivado, puro) · `lib/insumos/consumo.core.js`
(las compras por día) · `lib/insumos/cliente.ts` · handler `api/_insumos.js`, por
`api/datos.js?recurso=insumos` (**ninguna función nueva de Vercel: siguen 7 de 12**) · tablas en
`sql/migrate-insumos.sql` (`scripts/apply-insumos.mjs`) · semilla `scripts/sembrar-insumos.mjs` ·
tests `tests/insumos.test.ts`, `tests/insumos-handler.test.ts`, el bloque de `avisosDeInsumo` en
`tests/notificaciones.test.ts` y la fila en `tests/handlers-autorizacion.test.ts`.

## ⛔ Lo que comparte con otras secciones

- **El motor de avisos.** `avisosDeInsumo` vive en `lib/notificaciones/derivar.ts` y se acarrea en
  `store/useAvisos.ts` — tocar cualquiera de los dos toca el badge de todo el equipo.
- **Las reglas de canal**, importadas y ⛔ no copiadas: `canalDe` (`lib/liquidacion/canal.core.js`)
  y `esVentaTecnica` (`lib/etl/tecnica.core.js`). Si el día de mañana GN cambia los nombres de los
  canales, se arregla allá y esta sección se entera sola.

## Reglas que el código no dice

- 🔑 **El stock no es una columna: se suma del libro** (`insumo_movimiento`). Es lo que permite
  contestar *desde cuándo* falta, que es el `ts` del aviso — con `updated_at` el aviso diría
  «apareció hoy» todas las mañanas y el «NUEVO» no se apagaría nunca.
- 🔴 **`null` no es 0, en los cuatro lugares donde aparece**: stock sin contar, ritmo sin medir,
  precio sin cargar, `dias_reposicion` sin saber. Un 0 en cualquiera de los cuatro *afirma* —«se
  contó y no hay ninguna», «no se gasta nunca», «salió gratis», «llega el mismo día»— y los cuatro
  cambian lo que la pantalla decide.
- 🔴 **Un insumo sin contar NO dispara ningún aviso.** Es correcto y es incómodo: hasta que alguien
  haga el primer recuento por lugar, la sección está muda. Por eso los KPIs tienen «Sin contar» como
  filtro y no como nota al pie.
- 🔴 **Comprar y subir son dos acciones distintas y por eso son dos avisos.** Un lugar en cero
  teniendo en el depósito ⛔ no se compra: se sube. Confundirlas cuesta los días que tarda un
  proveedor, y es literalmente la mitad de lo que hoy se resuelve por WhatsApp (*«si me pueden subir
  del depo»*).
- 🔑 **El corte del «subir» es el CERO**, no un mínimo por lugar. Así no hay que inventar un umbral
  por ubicación, y el cero es el único número que no se discute.
- 🔑 **`paraReponer(insumo, movs, ritmo)` con `ritmo` OBLIGATORIO.** La llaman la pantalla y el
  derivador de avisos; con un default, el día que la regla mire otra cosa el compilador no señalaría
  a los llamadores y media regla se quedaría en el JSX.
- 🔴 **La unidad del insumo es UNA sola.** Se compra una caja de 1.000 bolsas y se consume de a una:
  el libro entero viaja en la unidad del insumo. `bulto`/`por_bulto` son ayuda **de la pantalla**
  para tipear («3 cajas × 1.000») y ⛔ no una segunda unidad.
- 🔴 **Un traslado son DOS filas** con el mismo `grupo`. Con una sola fila y una columna `destino`,
  todo el que sume stock tendría que acordarse de restar de un lado y sumar del otro. Por eso
  borrarlo se lleva las dos, y por eso `guardar-movimiento` **rechaza** `tipo:'traslado'`.
- 🔑 **El precio de referencia es ponderado por cantidad, sobre 180 días, y va con su denominador.**
  Con una sola compra ⛔ no se rotula «promedio»: dice «última compra» con su fecha. Un derivado de
  una sola observación con cara de promedio ya dejó una regla de Meta prendida y muda.
- 🔑 **La marca del ritmo sale de `insumo.marcas`, ⛔ no de la regla de consumo.** «Bolsas chicas de
  Zattia» ya dice de quién es; repetirlo en la regla sería un lugar más donde puede decir otra cosa.
- ⚠️ **La pantalla NO filtra por marca**, a propósito: el depósito es uno solo y el pedido al
  proveedor se hace una vez. Filtrar escondería la mitad de lo que hay que comprar. Cada fila lleva
  su chip cuando el insumo es de una marca sola, y el aviso sale **una** vez (por eso su lectura va
  fuera del `Promise.all` por marca en `useAvisos`).
- 🔑 **Sin sub-permiso: quien ve la sección, carga.** Un sub ⛔ no se hereda de la función, así que
  habría que tildárselo a alguien a mano el día del deploy — y este módulo no sirve si nadie carga.
  El día que haga falta separar mirar de escribir, se agrega `insumos.cargar` y se tilda ANTES.
- 🔴 **El handler no manda plata de ventas.** `comprasPorDia` cuenta filas de `ventas`, sin un peso.
  El endpoint que sí la lleva (`_ventas-diarias.js`) pide `ventas-mensuales`, que es de Análisis:
  colgarse de él le daría la facturación a quien sólo tiene que saber cuántas bolsas se gastan.
  Hay un test que lo fija.
- ⚠️ **Las ubicaciones son una lista cerrada** en `core.core.js` (depósito y los dos locales). Un
  local nuevo se suma ahí y sale con un deploy. Se eligió así porque el catálogo de ubicaciones
  **gobierna** a dónde apunta el aviso, y una pantalla para editarlas no la pidió nadie.

## Pendiente

- ▶️ **El local no ve esta sección.** El que se queda sin bolsas es el local (*«no hay más bolsas en
  local»*, *«habrá posibilidad de que alguien me traiga bolsas»*) y el área es Administración, así
  que hoy el que avisa por WhatsApp sigue siendo el que no puede anotarlo. Es la primera candidata a
  ampliar — y ⛔ no se resolvió adivinando: es una decisión de quién puede escribir.
- ▶️ **`dias_reposicion` está vacío en todo el catálogo sembrado**, así que el corte por días no
  corre todavía. Cuánto tarda cada proveedor no lo sabemos, y un número inventado ahí haría avisar
  de más o de menos. Bruno marcó que **las bolsas son lo que más demora**: es el primero que hay que
  cargar.
- ▶️ **Nadie hizo el primer recuento.** Hasta que alguien cuente, la sección está muda a propósito.
- ⚠️ **El ritmo `manual` necesita dos consumos anotados** para existir. Si nadie anota consumos, los
  insumos que no están atados a las ventas nunca van a tener días de vida — sólo el corte por
  unidades, que es la regla del manual y alcanza.

- ▶️ **La novedad está cargada como BORRADOR** (`n1787922095235_h4tx2x`, destino `seccion:insumos`):
  la publica Bruno de un click.

## Cómo se prueba

```bash
npx vitest run tests/insumos.test.ts --reporter=dot          # el libro, el precio, el ritmo, la regla
npx vitest run tests/insumos-handler.test.ts --reporter=dot  # el handler: qué frena y qué NO manda
npx vitest run tests/notificaciones.test.ts --reporter=dot   # el aviso
node scripts/apply-insumos.mjs                               # corre la migración y la verifica
node scripts/sembrar-insumos.mjs --simulacro                 # qué sembraría, sin escribir
node scripts/caminar-insumos.mjs                             # el handler contra la base REAL
node scripts/verificar-deploy-insumos.mjs                    # ¿llegó a prod? con cadena de control
```

`caminar-insumos.mjs` ⛔ no es un test: **invoca el handler contra la base de BDI**, siembra un
insumo `ZZ CAMINATA`, le hace una compra, un traslado y un consumo, y el oráculo es la base leída
por otro camino. Borra lo que sembró y verifica que los contadores vuelvan. Caminada el
28-ago-2026: **14 de 14**. ⛔ Lo derivado no se comprueba ahí —`core.ts` es TypeScript y no lo puede
importar un script de Node, y reimplementarlo sería una segunda versión de la regla—: eso lo cubren
los mutantes.

**Los siete mutantes que tienen que morir** (corridos el 28-ago-2026, 7 de 7): stock `null`→`0` ·
el recuento deja de cortar · las dos patas del traslado con el mismo signo · `<=` por `<` en el
mínimo · el `ts` del aviso pasa a ser hoy · el ritmo cuenta el día en curso · el precio promedia
unitarios en vez de ponderar.

🔴 **Lo que la suite ⛔ no puede probar y hay que caminar** contra producción: cargar un insumo →
una compra → un recuento → un consumo que lo deje en el anteúltimo → **ver aparecer el badge en el
sidebar** y que el clic caiga en `/insumos` con el filtro puesto. El oráculo se lee **por otro
camino** (la fila por PostgREST), ⛔ no la misma pantalla que la escribió.
