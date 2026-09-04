# Descripción y medidas (`gen-desc`) — ficha de sección

La ficha de cada prenda de Zattia: lo que el local carga **con la prenda en la mano** —atributos y
medidas— y el párrafo que se aprueba antes de salir a la tienda. Se llega por **Marketing > Tienda
Nube > Descripción y medidas** (`/tncat/redaccion`); la monta `components/tncat/Tncat.tsx` como
quinta subárea, pero **es una sección aparte con su propio permiso**, igual que la Tabla de talles.

⚠️ **Se llamaba «Redacción» hasta el 1-sep-2026 y lo renombró Bruno** —«no me gusta que diga
redacción»—: dejó de ser sólo el párrafo cuando las medidas entraron adentro de la fila. 🔑 **Cambió
el RÓTULO, ⛔ no la key ni la ruta**: `gen-desc` es el permiso que `josefinabatter` y
`camilaquintana` ya tienen tildado, y renombrarlo lo destildaría.

## 🔑 La dinámica real, que es la que decide la forma (1-sep-2026)

La contó Bruno: **la mercadería entra al depósito, baja al local, y ahí Camila Quintana y Josefina
Batter hacen la descripción y las medidas en el mismo momento**, con la prenda sobre la mesa.

⇒ Por eso las medidas viven **adentro de la fila** y ⛔ no en una pantalla aparte: dos pantallas
serían buscar la misma prenda dos veces, y esa fricción es la que hace que una de las dos no se
haga. La prenda pasa por la mesa una sola vez.

🔴 **Y las que cargan ⛔ NO publican.** Publica administración, o Bruno y Darío —decisión suya del
1-sep-2026, «inicialmente para probar todo»—. Eso ya era así para la descripción (`gen-desc.publicar`)
y ⛔ **no lo era para la Tabla de talles**: `gen-talles` no tenía sub, y las dos lo tenían tildado
desde el día uno ⇒ ese botón les escribía en la tienda viva. Se le estrenó el sub
`gen-talles.publicar` el mismo día.

## Por qué existe, con los números que la justifican

Medido contra la tienda viva el **27-ago-2026** (706 productos en TiendaNube, **328 publicados**):

| | |
|---|---|
| publicados **sin una sola palabra de prosa** | **44** |
| publicados con menos de 120 caracteres | **194** |
| publicados con 120 o más | 90 |
| publicados **sin ninguna foto** | **0** — siempre hay imagen |
| mudos creados hace **≤14 días** | **0** ⚠️ |
| mudos de **las dos últimas tandas** (15 y 27 días) | **41 de los 44** |

⚠️ **«Los últimos 14 días» no corta nada, y por eso el filtro de la pantalla va por TANDAS.** La
mercadería entra de golpe, no de a poco: un umbral en días habría mostrado una lista vacía justo el
día que había 41 productos para cargar. `ultimasTandas()` toma las dos **fechas de alta** más
recientes.

**La categoría dominante de los vacíos es NEW IN**: el problema pega en los ingresos. Un
producto entra, se publica, y sale a la calle mudo.

Y el formato base **no existía**, también medido: de 369 publicados **uno solo** (SWEATER
VIENNA) tenía formato rico, cero decían la composición, y convivían tres dialectos —
«Disponible en…» (58), «Colores disponibles:» (8), «Talle único» (3).

## Las decisiones de Bruno, y dónde viven

No se deducen del código, por eso están acá y con test.

### 19-ago-2026 — el formato

1. **Un párrafo que vende (≤220) + datos duros abajo.** → `lib/tn-desc/formato.core.js`
2. **No se nombran colores ni talles.** Los muestra el selector de variantes, y el texto se
   desactualiza solo. 🔴 **No es teórico**: TOP EMBER promete «beige, negro y blanco» y las
   variantes son blanco y negro; FAJA CLEO promete «negro y marrón» y sólo existe marrón. Los
   dos son casos de `tests/tn-desc-formato.test.ts`.
3. **La tela es dato, no adivinanza.** Una foto de estudio no distingue gasa de voile, y una tela
   mal puesta es un cambio o una devolución.

### 🔴 27-ago-2026 — los bullets dejan de ser prosa

**«Los bullets no son redacción, son atributos.»** Es la decisión que dio vuelta el módulo, y la
tomó Bruno mirando la primera corrida real. Hasta ese día el modelo escribía `{parrafo, bullets}` y
un validador los sostenía: etiqueta de una lista cerrada, 3 o 4, ≤60 caracteres, sin repetir, con
la tela apoyada en el insumo. O sea, **una tabla escrita en prosa con un validador haciendo de
esquema** — y un reintento pagado cada vez que el modelo se salía.

Hoy los bullets se **componen** desde la ficha que carga el local, de una lista cerrada
(`lib/tn-desc/atributos.core.js`). Una etiqueta inválida, repetida, fuera de orden o una tela
inventada **dejaron de poder ocurrir**. 🔑 Es la diferencia entre una regla mejor escrita y un caso
que se vuelve imposible.

⛔ **Y el motivo de fondo es más grande que las descripciones**: con listas cerradas el catálogo se
puede SUMAR («qué escote se vendió más», «cuánto del catálogo es denim rígido»), que es el dato que
hoy no existe para decidir qué producir. Por eso el valor **no puede** ser texto libre: cinco
maneras de escribir lo mismo son cinco filas distintas.

Las otras cuatro de ese día, todas medidas contra la corrida real:

4. **El párrafo arranca por el tipo de prenda**, nunca por «Este/Esta». Los tres productos de la
   primera corrida arrancaron con «Este top», «Este sweater», «Esta prenda» — y el peor ni
   nombraba la camisa. Los primeros **60 caracteres** son los que se ven en el feed.
   ⚠️ Un artículo («Un jean de corte amplio…») **no** se rechaza: ya dice la prenda.
5. **Cero repetición con los bullets.** TOP BLISS escribió «diseño asimétrico» y «manga ancha» en
   el párrafo y los repitió en dos bullets. Son 220 caracteres.
6. **El orden de los bullets es fijo**, por la lista canónica. Salieron en tres órdenes distintos
   para tres productos. 🔑 Esta regla **no está en el validador**: la resuelve el render.
7. **El modelo por defecto es el más barato** (Flash Lite): el catálogo entero sale **US$0,31**
   contra US$1,16, y es el único de los tres sin precio promocional.

### 🔴 1-sep-2026 — la lista sigue cerrada, pero se afloja DE CUÁL sale el valor

Las tres las pidió Bruno usando la pantalla, no leyendo el código:

> «no se puede agrandar foto» · «hay un short de ecocuero que tiene puesto como short minis y demás»
> · «capaz ver de no cerrar las opciones, ver la opción de sumar *no aplica*, y poder sumar alguna
> información de otra categoría»

8. **La foto se agranda, y son TODAS.** Se dibujaba en **44×55 px** y no era cliqueable; ahora hay
   una tira de todas las fotos del producto adentro de la fila abierta, y cada una abre el
   `Lightbox` del kit. 🔑 **Agrandar sólo la portada no contestaba el pedido**: el tajo, el botón,
   el escote de atrás o el largo real casi nunca están en la primera foto, y son exactamente lo que
   hay que mirar para contestar la ficha. La miniatura del encabezado se quedó como está: su clic
   abre la fila.
9. **«No aplica» es un valor más** (`NO_APLICA`), en todo atributo cerrado **menos Tela**. Se guarda
   y ⛔ no sale a la ficha, igual que `no identifico`. 🔑 «Esta prenda no tiene eso» es distinto de
   «nadie lo cargó», y esa diferencia es la única que dice si hay que volver a mirar la prenda —
   sin él, el contador de la fila se queda en `4/5` para siempre. ⛔ En Tela no va porque ahí la
   pregunta ya la contesta «no identifico», y dos maneras de decir lo mismo en la misma lista es lo
   que hace que después no se pueda sumar.
10. 🔴 **Un valor se puede PRESTAR de otra prenda, y un atributo se puede SUMAR.** El caso que lo
    disparó: un short de ecocuero cae en la familia `faldas`, cuyo `calce` ofrece palabras de
    pollera —`al cuerpo`, `recta`, `con vuelo`, `plisada`— y **ninguna le sirve**. El desplegable
    ahora muestra los propios arriba y los de otras prendas abajo, en su propio grupo; y un
    «+ agregar un dato» suma un atributo que la familia no pide (ej. `silueta` en ese short).
    ⛔ **Lo que NO se aflojó es que el valor salga de una lista**: `esValor` sigue rechazando una
    palabra que no existe en ninguna familia, que es de lo único que depende que el catálogo se
    pueda SUMAR. Lo que cambió es **de cuál lista sale**, no si sale de alguna.
    🔑 **Y el bullet del extra se compone**: si el «+ agregar un dato» guardara algo que después no
    se dibuja, el gesto no haría nada. El orden lo sigue decidiendo la lista canónica.
    ⚠️ **Los cuatro tests que vigilaban la regla vieja se RE-APUNTARON, ⛔ no se borraron**: el caso
    que ejerce el guard dejó de poder ser «wide leg en un top» —eso ahora está permitido— y pasó a
    ser una palabra inventada (`apretadito`). Un guard que se prueba con un caso que ya no viola
    nada es un guard apagado que se ve prendido.
11. 🏁 **La PALABRA PROPUESTA — la válvula, hecha el 1-sep-2026.** Es lo que faltaba de «no cerrar
    las opciones», y el único de los tres pedidos que tocaba el motivo de fondo del 27-ago. Última
    opción de cada desplegable: **«otra…»**, se escribe la palabra y sigue.
    - 🔴 **Pide un gesto explícito** (`propuesto: true`). Sin eso el guard del servidor es el de
      siempre ⇒ un valor mal escrito que llegue por cualquier otro camino se sigue rechazando. La
      válvula es un gesto, ⛔ no un agujero.
    - 🔴 **⛔ NO sale a la tienda hasta que la palabra entre al diccionario.** Es texto que lee una
      clienta: un error de tipeo ⛔ no puede llegar solo a la ficha. La prenda se publica **sin ese
      bullet**, y por eso la propuesta necesita que alguien la mire.
    - 🔑 **⛔ No hay columna que marque la propuesta**: una palabra es propuesta si `esValor` la
      rechaza. Es una consecuencia de la lista, ⛔ no un dato aparte que alguien podría olvidarse de
      escribir — y tiene el efecto que se busca: **el día que la palabra entra al diccionario, deja
      de ser propuesta sola**, en todos los productos donde se cargó y sin migrar nada. Es como
      entraron `bandó` y `volcado`.
    - ⚠️ **Se normaliza** (minúsculas, un espacio) o el escape trae de vuelta el problema que la
      lista evita: «Wide Leg» y «wide leg » serían dos filas del `group by`.
    - ⚠️ **Tiene forma de ETIQUETA**: 2 a 24 caracteres, hasta tres palabras, sin signos ni HTML.
      «top negro con ballenas y encaje» ⛔ no es un valor de escote — eso es Detalle.
    - 🔴 **Y tiene su propio reloj**: el aviso `palabra-propuesta`, que ve quien puede publicar y
      **agrupa por PALABRA y ⛔ no por producto** (la decisión es sobre la palabra). Sin el reloj, la
      bandeja se convierte en el campo libre por la puerta de atrás.
      📌 [[feedback_areben_freno_sin_valvula]].
    - ▶️ **Aprobar una palabra hoy es agregarla a `ATRIBUTOS` y deployar** — decisión de Bruno del
      1-sep-2026: **empezar chico y medir cuántas aparecen**. Mover las listas a la base para que
      aprobar sea un clic es bastante más trabajo y sólo se paga si son muchas; el diccionario
      salió de leer 328 fichas reales, así que la mayoría de las palabras ya están.

## La ficha de atributos — el diccionario de prendas

`lib/tn-desc/atributos.core.js` (`.js` plano: lo importan los dos handlers) y la tabla
`tn_atributos` (`sql/migrate-tn-atributos.sql`, RLS prendido y sin políticas).

**Seis familias**, que salen de la categoría de TiendaNube. Medido el 27-ago-2026: cubren **326 de
los 328 publicados**.

| familia | publicados | qué se le pide |
|---|---|---|
| Tops y bodies | 179 | Tela · Calce · Silueta · Escote/cuello · Manga · Largo |
| Abrigo | 41 | ídem |
| Short, mini y falda | 40 | Tela · Calce · Tiro · Largo |
| Pantalón y jean | 36 | ídem |
| Vestidos y monos | 19 | Tela · Calce · Silueta · Escote/cuello · Manga · Largo |
| Accesorios | 11 | ⛔ fuera de alcance: no comparten un atributo con una prenda |

🔴 **Las categorías de TiendaNube vienen SUCIAS** y por eso se normalizan en un solo lugar:
conviven `SHORTS, MINIS y FALDAS` con `SHORTS, MINIS Y FALDAS`, `BLAZER` con `BLAZERS`, y `DENIM `
trae **un espacio al final**. Sin `normalizarCategoria`, tres familias quedarían partidas en dos.

⚠️ **Dos productos no tienen familia y no es un agujero del mapa**: `BERMUDA HAYDEN` y
`BERMUDA TIDE` están cargados en TiendaNube **sólo como «NEW IN»**. `familiaDe` devuelve `null` y
la pantalla lo dice — pedirle atributos a un producto del que no se sabe qué es sería inventar.

**Lo que hay que saber para tocarlo:**

- 🔑 **`Silueta` es un campo APARTE de `Calce`**, y lo dio vuelta Bruno: «entallado» y «oversize»
  no son alternativas — un sweater puede ser las dos cosas. Metidos en una lista, esa prenda
  tendría que elegir cuál de las dos es.
- 🔑 **Escote y cuello son UN campo y dos etiquetas.** Se carga una vez —qué tiene arriba— y el
  bullet sale «Cuello: polera» o «Escote: en V» según el valor (`etiquetaDeBullet`). Preguntar las
  dos cosas obligaría a dejar una vacía siempre.
- 🔑 **El valor guarda la palabra del local** («manga larga», «tiro alto») porque es la que se
  elige y la que se va a agrupar. El bullet le saca la etiqueta repetida (`textoDeBullet`), así no
  hay que elegir entre un desplegable claro y una ficha bien escrita.
- ⛔ **`tela: 'no identifico'` se guarda y NO sale a la ficha.** «Alguien lo miró y no supo» es
  distinto de «nadie lo cargó», y esa diferencia es la que dice si hay que volver a mirar la prenda.
- ⛔ **`detalle` es el único campo libre y queda FUERA de todo análisis.** Es el escape para lo que
  no entra en ninguna lista, y va último en el bullet por la misma razón: es lo menos comparable.
- 🔑 **El bullet no GRITA** (4-sep-2026, pedido de Bruno mirando la primera ficha real): un valor
  escrito **todo en mayúsculas** sale en minúscula. Muerde sólo en `detalle`, que es el único que
  se tipea —hoy están cargados «DETALLE EN EL BOLSILLO», «CON LENTEJUELAS», «TRANSPARENTE»—; los
  demás salen de listas cerradas y ya vienen en minúscula. Se baja al **componer** y ⛔ no al
  guardar: el valor sigue siendo la palabra del local. 🔴 **Se decide palabra por palabra**: el
  primer intento miraba el valor entero y se cayó con el primer caso real —Bruno corrigió a mano
  `DETALLE EN EL BOLSILLO trasero` y esa única minúscula dejaba las otras cuatro gritando—.
  ⛔ Una palabra baja sólo con **dos letras o más**: «escote en V» es la forma, no un grito.
  ⚠️ Un `detalle` que **empieza con la palabra «detalle»** pierde además esa palabra, por la regla
  de al lado: «DETALLE EN EL BOLSILLO» sale **«Detalle: en el bolsillo»**.
- 🔴 **La lista cerrada la chequea el SERVIDOR** (`op:'atributos'`), no el `<select>`. Y el que
  compone **vuelve a preguntar**: un valor que no es de la familia no se dibuja aunque esté
  guardado. Un desplegable es una comodidad del que carga, no un candado.
- 🔑 **Se guarda al elegir, sin botón.** Son seis desplegables: un «Guardar» que los junta es un
  botón que alguien no aprieta, y ahí se pierde la ficha entera.
- 🔑 **`tn_descripciones.familia` se escribe en cada carga** porque el servidor **no ve las
  categorías de TiendaNube** — las tiene el navegador, que ya bajó el catálogo. Sin ese campo, el
  paso que publica no sabría contra qué lista componer.
- ⚠️ **Una fila por (producto, atributo)** y no una columna por atributo: agregar un atributo no es
  una migración, el análisis es un `group by`, y queda registrado **quién cargó cada valor** (con
  una columna por atributo, `por` diría sólo el último y taparía a los demás).

## 🆕 4-sep-2026 — cuidados, tip y el freno de la tela

Salió de mirar **FALDA SAGE**, una descripción escrita a mano que quedó bien, contra la primera
corrida real del módulo (JEAN MARINA). SAGE tenía seis bloques y nosotros dos.

**Lo que se sumó, y lo que NO.** Material y Calce ⛔ no se suman: ya son bullets, y repetirlos es
justo lo que molestaba del párrafo. Lo que faltaba de verdad era esto:

- 🔑 **Cuidados de la prenda, derivados de la TELA** (`lib/tn-desc/cuidados.core.js`). ⛔ No lo
  escribe nadie: la tela ya es lista cerrada, así que el bloque se compone solo, como los bullets.
  Un cuidado equivocado ⛔ no es una frase floja: es una prenda arruinada que vuelve como cambio.
  **Cinco grupos y no veintidós textos** —«casi siempre es más o menos el mismo», Bruno—:
  `no-agua` (ecocuero, piel) · `delicadas` (encaje, microtul, red, lurex, satén, gasa, batista) ·
  `deforman` (morley, lanilla, frisa, crepe) · `denim` (denim rígido y elastizado, corderoy, lino,
  bengalina) · `punto` (microfibra, jersey, ribb, lycra).
  🔴 **Con dos telas gana la MÁS RESTRICTIVA, ⛔ no la principal**: FALDA SAGE es microfibra con
  capa de microtul y se cuida como el microtul. El orden del array **es** la prioridad.
  ⚠️ `no-agua` va antes que `delicadas` a propósito: «lavar a mano» ya metió la prenda en el agua.
  ⛔ **Sin «bolsa de red»**, que lo sacó Bruno: «no es algo habitual» — un cuidado que pide algo
  que la clienta no tiene en casa no se cumple.
  🔑 **El test que lo sostiene es el de COBERTURA**: agregar una tela a la lista y no darle grupo
  deja `tests/tn-desc-cuidados.test.ts` en rojo. Sin eso, el mapa se pudre en silencio.
- 🆕 **Segunda tela** (`tela2`). ⛔ No se le pide a ninguna familia: vive en «+ agregar un dato»,
  porque la mayoría tiene una sola y un casillero para dejar vacío siempre ensucia la ficha.
  ⛔ **No sale como bullet propio**: se fusiona («Tela: microfibra + microtul»), que es como lo lee
  la clienta. En la base sigue siendo su fila, así que el análisis las ve separadas.
- 🔴 **SIN TELA NO SE REDACTA NI SE PUBLICA** (decisión de Bruno). El freno está en el servidor
  —`op:'publicar'` y el handler de IA—, ⛔ no sólo en la pantalla. `no identifico` **cuenta como
  sin tela**: se sigue guardando, porque «lo miró y no supo» es la prenda que hay que volver a
  mirar, pero ⛔ no alcanza para salir a la tienda.
- 🆕 **Tip de look**, y es **opcional**: «un tip flojo pesa más que la falta de tip». Se le pide al
  modelo siempre (va en el esquema junto al párrafo) y quien revisa lo borra si no suma. Le corren
  las mismas reglas duras —colores, talles, centímetros— porque vive en el mismo campo de TN;
  ⛔ no le corre la de arrancar por la prenda: un tip arranca por cómo se usa.
- 🆕 **4ª regla del párrafo: ⛔ no puede nombrar el producto.** Lo trajo «Jean Marina con un corte
  que aporta volumen…». ⚠️ Se mira el nombre **sin el tipo de prenda** («Marina», ⛔ no «Jean
  Marina»): la 3ª regla EXIGE nombrar la prenda, y prohibir el nombre entero sería dos reglas
  peleándose.
- ⛔ **Al publicar, el texto viejo se PISA**: el casillero «conservar» arranca destildado. Los 24
  productos de la tanda del 2-sep tienen un renglón escrito a mano en TiendaNube, y conservarlo
  dejaría dos textos diciendo lo mismo. El respaldo (`html_previo`) queda igual.

**El orden que sale a la tienda**: párrafo → bullets → tip → cuidados → tabla de talles.

▶️ **Falta el pie de marca** («Producto 100% Zattia 🇦🇷»), que Bruno quiere **sólo si el producto
es de producción propia**. 🔴 Ese dato ⛔ no existe en ningún lado: los SKU de TiendaNube son el
nombre del producto (medido: 1.815 variantes, ninguna con el formato `ZAT-TOP-NG-001` de
producción) y ninguna de las 25 categorías de la tienda lo dice. Lo propuesto es un casillero
`Origen` en la ficha; **lo decide Bruno**.

## Lo que muerde

- 🔴 **La descripción de TiendaNube tiene TRES cosas en un solo campo**: la prosa, la tabla de
  talles (`gen-talles` escribe ahí mismo) y —medido— **un `<img>` en 19 de los 369 publicados**.
  Por eso `lib/tn-desc/bloques.ts` **conserva lo que no es nuestro** y descartarlo es explícito:
  «rearmar y tirar el resto» se comería esas imágenes en silencio.
- 🔴 **TiendaNube no tiene historial.** Cuando se pisa una descripción, la anterior no existe en
  ningún lado. Por eso `html_previo` va a Supabase con RLS y no al KV, y por eso el invariante
  es **el respaldo se escribe ANTES que la tienda**. → `sql/migrate-tn-descripciones.sql`
- 🔴 **`validarBorrador` es carga estructural, no un adorno.** Cuando el borrador lo escriba un
  modelo, el JSON Schema de structured outputs **no puede** fijar «3 o 4 bullets» ni «máximo 220
  caracteres» (no soporta `minItems`/`maxItems`/`maxLength`). Si esto no está, no hay formato.
- ⚠️ El catálogo se baja con **`?variantes=1`**, que usa **otra clave de caché** del lado del
  servidor (`:var3`): esta bajada no comparte caché con Fotos ni con Tabla de talles.
- 🔑 El piso de 3 caracteres al buscar variantes en el texto no es capricho: los talles viajan
  como valores de variante igual que los colores y son cortos —y los de pantalón son **números**—,
  así que sin el piso «2 bolsillos» quedaría rechazado por «nombrar el talle 2».

## 🔴 2-sep-2026 — «se le cierra y no guarda»: el filtro le cerraba la ficha en la mano

Lo trajo Bruno desde el local: *«están queriendo poner descripción y medidas, pero cuando
seleccionan una opción del desplegable se le cierra y no guarda»* — el usuario de Camila Quintana.

**Lo que pasaba, medido contra la base antes de tocar una línea**: ese mediodía había **cuatro
productos con UN solo atributo cargado** —`tela`, el primer desplegable de la ficha— a un minuto
uno del otro (13:45, 13:46, 13:46 y 13:47 UTC) y ninguno siguió. Los cuatro son productos **viejos**
(altas de 2024 y 2025) y **con categoría en TiendaNube**, así que no llegaron por «Últimas 2 tandas»
ni por el desplegable de «¿Qué prenda es?»: llegaron por el KPI **«Sin ficha cargada»**.

🔑 **Y ahí está todo**: ese filtro es *«tiene prenda y ⛔ ningún atributo»*, así que **el mismo gesto
que guardaba la tela sacaba a la fila de la lista**. La ficha desaparecía de la pantalla en el
instante de elegir. Se lee exactamente como «se cerró y no guardó» — y estaba **guardado**: los
cuatro valores están en `tn_atributos`. El defecto ⛔ no era del guardado, era de la lista.

⇒ **La regla, ahora en `lib/tn-desc/lista.core.ts` con `abierto` como parámetro OBLIGATORIO:** un
filtro decide **qué se empieza a mirar, ⛔ no qué se puede terminar de cargar**. La fila abierta se
queda en la lista aunque deje de cumplirlo, y se va recién cuando alguien la cierra.

- ⚠️ **El KPI sigue contando la verdad** («5 sin ficha» con 6 filas en pantalla es correcto: la 6ª
  ya tiene algo cargado). El que miente si se lo empareja es el contador, no la lista.
- ⛔ **`abierto` no es una llave maestra**: un producto despublicado no vuelve a la lista por estar
  abierto. Está fijado por test.
- 🔑 El orden ⛔ no mira la ficha ni la cola —sólo el largo de la prosa y el nombre— justamente para
  que una fila **no salte de lugar** mientras alguien la completa. También está fijado por test.
- 📌 Es la misma familia que la media regla escrita en el JSX de una pantalla: mientras el filtro
  vivió adentro del `useMemo` de `GenDesc.tsx`, ningún test podía mirarlo. Los mutantes que lo
  defienden: sacar la excepción (3 rojos) y hacerla llave maestra (1 rojo).

## Dos permisos, y la línea está donde está el costo

| nivel | quién | qué habilita |
|---|---|---|
| sección `gen-desc` | el local | ver la cola y **cargar el insumo** |
| sub `gen-desc.publicar` | marketing | escribir el borrador y **aprobarlo** |

No se colgó de `gen-talles` a propósito: pegar una tabla de medidas es mecánico y reversible;
redactar reescribe el texto de venta de la tienda (y va a gastar plata en una API externa).
Colgarlo ahí habilitaría a todos los que hoy pegan tablas sin que nadie toque un checkbox.

## El redactor con IA (tanda 3, 19-ago-2026 · pasado a Gemini el 24-ago-2026)

El borrador lo puede escribir un modelo. **No cambió nada de lo de arriba**: ni la tabla, ni la
pantalla, ni el validador, ni `bloques.ts`. Sólo cambió de dónde vienen `{parrafo, bullets}`.

- **`lib/tn-desc/redactor.core.js`** — el prompt, el esquema, el costo y el reintento. No habla
  con la red: recibe la función de llamada por parámetro, y por eso `tests/tn-desc-redactor.test.ts`
  ejerce el camino entero —reintento incluido— sin API key y sin gastar un centavo.
- **`api/_tn-desc-ia.js`** — recurso `tn-desc-ia` de `api/datos.js`. Es el único endpoint del
  monitor que **gasta plata por apretar un botón**, así que pide el sub `gen-desc.publicar`, el
  mismo que aprobar. ⛔ No guarda: devuelve el borrador y se para.

🔴 **El reintento es carga estructural, igual que `validarParrafo`.** Desde el 27-ago-2026 el
esquema es de **una sola clave** (`{parrafo}`) — los bullets ya no los escribe nadie— pero
`maxLength` sigue sin estar soportado: «hasta 220 caracteres» no se puede pedir ahí, y «no nombres
los colores de ESTE producto» ni «no repitas lo que dicen los bullets» menos. Cuando el validador
rechaza, los problemas vuelven al modelo —**todos juntos**— y se pide de nuevo. Dos intentos.

🔑 **Las variantes viajan EN EL PROMPT, no sólo en el validador.** Si el modelo no sabe que «arena»
es un color de este producto, lo escribe, se lo rechazan, y se paga un reintento por algo que se
podía decir de entrada. 🔑 **Y desde el 27-ago-2026 viajan también los bullets ya compuestos**, por
el mismo motivo: la regla «no repitas lo que dicen los datos» sólo la puede cumplir el que sabe qué
dicen.

🔑 **`formato.core.js`: por qué el validador bajó a JS plano.** El reintento necesita validar, y ese
camino termina en `api/_tn-desc-ia.js` — un handler de `api/` corre en Node sin pasar por el
compilador de Next y **no puede importar TypeScript** (es el motivo de `lib/permisos.core.js`).
`formato.ts` quedó como el re-export tipado: ningún import de la pantalla ni de los tests cambió.
⚠️ La unión `Etiqueta` se declara a mano en el `.ts` porque TS infiere `string[]` de un `.js`; que
las dos no se separen lo cuida un test, porque **media regla en cada lado no se ve mal de ningún
lado**: una etiqueta agregada sólo en el `.js` la aceptaría el validador y la rechazaría el `<select>`.

### El proveedor es Gemini, y el motivo NO fue la plata (24-ago-2026)

La tanda 3 salió contra Anthropic y esta ficha decía «no se cambia de proveedor», con la cuenta
hecha: el catálogo entero sale **US$1,14 una sola vez**. Esa cuenta sigue siendo cierta y sigue
sin ser el argumento. **Lo que decidió es que Darío ya usa Gemini en n8n**: una sola cuenta, una
sola clave para rotar y un solo lugar donde mirar cuánto se gastó. Con Gemini el catálogo sale del
mismo orden —alrededor de un dólar— así que la plata no movió el fiel para ningún lado.

⛔ **Lo que NO cambió es la parte que importa**: el núcleo recibe `llamar` por parámetro, así que
el cambio entero fue el handler. Ni la pantalla, ni el validador, ni la tabla, ni publicar en la
tienda se enteraron. Estaba escrito acá que iba a costar ~20 líneas y costó eso.

🔑 **Y de paso se cerró la filtración que hacía falsa esa promesa.** `armarPedido` devolvía bloques
con forma de Anthropic (`{type:'image', source:{...}}`) **adentro del núcleo**. Ahora devuelve
`{system, texto, imagen}` y la forma de cable vive entera en el handler. Lo cuida un test que
mira las claves del pedido: si vuelve a entrar forma de proveedor ahí, se cae.

- **Sin SDK**: la API se habla con `fetch` contra `POST /v1beta/interactions`. `@anthropic-ai/sdk`
  se desinstaló el mismo día: **en el Monitor hay una sola clave de IA y es `GEMINI_API_KEY`**.
- ⚠️ **Nada de `additionalProperties` en el esquema**: Gemini lo rechaza con un 400 y no se redacta
  nada. Hay un test que lo mira en todos los niveles del JSON, no sólo en la raíz.
- ⚠️ **`store:false` en cada pedido.** El endpoint guarda la interacción del lado de Google por
  default. Acá no hay conversación que continuar y la ficha de un producto nuestro no tiene por
  qué quedar allá.

### Tres modelos en la pantalla, y el costo se muestra

Arranca en **Flash Lite** —el más barato, decisión de Bruno del 27-ago-2026— y desde el mismo
desplegable se puede subir a **Flash 3.7** o a **Pro 3.1** para un producto puntual, comparando los
textos con el costo real de cada uno al lado. Eso es lo que decide, no
una opinión sobre la prosa. El `<select>` recorre `MODELOS`: agregar o sacar uno es una entrada.

- ⚠️ **Los Gemini 3 están con precio promocional hasta el 31-dic-2026 y después se DUPLICAN**
  (Flash 3.7: $0,75/$3,75 → $1,50/$7,50). Está modelado con su fecha, con test de los dos lados
  del corte: el 1-ene-2027 la pantalla dice la verdad sin que nadie se acuerde de venir a tocarlo.
- 🔴 **Los tokens de pensar se facturan como salida**, y la doc de Google **no dice** si
  `total_output_tokens` ya los trae adentro o si van aparte. No se adivina: `usoDe` concilia
  contra `total_tokens` y, cuando no se puede saber, **cobra de más**. El costo que miente para
  abajo es el que empuja una decisión de 370 productos hacia el modelo equivocado.
- 🔑 **Los tres piensan igual (`thinking_level: 'low'`)**, y hay un test que lo exige. Dejar uno en
  el default y bajarle el nivel a otro compara dos configuraciones, no dos modelos — es el mismo
  error que ya nos costó una vuelta con el `effort` de Anthropic.
- ⚠️ **Lo cacheado no se suma aparte**: en Gemini viene adentro de la entrada. Sumarlo lo cobraría
  dos veces. Se muestra igual, porque el día que aparezca explica por qué un producto salió más
  barato que el de al lado.
- ⚠️ **Pro 3.1 es `preview`.** El día que Google lo retire contesta 400 y la pantalla lo dice; el
  arreglo es cambiar la entrada de `MODELOS`.

### 🔴 La foto va con los bytes adentro, y eso NO se descubre leyendo la doc

Medido el 24-ago-2026 contra la API real. La doc de Google dice que el endpoint acepta una imagen
por URL pública, y es cierto — pero **con nuestra clave contesta `429 «Resource has been
exhausted»`**. Y el mismo pedido, con los bytes de la misma foto adentro, contesta 200.

🔑 **La trampa es el disfraz**: un 429 se lee como «se acabó la cuota» y manda derecho a mirar la
facturación, que es donde no está el problema. Lo que se agotó no es la cuota de la cuenta: es que
Google vaya a buscar la URL por nosotros. La bisección que lo separó está en tres líneas —esquema
solo: 200 · esquema + `thinking_level`: 200 · foto por URL, sin nada más: **429**.

Por eso `bajarFoto` la baja el handler y la manda en base64. Y está bien que así sea: la URL ya
pasaba por una lista blanca del CDN de TiendaNube, así que el pedido de red sale a un lugar que
elegimos nosotros y no a uno que eligió el navegador.

⛔ **Si la foto no se puede bajar, no se redacta.** No hay respaldo silencioso a «escribí sin
foto»: de los 41 mudos no hay ni insumo ni prosa previa, así que sin la foto el modelo escribiría
a partir del nombre y nada más — que es justo lo que esta sección existe para no hacer.

⚠️ El `content-type` del CDN manda sobre la extensión del archivo: `.jpg` que en realidad es webp
pasa más seguido de lo que parece, y un `mime_type` equivocado lo rechaza Google.

📌 La foto son **1.073 tokens de los 1.501 de entrada (71%)**. Sacarla sería el único ahorro real
que hay acá, y son centavos: ver los tres costos medidos abajo.

## Publicar en la tienda (tanda 4, 19-ago-2026)

El botón **«Publicar en la tienda»** aparece en la fila cuando el borrador está aprobado, y
escribe **un producto por vez**. Nadie va a leer 370 borradores de corrido; la corrida masiva
sigue sin existir a propósito.

🔴 **El orden es el invariante, y es el único motivo por el que esto vive en el servidor.**
TiendaNube no tiene historial: `html_previo` es la única copia que va a existir del texto
anterior. Los cuatro pasos van seguidos en `api/_tn-desc.js`, `op:'publicar'`:

1. **Leer fresco** — `GET tn-categorias?accion=descripcion&productId=`. No sale del audit, que
   está cacheado: un respaldo sacado de un caché de hace media hora es el respaldo de otra cosa.
2. **Respaldar y CONFIRMAR** — `html_previo` + `hash_previo`, estado `escribiendo`. Si esto
   falla, se corta acá y la tienda no se toca.
3. **Escribir con compare-and-swap** — `POST accion:'descripcion-prosa'` con `hashPrevio`. Del
   otro lado se relee la descripción y, si el hash no coincide, **muere en 409 sin escribir**:
   alguien la tocó en el medio (pegaron una tabla de talles, el local editó a mano) y el
   respaldo guardado ya es de otra versión.
4. **Releer y verificar** — ⛔ un 200 del `PUT` no prueba que la escritura haya pasado. Se
   vuelve a leer el producto y se compara; si no coincide, la fila queda con `verificado:false`
   y la pantalla dice «se escribió, pero la relectura no coincide», **no «listo»**.

🔑 **Va del lado del servidor y no del navegador** para que cerrar la pestaña en el medio no
pueda dejar la tienda escrita y la fila diciendo que no.

🔑 **Se compone una sola vez, en `lib/tn-desc/bloques.core.js`.** `bdi-catalogo` recibe el texto
ya armado y sólo se hace las preguntas que necesitan la tienda delante. Dos composiciones del
mismo campo es lo que se desincroniza. Por eso `bloques`, `generarHtml` y `esc` bajaron a `.js`
plano: el que compone es un handler de `api/`, que **no puede importar TypeScript**.

🔑 **El HTML sale del borrador GUARDADO, no de lo que manda el navegador**: lo que se aprobó es
lo que se publica. Y sólo sale a la tienda un borrador en estado `aprobado`.

🔴 **El residuo se conserva salvo que alguien lo destilde a mano**, y la pantalla lo muestra
antes (avisando si adentro hay una imagen). No hay default destructivo: descartar es
irreversible y del lado de TiendaNube no hay historial para darse cuenta.

## 🔴 La colisión del wrapper de 680px (encontrada al arrancar esta tanda)

`generarHtml` envuelve la prosa en un `<div style="…max-width:680px…">`, que es **la misma firma**
con la que el generador de talles reconoce y borra su envoltorio viejo. Dos consecuencias, las
dos medidas antes de escribir una sola descripción:

- **`prosaDe` daba 0 caracteres sobre nuestro propio texto** ⇒ el producto recién redactado iba a
  seguir contando como «sin descripción» en el KPI de Marketing y en el filtro de esta pantalla.
- **Pegar la tabla de talles después borraba la prosa entera**, dejando `<!--PROSA-INI-->
  <!--PROSA-FIN-->` vacío. Y no hay historial: ese texto no quedaba en ningún lado.

La regla que lo arregla ya estaba escrita («primero los bloques firmados, después los tags»):
estaba aplicada al bloque de talles y no al de prosa, en las dos puntas. Ahora el bloque de prosa
se extrae **antes** de tocar wrappers en `lib/tn-desc/prosa.ts` y en
`bdi-catalogo/api/_desc-talles.js`.

🔑 **El test que tenía que cazarlo existía y estaba verde**: su fixture era un `<p>` pelado adentro
de las marcas, no el HTML que sale de `generarHtml`. Ahora el fixture es la salida real.

⚠️ `bdi-catalogo` no tiene runner de tests. Por eso las dos reglas puras viven en `api/_desc-talles.js`
y `api/_desc-prosa.js`, y se ejercen con `node scripts/check-desc-talles.mjs` y
`node scripts/check-desc-prosa.mjs` — sin credenciales, y **saliendo 1 si algo falla**.

## Lo que TODAVÍA no hace

🔴 **NADIE cargó todavía una ficha, y nadie publicó nunca una descripción.** Las dos mitades están
construidas y probadas contra la base, pero el circuito de dos manos —el local carga, Marketing
escribe y publica— no lo ejerció una persona ni una vez. Publicar es el único verbo que escribe en
la tienda viva y **ningún test lo toca**: el oráculo es abrir un producto, cargarle la ficha,
aprobar el párrafo, apretar el botón y **mirarlo en TiendaNube**.

⛔ **No hay verbo de vuelta todavía.** El respaldo (`html_previo`) está guardado y es la única
copia que existe, pero restaurarlo desde la pantalla no está hecho: hoy se recupera leyendo la
fila. Es la próxima tanda y es barata, justamente porque el respaldo ya está.

✅ **La llamada real está ejercida** (24-ago-2026). Era el único eslabón que ningún test podía
tocar, y ya se apretó: `node scripts/probar-redactor.mjs [modelo]` hace una llamada de verdad
sobre un producto vivo (JEAN LESKA, con su foto del CDN) y contesta las cuatro preguntas que la
doc no contesta. **Los tres modelos pasaron en un solo intento y sin un problema del validador.**

🔑 El probador **importa `llamador` de `api/_tn-desc-ia.js`**, el mismo que corre en producción.
Un probador con su propia copia del pedido puede salir en verde mientras el botón falla — que es
exactamente lo que un probador tiene que hacer imposible. Por eso `llamador` está exportado.

Lo que quedó medido:

| modelo | costo por producto | el catálogo (370) | tokens de pensar |
|---|---|---|---|
| **Flash Lite** (default desde el 27-ago) | US$0,00083 | **US$0,31** | 134 |
| Flash 3.7 | US$0,00314 | **US$1,16** | 369 |
| Pro 3.1 | US$0,01697 | **US$6,28** | 984 |

📌 Medido con el esquema viejo, cuando el modelo escribía también los bullets: **son un techo**.
Desde que escribe sólo el párrafo, la salida es menos de la mitad. 🔑 Y Flash Lite es el único de
los tres **sin precio promocional**, así que el 1-ene-2027 la diferencia con Flash 3.7 pasa de
3,8× a 5×: el default no hay que revisarlo esa fecha.

🔴 **Y quedó contestada la pregunta que la doc de Google no contesta: los tokens de pensar van
APARTE de `total_output_tokens`.** En Flash 3.7 son 369 contra 168 de salida visible: **pensar
cuesta más del doble que el texto que se lee**. Si `usoDe` los hubiera dado por incluidos, la
pantalla mostraría menos de la mitad del costo de salida. La conciliación contra `total_tokens`
era necesaria, y acertó.

⚠️ Bajar `thinking_level` a `minimal` es la única palanca de costo que queda y no se tocó: sobre
US$0,31 el ahorro son centavos, y menos razonamiento son más reintentos. Si alguna vez importa,
está medido de dónde sacarlo.

✅ **Anthropic salió del proyecto entero** (24-ago-2026, decidido por Darío). `@anthropic-ai/sdk`
se desinstaló, y el cron de los avances de `docs/secciones/memo.md` —que se apoyaba en esa
dependencia y en `ANTHROPIC_API_KEY`— quedó anotado para escribirse con Gemini.

📌 **`ANTHROPIC_API_KEY` nunca llegó a estar en Vercel**, verificado por Darío en el dashboard el
24-ago-2026. O sea que el botón «Redactar con IA» **nunca funcionó** entre la tanda 3 y hoy, y
`memo.md` la contaba entre las piezas listas para el cron de los avances sin que nadie la hubiera
mirado. 🔑 Es exactamente el motivo por el que la ficha pedía «el oráculo es apretar el botón una
vez»: un pendiente que dos docs dan por resuelto de maneras distintas no está resuelto en ninguno.

⛔ Tampoco hay corrida masiva: se redacta de a uno, desde la fila. Pasar los 370 de una es otro
verbo (y otra tanda), porque nadie va a leer 370 borradores de corrido.

✅ La migración `scripts/apply-tn-descripciones.mjs` **corrió el 19-ago-2026** en las dos bases. El
oráculo fue la app en vivo, no la consola: `GET /api/datos?recurso=tn-desc&store=zattia` contesta
`200 {"ok":true,"filas":[]}` — que además prueba que en Vercel está la service key de Zattia, porque
el handler devuelve un 500 con nombre y apellido si la clave que agarra es la pública.

## Las medidas (1-sep-2026)

La guía de Bruno (`TOMA DE MEDIDAS CON GUÍA.pdf`, 9 páginas) es la fuente: 7 hojas de dibujo
técnico con la prenda apoyada y las flechas rotuladas, más 2 de bajada de línea. El diccionario
está en `lib/tn-medidas/medidas.core.js`, la tabla en `sql/migrate-tn-medidas.sql`, el bloque que
se publica en `lib/tn-medidas/bloque.core.js`.

🔴 **⛔ No es un ajuste de `lib/gen-talles/plantillas.ts`: es otro juego de medidas.** Aquéllas
piden `Contorno busto`, `Ancho de hombros`, `Contorno cadera` y `Tiro`; la guía ⛔ no mide ninguna
de las cuatro — mide **Ancho** de sisa a sisa con la prenda apoyada, y el tiro sólo le sirve de
referencia para saber dónde va el ancho.

### Las cuatro reglas, y por qué ninguna es un comentario

1. **Se mide la prenda APOYADA Y PLANA**, y la cintura se agarra por la mitad y **se publica ×2**.
   Lo dice la guía textual. 🔑 **La multiplicación la hace el sistema, ⛔ nunca la persona**
   (`paraPublicar`): medido contra la tienda viva, de 69 tablas con cintura legible **63 están en
   contorno y 6 por debajo de 45 cm** — esas 6 son las veces que alguien se olvidó de multiplicar.
2. 🔴 **Lo que estira no se mide; el largo se mide SIEMPRE.** Regla de Bruno. `largo` tiene
   `estira: false`, así que el botón «estira» ⛔ **no existe** en su casillero: la regla no depende
   de que alguien la recuerde. 📌 [[feedback_areben_invariante_escrito_no_frena]].
3. **«Estira» es un VALOR, ⛔ no un casillero vacío.** En blanco, «no lo medimos porque estira» y
   «nadie lo cargó» se ven igual — y es la única diferencia que dice si falta trabajo. Misma forma
   que `TELA_SIN_IDENTIFICAR`.
4. 🔴 **Una fila sin un solo número ⛔ NO se publica.** Medido el 1-sep-2026: hay **5 productos
   publicados** —VESTIDO SOLANA, VERONA, MALIA, AMBAR y MONO TIARE— con la tabla en la tienda
   diciendo «CINTURA (CONTORNO TOTAL) CM», sin número, y **63 tablas con celdas en «-»**.

### Lo que la pantalla sabe sin preguntar

- 🔑 **La ficha ya tiene la TELA**, que es el atributo de orden 1 ⇒ con microfibra, lycra, morley o
  ribb el aviso sobre el ancho sale solo, con la prenda delante, en vez de vivir en un manual.
- 🔑 **La ficha ya tiene la MANGA** ⇒ un top sin mangas ⛔ no pide largo de manga. Y el servidor lo
  **vuelve a preguntar**: que el casillero no se dibuje es una comodidad del que carga.
- 🔴 **Los talles salen de las VARIANTES, ⛔ no se tipean.** La Tabla de talles vieja arrancaba con
  `S, M, L, XL` clavados: medido, **98 de los 111** productos sin medidas ⛔ no tienen eje de talle,
  así que esa grilla les pedía inventar tres talles que el selector de la tienda no ofrece.

### El bloque que sale a la tienda

Usa **la misma firma** que el generador viejo (`AREBEN-TALLES`) a propósito: **reemplaza** la tabla
que había, ⛔ no se suma. ⚠️ Y una tabla nueva **vacía ⛔ no borra** la que había —`htmlDeMedidas`
devuelve `''` tanto para «no lleva» como para «todavía nadie midió», y ninguna de las dos cosas
puede costar la única copia que existe—. El guard `conservaLaTabla` sigue prendido: exige que la
tabla **nueva** esté entera en el resultado.

🔑 **Los rótulos dejan de ser letras** (`a. Contorno busto`) y pasan a la palabra, porque los
dibujos de la guía ⛔ no tienen letras: rotulan ANCHO, LARGO, LARGO DE MANGA.

🔴 **Y la ficha deja de contradecirse sola**: el bloque viejo decía «tomadas sobre superficies
planas» arriba y «medir alrededor de toda la cintura» diez líneas abajo.

## El aviso de la cola (1-sep-2026, pedido de Bruno)

> «una vez que terminen la cola, que haya una alerta de x cantidad de descripciones o medidas sin
> publicar»

`avisosDeFicha` en `lib/notificaciones/derivar.ts`, con la regla en `lib/tn-desc/pendientes.core.ts`
—el mismo núcleo que va a mirar la pantalla, para que el badge y la lista ⛔ no digan cosas
distintas—.

- 🔴 **Tiene DUEÑO: sólo lo ve quien puede publicar.** A las que cargan ⛔ no les llega: sería un
  reloj que acusa a quien no puede hacer nada. 📌 [[feedback_areben_reloj_sin_dueno]].
- ⚠️ **Son DOS avisos.** «Aprobada y sin publicar» se cierra con un clic; «cargada y sin párrafo»
  pide sentarse a escribir. Un solo número diría «17 pendientes» sin decir cuáles se resuelven en
  un minuto.
- 🔴 **La espera se mide desde `aprobado_at`, ⛔ no desde `updated_at`**: `updated_at` se mueve cada
  vez que alguien carga una medida, así que mediría «hace cuánto que nadie la toca».
  📌 [[feedback_areben_updated_at_no_mide_la_espera]].
- ⛔ Una prenda marcada «no lleva tabla» ⛔ **no** es un pendiente: si contara, la cola nunca bajaría
  a cero — y una cola que nunca baja a cero deja de mirarse.
- ⚠️ **Hoy el aviso nace en CERO y eso es correcto**: nadie cargó todavía una ficha. El día que la
  primera se apruebe, aparece.

## El talle de la modelo (3-sep-2026, pedido de Bruno)

> «Dinámica sesión de fotos con talle de la modelo — para luego cargar el talle que usa la modelo en
> la descripción del producto.»

La ficha de cada producto ahora muestra **qué modelo lo fotografió y qué talle usa**, arriba del
insumo del local. Sale de la **sesión de fotos** (`lib/sesionfotos/modelo.ts`), y el puente es el
**SKU de variante** —por eso `ProductoTn` conserva `skus`, que `normalizar()` tiraba—: la sesión
arma sus ítems con el catálogo de Gestión Nube y esta pantalla con el de TiendaNube.

🔴 **SE MUESTRA, ⛔ NO SE PUBLICA, y eso ⛔ no es una etapa a medias: son dos reglas que se cruzan.**
El párrafo **no puede nombrar un talle** —`validarParrafo` lo rechaza desde el 27-ago-2026 por
decisión de Bruno: *«eso lo dicen el selector y la tabla»*, porque los talles del PRODUCTO se
desactualizan solos—. El talle de la modelo ⛔ no es ese talle y ⛔ no se desactualiza nunca, así que
la frase **no va en la prosa**: va como un **bloque compuesto**, al lado de los bullets y de la tabla
de medidas, con la misma doctrina del 27-ago («los bullets no son redacción, son atributos»).
▶️ **Ese bloque todavía no existe y es lo que falta decidir**: si sale en todas las fichas, con qué
palabras y si lo compone el servidor al publicar (que es donde tendría que vivir, en
`lib/tn-desc/bloques.core.js`).

⚠️ **Se leen las sesiones de TODAS las líneas de la marca** (`lineasDeMarca`), no sólo `zattia`: las
de Stunned son filas `store='stunned'` y sus prendas están en la misma tienda. Y la lectura **falla
ABIERTA** —al revés que `leerCajon`, que falla cerrada porque río arriba se escribe sobre lo leído—:
si una línea no contesta, la pantalla abre igual **con un cartel**. 🔑 Sin ese cartel, «esta prenda
no tiene talle de modelo» y «no se pudieron leer las sesiones» se ven exactamente igual: un renglón
que no está.
