# Norte — ficha de sección

**Key `norte`, área Dirección, las dos marcas.** Es el tercer tiempo de Dirección: **Gerencial** dice
qué decidir *hoy*, el **Memo semanal** dice qué *pasó*, y Norte dice **hacia dónde vamos**. Contesta
una sola pregunta arriba de todo: **¿el stock que entra sale a tiempo para pagarlo?**

## Por qué existe

El 17-ago-2026 un análisis para decidir qué promo hacer con 11.000 fundas **cambió de conclusión
tres veces en una tarde**, y las tres por un dato que existía pero no estaba donde se decide: las
fechas de pago reales, quién lleva mayorista, y las importaciones que venían (14.000 el 7-sep y
8.500 a mediados de octubre). Con ese último dato el problema resultó ser otro del que se venía
discutiendo: **entran 479 fundas por día y salen 238**.

Norte es el lugar donde eso deja de vivir en la cabeza de una persona.

## Dónde vive

- `components/norte/Norte.tsx` · `components/norte/useNorte.ts` · `components/norte/EditorCondiciones.tsx`
- `lib/norte/core.ts` (todo el cálculo, **puro**) · `lib/norte/tipos.ts` · `lib/norte/persistencia.ts`
- `api/_norte.js`, que entra por `api/datos.js?recurso=norte`
- `sql/migrate-norte.sql` + `scripts/apply-norte.mjs`
- Banco: `tests/norte.test.ts`

## ⛔ Lo que comparte con otras secciones

- **`ingresos` (Compras → Ingresos proyectados) es la otra mitad de cada importación.** Las
  unidades, los modelos, el proveedor y la fecha de llegada son de ahí y **no se duplican**: se leen
  del KV y se cruzan por `ingresoId`. Norte sólo agrega la economía.
- Reusa `canalDe`/`Canal` de `lib/liquidacion/resultado.ts`, `Linea` de `lib/memo/tipos.ts`, y
  `totalU`/`normalizar` de `lib/ingresos/core.ts`.
- El ritmo de salida sale del payload del ETL (`useDatosMonitor`), no de una consulta propia.

## Reglas que el código no dice

- 🔑 **Los plazos cuentan desde la FACTURA, no desde la llegada.** Confundirlas corre los
  vencimientos un mes entero. El 17-ago eso dio una cuota «vencida» que no existía y dio vuelta la
  conclusión del análisis hasta que apareció la fecha correcta.
- 🔑 **La fecha pactada de una cuota pisa al cálculo por días.** «A 30 días» del 7-ago da 6-sep
  contando, y el proveedor de BDI cobra el **7-sep**: en la práctica «30 y 60» quiere decir «el
  mismo día de los dos meses que siguen».
- 🔑 **`ventas.store` es la SUCURSAL** («Local», «Depósito Minorista»), no la marca. La marca es
  contra qué base se consulta. Leerlo al revés ya costó una conclusión errada.
- ⚠️ **Una importación sin condiciones no aparece en el calendario de pagos, y la pantalla lo dice.**
  Asumirle un costo promedio inventaría una deuda con cara de razonable.
- ⚠️ **`normalizar()` antes de `totalU()`**, siempre: el KV tiene registros en formato viejo y
  `totalU` sobre uno de ésos devuelve **cero** — una importación de 14.000 contada como vacía.
- Escribir es de **admin**, como el techo de rentabilidad: acá se firma cuánto se debe y cuándo.

## 🔴 Lo que ya se rompió, y lo que está roto de arrastre

- **El GET del KV de ingresos es público.** En `bdi-catalogo/api/ingresos.js` el portero
  `exigirUsuario` **sólo corre `if (req.query?.kind)`**, y los ingresos proyectados usan la ruta
  default sin `kind`. Con `Access-Control-Allow-Origin: *`. ⇒ hoy cualquiera que sepa la URL lee
  proveedor, cantidades, modelos, fechas y las fotos de los diseños que vienen.
  **Por eso el costo y los plazos van a la base y no al KV**: meterlos ahí sería publicar la deuda
  de la empresa. Arreglarlo es tocar el repo de Darío y coordinar — si el monitor no manda
  credencial en el GET, la sección `ingresos` deja de cargar.
- ⚠️ El POST del KV **reescribe el array entero**: un guardado con `ingresos: []` borra todo.
- Al escribir el hook, `react-hooks/set-state-in-effect` cazó un `setCargando(true)` en el cuerpo
  del efecto. Se resolvió derivando `cargando` de una clave, igual que `useDatosMonitor` — y de paso
  arregló que al cambiar de marca se vieran un instante los datos de la anterior.

## Pendiente

- 🔴 **La contribución por canal.** El payload del ETL trae unidades pero **no precios**
  (`FilaDetalle` es `sale_id · product_id · quantity`), así que hoy la pantalla muestra unidades y
  no plata. Aplicarle a mayorista la contribución de la tienda la sobrestimaría **7,6 veces**
  ($1.046 contra $7.920). El camino es el cruce por línea contra las dos bases, que **ya está
  escrito** en `api/_memo.js:96-146`.
- 🔴 **El medido de cada meta.** Hoy se cargan objetivo y fecha; el avance no se calcula solo, y por
  eso la columna no está — mostrarlo en cero se leería como «no avanzamos».
- El P&L «por arriba» por línea (previo a gastos), que es lo que pidió Bruno para no depender del
  dashboard. El resultado fino sigue siendo del dashboard: Norte hace la versión de todos los días.
- Una pantalla para editar metas (hoy entran por API).
- Cerrar contra la **estructura** ($25-30M/mes de fijos de las tres marcas) necesita los gastos por
  marca, que viven en el dashboard (`datos_ventas_gn` + `gastos`) y **no tienen endpoint**.

## Cómo se prueba

- `npx vitest run tests/norte.test.ts` — 26 casos.
  🔑 **El oráculo no es que estén en verde**: es que `reproduce lo medido a mano el 17-ago-2026`
  siga dando **237,6 fundas/día de salida y 479 de entrada**. Esos dos números se midieron contra la
  base antes de que existiera el código. Si alguien toca una fórmula y ese caso se cae, la fórmula
  está mal.
- El banco discrimina: se mataron dos mutantes (sacar el filtro de importaciones arribadas, dejar el
  stock negativo) y los dos murieron con `AssertionError`, no con error de sintaxis.
- ⚠️ **Ejercer a mano el guardado en producción**: es el verbo que escribe, y en este repo es el que
  más veces falló. Cargar una importación con costo y dos cuotas, recargar, y ver que vuelve.
