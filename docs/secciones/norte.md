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
- `lib/norte/contribucion.core.js` (la cascada de plata, `.js` porque la usa el handler) + `.ts` tipado
- `api/_norte.js`, que entra por `api/datos.js?recurso=norte`
- `sql/migrate-norte.sql` + `scripts/apply-norte.mjs` · `sql/migrate-ventas-cobro.sql` + `scripts/apply-ventas-cobro.mjs`
- Banco: `tests/norte.test.ts` · `tests/norte-contribucion.test.ts`

## ⛔ Lo que comparte con otras secciones

- **`ingresos` (Compras → Ingresos proyectados) es la otra mitad de cada importación.** Las
  unidades, los modelos, el proveedor y la fecha de llegada son de ahí y **no se duplican**: se leen
  del KV y se cruzan por `ingresoId`. Norte sólo agrega la economía.
- Reusa `canalDe` de **`lib/liquidacion/canal.core.js`** (la implementación se mudó ahí el
  18-ago-2026, cuando entró a un handler; `resultado.ts` es el re-export tipado), `Linea` de
  `lib/memo/tipos.ts`, y `totalU`/`normalizar` de `lib/ingresos/core.ts`.
- ⛔ **Las reglas de la contribución son del DASHBOARD, no de acá.** `cuentas_cobro_gn` (qué cuenta
  factura ⇒ IVA) y `comision_medio_pago` se leen de su Supabase con `DASHBOARD_SUPABASE_URL` /
  `DASHBOARD_SUPABASE_SERVICE_KEY`. Copiarlas acá es lo que diverge: el día que se cree una cuenta
  nueva en Gestión Nube, la copia vieja la daría por no facturable y eso es 21% de más, callado.
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
- 🔑 **El IVA no lo decide el canal ni el medio de pago: lo decide la CUENTA DE COBRO**
  (`account_display`). Medido sobre julio-2026: las ventas mayoristas de BDI entran por
  «Transferencia Mayorista» y «Sin cobro», que **no facturan** ⇒ no llevan IVA y sus netas son
  iguales a las brutas. Deducirlo del canal —«mayorista factura»— da 21% menos, con cara de bien.
- 🔴 **Una venta sin cuenta clasificada o sin CMV queda AFUERA del cálculo, y la pantalla lo dice.**
  No hay default barato: asumirle «no facturable» sube la contribución 21% y asumirle costo cero se
  lleva todo el margen. La cobertura («calculado sobre N de M ventas») va siempre.
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

## La contribución por canal (18-ago-2026)

**No se inventó una cascada: se portó la del dashboard**, que ya está verificada contra el P&L real
de Gestión Nube (`areben-dashboard/scripts/sync-analitica-gn.mjs`).

```
ventas (con IVA) − descuentos + envíos − IVA (sólo si la cuenta factura) = netas
netas − CMV − comisiones − costo de envíos                               = contribución
```

- 🔴 **Las dos mitades del dashboard NO calculan igual.** Su P&L mensual le saca el IVA sólo a la
  mercadería; su analítico se lo saca a mercadería − descuento + envío. En la Tienda Nube de julio
  eso son **$4.426 sobre $243.650 (2%)**. Acá va la del analítico: es la que reproduce los datos
  guardados y la que respeta que el envío facturado paga IVA. **El dashboard no se tocó** — cuál de
  las dos queda es decisión de ese repo.
- Las cuatro columnas que hacían falta (`account_display`, `discount`, `shipping_cost`,
  `total_cost`) **ya venían en el payload de GN y el espejo las tiraba**. Ver
  `sql/migrate-ventas-cobro.sql`. En Zattia `total_cost` directamente no existía, y por eso no tenía
  margen.
- ⚠️ **Lo que la contribución NO descuenta**: las comisiones de cobro están en **0% en el
  dashboard** (nadie las cargó), y la cascada no resta IIBB ni impuesto al cheque —que el techo de
  rentabilidad de Meta Ads sí resta—. Las dos cosas se dicen en pantalla.
- El oráculo del banco: **reproduce al centavo cinco filas reales de julio-2026** de
  `ventas_gn_agg`, que las calculó otro repo contra la API de GN. 11 mutantes, 11 muertos.

## Pendiente

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
- `npx vitest run tests/norte-contribucion.test.ts` — la cascada de plata. 🔑 **Su oráculo tampoco
  es el verde**: es que las cinco filas de julio-2026 sigan dando las `ventas_netas` que el
  dashboard tiene guardadas. Ese número lo calculó otra implementación, en otro repo, contra la API
  de Gestión Nube.
- ⚠️ **Ejercer a mano el guardado en producción**: es el verbo que escribe, y en este repo es el que
  más veces falló. Cargar una importación con costo y dos cuotas, recargar, y ver que vuelve.
