# Mapa del local — ficha de sección

Sección `mapa-local`, área `local`, sólo Zattia. Los percheros del salón dibujados como están:
qué tipos de prenda van en cada barra, a qué altura y cuántas perchas entran cómodas. La pidió
Bruno el 30-sep-2026 para *«ver nuestro mapa con nuestros percheros y decidir a distancia»*.
Antes de esta sección ningún lugar decía qué debería estar colgado en cada mueble.

## Dónde vive

- **Pantalla:** `components/mapa-local/`. Son **dos vistas de la misma sección** (misma key, mismo
  permiso), una debajo de la otra en el menú: **«Mapa del local»** (`/mapa-local`, los percheros) y
  **«Qué se cuelga»** (`/mapa-local/que-se-cuelga`, `components/que-se-cuelga/QueSeCuelga.tsx`).
  - `MapaLocal.tsx` despacha entre las dos vistas y arma la de los percheros.
  - `useMapaLocalDatos.ts` carga lo que leen las dos (mapa, stock y ventas). `useActividad` también
    lo usa el Chequeo de exhibición: el control ordena igual que la hoja.
  - `Plano.tsx` es el plano visto desde arriba.
  - `Pared.tsx` es la pared de frente, a escala en cm.
  - `Detalle.tsx` es un módulo y sus barras, que se pueden editar.
  - `Mover.tsx` es la lista «Mover».
  - `TablaTipos.tsx` y `Prendas.tsx` completan la pantalla.
- **Lógica:** `lib/mapa-local/`.
  - `core.ts` es puro.
  - `proponer.ts` arma la propuesta con el stock de hoy.
  - `hoja.ts` es la hoja por módulo, en PDF A4.
  - `inicial.ts` es el armado propuesto y la tabla de tipos.
  - `validar.core.js` hace el saneo y lo importa el handler.
  - `cliente.ts` habla con el servidor.
- **Servidor:** `api/_mapa-local.js`, por `api/datos.js?recurso=mapa-local`.
- **Base:** la tabla `mapa_local`, una fila jsonb por marca (`sql/migrate-mapa-local.sql`), sólo
  en el Supabase de Zattia.
- **Tests:** `tests/mapa-local.test.ts`, `tests/mapa-local-mover.test.ts`,
  `tests/mapa-local-handler.test.ts` y `tests/que-se-cuelga.test.ts` (temporada y ritmo).

## ⛔ Lo que comparte con otras secciones

- **La bajada y el cruce son los del Chequeo de exhibición:** `bajarExhib`, `armarProdMap` y
  `construirItems`, de `lib/exhib/`. También son de ahí el tipo de prenda (`tipoDePrenda`, que se
  saca del nombre) y la línea (`precioDeGondola` → `ofertaVigente`, el mismo precio que imprime
  Etiquetas). Tocar esas funciones cambia también qué cae en cada barra.

## Reglas que el código no dice

- 🔑 **Se guarda el ARMADO, ⛔ no dónde cae cada prenda.** Cada prenda cae en una barra por su tipo
  y su línea, y se recalcula con el stock del espejo cada vez que se abre la pantalla. Guardar el
  resultado lo dejaría viejo con la primera venta. La ganancia es que lo que entra nuevo ya tiene
  lugar, y lo que pasa a sale se muda solo a una barra de sale.
- 🔴 **El cupo es un techo y ⛔ nunca se pasa.** Lo que no entra se lista aparte como «No entran»,
  y son las prendas que van al depósito. Medido el 30-sep-2026 con el armado inicial:

  | | prendas |
  |---|---|
  | en el Local (producto×color con stock, sin Stunned) | 642 |
  | que se cuelgan | 607 |
  | perchas cómodas | 298 |
  | **no entran** | **301** |

  La saturación de las fotos del local es esa diferencia. Colgar de más esconde la decisión, en
  vez de tomarla.
- 🔴 **Una percha es un producto×color, ⛔ no un producto.** En Gestión Nube el color va a veces en
  la variante («Bordó - S») y a veces en el nombre («CAMPERA ROCK - VIOLETA»). Contando por
  producto daban 444; por producto×color, 679. → `colorDeVariante`.
- 🔑 **Qué se queda colgado cuando no entran todas** (`prioridad`, decisión de Bruno del
  1-oct-2026; antes era «más unidades primero»):
  1. **Lo nuevo de 7 días o menos** (desde el alta en GN) tiene lugar asegurado.
  2. **El resto compite por RITMO** (`ritmoDe`): ventas por día desde que está a la venta, con tope
     en los 30 días del ETL. Sin ventas conocidas va detrás de todo lo que vende.
  3. **Sin rotación** (cero ventas en 30 días y a la venta hace más de 30) va última.
  Desempatan las unidades y el nombre. ⚠️ Los cortes 7/30 son reglas elegidas, ⛔ no medidas.
- 🔴 **«Lo nuevo primero» por 30 días se comía el salón**, y por eso quedó el ritmo. Medido el
  1-oct-2026 con el stock real: en septiembre entraron 147 productos (251 prendas) y se llevaban
  **246 de 298 perchas**, con 174 que vendían afuera (una con 23 ventas en 30 días). Con el ritmo:
  126 perchas para lo de septiembre, las 117 sin rotación afuera, y lo que más vende de lo que
  queda afuera hace 4 en 30 días.
- 🔑 **El outlet ⛔ no tiene trato aparte**: compite por percha con lo nuevo según lo que vende.
  Medido el 1-oct-2026 en el local: por percha rendía igual (1,29 contra 1,26 u por producto en 14 d).
- ⚠️ **Las ventas suman el local Y la tienda online** (`allVariantes` del ETL ⛔ no las parte por canal).
- 🔑 **La temporada va por TIPO de prenda** (`temporada` en la tabla de tipos: verano, invierno o
  todo el año) y **las fechas en el mapa** (`temporadas`). Fuera de su temporada el tipo **duerme**
  (`despierta`, `Ubicacion.durmiendo`): ⛔ no pide percha, ⛔ no cuenta como «no entra» y «Proponer» ⛔ no le da
  barras. Las fechas se pisan a propósito: **lo que se pisa es el cambio de temporada** y ahí
  compiten las dos. ⚠️ Las fechas iniciales son una propuesta (verano 15-sep → 31-mar, invierno
  1-mar → 15-oct; el 15-oct por los sweaters que seguían vendiendo a fines de septiembre).
- 🔑 **Un mapa guardado antes del 1-oct-2026 ⛔ no trae temporada**: cae a la del armado inicial
  (`temporadaDe`, `temporadasDe`). Así un mapa viejo ⛔ no despierta los sweaters en verano.
- 🔴 **`hoy` es parámetro obligatorio de `ubicar`, `proponerArmado` y del tramo**: la regla ⛔ no lee el
  reloj. La pantalla lo fija al abrir.
- 🔑 **«Qué se cuelga» guarda SÓLO las temporadas** (`conTemporadas`): relee el mapa y le aplica el
  cambio, para ⛔ no pisar un cambio de barras guardado desde los percheros. Sin un mapa guardado ⛔ no deja
  guardar: guardaría el armado propuesto como «el mapa del local».
- 📊 **Lo que duerme se lleva también lugar de barra**: el 16-oct se duermen 38 prendas de abrigo,
  «No entran» baja 26 y las colgadas bajan 12 — las barras de abrigos quedan vacías hasta que
  alguien aprieta «Proponer» o las cambia a mano.
- 🔴 **Llenar en orden mentía «no entra»** (cazado el 1-oct-2026): si D1 acepta tops y sweaters,
  los tops se quedaban con D1 aunque tuvieran lugar en D2, y el sweater salía «al depósito».
  `ubicar` ahora corre una prenda ya colgada a otra barra suya, en cadena, antes de declararla
  afuera. Con el stock del 1-oct ⛔ no cambia ningún número (todas las barras están llenas): el
  defecto muerde cuando sobra lugar en alguna barra.
- 🔑 **El cupo lo pone el tipo MÁS GRUESO de la barra**, ⛔ no el promedio. Una barra que acepta
  tops y sweaters puede terminar llena de sweaters.
- 🔑 **Dos densidades por tipo: cómoda y al TOPE** (`topePorM`). El tope es lo apretado, sin que
  las perchas se deslicen: Bruno midió **38 BLUSAS en una barra de 0,75 m** (30-sep-2026) ⇒ 51/m.
  ⛔ **Un tope sin medir vale lo mismo que cómodo**: inventarlo sería decir que entra algo que nadie
  probó colgar. 🔴 Por eso, con sólo BLUSA medida, **al tope da igual que cómodo** (298 contra 298):
  las blusas comparten barra con CAMISA, FALDA y POLLERA, y en la barra manda el más grueso. El
  número del tope aparece recién cuando se miden los tipos que comparten barra.
- ⚠️ **El cupo cómodo sigue SIN MEDIR** (los números de la tabla los propuse yo). Bruno dijo que se
  define otro día: ⛔ no darlo por cerrado.
- 🔑 **«Proponer con el stock de hoy»** (`proponer.ts`, pedido de Bruno: *«ni todo doble ni fijo»*)
  rearma los módulos de pared: reparte entre colección y sale según cuántas barras pide cada una
  (colección adelante), y cada barra se la lleva **la familia con menos de lo suyo colgado**.
  🔴 **⛔ No maximiza perchas**: con el doble de prendas que de lugar, maximizar llena todo de tops
  y deja los vestidos sin barra. Es una regla elegida, ⛔ no medida. La isla no se toca y los
  módulos de frente siguen de frente. Llena el editor; ⛔ no guarda.
  Medido el 30-sep-2026 con el stock real: 8 módulos de colección y 6 de sale, **292 colgadas**
  contra 298 del armado inicial, pero **0 sin lugar** contra 8.
- ⚠️ **Las alertas de altura salen de una regla, ⛔ no de una medición.** Cada clase de largo mide
  colgada: corta 60 cm, media 90, larga 130, más 5 de aire. El caso de las fotos es una camisa
  arriba que tapa la barra de abajo.
- ⚠️ **El armado inicial es un borrador.** El ancho de los módulos lo dio Bruno; el resto lo propuse
  yo sobre el plano y las fotos. Hasta que alguien lo guarde, la pantalla lo dice.
- ⚠️ **Con la Feria Online viva (27-sep → 4-oct), «sale» incluye las promos de la feria.**

- 🔑 **«Mover» compara el mapa guardado al abrir la pantalla contra el que se está viendo, con el
  MISMO stock.** ⛔ No es «lo que está colgado contra lo que debería»: eso no lo sabe nadie hasta F4.
  Sin un mapa guardado no aparece (el armado inicial no es lo que está colgado), y ⛔ no se vacía
  al guardar, para poder imprimir después.
- 🔴 **Para «Mover», `ubicar` sola no sirve**: llena en orden, así que un cambio en la primera barra
  corre a todas las prendas de ese tipo una barra más allá. `estabilizar` deja cada prenda en su
  barra de antes siempre que se pueda, ⛔ sin cambiar qué entra. Medido el 1-oct-2026 con el stock
  real: sacarle TOP a la isla movía **125 prendas en crudo y 51 estabilizado**; «Proponer» sobre el
  inicial, 288 contra 217, y de las 158 que pasan de barra a barra **147 son obligadas** (su barra
  ya no las acepta).
- ⚠️ **De un día al otro, la hoja de un módulo puede cambiar sin que nadie toque el mapa**: entra
  stock, se vende una prenda y el llenado se corre. `estabilizar` sólo actúa contra el mapa
  guardado, con el stock de hoy. Lo resuelve F4, que ve lo colgado de verdad.
- 🔑 **La hoja por módulo** va barra por barra, en el orden en que se mira (de frente, arriba,
  abajo), con un casillero por prenda. Si hay un cambio, lo nuevo sale en negrita con de dónde
  viene, y abajo dice qué sacar y a dónde llevarlo. «Imprimir las hojas», sin cambio, imprime
  todos los módulos; con un cambio, sólo los que toca. ⛔ Sin flechas: la Helvetica de jsPDF no las
  tiene.

- 🔑 **F4: el control se hace en el Chequeo de exhibición, y el lugar SIGUE siendo texto libre.**
  Los códigos de los módulos (`D01`…) se suman a las sugerencias del campo, y cuando lo escrito
  **es** un módulo del mapa guardado (`D1`, `d01` y `D01` valen igual) aparece el control: cuántas
  de las que el mapa pone ahí pasaron por el lector, cuáles **faltan** (con dónde se las vio en el
  recorrido, si se las vio) y cuáles **sobran** (con a qué módulo van, o si van al depósito). Así
  ⛔ no se da vuelta la regla de `exhib.md`: el salón se reacomoda y la vidriera sigue siendo un
  lugar.
- 🔑 **El control usa el mapa GUARDADO, en cómodo**: la misma ubicación que imprime la hoja del
  módulo. Sin mapa guardado ⛔ no aparece, porque el armado inicial ⛔ no es lo que está colgado.
- 🔴 **Lo lee también quien tiene sólo el Chequeo de exhibición**: el GET acepta `exhib` además de
  `mapa-local` (el que camina con el lector ⛔ no tiene por qué ver la sección). El mapa ⛔ no lleva
  plata ni datos de nadie, y guardar sigue pidiendo `mapa-local.editar`.

## Pendiente

- ✅ La tabla `mapa_local` ya está en Zattia (verificado el 30-sep-2026: el API contesta
  `sinTabla:false`). Todavía nadie guardó un armado.
- ▶️ **Medir:** el cupo cómodo de cada tipo, y el tope de los que comparten barra con las blusas.
  📏 1-oct-2026 (le pasaron a Bruno): **hoy hay ~37-38 perchas por barra de 0,75 m en todos los
  percheros** (~2 cm por percha) — es el tope, ⛔ el cómodo, y Bruno lo ve sobrecargado. El armado
  inicial supone ~16 por barra en tops (22/m). ⚠️ Falta saber si cuelgan **un talle por color o
  todos**: el mapa cuenta una percha por producto×color.
- ✅ **F3 — la orden al local:** la lista «Mover» y la hoja por módulo (1-oct-2026). ⚠️ El PDF
  ⛔ no se miró impreso todavía.
- ✅ **F4 — el control con el lector** (1-oct-2026, `lib/mapa-local/control.ts` +
  `components/exhib/ControlModulo.tsx`). ⚠️ ⛔ No se vio en prod: aparece recién cuando alguien
  **guarde** un mapa.
- ✅ **Al cerrar el recorrido, el control de todos los módulos juntos** (1-oct-2026,
  `controlDelRecorrido`): «caminaste N de M módulos», los totales **sólo de lo caminado**, el
  control de cada módulo con su «Ver cuáles», y los módulos sin caminar nombrados ⛔ sin afirmar
  nada sobre ellos. 🔑 Una prenda que sobra en dos módulos ajenos es **una** percha para mover. Y
  «acá» pasó a ser el MÓDULO, ⛔ el texto: `D1` y `d01` en el mismo recorrido suman juntos.
  ⚠️ Sólo en el cierre: al abrir un recorrido viejo ⛔ sale, porque el stock de hoy ⛔ es el de ese día.
- ▶️ **Lo que F4 todavía ⛔ no hace:** decir a qué **barra** del módulo va cada prenda (el lector
  sólo sabe el módulo).

## Cómo se prueba

- `npx vitest run tests/mapa-local.test.ts tests/mapa-local-handler.test.ts tests/que-se-cuelga.test.ts`.
- **El oráculo de la temporada y el ritmo (1-oct-2026):** con el stock del Local y las ventas de
  todos los canales, la lógica de la sección y un conteo directo hecho aparte dieron lo mismo: 637
  prendas, 602 que se cuelgan, 485 compiten por ritmo y 117 sin rotación; duermen 0 el 1-oct
  (cambio de temporada), 38 el 16-oct y 71 el 15-jul.
- **El oráculo de los números:** las 642 prendas, con 355 de colección, 275 de sale y 12 sin
  precio, salieron iguales por la lógica de la sección y por un conteo directo del inventario
  hecho aparte (30-sep-2026).
