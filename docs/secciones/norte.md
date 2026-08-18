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

- `components/norte/Norte.tsx` · `components/norte/useNorte.ts` · `components/norte/EditorCondiciones.tsx` · `components/norte/EditorMeta.tsx`
- `lib/norte/costos.core.js` (**el saneado del guardado de costos**, fuera del handler para poder ejercerlo) + `.ts` tipado
- `lib/norte/core.ts` (todo el cálculo, **puro**) · `lib/norte/tipos.ts` · `lib/norte/persistencia.ts`
- `lib/norte/medidores.core.js` (**qué puede medir una meta**, LA lista) + `.ts` tipado
- `lib/norte/contribucion.core.js` (**la cascada de plata, escrita UNA vez**, y el filtro de qué venta
  entra: `.js` porque la usa el handler) + `.ts` tipado
- `lib/norte/pyl.core.js` (el P&L por línea: reparte los renglones de esa cascada) + `.ts` tipado
- `components/norte/PylLinea.tsx`
- `api/_norte.js`, que entra por `api/datos.js?recurso=norte`
- `sql/migrate-norte.sql` + `scripts/apply-norte.mjs` · `sql/migrate-ventas-cobro.sql` + `scripts/apply-ventas-cobro.mjs`
- Banco: `tests/norte.test.ts` · `tests/norte-contribucion.test.ts` · `tests/norte-pyl.test.ts` ·
  `tests/norte-metas-handler.test.ts` · `tests/norte-contribucion-handler.test.ts`

## ⛔ Lo que comparte con otras secciones

- **`ingresos` (Compras → Ingresos proyectados) es la otra mitad de cada importación.** Las
  unidades, los modelos, el proveedor y la fecha de llegada son de ahí y **no se duplican**: se leen
  del KV y se cruzan por `ingresoId`. Norte sólo agrega la economía.
- 🔑 **Y los `bloques` de ese ingreso son los MATERIALES sobre los que se cuelga el costo.** El
  bloque ya era «un material con su grilla» en el modelo de `ingresos` (`lib/ingresos/tipos.ts`) y
  tiene su nombre editable en la vista Editar: IMD, encapsuladas, transparentes. Norte no inventa
  una lista de tipos propia — la que existe es ésa, y sus unidades ya cierran contra el total del
  pedido (medido el 18-ago-2026: 1.132 + 6.549 + 6.480 = 14.161 en la IMPORTACION 2).
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
- 🔑 **La unidad de una meta la decide el MEDIDOR, no la escribe una persona.** Hasta el 18-ago
  `unidad` era texto libre y el avance no se calculaba: nada impedía cargar un objetivo «500 por
  mes» contra un medido que sale **por día**. El avance sale plausible, y falso, y no falla nada.
  Elegir de `medidores.core.js` es lo que pone el objetivo y el medido en la misma escala **por
  construcción**.
- 🔑 **Un medidor que el motor no conoce se rechaza al guardar, y `medirMeta` lo vuelve a rechazar
  al medir.** No es redundancia: sin el segundo corte, un medidor desconocido caía por descarte en
  «contribución por unidad» y devolvía **un número bien formateado que no era lo que la meta
  decía**. Lo cazó un mutante, no la suite.
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

## El costo por material, y el tilde que hace deuda (18-ago-2026)

**El costo no es uno por importación.** Un contenedor trae IMD, encapsuladas y transparentes juntas
y cada material tiene su precio (US$1,08 las comunes, hasta US$1,35 las encapsuladas). Lo pidió
Bruno al ver el editor: *«no puede ser ponderado»*, y tiene razón por una cuenta y por una lectura —
el promedio da el **mismo total** y **miente en cada línea**: el día que se pregunte cuánto cuesta
una encapsulada, la respuesta va a ser el promedio de otra cosa. Sobre la IMPORTACION 2 real, el
promedio simple de los tres precios da US$16.568 contra los US$17.043 verdaderos.

- 🔑 **Los materiales no se cargan en Norte: son los bloques del ingreso**, que ya traen sus
  unidades. Copiarlas acá daría dos números para lo mismo y ninguno mandaría. Lo único que se
  agrega es el precio, y opcionalmente las unidades facturadas de ese material.
- 🔑 **Mientras falte el costo de un material, la compra NO se totaliza.** Un total sobre los
  bloques cargados sería una deuda **más chica que la real, con cara de completa**. La pantalla
  nombra el material que falta, no dice «falta cargar».
- 🔴 **Un costo en 0 no es un material gratis: es «todavía no lo sé».** El umbral se decide en **un
  solo lugar** (`estadoDeCompra`); el saneador del guardado lo deja pasar a propósito, para no tener
  dos reglas que puedan discrepar. Lo cazó un mutante que sobrevivió con `>= 0`.
- ⚠️ **Un costo cuyo bloque ya no está en el ingreso no se descuenta callado**: sus unidades no
  existen, así que no suma, y se nombra en pantalla. El caso real es que alguien borró un bloque.

### Los cuatro peldaños de una compra

**Cada uno se gana con un dato, y el número no empeora al subir.** Es la respuesta a lo que pidió
Bruno: *«sólo entra al calendario de pagos lo que tenga costo, pero además que esté confirmado el
ingreso y la fecha de ingreso; podemos armar estimativos, y luego fecha de pago»*.

| peldaño | qué tiene | desde dónde cuentan los plazos |
|---|---|---|
| `incompleta` | le falta el costo de algún material, las cuotas o una fecha | no se proyecta |
| `estimada` | todo costeado, sin confirmar | la **llegada estimada** del KV |
| `confirmada` | + el tilde y la fecha de ingreso real | la **fecha de ingreso** |
| `firme` | + la factura | la **factura** ⇒ es deuda, y va al calendario |

- 🔑 **El tilde de confirmado es propio de Norte y NO se deduce del `estado` de la importación.** Lo
  decidió Bruno así, y el dato le da la razón: al 18-ago la IMPORTACION 1 ya había llegado el 27-jul
  y su estado seguía en «tránsito». Deducirlo de ahí haría que un olvido ajeno mueva el calendario
  de pagos.
- 🔑 **La deuda y el estimativo salen de la MISMA cuenta** (`pagosDe`), y lo único que cambia es de
  qué fecha se cuentan los plazos. Escribir el estimativo aparte serían dos cuentas del mismo pago,
  que se separan el día que alguien toca una. Cada pago dice contra qué fecha se estimó.
- 🔴 **Lo estimado va en su propia tabla, debajo de la deuda.** Una fila estimada entre las firmes
  se suma sin querer: el total del mes pasaría a incluir plata que nadie facturó.
- ⚠️ **Una compra confirmada pero sin factura sigue siendo estimativo**, contado desde la fecha de
  ingreso. Es lo que evita que el número empeore al cargar más dato.

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

## Las metas y su medido (18-ago-2026)

Una meta **declara qué se cuenta**, y el número de hoy se calcula al mirar. Hasta acá se cargaban
`objetivo` + una `unidad` escrita a mano y el avance no existía: la columna estaba vacía a propósito,
porque un 0 se lee como «no avanzamos».

- **Tres medidores**, cada uno con su unidad pegada: `unidades-dia` (fundas/día), `contrib-unidad`
  ($/funda) y `contrib-dia` ($/día). Con canal, o `null` = todos juntos.
- 🔑 **Mide contra el mismo `ritmo` que la pantalla ya muestra arriba.** Si la meta recalculara la
  contribución por su cuenta —sobre la ventana del servidor en vez de la del ETL— la misma pantalla
  tendría dos números distintos para «la contribución por día» y no habría cómo saber cuál mirar.
- 🔑 **`contrib-unidad` de todos los canales es PONDERADO por unidades.** Mayorista deja $1.541 y
  online $7.295, pero mayorista es el 88% de las unidades: promediar los canales parejo da más del
  triple de lo que deja el negocio.
- 🔴 **Sin dashboard conectado los dos medidores de plata devuelven `null` y el motivo, no cero.**
  `ritmoDeSalida` pone `contribUnidad` en 0 para lo que no sabe, así que medir igual daría «$0/día»
  — que afirma «no deja nada», que es otra cosa y es falsa. Por eso `hayPlata` entra por parámetro
  y no se deduce de que el número sea cero. **Hoy es el caso real**: falta la env var.
- Un canal que no vendió da **0 unidades** (es un dato) pero **null** en plata: sin unidades no hay
  por qué dividir, y un «$0/funda» se leería como «no deja margen».
- **La clave se genera sola** (`claveDeMeta`). `key` es la PK y el guardado es un `upsert`: dos
  metas con la misma clave no dan error, **se pisan**. Al editar no se toca: cambiarla crearía una
  meta nueva en vez de renombrar la vieja.
- **Editor en pantalla**, de admin (`EditorMeta.tsx`). Las metas ya no entran por curl.
- ⚠️ La columna `unidad` de la base quedó como **espejo** del catálogo, para poder leer una fila
  suelta en `psql`. **No es la fuente**: la escribe el handler desde `medidorDe(medidor).unidad`.

## El P&L «por arriba» por línea (18-ago-2026)

El otro corte de **la misma plata**: por canal se decide *por dónde* sacar el stock, por línea
*cuánto deja cada negocio*. Los dos salen del **mismo viaje y la misma ventana** — pedirlos por
separado sería la forma de que dos tablas pegadas muestren totales que no cierran entre sí.

- 🔑 **La cascada NO se escribió dos veces.** `cascadaDeVenta` y `ventasUsables` (el filtro de qué
  venta entra) viven en `contribucion.core.js` y los usan los dos cortes. El P&L **reparte** los
  renglones de esa cascada; no calcula los suyos.
- 🔑 **Acá SÍ hay que prorratear, y por canal no.** El canal es una propiedad de la venta entera; la
  línea sale de los renglones, y `venta_detalles` trae `quantity` y `total` **pero no costo por
  renglón**. El CMV, el descuento, el envío y el IVA se reparten **por el peso de la mercadería de
  cada línea**, que es el mismo criterio con el que el dashboard reparte una venta entre marcas.
- 🔑 **Los detalles tienen que traer `product_id`.** Sin esa columna `lineaDe` recibe `undefined` y
  en Zattia **todo Stunned se contabiliza como Zattia**: el P&L sale completo, cuadrado y con la
  plata en el negocio equivocado, sin que falle nada. Lo defiende `norte-contribucion-handler`.
- 🔴 **Tres casos de reparto y ninguno es un default** (`baseDeReparto`): por mercadería; **por
  unidades** cuando la venta facturó cero o negativo —dividir por ese total daría pesos que no suman
  1 o de signo cambiado—; y **afuera** cuando no hay ni una cosa ni la otra.
- 🔴 **Lo que queda afuera se dice CON SU PLATA, no con su número de ventas.** Medido contra
  producción el 18-ago: en la ventana hay **6 ventas sin línea en BDI y 8 en Zattia**, y no están
  vacías — son **devoluciones con CMV negativo** (−$4.639 y −$7.643). La contribución por canal sí
  las cuenta ⇒ sin `sinRepartoContribucion` los dos totales de la misma pantalla difieren y no hay
  con qué explicar la diferencia. Un «6 ventas» no dice si son $5.000 o $5.000.000.
- ⚠️ **La fila «Ventas» no suma a lo ancho**: una venta mixta (Zattia + una funda Stunned) cuenta en
  las dos líneas, igual que los tickets del memo. El total lo cuenta el núcleo, no la pantalla.
- **Los renglones son filas y las líneas columnas**, como el P&L del dashboard: un P&L se lee de
  arriba abajo y así se puede cotejar renglón contra renglón el día que los dos no coincidan.
- ⛔ **Termina en la contribución.** Los gastos fijos ($25-30M/mes de estructura de las tres marcas)
  viven en el dashboard (`datos_ventas_gn` + `gastos`) y **no tienen endpoint**. Estimarlos para
  «completar» el P&L sería inventar justo el número que decide si una línea da o no da.

## Pendiente

- Cerrar contra la **estructura** necesita esos gastos por marca, que no tienen API. Es lo único que
  falta para que el P&L baje del «por arriba» al resultado.

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
- `npx vitest run tests/norte-metas-handler.test.ts` — la validación de una meta. 🔑 **Su oráculo
  es el modo de falla, no el verde**: una meta con un medidor que el motor no conoce **se guarda
  bien y no mide nunca**, y en pantalla se ve igual que un dato que todavía no llegó.
- 🔑 **Se muraron 12 mutantes el 18-ago y uno sobrevivió — y tenía razón**: agregar un medidor al
  catálogo sin enseñárselo a `medirMeta` dejaba el banco en verde y la pantalla mostrando el número
  de otro medidor. El corte explícito de `medidor desconocido` salió de ahí.
- `npx vitest run tests/norte-pyl.test.ts` — el P&L por línea. 🔑 **Sus dos oráculos**: las mismas
  cinco filas reales de julio-2026, y que **el total por línea sea el total por canal al centavo**
  (más lo que quedó sin repartir). Son dos cortes de la misma plata: si el reparto se lleva algo
  puesto o lo duplica, los totales se separan. 15 mutantes, 15 muertos con `AssertionError` — y uno
  sobrevivió primero porque la venta sin reparto del test no tenía ni envío ni comisión.
- 🔑 **La forma de los datos se midió contra producción con `psql`, no contra fixtures**: 5 ventas
  mixtas en Zattia (el prorrateo se ejerce de verdad), 27 ventas en BDI que facturan cero con
  unidades (el reparto por unidad también), 0 renglones apuntando a un producto borrado, y las 14
  ventas sin línea de arriba. Ningún fixture podía decir eso.
- `npx vitest run tests/norte-costos.test.ts` — el saneado del guardado. 🔑 **Vive fuera del handler
  para poder ejercerlo de verdad**: una regla encerrada en la capa de salida sólo se puede probar
  comprobando que el archivo contenga una línea. 3 mutantes, 3 muertos.
- 🔑 **9 mutantes sobre los peldaños y el costo por material, 8 muertos y uno vivo con razón**: con
  `>= 0` un costo en cero contaba como cargado y el total salía sin ese material, más chico que el
  real y sin que nada avisara. El caso que faltaba era justamente el cero.
- ⚠️ **Ejercer a mano el guardado en producción**: es el verbo que escribe, y en este repo es el que
  más veces falló. Cargar una importación con el costo de cada material y dos cuotas, recargar, y
  ver que vuelve.
