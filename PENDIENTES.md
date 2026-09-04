# PENDIENTES — legibilidad del monitor

**Lo dijo Bruno el 25-ago-2026, y es el pedido que abre este archivo:**

> «los sectores en monitor no se entienden qué hace ni qué ejecutan, está mal armado, tiene
> funciones pero no las usa nadie»

Este archivo NO es una lista de features. Es el análisis de **por qué una app con 55 secciones
terminadas se usa poco**, y los pendientes que salen de ahí. Lo que se arregle, se borra de acá.

⚠️ Antes de tocar: hay **otra sesión trabajando en este repo**. Rutas explícitas, `git fetch` al
arrancar, `git commit -F msg -- <rutas>`, ⛔ nunca `git add -A`.

---

## 🆕 LOS SIETE DE BRUNO — 3-sep-2026 (dictado, sin analizar todavía)

Dicho por él, textual, en una sola vuelta. ⛔ Nada de acá está verificado aún: se anota primero,
se mide después. Cada punto se borra de esta lista cuando esté hecho y **caminado por Bruno**.

1. 🏁 **RENDIMIENTO — hecho el 3-sep. Era UNA causa y explicaba los dos síntomas.**
   > «En rendimiento cambio la fecha y no anda el filtro de hoy, ni de hoy y ayer. Por eso no la
   > uso. Tampoco actualiza ninguna info.»

   El día en curso lo trae el **parte**, que es de **una cuenta publicitaria sola**, y el eje
   arranca en «Todas» sin autoseleccionar ⇒ entrando por el menú **el parte no se pedía nunca** y
   las tres ventanas dibujaban la misma foto de 7 días, sin que saliera un fetch. El relato entero
   —y el cartel que mentía diciendo «Meta no contestó»— en `docs/secciones/meta-ads.md`.
   ⚠️ **Es la SEGUNDA vez que lo reporta**: el 30-ago se arregló otra cosa real y quedó sin caminar.
   🏁 **Esta vez SÍ se caminó, en producción**: con «Todas (3)» y Zattia, «Hoy» ahora abre la banda
   del día en curso y el Gasto pasa de $ 66.751 (7 días) a $ 1.756 (hoy, en vivo).

2. 🏁/▶️ **AGENDA — el SECTOR ya está; los títulos los tenés que elegir vos.**
   > «La agenda - los títulos están medios extraños. Además, en las reuniones no dice qué sector, y
   > tengo 3 sectores que dirijo.»

   🏁 El sector ya se dibuja en cada renglón del Hoy —**caminado en producción**: dice «Local» y
   «Bruno Arevalo y Camila Budek»— (el dato viajaba y era la única pantalla que no lo mostraba). ⚠️ Una reunión dirigida **por nombre** no tiene sector: eso se cambia cargando.
   ▶️ **Los títulos son DATA, ⛔ no código** — se editan en `/agenda/eventos`. Falta que Bruno diga
   cuáles. Ver `docs/secciones/agenda.md` § 3-sep.

3. 🏁/▶️ **PERMISOS — la respuesta a la pregunta es NO, y por eso hubo que cambiar el motor.**
   > «¿Puede ser que yo tenga permisos del local? Porque veo lo de descripciones, y preparar
   > pedidos. El usuario de Bruno. Si es así, córramelos. Y también a Darío.»

   🔑 **Medido el padrón (16 usuarios): Bruno y Darío tienen `funcion: ['direccion']` y CERO
   tildes.** ⛔ No hay ningún rol de local asignado de más: los ven por ser **admin**, que en
   `puedeVer` ganaba arriba de todo.
   🔴 **Y por eso «córramelas» ⛔ no se podía hacer**: la única forma de sacarle una sección a un
   administrador era **destildarle «Administrador»** —la ficha lo decía con todas las letras—, y
   eso le saca además Config, el memo, el calendario y la liquidación. La matriz de permisos ni
   siquiera se le dibujaba.
   🏁 **Hecho el 3-sep**: la **excepción ahora le gana al admin** (paso 1 de `puedeVer`) y la ficha
   de un administrador dibuja la matriz. Destildar una sección le escribe la excepción, por marca;
   volver a tildarla la saca. ⛔ **Config no se puede cerrar sobre uno mismo**: `usuarios` no pasa
   por `puedeVer` ni está en la matriz, y hay un test que se pone rojo si eso cambia.
   ⚠️ Lo que **no** cambia son los ~160 `esAdmin(perfil) || …` de `api/`: casi todos contestan
   «¿puede escribir?», no «¿la ve?». La sección desaparece del menú y el guard rebota; que un
   handler suelto conteste el dato ⛔ no es un agujero — es el dueño sacándose una entrada de la
   vista, no un candado.
   ▶️ **Falta que Bruno destilde las que no quiere ver** —en Config, su ficha, «Sacarle secciones
   del menú»—, o que diga cuáles y las escribo yo. ⚠️ Lo pidió **también para Darío**, y eso ⛔ no
   lo toco sin que lo diga de nuevo: son dos nombres que él nombró en una sola frase y «descripciones»
   puede ser **Descripción y medidas** (`gen-desc`) o **Fotos y descripciones** (`marketing`).

4. 🏁 **AGENDA — hecho el 3-sep. Eran dos defectos apilados, y uno era de DATO.**
   > «En la [pregunta] de cómo entró la orden, voy a agenda hoy, y no puedo ver lo de la selección
   > que hice o la decisión que tomé. O sea no aparece la opción apretada como sí aparece la tilde
   > en las OCs.»

   La tarjeta unificada dibujaba los botones **sin mirar el tilde** (el renglón suelto sí lo
   miraba, por eso se veía bien con una sola orden), y abajo **la puerta elegida no se guardaba en
   ningún lado**. Ahora el renglón contestado muestra ✓ y «Entró por …».
   ⛔ **Sin caminar todavía**: ese día no había ninguna pregunta en el Hoy. Se mira cuando entre una OC.
   El relato, en `docs/secciones/agenda.md` § 3-sep.

5. 🏁/▶️ **FOTOS — el talle de la modelo ya se anota y ya se ve en la ficha. Publicarlo choca con
   una regla tuya, y esa decisión falta.**
   > «Dinámica sesión de fotos con talle de la modelo - para luego cargar el talle que usa la
   > modelo en la descripción del producto.»

   🏁 **La sesión lo guarda** (nombre · talle · altura) y **«Descripción y medidas» lo muestra** en
   la ficha del producto: *«La modelo mide 1,70 m y usa talle S»*. El relato entero en
   `docs/secciones/sesionfotos.md` § La modelo y su talle.
   🔑 **Es de la SESIÓN y no de la prenda** (elegido por Bruno): una sesión es una modelo, y su
   talle es el mismo en las 30 prendas. **El talle es lo obligatorio, el nombre no.**
   🔴 **El puente con la descripción es el SKU, ⛔ no el id**: la sesión usa el catálogo de Gestión
   Nube y la ficha el de TiendaNube. 📌 **Medido: 79 de 79 SKU cruzan** (en BDI; en Zattia la tabla
   tiene RLS y no se pudo medir desde afuera).
   ▶️ 🔴 **Falta UNA decisión tuya: cómo se publica.** El párrafo ⛔ **no puede nombrar un talle** —lo
   rechaza `validarParrafo` desde el 27-ago, por decisión tuya: *«eso lo dicen el selector y la
   tabla»*—. El de la modelo ⛔ no es ese talle y ⛔ no se desactualiza nunca, así que tiene que salir
   como **un bloque compuesto**, al lado de los bullets y de la tabla. **Hoy se ve en el monitor y
   ⛔ no sale a la tienda.** Falta decir: ¿va en todas las fichas?, ¿con qué palabras?
   ▶️ Y falta **caminarlo**: cargar una modelo en una sesión real y ver la frase en la ficha.

6. 🏁/▶️ **MODEL MANAGEMENT — la FICHA ya está y la base también; falta CAMINARLA.**
   > «Sección en monitor de Model Management - fichas - Booker - Portafolio con mejores fotos de la
   > modelo con nosotros. Principalmente para análisis. También que se pueda agregar ideas,
   > modelos, como si fuese una base de datos.»

   🏁 **Sección nueva «Modelos», en Marketing** (3-sep): el padrón y la ficha de cada una —quién es,
   Instagram y teléfono, **agencia y booker** (las tres vacías dicen «Directa», que acá es lo más
   común), talle, altura y medidas, para qué marcas trabaja y notas—. El relato entero en
   `docs/secciones/modelos.md`.
   🔑 **Su primer lector ⛔ no es su pantalla: es la sesión de fotos.** El talle y la altura de la
   sesión (el punto 5) se tipeaban a mano porque este padrón no existía; ahora los dos normalizan
   con **la misma función**, que se mudó a `lib/modelos/core.core.js`. Eso decide texto que sale a
   la ficha de un producto que lee una clienta.
   ⛔ **La pantalla no dibuja ninguna columna medida** —cuántas sesiones hizo, qué vendió lo que
   fotografió—: 📌 medido el 3-sep, **0 de 11 sesiones de BDI tienen modelo anotada** (y en Zattia la
   tabla ⛔ no se pudo leer desde afuera, así que ese 0 es «no se pudo medir»). Con 0 enganchadas
   esas columnas dirían **0 para todas**, y un cero afirma.
   ✅ **La migración ya corrió en BDI** y está verificada por otro camino que el que la corrió
   (PostgREST contesta `200 []`, y una tabla inventada al lado contesta 404).
   🏁 **Y la sesión de fotos ya ELIGE la modelo del padrón** (3-sep, más tarde): un selector «Del
   padrón» arriba de los tres campos que trae su talle y su altura y —lo que importa— **deja el
   `id` de la ficha adentro de la sesión**. Era el enganche que faltaba: tipear el nombre ⛔ no cruza
   nada, y sin cruce el análisis que pediste ⛔ no se puede calcular. Los tres campos siguen libres,
   así que la modelo sin ficha se anota como siempre.
   🔴 **Lo que hubo que abrir para eso**: quien carga una sesión ⛔ puede no tener Modelos tildada
   —justo desde el punto 3, que permite sacar secciones de a una— y el selector no podía empezar a
   contestar 403. La lista corta (`?modo=elegibles`) la puede pedir también `sesion-fotos`, y por
   ahí viajan **cuatro campos**: id, nombre, talle y altura. El teléfono, el mail, la agencia, la
   nota y **escribir** siguen pidiendo Modelos.
   ▶️ **Falta caminarla**: cargar una modelo de verdad, elegirla en una sesión y ver que quede. ⚠️ El
   padrón está vacío, así que el selector ⛔ no se dibujó nunca con una ficha adentro.
   ▶️ **Lo que sigue, en este orden**: (1) **el análisis** («principalmente para análisis»): cuántas
   sesiones hizo cada una y cómo vendió lo que fotografió —ahora ya hay con qué cruzarlo, pero
   ⚠️ **la primera columna medida ⛔ no se dibuja hasta que haya sesiones enganchadas**: hoy serían 0
   para todas, y un cero afirma—; (2) **el portafolio** de fotos.
   ▶️ ⚠️ **Y dos preguntas tuyas**: las **«ideas»** del dictado, ¿son de producción, de looks o de
   modelos a contactar? —hoy entran en la nota de cada ficha—; y el **cachet**, que ⛔ no puse: lo
   vería todo el que ve la sección, y ése no es el permiso de la liquidación.

7. 🏁 **ANÁLISIS — hecho el 3-sep: el buscador miraba SÓLO el nombre.**
   > «Sumar en análisis, también poder buscar por código de proveedor las ventas de producto.»
   > Aclarado con una captura: *«sería buscar 5000 y que aparezca ese top skyler»* — o sea el
   > **SKU**, que la fila ya dibujaba (`5000 · Contamina`) y no se podía buscar.

   «Por producto» ahora matchea **nombre · SKU · proveedor**, y «Por variante» suma **SKU y código
   de barras**. Sin migración ni endpoint: los tres campos ya viajaban en el payload del ETL.
   🏁 **Caminado en producción**: buscar `5000` devuelve el TOP SKYLER, 1 producto.
   ⚠️ Si algún código no aparece, es el campo **«Código»** de Gestión Nube —otro campo, que hoy ⛔ no
   se guarda: en BDI el sync lo descarta— y eso sí es una migración en las dos bases.

---

## 🆕 EL OCTAVO: LA SESIÓN DE FOTOS COMO **EVENTO** — 3-sep-2026 (dictado, sin analizar todavía)

Textual, en una sola vuelta, y ⛔ **nada de acá está diseñado**: se anota primero, se mide después.
Lo abrió él mismo diciendo por qué: *«estoy teniendo inconvenientes con el armado de los mismos, las
solicitudes de productos y demás»* ⇒ el pedido sale de **usarla**, ⛔ no de leer el código.

> «Sobre sesión de fotos me gustaría profundizar un poco más. Sesión de fotos es un evento que viene
> de tres motivos. Por eso mismo necesito que el evento opción de fotos también despliegue una
> disparada de tareas a cada persona con la sesión de fotos, siendo un evento con **modelo, fecha,
> hora, tiempo aproximado**. Dentro de la misma además tiene que poder solicitarse **varias
> solicitudes de productos**. Además la solicitud de fotos tiene que poder pedirse productos **de
> stock o de ingresos directamente, sacar info de la OC**. Eso tiene que generar un **banco de
> productos de la sesión**, donde se realiza una **clasificación rápida** y se generan **outfits
> digitales** con distintos productos de arriba y abajo. Si el producto de la OC que ingresó no
> alcanza para armar outfits, se procede a pedir una **solicitud a local**, es decir, el armado de
> outfits se realiza desde ahí, entonces va más ordenado.»

🔑 **El pedido de fondo da vuelta el objeto**: hoy **la solicitud ES la sesión** (1 a 1), y esto pide
que la **SESIÓN sea el padre** —un evento con modelo, fecha, hora y duración— y que las solicitudes
de productos sean **hijas** (varias). Todo lo demás cuelga de ese cambio.

📌 **Primera lectura, medida contra el código el 3-sep — la mitad ya existe:**

| lo que pide | cómo está hoy |
|---|---|
| «viene de tres motivos» | ✅ **ya es un eje**: `disparador` = faltante · campaña · ingreso (`lib/solicitudes/disparador.ts`) ▶️ pero **ninguna puerta lo llena sola**: hoy se elige a mano |
| «que despliegue una disparada de tareas a cada persona» | ✅ **ya existe y está vivo**: los **9 moldes** de la plantilla `sesion-fotos` (Agenda), que se siembran solos cuando alguien crea la sesión, **cada paso con su dueña** y su offset (la modelo −2, las referencias −1, el día 0). Cargados y ejercidos el 29-ago |
| «con modelo» | ✅ **desde hoy**, y ahora sale del padrón (punto 6) |
| «fecha, **hora, tiempo aproximado**» | 🔴 **fecha sí; hora y duración ⛔ NO EXISTEN** en la solicitud |
| «varias solicitudes de productos dentro de la misma» | 🔴 **⛔ no se puede**: la sesión **es** la solicitud. Es el cambio estructural del pedido ⚠️ y ya hay un caso real que lo pide desde otro lado: una sesión que fotografía Zattia y Stunned **son dos solicitudes** |
| «pedir de stock **o de ingresos, sacando info de la OC**» | 🔴 el borrador se arma sólo sobre el **stock** (`allProductos`/`allVariantes`); de la OC o de la recepción ⛔ nada |
| «banco de productos + clasificación rápida + **outfits digitales** arriba/abajo» | 🔴 **⛔ no existe**. Lo único cercano es **físico**: las bolsas numeradas, donde cada bolsa **es un look** (`lib/sesionfotos/tipos.ts:70`) |
| «si la OC no alcanza, pedir una **solicitud a local** desde ahí» | ⚠️ el sistema ya decide **depósito o local por ítem** (`origen`), pero ⛔ no como «completar un outfit» |

▶️ **Lo que hay que decidir antes de escribir una línea** (⛔ ninguna es código):
1. **Qué es una sesión sin solicitudes**: ¿el evento se crea primero —con modelo, fecha y hora— y las
   solicitudes se le cuelgan después? Eso cambia **cuándo se siembran los 9 pasos de la Agenda**, que
   hoy se disparan al crear la solicitud.
2. **Qué es un outfit**: ¿arriba + abajo y nada más, o entra calzado y accesorios? ¿Un producto puede
   estar en dos outfits? ¿El outfit se le asigna a una modelo y a una hora?
3. **Qué es «clasificación rápida»**: ¿arriba/abajo/vestido sale de la **categoría de TiendaNube**
   —que ya mezcla: 14 de 40 de «SHORTS, MINIS y FALDAS» son shorts, medido el 1-sep— o se tilda a
   mano prenda por prenda?
4. **De dónde sale «lo que ingresó por la OC»**: ¿la recepción del monitor, la OC de Gestión Nube o
   el aviso de ingreso? Son tres fuentes con tres momentos distintos.
5. 🔴 **Y la más cara**: ¿esto **reemplaza** la pantalla de sesión de fotos o **la envuelve**? Hay 30
   sesiones vivas con su historial adentro, y el ciclo —venta en GN que separa stock → retiro →
   devolución → anulación— ⛔ no se puede partir por la mitad.

---

## 🆕 AGENDA — el primer día del webhook en vivo — 1-sep-2026 (pedido de Bruno)

> «la selección de opciones tiene que ser según marca: Zattia es producción propia o compra
> nacional, y bdi el resto» · «cuando hay varias OC estaría bueno las actividades de cada evento,
> unificarlas en factor común» · «la vista mía, tengo cosas de administración, ¿puede ser? ¿por qué
> sería?»

Aclarado por él en la misma vuelta: *«bdi y zattia tienen compra nacional; la diferencia es que bdi
tiene importado, y zattia tiene producción propia»* y *«accesorios nacionales sería compra
nacional»*.

🏁 **Las tres, hechas** — el relato entero en `docs/secciones/agenda.md` § «EL PRIMER DÍA EN VIVO».
Lo medido ese día contra la base: **11 preguntas de puerta**, **10 contestadas** (todas Zattia,
todas «compra nacional») ⇒ **100 renglones sembrados**.

1. **Las puertas pasaron de cuatro a tres, y cada una vive en su marca.** «Accesorios nacionales» era
   la compra nacional de BDI. Zattia ofrece propia + nacional; BDI, nacional + importación. El
   servidor corta por la misma lista que la pantalla, y `accesorios` **sigue entrando** desde
   `ingreso2` traducido a `nacional`.
2. **Las actividades repetidas se unifican en una fila** («05) Decidir el PRECIO · 3 de 10», con una
   orden por ficha). Cada orden conserva **su** tilde; ⛔ no cambió qué se guarda. 🆕 **Segunda
   vuelta**: el tilde quedó **afuera** del número de orden —eran un solo botón, así que ir a mirar
   qué vino marcaba el paso como hecho— y **el número abre la orden** en Ingresos (`?oc=`).
3. **Lo de Administración en el «Hoy» de Bruno es el atajo del admin**, que recibe todo lo dirigido
   **por rol** —las 11 preguntas (`administracion`) y los 10 «04) La DESCRIPCIÓN» (`local`)—. Lo que
   va por nombre ⛔ no le llega. Con el punto 2, esos 21 renglones son **dos filas**.

### ▶️ Lo que queda

1. 🏁 **Caminado por Bruno el 1-sep-2026 y anda** (*«si anda perfecto, ahí lo probé»*): el tilde, el
   «Marcar las N» y el número de orden abriendo la orden en Ingresos. ⚠️ Lo caminó **con su usuario,
   que es admin**: falta verlo con **Lorena**, que es la que tiene los 36 renglones y la única sin
   `admin` que puede contestar la puerta.
   ⚠️ Los cien renglones sembrados ese día ⛔ **no traen el id de la orden** —el campo nació
   después—: abren por **rótulo**, que `recepciones` resuelve igual. Los que se siembren de ahora en
   más van por id.
2. ▶️ **Decidir si el «Hoy» del admin lleva un filtro «sólo lo mío»** — o si la pregunta de la puerta
   se dirige por nombre en vez de por rol. ⛔ **La salida barata NO es tocar `esParaMi`**: lo comparte
   Novedades. Hoy queda como está: el volumen lo arregló la unificación.
3. ▶️ **La novedad**, si Bruno quiere: la unificación **la ve todo el equipo**, no sólo quien carga.

---

## 🆕 CANJES → la venta va a GESTIÓN NUBE — 1-sep-2026 (pedido de Bruno)

> «quiero ver tema canjes, de poder escribir los canjes de las personas en ventas de gestión nube
> con el nombre de canjes bdi — en la nota que diga el nombre de la persona, y luego le genero
> etiqueta por afuera»

🏁 **Hecho y en el repo** (el relato entero, en `docs/secciones/canjes.md`): el paso 1 de un canje
con envío crea la venta a $0 en GN contra el cliente **`Canjes BDI` (645369)**, con la nota
`Canje C-0079 — Nombre Apellido — envío (Monitor)`, descontando del **Depósito Minorista**. La orden
de Tienda Nube dejó de ser el camino principal y quedó plegada.

### ▶️ Lo que está en manos de Bruno

1. 🏁 **El canal quedó resuelto (1-sep): es el 15 «Influencer».** Bruno creó el canal propio
   «Canjes» pero GN **no lo ofrece en el selector de la venta** (habría que habilitarlo en
   Preferencias → «Personalizar Canales de Venta»), así que eligió uno preseteado. Con eso los
   canjes **cuentan** en rotación, vida útil, caducados y CRM. 🔴 **Ese canal queda reservado para
   canjes**: `canalDe` lo manda a `tecnica` para que las ventas a $0 no hundan el precio promedio,
   así que **una venta cobrada cargada ahí tampoco contaría** para el promedio.
2. 🏁 **El precio congelado quedó corregido (1-sep).** La vitrina «Girlhood Collection» tenía sus
   **19 ítems a $1.490** cuando en la tienda valen **$13.990–14.990**, y ese número se había copiado
   a los ítems que las creadoras eligieron ⇒ el balance contaba ~10 veces menos de lo que costaron.
   🔑 **El precio no existía en la tienda ni existió como promo**: medido contra el catálogo real de
   Tienda Nube (`tiendanube-audit`), **0 de 252 productos** tienen 1.490 y el más barato es 1.990.
   Fue la foto del **4-ago**, día en que se importó la vitrina, que quedó congelada.
   ✅ Corregidos **19 ítems de vitrina** y **39 ítems vivos de los 13 canjes abiertos**, con el
   precio de hoy de cada SKU (misma regla `precioVigente`, mismo catálogo — no un tercer precio).
   ⛔ **No se tocaron** los de canjes cerrados o cancelados (su balance es historia) ni los ítems
   `quitado`. ✅ Verificado antes de escribir que ninguno de los 13 se pasa de tope: **todos son por
   unidades**, así que el precio no traba la venta de ninguno.
3. ▶️ **Probarlo con un canje real**, y mirar dos cosas en GN: que la venta quedó a nombre de Canjes
   BDI con la nota, y **si el stock de la tienda online bajó**. Sin la orden de Tienda Nube, eso
   depende de la integración GN↔TN y **no está verificado**.

### 🆕 Las ETIQUETAS: las 13 a domicilio están CREADAS (2-sep)

🏁 **Las 13 etiquetas a domicilio quedaron creadas en Envío Nube, todas «Por enviar» y SIN COMPRAR.**
El saldo no se movió: sigue en **$39.721** (crear no cobra; el gasto es «Comprar etiqueta», que es
además lo que genera el código de seguimiento).
- 1-sep, 7: `EM4240` Mercedes Jaime · `EM4241` Jennifer Bilbao · `EM4242` Lourdes Cuchero ·
  `EM4243` Melisa Bruno · `EM4244` Delfina Cassarino · `EM4246` Maia Cigorraga ·
  `EM4247` Giuliana Gardonio.
- 2-sep, 6: `EM4254` Luisina Bidart (C-0075) · `EM4255` Berenise Ahumada (C-0077) · `EM4256` Julieta
  Clara (C-0078) · `EM4257` Manuela Melkun (C-0079) · `EM4258` Abril Gobio (C-0080) · `EM4259`
  Victoria Bartos (C-0081; Rosario→Rosario sale **$7.600**, el resto **$8.776**).

4. ▶️ **La mano que queda es de Bruno: COMPRAR las 13.** Son ~$113.500 y el saldo alcanza para 4.
5. ▶️ **Falta C-0082 Julieta Junco, que va a SUCURSAL** — el formulario es otro («Agregar envío
   manual → A sucursal») y **falta que Bruno diga a qué sucursal**. ⛔ C-0051 Celeste Aloe la sacó él:
   no lleva etiqueta.
6. 🏁 **«Barrio» ya está en el link que llena la creadora** (2-sep). Es obligatorio **sólo con
   envío** —con retiro en el local no se pide nada del domicilio— y la ayuda del campo dice qué poner
   si en su ciudad no se usan los barrios: repetir la localidad, que es lo que se cargó a mano las
   trece veces. Está también en la ficha del equipo y en la grilla de campos que se copia a Envío
   Nube. ⛔ **No entra a `tieneDireccion`**: las fichas viejas no lo tienen y sumarlo al criterio de
   «se puede despachar» frenaría canjes en curso por un dato que nadie les pidió.
7. 🏁 **El guard de la provincia ya está** (2-sep): con un CP de 1000 a 1499 la provincia se corrige a
   CABA al guardar, **en los dos lados que escriben** —el portal y la ficha del equipo—, porque las
   cuatro que salieron mal las había tipeado el equipo. Hay **un solo rango y es a propósito**: los
   demás se pisan entre sí y una tabla escrita de memoria corregiría direcciones que están bien.
   ✅ **Migración corrida en BDI y EN PROD** (2-sep): la columna verificada contra
   `information_schema` y la escritura **ejercida de verdad por PostgREST y revertida** —el caché de
   esquema de PostgREST ya mordió una vez—. El campo se leyó en el bundle de producción.
   ⛔ **Las 6 fichas que hoy tienen la provincia peleada con el CP quedan como están, por decisión de
   Bruno** (4 mal de verdad —Mercedes Jaime, Melisa Bruno, Maia Cigorraga, laureana bottini— y 2
   escritas «CABA» en corto). El guard las corrige al próximo guardado; hasta entonces siguen así.
   ▶️ **Falta lo único que ningún test puede**: abrir el link desde un **celular**, cargar el barrio
   y ver que se guarda. El bundle dice que el campo está dibujado, ⛔ no que la escritura funcione.
8. ⚠️ **Tres direcciones se cargaron interpretándolas, y conviene que la ficha lo refleje**:
   C-0078 «Av 101 9 de julio» **no eran dos calles** —es la Avenida 101, que en Villa Ballester se
   conoce como 9 de Julio; se cargó `Av. 101 (9 de Julio)`—; C-0075 el timbre no tiene campo propio y
   entró en Departamento (`5 C (timbre 53)`); C-0081 piso y depto venían como `03`/`06` y se cargó
   `Piso 3 Dto 6`.

---

## 0. La corrida de VOCABULARIO — 28-ago-2026 (pedido de Bruno)

> «no me están gustando los títulos y los términos de los mensajes: lo que falta tendría que ser
> pendiente, sacar tiene que ser eliminar»

📌 **La regla vive en [`VOCABULARIO.md`](./VOCABULARIO.md)** —el MISMO archivo en este repo y en
`areben-marketing`, versión `2026-08-29`— y la clava `tests/vocabulario.test.ts`. ⛔ Antes de escribir
un botón, un título o un cartel de vacío, se lee. El nombre del trabajo, para pedirlo afuera: es
**UX writing**; lo que se pide es un **glosario de producto con vocabulario controlado** más una
**guía de estilo de contenido**, y después la **auditoría de contenido** que los aplica.

### 🏁 Hecho

- **Los rótulos del menú.** 15 nombres en `lib/nav.datos.ts`: `Objetivo de ventas` · `Fotos y
  descripciones` · `Importaciones` · `Conteo de depósito` · `Posventa` · `Fallas del local` ·
  `Fallas de depósito` · `Productos` · `Variantes` · `Clientes` · `Iniciar un reclamo` ·
  `Retornos a depósito` · `Solicitudes de todas las marcas` · `Cola de fotos`.
  🔑 **Las nueve palabras que significaban dos cosas las cerró Bruno**: `Faltantes` se la queda
  Compras · `Importaciones`/`Ingresos` · `Conteo de depósito` · `Solicitudes` queda (es la misma
  pantalla vista desde cuatro lugares) · `Canjes` y `Talles` ⛔ **no se tocan, decisión suya** ·
  Posventa es **una cadena** (local → depósito → el motor), ⛔ no tres nombres de lo mismo.
- 🔴 **Una descripción que MENTÍA.** El `info` de `marketing` en `PERM_CAT` decía «Armado de
  publicaciones para redes y TiendaNube» — esa pantalla no existe: es una auditoría de fichas de TN.
  Y ese texto sale como **tooltip en la matriz de permisos** (`components/usuarios/MatrizPermisos.tsx`),
  así que quien repartía permisos leía la descripción de otra cosa. ⚠️ Había **dos** descripciones por
  sección (`PERM_CAT.info` y `DESCRIPCIONES` de `lib/nav.ts`) y sólo una estaba bien.
- 🔑 **El rename destrabó un eyebrow.** `categoriaDe('marketing')` daba `null` **porque la sección se
  llamaba igual que su grupo**: era el síntoma, no una decisión. Era la única pantalla que no decía
  de qué grupo venía.
- **Familia *eliminar*: 330 textos.** `borrar` → **Eliminar**, `quitar` → **Sacar**, decidiendo cada
  uno con *¿la cosa sigue existiendo después?*.
- **Familia *publicar*: 25 gestos** a `Enviar`. Se terminó el caso de las dos puntas del mismo flujo
  diciéndose distinto («Mandar a sesión de fotos» / «Enviar a Marketing»).
- **`tests/vocabulario.test.ts`**, con el mecanismo de MAKETA (saca comentarios, junta identificadores,
  allowlist de 94 símbolos) más las **34 pantallas destructivas que TIENEN que decir la palabra** —sin
  eso el test se cumple perfecto en una app sin ningún botón—. **Mutado tres veces y murió las tres.**

### 🔴 Lo que ya mordió y no hay que repetir

- **Tres claves de datos se rompieron con la barrida**: `'quitado'` (estado de un ítem de canje),
  `'quitar'` (union de acción de Tienda Nube) y la firma de `lib/tncat/categorias.ts`. ⛔ **Un string
  que es CLAVE no es texto**: la regla es del texto que lee una persona. Lo cazó el `typecheck`, que
  es el oráculo barato para esto.
- ⚠️ **Y una era las dos cosas**: en Sesión de fotos el historial **guarda el verbo y lo dibuja tal
  cual** (`{c.por} {c.accion} {c.detalle}`). Ahí `quitó` → `sacó` es correcto, y **las filas viejas
  siguen diciendo `quitó`**: van a convivir un tiempo. Decidido con el costo delante.
- 🔴 **La regla de `Mandar` estaba MAL ESCRITA y hubo que corregirla.** Prohibía la palabra; medido,
  de **99 apariciones sólo 17 nombraban un gesto**. Las otras son prosa al cliente («Te mandamos la
  etiqueta», que en castellano está bien) y **otro verbo que se escribe igual**: «el corte que manda»,
  «Gestión Nube es quien manda sobre el precio» son *gobernar*. ⇒ la regla ahora dice **sólo como
  nombre del gesto**.

### 🏁 Hecho el 29-ago — las otras cuatro familias

- **Las seis familias, clavadas, y `tests/vocabulario.test.ts` pasó de 3 tests a 12.** Una prueba por
  familia sobre **el nombre del gesto**, más un piso de cuántos rótulos vio el extractor y la lista de
  pantallas que tienen que aportar alguno. 🔑 **Es el MISMO bloque que `areben-marketing`**, byte a
  byte salvo los números medidos.
- 🔴 **Y ese test nació con un PUNTO CIEGO que dejó vivo a un mutante.** La primera versión parseaba
  las etiquetas contando llaves para saltarse el `>` de `onClick={() => x()}`, y llegaba **hasta tres
  niveles**: un `<Button>` con `onClick={async () => { try { … } catch { … } }}` ⛔ no matcheaba, así
  que su rótulo era invisible — y ésos son justo los botones que escriben. Medido: devolver un
  «Sumar» a `components/canjes/BloqueEntregables.tsx` **no puso nada en rojo**.
  ⇒ **el extractor ya no parsea nada**: toma todo el texto JSX y los atributos de texto, y se queda
  con **lo que puede ser un rótulo** (hasta cinco palabras, sin `(`, `:`, `;` ni `=`). 🔑 **El tope de
  palabras es lo que separa el rótulo de la PROSA**, que es la lección de `Mandar` resuelta con una
  medida en vez de una lista de excepciones. Con el cambio aparecieron **cuatro rótulos más** que
  ninguna versión anterior veía.
- **Familia *agregar*: 30 rótulos.** `Anotar`/`Sumar` repartidos con la pregunta de §1.3 — **Crear**
  lo que nace al escribirlo (una idea, una decisión) y **Agregar** lo que ya pasó afuera y acá queda
  registrado (un faltante, un movimiento, un intento de entrega, un pedido de insumos).
- **Familia *guardar*.** ⚠️ Y confirmó lo que este archivo ya avisaba: **«Aplicar ajuste» no era
  guardar**… pero tampoco era aplicar. Relee el stock y **arma un Excel** ⇒ quedó **«Generar el
  ajuste»** (los dos conteos y el instructivo). Lo que sí escribe afuera se queda con `Aplicar` **y
  ahora nombra dónde**: «Aplicar en Tienda Nube», «Aplicar en TN».
- **Familia *publicar*.** `Mandar a Drive` · `Mandar a sesión de fotos` · `Mandar` · `Sin mandar` →
  **Enviar**.
- **Familia *editar*: ⛔ no había ni uno.** `Modificar` y `Retocar` no aparecen en ningún rótulo.
- 🏁 **Se cerró la deuda de `Borrar` y `Quitar` a secas en la allowlist**, que estaba escrita acá como
  debilidad conocida: los dos últimos usos vivos eran **texto** —«Borrar … de esta computadora» y
  «Quitar el elegido», cuyo propio diálogo ya decía «Sacar»— y con ésos arreglados la lista quedó
  **sólo con nombres que ninguna pantalla podría decir**. 🔑 **Lo cazó el test de al lado**, el que
  exige que la lista se vacíe sola.
- **El glosario subió a `2026-08-29c`** y está byte a byte en los dos repos. Entraron dos carve-outs
  medidos, los dos con la misma forma: la palabra se queda **cuando el gesto escribe en OTRO sistema y
  el rótulo nombra cuál** (`Aplicar en …`, `Dar de baja en GN` — es la palabra del sistema de
  destino, y traducirla manda a buscar un botón que allá no existe).

### ▶️ Lo que falta

- 🔴 **`components/crm/CRM.tsx` quedó SIN COMMITEAR a propósito.** El cambio de vocabulario está
  hecho en el archivo (`+ Sumar` → `+ Agregar`), pero **la otra sesión tiene ese archivo a medio
  editar** —le sacó el import de `vistaTemp` y está tocando `components/crm/temperatura.ts`—, así que
  commitearlo publicaría su trabajo por la mitad. 📌 [[feedback_areben_checkout_compartido_no_hay_merge]].
  ▶️ **Entra en el próximo commit que toque CRM**, o se vuelve a aplicar si se pierde.
- 🏁 **Los dos homónimos se cerraron** (29-ago, decisión de Bruno: la palabra se la queda el sentido
  que ya la tenía). `Faltantes` queda en Compras y en **Exhib** pasó a **«Sin escanear»**; en
  Recepciones ya decía «Unidades que faltaron» y ⛔ no hubo nada que tocar. `clavado` queda para el
  **producto sin rotación**, y la cuenta atada a una marca pasó a **«el que tiene una sola marca»**.
  🔑 **Los cuatro homónimos de los dos repos se cerraron SIN bautizar una palabra nueva.**
- 🏁 **La jerga de §3 tiene test** (`corrida` · `copy` · `moodboard`), y salió de los 8 textos que lee
  una persona. 🔑 **El oráculo de que una palabra es jerga es que alguien no la entienda**, y pasó:
  Bruno leyendo el pendiente de MAKETA — *«no sé lo que es corrida de un reloj»*. ⇒ ⛔ no se le busca
  un sinónimo, **se dice qué pasa**: «no hay ninguna corrida exitosa reciente» → **«hace rato que no
  termina bien»**.
- 🏁 **Y de las tres que iban a preguntarse, DOS no eran una decisión: eran un resto.**
  - **`Sembrar`** ya ⛔ no era el nombre de ningún botón —el de la Agenda dice **«Cargar los
    pendientes»**— y sólo sobrevivía en el **mensaje de error**, que decía otra cosa que el botón que
    lo dispara. ⇒ «No se pudieron cargar los pendientes.»
  - **`Bitácora`**, la pestaña de Liquidación, es la MISMA palabra que el menú de MAKETA ya había
    resuelto como **Actividad**.
  🔑 **Antes de mandar a decidir una palabra, mirar si el gesto ya se llama de otra manera en su
  propio botón, o si la otra app ya la resolvió.**
- ⛔ **`padrón` NO entra al test, y ⛔ no es un olvido**: sus 13 apariciones son todas de **Canjes**,
  que Bruno dejó afuera de la corrida. Es una decisión suya **ya tomada**, ⛔ no una pendiente. Está
  escrita en el test como **lista de archivos** —y con un segundo test que exige que la excepción
  siga excusando algo— para que el día que se levante se vea exactamente qué entra.
- 🏁 **La novedad está cargada, y queda de BORRADOR: `n1788020491323_anup1v`.** ▶️ **La publica Bruno
  de un click**, en `/novedades` → «Sin publicar». Le llega a **todos**, y ⛔ **no va como importante**:
  📌 medido, las 17 publicadas están las 17 en importante, así que un cartel bloqueante más no
  distingue nada — y un renombre ⛔ no frena el trabajo de nadie hoy.
- 🔑 **Lo que la disparó no fue la lista de renombres, sino una novedad YA PUBLICADA**: *«Lo que te
  piden y no tenemos: **anotalo** desde Atención»* nombra un botón que hoy dice **«Agregar un
  faltante»**. 📌 Es la regla de la ficha leída al revés, y por eso esa línea es la segunda de la
  novedad: quien siga la vieja va a buscar una palabra que ya no está.
- ⚠️ **`tests/crm-paridad.test.ts` sigue con 13 tests en rojo, y ⛔ no son de esta corrida**: se midió
  guardando los cambios aparte y dieron los mismos 13. Estaban rotos de antes.

---

## 1. La evidencia, medida — no es impresión

Contado contra la base de producción el **25-ago-2026**, módulo de Meta Ads:

| tabla | filas | qué significa |
|---|---|---|
| `meta_ads_regla` | ~~0~~ → **11** | 🏁 **prendidas el 26-ago** (P2). Los diales y el porqué, en el desplegable de P2 |
| `meta_ads_umbral` | **0** | y está bien: de los dos cortes que corren, uno se deriva y el otro sale de la ficha de rentabilidad. Sólo se llena para pisar un derivado o para las marcas sin ventas |
| `meta_ads_hallazgo` | ~~0~~ → **4** | 🏁 **los primeros de la historia, el 26-ago**: se corrió el reloj de verdad (`gh workflow run meta-reglas.yml`) y las 11 reglas quedaron con `ultima_corrida` |
| `meta_ads_favorito` | **0** | el botón de favorito de la Biblioteca no se tocó nunca |
| `meta_ads_informe` | 2 | y los dos **sin publicar** |
| `meta_ads_plan` | 4 | 2 `duplicar` (8-ago) + 1 `piezas` (10-ago) + 1 del 25-ago |
| `meta_ads_accion` | 37 | **todas de UNA persona**, del 6 al 25 de agosto |

🔑 **Lo que esto decía el 25-ago: el módulo se usa para EJECUTAR, nunca para DECIDIR.** Las tres
tablas que convertirían datos en «qué hago hoy» —reglas, umbrales, hallazgos— estaban las tres en
cero. 🏁 **La primera dejó de estarlo el 26.**

✅ **Al 26-ago-2026 la zona de Rendimiento contesta esa pregunta** (P3, abajo). Las tres tablas de
reglas siguen en cero: eso es P2, y resultó ser más que mover un dial.

🔴 **Y la prueba más incómoda:** el 25-ago se hizo una sesión entera de análisis de la pauta
—cruce con pedidos reales, elasticidad, techo re-medido, veredicto por conjunto— y **no se abrió
el monitor ni una vez**. Se contestó con ~20 consultas directas a la base y a la API. *Si la
pantalla contestara la pregunta, se habría abierto.*

## 2. El diagnóstico

### 2.1 🔴 No se entiende qué hace ni qué EJECUTA cada sección

Es el pedido literal de Bruno y es el problema raíz. Hoy, para saber qué hace una sección hay que
**abrir el código**. Concretamente:

- `docs/mapa-secciones.md` dice **dónde vive el código** de cada pantalla. Es una tabla de
  ubicaciones para quien programa.
- `docs/secciones/*.md` son **25 fichas sobre 55 secciones**, y su plantilla dice textual que se
  leen «ANTES de abrir los archivos» y que su trabajo es «decir qué mirar con cuidado».

⇒ **Toda la documentación del monitor está escrita para quien lo CONSTRUYE.** No existe una sola
línea escrita para quien abre la pantalla y no sabe qué va a pasar si aprieta.

Y el caso peor es el de los botones que **escriben afuera**: pausar, presupuesto, duplicar, piezas,
planes. Ahí «no entender qué ejecuta» no es incomodidad, es **miedo justificado**: son botones que
mueven plata en Meta y la pantalla no dice ni qué va a tocar, ni si es reversible, ni quién se
entera.

### 2.2 Está armado para ejecutar, no para decidir

Todo lo que funciona —accionar, planes, la foto, la Biblioteca, el Parte— **presupone que ya sabés
qué querés hacer**. Ninguna pantalla contesta *«¿qué apago, qué escalo, qué testeo hoy?»*.

El «Parte del día» es lo más cerca que hay, **y es un botón que copia texto para pegar en otro
lado**: la herramienta admite que la decisión se toma afuera.

### 2.3 Todo es *pull*

Hay que acordarse de entrar y de mirar. Un conjunto que compra al doble del techo tres días
seguidos, el catálogo de Meta parado, un sync en rojo: nada de eso sale a buscar a nadie.

### 2.4 Las pantallas hablan en el idioma del sistema, no del negocio

`conjunto`, `objeto_id`, `estado_real`, «efectivo vs configurado», `OPT_IN`. Quien decide piensa en
«esta pieza compra caro» y «este público está agotado».

### 2.5 Hubo un motivo real para desconfiar de los números

El techo de costo por compra de BDI estuvo semanas calculado con **2,6 unidades por pedido** cuando
lo medido eran 1,93-1,99: **26% de sobrestimación**, o sea conjuntos que la app daba por rentables y
no lo eran. Si el número con el que la app juzga está mal, se deja de creerle a la app entera —y no
vuelve sola cuando el número se arregla.

## 3. Los pendientes, en orden

### 🆕 ▶️ P0 — Lo que queda de la Agenda partida en seis (29-ago-2026)

La sección se partió en seis entradas de menú y las tres poblaciones de `agenda_items` se separaron
(ficha: `docs/secciones/agenda.md` § «SEIS pantallas»). Lo que queda es **de Bruno**:

- ▶️ **Publicar la novedad**, que quedó cargada como borrador: *«La Agenda, ahora por partes»*
  (`n1788054663959_yw2xuq`), en `/novedades` → «Sin publicar». El deploy **ya está en la calle**
  (verificado el 29-ago con la cadena nueva adentro del chunk del nav).
- ▶️ **Caminar a mano lo que ningún test alcanza**, listado al final de la ficha: las seis entradas
  con los dos perfiles, el modal de una actividad, y el `offset` al pasar de Mes a Semana.

### 🆕 🏁 P0b — Horas extras: HECHO Y CAMINADO (30-ago-2026)

Pedido de Bruno: *«en agenda de monitor, que esté el link de dashboard para que puedan cargar sus
horas extras; y la alerta de fin de mes, que sea sólo para las personas que tienen autorizadas las
horas extras»*. La ficha: `docs/secciones/agenda.md` § «la quinta forma de destino».

🔴 **El agujero era de DATOS y estaba a la vista sólo si se medía: `0 de 11` empleados activos tenía
el link generado.** La rutina les caía desde el 23-ago y **no había nada que abrir**.

✅ **Cerrado el 30-ago, con Bruno mirando**: se generaron los links de las **cuatro que él nombró**
—**Camila Budek, Candela Luis, Josefina Batter y Camila Quintana**— en el dashboard, se pegaron en
sus perfiles de `/usuarios`, y la rutina `it178752572363714_6wxkmp` pasó de los tres nombres a
`destino: {tipo:'horas-extras'}`.

- ⚠️ **Sofi quedó AFUERA a propósito** (no estaba en la lista de Bruno). Hasta el 30-ago la rutina la
  nombraba: era justo el caso que el pedido venía a arreglar.
- ⛔ **Gerardo Tamayo no tiene cuenta en el monitor**: si algún día hace horas, el link se le pasa
  por afuera, porque no hay perfil donde tildarlo.
- **Los oráculos que se corrieron** (⛔ ninguno es «lo vi en la pantalla»): el padrón quedó en
  **16 usuarios y 16 con contraseña**, igual que antes de guardar —es lo único que detecta el borrado
  silencioso de contraseñas—; cada link se cruzó contra la fila de esa persona en la base del
  dashboard; el `manual_id` de la rutina quedó **intacto**; y `/horas/<token>` se abrió **en el
  navegador, sin sesión** (salió «Hola, Camila» con su carga vieja del 31/07).
- **El control de dos lados en la ficha de Organización**: a **Cami Budek** (tildada) la rutina le
  aparece; a **Sofi** (sin tildar) ⛔ no —con una rutina suya visible en el mismo barrido, que es lo
  que prueba que la lista no estaba ciega—.
- ✅ **La novedad ya está escrita y cargada como BORRADOR**: `n1788116275709_u56o8j`, «Tus horas
  extras las cargás vos», destino `horas-extras` (⇒ le llega **sólo a las cuatro**, y la lista se
  ajusta sola) y **sin `importante`** —las 15 publicadas están las 15 en importante, y si todas
  frenan, ninguna frena—. ▶️ **Queda el click de Bruno en Publicar.**
- ✅ **Y el botón se renombró a «Cargar horas extras»** (era «Cargar mis horas») y pasó a ser un
  botón de verdad: ver el 🔴 de `ButtonLink` en la ficha de la Agenda.

### 🆕 🔴 ▶️ El modal de la Agenda dice «— sin manual —» en 75 de 75 rutinas (30-ago-2026)

Salió de caminar lo de arriba. El desplegable **«Cómo se hace»** de `ModalItem.tsx` sólo lista los
manuales **publicados** (`publicados = manuales.filter((m) => m.publicado)`), y hay **1 publicado de
12**. ⇒ **medido: las 75 rutinas activas que tienen manual abren el modal diciendo que no tienen.**

- ✅ **No borra nada solo**, y se verificó: `manualId` vive en el estado y el `onChange` sólo dispara
  si alguien toca el desplegable, así que guardar otro campo lo conserva. Se comprobó guardando el
  destino de «Cargar las horas extras» y releyendo `manual_id` de la base: intacto.
- 🔴 **Pero si lo tocás, no lo podés volver a poner**: el manual que la rutina tenía **no está entre
  las opciones**. ⇒ ⛔ hasta que se publiquen los manuales, editar una rutina y **no tocar «Cómo se
  hace»**.
- ▶️ Se arregla solo el día que se **publiquen los 11 manuales** (ya estaba en la lista de manos de
  Bruno). La alternativa, si eso tarda: que el desplegable incluya el manual que la fila ya tiene,
  aunque esté en borrador, marcado como «sin publicar».

### ▶️ P1 — Cada sección declara, EN LA PANTALLA, qué hace y qué ejecuta

Lo mínimo, en el encabezado de cada sección: **una línea de qué resuelve** y, si tiene botones que
escriben, **qué toca cada uno, dónde, y si se puede volver atrás**.

Cómo hacerlo sin escribir 55 textos sueltos:
- El registro de secciones ya existe y ya está amarrado por `tests/agents-mapa-secciones.test.ts`.
  **Sumarle dos campos obligatorios: `queHace` y `queEscribe`** (este último `null` si la sección
  sólo lee). Un test que exija los dos, igual que hoy exige que la sección figure en el mapa.
- Las acciones de Meta ya tienen la mitad hecha: `lib/meta-ads/acciones.core.js` tiene `rotulo`
  («pausar o activar», «cambiar el presupuesto diario») y `reintentable`. **Falta que eso se lea en
  la pantalla ANTES de apretar**, no sólo en el modal de confirmación. ▶️ Sigue pendiente: la zona
  monta los botones en la fila pero el rótulo y el «¿se puede volver atrás?» se siguen leyendo recién
  adentro del modal. Y en el de presupuesto falta el aviso de si el paso **reinicia el aprendizaje**
  —el dato ya lo calcula `aprendizajeDe()` y se muestra en el «por qué» de la celda, pero no en el
  modal, que es donde se decide.

⚠️ **Esto es lo primero porque es lo que pidió el usuario**, y porque sin esto ninguna de las otras
mejoras se descubre.

### 🏁 P2 — HECHO (26-ago-2026): el motor de reglas está PRENDIDO

**`meta_ads_regla` pasó de 0 a 11 filas.** Las prendió Bruno con el script, verificado por relectura.
El cron de las 07:50 ya no corre en vacío: el simulacro del mismo día deja **4 hallazgos** —
`GIRLHOOD FRIO - INTERESES 1` al 156% del techo, `AD01 - UNBOXING LOCAL` vendiendo dos días después
de pausado, `AD02 - GIRLHOOD COLLECTION` con el CTR 31% abajo, y el radar de Zattia.

🔴 **Y prenderlas destapó dos defectos que ningún test veía, los dos del mismo tipo: un número que
existe pero no significa.** Están contados en `docs/secciones/meta-ads.md`:
1. el **piso derivado de UNA sola compra** ($330.528 en Stunned) dejaba la regla **prendida y muda**;
2. la **fatiga miraba una semana**, donde el desgaste no se ve, y confirmaba con la dirección sin la
   magnitud ⇒ decía «Está quemado» sobre una caída del CTR del **2%**.

🔑 **Los dos los encontró EJERCER —calibrar marca por marca y correr el simulacro—, ⛔ no la suite.**
Es la tercera vez seguida en este módulo.

▶️ **Lo que queda del motor** son los 3 cortes de la tabla de abajo que siguen en 🔴, y **los dos
presets que quedaron afuera a propósito**: `gastos-hormiga` (pide `roas_objetivo`, la vara que este
repo decidió no usar) y `ganador-escalar` (pide `techo_diario_crudo`, que es plata y la firma Bruno).

<details><summary>Cómo se prendieron, y con qué diales</summary>

**El detalle de la calibración (26-ago)**

🔑 **El techo quedó enganchado**: sale de la ficha de rentabilidad de la marca (`desdeFicha`), así
que `cpa_maximo` ya no es un dial huérfano y **el corte principal se prende sin que nadie elija un
número**. Y `leerTechos()` es una sola lectura para los cuatro que la usan. El detalle, la
verificación contra la pauta real y por qué la regla es más exigente que la pantalla:
**`docs/secciones/meta-ads.md`**. Los cortes:

| corte | ¿hay preset? |
|---|---|
| 3 días de gasto con **0 compras** → apagar | ✅ `freno-emergencia` (ventana 3 + `gasto_minimo`) |
| CPA > techo × 1,5 en 5 días → apagar | 🆕✅ `costo-alto` — **el corte principal, ya corre** |
| ≥95% del tope **y** CPA < 75% del techo → escalar +20% | ✅ existe (`ganador-escalar`, corta por COSTO si la marca tiene ficha) — ⛔ **sin prender**: pide `techo_diario_crudo`, que es plata |
| celda de test — **ver «La regla del test» abajo**, corregida por Bruno el 26-ago | 🔴 **no existe**, y antes hace falta poder **marcar una celda como test** — no hay dónde guardarlo |
| CPM del núcleo +15% contra la semana previa | 🔴 **no existe**, y con esta forma no debería: es un tripwire **de la línea** y todos los detectores son por objeto |
| pedidos de Tienda Nube/día contra la meta de Norte | 🔴 **no existe**: cruza fuera de la foto, y correr sólo sobre la foto es lo que hace que las reglas anden **sin token y sin cupo** |

### 🔑 La regla del test — LA VERSIÓN VIGENTE (26-ago-2026, la fijó Bruno)

⛔ **Deroga a la de «$10.000 en UN día · 0 muere · 1 sigue · 2+ aprobado»**, que estuvo escrita en
la memoria de las sesiones y en este archivo. Bruno: *«para mi son dos dias la puerta. 2/3 sigue
4/5 aprobado / 6 escalar»*.

**Plata: $10.000/día × 2 días = $20.000.** Se lee **el 2º día** — el 2º día es el que habla de la
pauta. 🔴 **Manda el TOTAL, no el diario**: se puede bajar el diario estirando los días
($5.000 × 4 días = los mismos $20.000, mismas puertas). ⛔ **Lo que no se puede es bajar el total**,
porque las puertas son cuentas de compras. Medido con Poisson contra el techo de BDI ($7.641):

| presupuesto | total | mata una pieza que está JUSTO en el techo |
|---|---|---|
| $2.000/día × 2 | $4.000 | **90%** — no es un test, es una lotería |
| $5.000/día × 2 | $10.000 | 62% |
| $7.500/día × 2 | $15.000 | 42% |
| **$10.000/día × 2** | **$20.000** | **26%** ← el piso |

**Las puertas, por compras acumuladas al 2º día: 0-1 muere · 2-3 sigue otra tanda · 4-5 aprobado ·
6+ escalar.** Cómo se porta (Poisson, $20.000, techo $7.641):

| lo que la pieza REALMENTE cuesta | muere | sigue | aprobado | escalar |
|---|---|---|---|---|
| $3.400 (44% del techo) | 2% | 14% | 30% | **54%** |
| $5.000 (65%) | 9% | 34% | 35% | 21% |
| **en el techo, $7.641** | **26%** | 47% | 22% | 5% |
| 2× el techo | 62% | 33% | 4% | 0% |
| 3× el techo | 78% | 21% | 1% | **0%** |

🔑 **Un desastre de 3× el techo escala el 0% de las veces** — la regla vieja lo aprobaba el 39%.
✅ **El `1` MUERE — cerrado por Bruno el 26-ago**: *«si es 20mil de gasto y hizo 0 o 1 venta,
muere»*. Se evaluó mover el `1` a «sigue» (bajaba los falsos muertos del 26% al 7%, a cambio de que
una pieza de 2× el techo se llevara una 2ª tanda el 38% de las veces) y **se descartó**. ⇒ **la
regla está COMPLETA: no queda nada abierto en las puertas.** El 26% de falsos muertos es el precio
aceptado, y es el error barato: matar una pieza buena cuesta la oportunidad, escalar una mala quema
plata todos los días.

🔴 **El 1er día de una celda creada ESE MISMO día es PARCIAL y no cuenta.** `TEST IP AZUL BROAD` se
creó el 25-ago y gastó $3.612 de sus $10.000 (36%): su primer día completo fue el 26. Leerlo como
«dos días, 0 compras ⇒ muere» es matarlo antes de que corra el test.

🔑 **«6 compras» y «$2.000 por compra» NO son la misma puerta, y gana la de las compras.** A
$20.000, 6 compras = $3.333 (44% del techo) y $2.000 = 10 compras (26%). Una pieza que de verdad
cuesta $2.000 llega a 6+ el **93%** de las veces pero a 10+ sólo el **54%** ⇒ cortar por
«$2.000 observado» se pierde la mitad de las piezas que hay que escalar. **El costo por compra del
test no es una puerta: dice cuánto AIRE tiene la celda para escalar.** Con la elasticidad medida
(0,54 ⇒ el costo sube con el gasto^0,46), una celda a $2.000 aguanta **18× su presupuesto** antes de
tocar el techo — y el `TOPE_ESCALONES = 6` del código la frena en 3× ($3.308, 43% del techo).
⚠️ Ese 18× es optimista: la elasticidad se midió sobre la cuenta entera, y **una celda sola satura
su público más rápido**. ▶️ Vale revisar el tope para celdas que arrancan muy abajo.
### 🔑 La regla del ESCALADO — la VENTANA no puede cruzar un cambio de presupuesto (3-sep-2026)

**Escalar pide las TRES de siempre** —CPA < 75% del techo, entrega ≥ 85% en días cerrados,
frecuencia que no se esté yendo— **y el paso es de 20% MÁXIMO**, porque cada cambio reinicia el
aprendizaje del conjunto. Esta sección agrega **la cuarta, que es sobre QUÉ DÍAS se miden esas
tres**. ⛔ No deroga nada de arriba.

🔴 **La ventana arranca en el ÚLTIMO CAMBIO DE PRESUPUESTO del objeto, no hace 7 días.** Un cambio
parte la historia en dos regímenes distintos y promediarlos **miente**: da el CPA de un presupuesto
que ya no existe.

**El caso que la fijó — 3-sep-2026, lo objetó Bruno**: *«si se le realizó el escalado días previos,
el análisis tiene que ser cómo rindió luego del escalado previo, no un análisis de ventas de los
últimos 7 días»*. El parte ofrecía escalar **GIRLHOOD FRIO - INTERESES 1** con *«CPA $4.125 = 54%
del techo»*. Se le había subido el presupuesto **el 1-sep** ($8.640 → $10.368, +20%). Los días
cerrados **desde ese escalón** eran dos:

| día | gasto | compras | CPA |
|---|---|---|---|
| 1-sep | $10.800 | 3 | $3.600 |
| 2-sep | $10.763 | **0** | — |
| **desde el escalón** | **$21.563** | **3** | **$7.188 = 95% del techo ($7.595)** |

⇒ **no pasaba el < 75%: estaba al 95%.** El «54%» salía de que la ventana fija se comía el 29 y
30-ago, **anteriores al escalón**, cuando corría a $8.640 y compraba a $1.726 y $3.408. Escalar así
es subirle plata a un escalón **que todavía no devolvió nada**.

🔴 **Y un escalón con menos de 2 días CERRADOS no se lee**: no es que rinda mal, es que **no hay
lectura todavía**. Mismo espíritu que el 1er día parcial de una celda de test.

✅ **Contracaso, el mismo día**: **GIRLHOOD FRIO - COPY B** sí pasó, y por el motivo contrario — su
último cambio fue el **26-ago** (−20% a $8.000) y **nunca se tocó desde entonces**, así que los 7
días del 27/8 al 2/9 son **un tramo homogéneo al mismo presupuesto**: $56.513 / 13 compras =
**$4.347 = 57% del techo**, entrega 101%, frecuencia plana 1,04-1,10. Ésa es la lectura que vale.

🔧 **Está en el código**: `herramientas/parte-del-dia.mjs` del repo `analista-meta`
(`ultimoCambioDePresupuesto`). El parte ahora imprime, debajo de cada candidato, **en cuántos días y
desde qué fecha lo midió**, y contra qué escalón.

🔴 **CORRECCIÓN de la misma tarde**: se escribió acá que «A BAJAR sigue con ventana fija». **Es
falso** — `A BAJAR` se alimenta del MISMO array `cands` que `A ESCALAR`, así que quedó alcanzada por
el cambio sin que nadie lo pidiera. Se vio a las 18:26 del 3-sep porque **dos veredictos de bajada
cambiaron**: FUNDAS MENOS 15MIL pasó de 221% (PAUSAR) a 117% (−20%) —el 221% mezclaba días
anteriores a su propio −20% del 1-sep— y apareció TEST BROAD BDI a 208%. 🔑 **La lección no es el
error de tipeo: es que una ventana compartida propaga el cambio a secciones que no se están
mirando.** ⇒ al tocar `cands`, revisar quién más lo consume.

🔴 ▶️ **ABIERTO, y lo destapó esa propagación: el umbral de PAUSAR (≥150%) NO tiene piso de
observaciones.** Se calibró sobre ventanas de 5-7 días; con la ventana recortada al post-escalón,
**2 días y 1 compra alcanzan para pedir una pausa**. Caso real, 3-sep: `TEST BROAD BDI - 06/05` se
escaló el 1-sep ($6.552 → $7.862) y el parte lo mandó a PAUSAR con $15.771 / **1 compra** = 208%…
mientras que **en los 5 días ANTERIORES al escalón iba a $31.927 / 6 compras = $5.321 = 70% del
techo**. Lo que corresponde ahí ⛔ no es pausar: es **revertir el escalón** (−20%: $7.862 → $6.552),
al presupuesto donde rendía. ⇒ mientras no haya piso, **una pausa medida en menos de 3 días o menos
de 3 compras se lee como "revertir el escalón", no como "matar"**.

⚠️ Sólo se miran los últimos 10 días: si el último cambio quedó fuera de esa ventana, se toma como
que no hubo cambio, que es lo correcto.


### 🔴 REGLA DE INSTRUMENTO — el snapshot tiene una VENTANA CIEGA de 21:00 a 24:00 (3-sep-2026)

**Un cambio de presupuesto o una PAUSA hechos después de las 21:00 hora argentina ⛔ NO quedan
registrados en la foto de ese día.** El monitor sigue mostrando el valor viejo y el objeto sigue
figurando `ACTIVE`.

**Por qué.** `snapshot-meta.mjs` parte las filas en dos lotes: sólo la fila de **HOY** lleva las
columnas de configuración (`CONFIG_COLS` = objetivo, estado, estado_efectivo, estado_real,
**diario_crudo**); las demás van sin ellas, a propósito, para que releer los últimos días no pise el
presupuesto correcto de ayer con el de hoy. Y **`hoyLocal = isoDia(new Date())` usa la hora del
runner, que en GitHub Actions es UTC**. Pasadas las 00:00 UTC (21:00 en Argentina) el script cree
que «hoy» es el día siguiente ⇒ la fila del día que de verdad está corriendo cae en el lote **sin
configuración**, y la fila del día nuevo no se escribe porque Meta todavía no tiene métricas para
una fecha que, en la zona de la cuenta, no empezó.

**Cómo se descubrió, y por qué importa.** El 3-sep a las 22:03 Bruno aplicó un −20% en
`TEST INTERESES 1 - ZATTIA 07/05` ($9.700 → $7.760) y se sacó una foto para verificarlo: seguía
diciendo **$9.700**, y ningún presupuesto de la cuenta figuraba cambiado. 🔑 **La foto no desmentía
el cambio: no podía verlo.** La prueba de que la fila igual se reescribió es que el `spend` de Zattia
del 3-sep sí se actualizó ($5.557 → $7.669) y el `capturado_at` quedó en 01:03Z — **métricas nuevas,
configuración vieja**.

⇒ **Cómo se trabaja mientras esto esté así:**
- ⛔ **Después de las 21:00 no se verifica un cambio de config contra la foto.** Se verifica a la
  mañana siguiente, cuando UTC y la cuenta vuelven a coincidir.
- 🔴 Y al revés, que es lo peligroso: **un `ACTIVE` o un presupuesto leídos en esa franja pueden ser
  de hasta 3 h antes.** Vale para el parte del día y para cualquier regla que se apoye en el estado.
- ▶️ **El arreglo**: `hoyLocal` tiene que salir de la **zona de la cuenta** —`timezone_name`, que el
  propio script ya trae en `me/adaccounts`— y no de la hora del runner.

### 🔑 La FORMA del test — cuántos avisos por conjunto (28-ago-2026)

La sección de arriba dice **cuánta plata y qué puertas**. Ésta dice **cómo se agrupan los avisos**.
⛔ **No deroga nada de arriba**: el total de $20.000 y las puertas por compras siguen mandando.

**De dónde salió.** El 28-ago la consultoría que paga Bruno propuso **testear 3 avisos dentro de un
mismo conjunto** y, si uno se lleva todo el presupuesto, **aislar a los otros dos**. La primera
respuesta de la sesión fue que eso no servía, apoyándose en el *«Meta no reparte: la pieza #1 se
lleva el 80%»* del 26-ago. **Bruno lo objetó: *«esos testeos los hicimos luego de tener aprendizaje
en el CDA, no los arrancamos al mismo momento»*. Tenía razón y la medición vieja estaba
contaminada** — mezclaba dos casos que se portan al revés. Es, además, la misma regla que traía la
consultoría: *«los testeos son siempre en paralelo, nunca meter en uno que ya tenga aprendizaje»*.

🔑 **Re-medido el 28-ago con `scripts/medir-reparto-conjunto.mjs`** —queda para volver a correrlo,
es la partición y no el promedio— sobre `meta_ads_snapshot_dia`, nivel aviso, 11-may→28-ago. De 23
conjuntos con 2+ avisos se descartan **8 censurados** (arrancaron en el 1er día de la foto o antes:
no se sabe cuándo empezaron de verdad). Quedan 15, partidos por **cuándo arrancó cada aviso**, y
mirando **los 2 primeros días**, que es la ventana del test:

| | conjuntos | cuota de la #1 (mediana) | #1 ≥90% | la #2 se quedó con |
|---|---|---|---|---|
| **escalonado** — el aviso se sumó a un conjunto que ya gastaba | 10 | **100%** | **10/10** | **$0 en 8 de 10** |
| **arrancaron juntos** — misma cohorte inicial | 5 | **79%** (min 62%) | 1/5 | ~20% del gasto |

🔴🔴 **El caso escalonado es total: en los 10 conjuntos el incumbente se lleva el 100% de los dos
primeros días.** Poner una pieza nueva al lado de una que ya corre ⛔ **no la testea: no sale al
aire**, y después se concluye «no funcionó» cuando nunca corrió. Casos: la segunda pieza recibió
**$0** en 8 de 10, y **$47** en otro. Precedente: *«el duelo del 15-ago NO OCURRIÓ»*.

✅ **Arrancando juntos es otra cosa: la #1 se lleva 79% y la #2 se queda con ~20%.** ⚠️ Y la
concentración **se agrava con los días**: a 7 días la mediana sube de 79% a 83%. ⇒ **la ventana
corta del test juega a favor.**

🔑🔑 **PARA QUÉ SIRVE EL CONJUNTO COMPARTIDO — lo fijó Bruno el 28-ago, y es lo que ordena todo lo
de arriba:** *«testear de a 2 o 3 sólo sirve para encontrar al ganador, y aislarlo. El resto va a
tener su oportunidad más adelante cuando se cree otro CDA, porque poco presupuesto gastado no quiere
decir que va a morir ahí»*.

⇒ **Es un BUSCADOR, ⛔ no un juez.** La sesión venía tratándolo como un descarte —«¿alcanzan las
impresiones de la #2 para leerle el CTR?»— y esa pregunta **no hay que hacérsela**: a la #2 no se la
lee. La concentración de Meta **es** la selección: se queda con la que puede entregar mejor, esa se
aísla, y las otras vuelven al banco sin veredicto.

**⇒ Lo que queda decidido:**

1. ⛔ **NUNCA sumar un aviso a un conjunto que ya gasta.** Medido: 100% al incumbente, 10 de 10. Esto
   vale para cualquier prueba, no sólo para las formales. Lo que se prueba se arranca **a la par**.
2. ✅ **2 o 3 piezas en un conjunto nuevo, arrancadas el mismo día**, a los $20.000 / 2 días de
   siempre. Con 3 hay más chances de que asome la buena, y ⛔ **no importa** que la #3 se lleve el
   6%: no se la va a leer.
3. 🔑 **El ganador sale con su lectura HECHA.** Se lleva el 79-100% ⇒ **$16.000-20.000 de los
   $20.000**: es prácticamente la celda entera. ⇒ **el buscador no cuesta una celda extra, ES la
   celda** — y a la salida ya tiene compras acumuladas contra las puertas. Después se aísla, y ⛔
   **sin subirle el presupuesto**.
4. 🔴🔑 **Las que no gastaron ⛔ NO MUEREN Y NO SE ANOTAN COMO PROBADAS.** Gastar poco ⛔ no es un
   resultado: vuelven al banco de piezas y les toca **su propio conjunto** más adelante. ⚠️ El
   riesgo operativo es que queden registradas como «testeadas y no funcionó» —ya pasó: *«el duelo
   del 15-ago NO OCURRIÓ»*— ⇒ **al cerrar la tanda hay que dejar escrito que no tuvieron veredicto**,
   no dejar que el silencio se lea como fracaso.
5. ⚠️ **n = 5.** Es lo que hay. Vale para decidir, ⛔ no para dar por cerrado; se re-mide cuando haya
   más conjuntos arrancados a la par.

▶️ **Lo que queda ABIERTO y es la pregunta de fondo del método: ¿la que Meta elige temprano es la
que más vende?** La concentración se decide en las primeras horas con señal de **clicks**, ⛔ no de
compras. Que eso sea un buen proxy es **plausible acá** —el desgaste medido en esta cuenta aparece
como CTR cayendo con el CPM clavado— pero ⛔ **no está medido**. Se puede medir hacia adelante:
anotar a quién eligió Meta en cada tanda y comparar con el costo por compra que esa pieza saca
después, ya aislada.

**El rescate** — para el que quiera darle su turno a una pieza que no gastó, ya sea en la tanda de
arriba o en un conjunto viejo que quedó con varios avisos adentro:

- El **ganador se queda donde está** y ⛔ **sin subirle el presupuesto** — subirlo le resetea el
  aprendizaje.
- El que no gastó **sale a conjunto propio**. ⛔ Si son dos, **NO van juntos al mismo conjunto
  nuevo**: se repite el reparto y uno vuelve a quedar mudo. **Uno por conjunto.**
- ⚠️ Y esto ⛔ no es urgente: la pieza que no gastó **no perdió nada**, sigue entera en el banco. El
  turno se le da cuando haya presupuesto libre, no para «cerrarle el caso».
- 🔴🔑 **El aislado ⛔ NO se pauta «con el mínimo».** La consultoría dice mínimo y eso **choca con la
  puerta**: a $3.000/día junta $6.000 en 2 días, saca 0-1 compras y «muere» — **muerto por falta de
  plata, no por malo**, que es el defecto que se está reparando. O va a **$20.000 totales** y le
  corre la puerta, o **se acepta que no tiene veredicto**. Las dos cosas juntas, no. (Mismo
  invariante de arriba: **manda el TOTAL**.)
- 🔴 **Duplicar el conjunto le prende el CATÁLOGO solo** ⇒ chequearlo **antes** de contar el
  resultado, o el aislado no mide la pieza, mide otra cosa.
- 🔴 Vale igual **el 1er día parcial**: el día en que se crea la celda no cuenta.

⚠️ **Lo que la forma ⛔ no arregla: cuánto se le puede creer al ganador.** Sale del conjunto con
$16.000-20.000 encima, así que **sí** tiene lectura contra las puertas — pero $20.000 compran 0-4
compras y la diferencia entre 1 y 3 sigue siendo ruido. Eso ⛔ no lo causa el agrupamiento, lo causa
el **TAMAÑO DE MUESTRA**, y sin más plata por celda no hay forma que lo arregle. Lo que sí baja la
exposición diaria es **estirar el diario** ($5.000 × 4 días, mismos $20.000).

🔴 **Y para el escalado (CBO con los ganadores):** CBO reparte entre conjuntos, pero **adentro de
cada uno sigue valiendo el 79/21**. Además reparte hacia el que ya gana, y hoy **una sola pieza
(`AD02 GIRLHOOD`) es el 52% del gasto de BDI** ⇒ acelera el desgaste de la única pieza que sostiene
la cuenta. Si se va a CBO: 5-6 avisos y **al menos 3 piezas nuevas adentro**.

🔑 **El marco: la forma del test no fabrica piezas.** El cuello medido son las PIEZAS —CTR −42% con
CPM clavado, ninguna pieza virgen, ~$38.000/día libres y ninguna celda nueva esperando—. Ninguna
grilla reemplaza tener **4-6 piezas nuevas con ángulos distintos**.

**Los once renglones que se prendieron**, calibrados contra la pauta real antes de tocar nada. La
columna que importa es **7 días**, que es el ruido que iba a llegar por la mañana; los 90 son casi
todos objetos que ya están apagados:

| línea | preset | dial | saltos 7d | 90d / objetos |
|---|---|---|---|---|
| bdi | `costo-alto` | — | **8** | 25 / 7 |
| bdi | `freno-emergencia` | — | **10** | 59 / 8 |
| bdi | `atribucion-tardia` | — | **10** | 12 / 3 |
| bdi | `fatiga` | `frecuencia_maxima 1.3` | 5 ⚠️ | 15 / 1 |
| bdi | `sin-avisos` | — | 0 | 0 |
| zattia | `freno-emergencia` | — | **6** | 54 / 2 |
| zattia | `atribucion-tardia` | — | **2** | 2 / 1 |
| zattia | `fatiga` | `frecuencia_maxima 1.6` | 4 ⚠️ | 15 / 1 |
| zattia | `costo-alto` | — | 0 | 6 / 2 |
| zattia | `sin-avisos` | — | 0 | 62 / 1 |
| stunned | `sin-avisos` | — | 0 | 8 / 1 |

⇒ **~5 hallazgos por mañana entre las tres marcas.** Es una lista que se lee, ⛔ no un tablero que se
ignora. ⚠️ **Las dos filas de `fatiga` son de ANTES del arreglo de la ventana** —eran casi todas
falsos positivos por caídas del tamaño del ruido— y hoy dan menos: en la corrida del 26-ago queda
**una sola**, `AD02 - GIRLHOOD COLLECTION`, y la de Zattia se cayó sola porque su CTR venía SUBIENDO.

🔑 **Los diales de `fatiga` no son un número elegido: son el CODO de la curva de frecuencia.** En BDI,
`1,2` arrastra 8 avisos y `1,3` deja **exactamente uno — `AD02 - GIRLHOOD COLLECTION`**, que es el 52%
del gasto de la marca. En Zattia la curva es plana de `1,3` a `1,6` ⇒ va `1,6`, el más alto que no
pierde nada.

</details>

▶️ Y una segunda, en la otra pantalla: **Zattia corta contra un techo que hoy no aplica** —su ficha
está cargada a precio de LISTA y la tienda está en liquidación— ⇒ la regla hereda la ficha, que es
como tiene que ser, y **arreglar la ficha arregla la regla**.

🏁 **Y el cartel del bloque vacío dejó de mentir** (26-ago, 4ª tanda): decía «no hay reglas cargadas»
con el texto clavado y siguió diciéndolo la tarde en que se prendieron las once. Ahora el motivo se
**mide** (`silencioDeReglas`): sin reglas · prendidas pero todavía sin correr · corrieron y no
encontraron nada — **sólo la última significa «está todo bien»**, y lleva la fecha de las dos puntas.
El detalle, en `docs/secciones/meta-ads.md`.

### 🏁 P3 — HECHO (26-ago-2026): la zona de Rendimiento

`/meta-ads` es la zona: veredicto por celda contra el techo, el desgaste, el aprendizaje, el cruce
con los pedidos reales y los botones en la fila. El menú bajó de **once entradas a cuatro**
(Rendimiento · Producir · Analizar · Configurar). Detalle y verificación en
`docs/secciones/meta-ads.md`.

🔑 **Y quedó resuelta la tensión que este archivo tenía con la ficha**: aquélla defendía que el parte
fuera un botón (cinco llamadas a Graph, el cupo es un porcentaje) y esto pedía que fuera la pantalla.
**La pantalla no es el parte: es la FOTO** —se pide sola, es barata, tiene 90 días y contesta con el
token vencido—, y el parte quedó siendo el botón que trae el día EN CURSO, que es lo único que sólo
existe en Graph.

### 🏁 P4 — HECHO (26-ago-2026): los hallazgos salen a buscar a Bruno

**Los hallazgos entran al badge del sidebar y al bloque de Inicio**, como noveno aviso derivado
(`avisosDeHallazgo`). ⛔ No hace falta acordarse de entrar a `/meta-ads`, y el clic lleva a la zona
**con la línea puesta**.

🔴 **El agujero estaba medido:** el motor escribió sus primeros cuatro hallazgos a las 07:50 —uno, un
conjunto comprando al **156% del techo**— y a media tarde los cuatro seguían en `nuevo`. Nadie abrió
la sección en todo el día. Es exactamente lo que dice el punto 4 de este archivo: con un solo
operador, **lo que no le llega no existe**.

🔑 **Y ⛔ no contradice el «no hay pantalla nueva de alertas» de la ficha: lo cumple.** No es un
segundo lugar al que entrar — es el contador que ya está en todas las pantallas. Accionar sigue
pasando en un solo lado.

🔴 **Construirlo destapó el tercer «número que existe y no significa» del módulo en dos días:**
`veces` decía «días seguidos» y contaba **filas**, así que un hueco en el medio se leía como racha. De
arreglarlo sale `desde` —cuándo EMPEZÓ—, que es el `ts` del aviso: con la fecha del último renglón el
aviso diría «apareció hoy» todas las mañanas y el «NUEVO» no se apagaría nunca. Detalle en
`docs/secciones/meta-ads.md`. **16 mutantes, 16 muertos.**

🏁 **Y el mail también** (26-ago, 6ª tanda). El reloj de las 07:50 manda un mail después de escribir
los hallazgos. 🔑 **Lleva los ABIERTOS y ⛔ no los de hoy** —si no, un hallazgo del lunes que nadie
accionó desaparece del mail del martes—, y **con cero ⛔ no manda nada**, porque un mail diario que
dice «no hay nada» enseña a no abrirlo. Detalle en `docs/secciones/meta-ads.md`.

🔴 **Va por el MISMO SES que ya usa `areben-mailer`** —lo corrigió Bruno—: dominio verificado, DKIM,
fuera del sandbox, 50.000/día de cuota. ⛔ No hizo falta cuenta nueva ni verificar nada. **El mail ya
se mandó de verdad** con los 4 hallazgos reales.

🏁 **PRENDIDO.** Bruno cargó los 3 secrets y **se verificó CORRIENDO EL WORKFLOW**, ⛔ no la Mac: el
log de la corrida dice `Mail mandado` con su `MessageId`. ⚠️ El `--simulacro` ⛔ no sirve para esto
—sale antes de tocar las credenciales—, así que la prueba tenía que ser una corrida real.
▶️ Falta que Bruno confirme que **llegó a la bandeja y ⛔ no a spam**: es lo único que desde acá no se
puede ver.
⚠️ Lo limpio sería un usuario de IAM con `ses:SendEmail` y nada más, en vez de reusar la clave del
mailer. Es consola de AWS y queda anotado.

### ▶️ P5 — Traducir el idioma

Glosario mínimo y consistente en pantalla: conjunto → «celda/público», `estado_real` → «¿está
entregando?», etc. Barato y se nota enseguida.

### 🆕 ▶️ P6 — Lo que queda de las seis tandas de Meta (30-ago-2026)

Bruno caminó `/meta-ads` entero y salieron seis tandas, **todas en prod y verificadas** (el relato
completo, en `docs/secciones/meta-ads.md`; acá sólo lo que **falta**).

**🔴 Manos de Bruno — caminar la pantalla.** El login pide contraseña, así que esto ⛔ no lo puede
hacer nadie más. Cinco cosas que sólo se ven abriéndola:
1. Que la marca **venga preseleccionada** con la del sidebar, y que si elegís «Todas» a mano **se
   quede** (es el caso que el default en `'todas'` hacía imposible).
2. Que `Hoy •` cambie los **números** y ⛔ no el **veredicto**, y que el cartel de arriba lo diga.
   🏁 **Arreglado el 30-ago (tarde), y era un defecto real que Bruno cazó acá**: *«cambio la fecha
   en rendimiento con hoy, ayer o hace 3 días pero no cambian los resultados»*. La fila de KPIs
   salía **siempre de la foto** —`fusionarVivo` pisaba las celdas y ⛔ no los totales— y además
   «Hoy», «Hoy y ayer» y «7 días» le piden a la foto **la misma ventana**, así que las tres hacían
   el mismo pedido. Relato en la ficha. ▶️ **Falta mirarlo**: que «Hoy» mueva el **Gasto** de arriba
   y ⛔ no sólo la tabla, y que diga «Compras · Meta» en vez de «Pedidos reales».
3. Que la fila mida **un renglón**, que el «⋯» cierre con Escape y clickeando afuera, y que la cara
   del anuncio aparezca (**tarda ~6 s la primera vez**: son 257 piezas).
4. Que el hallazgo de `AD01 - UNBOXING LOCAL` —que es de nivel **aviso**— aparezca **adentro de la
   fila de su conjunto**. Es el caso que prueba el reparto.
5. Que Producir ya ⛔ no te explique Rendimiento.
6. 🆕 **El aire de la ficha de Rentabilidad, que desde el 30-ago sale de la foto**: que BDI diga
   **~1,2× de aire** y ⛔ no 2,7×, que Zattia muestre su ventana terminando el **26** y ⛔ no el 29
   (cada línea tiene su último día cerrado), y que **Stunned muestre el costo SIN aire** —su techo
   es el prestado de BDI—. Y que el aviso «la ficha quedó vieja» aparezca en las dos, con el botón
   **«Emparejar la ficha»**.

**▶️ Lo que queda escrito y ⛔ sin hacer:**
- **`link` → `enlace`: 23 rótulos** en Atención, Canjes y Envíos. 📊 Medido. Está prohibido en
  `VOCABULARIO.md` §1.6 y ⛔ **no** en el test — son tres secciones que esta tanda ⛔ no tocó, y
  barrerlas a medias es peor que no barrerlas.
- **§3 (título = sustantivo, ⛔ no frase) sigue SIN test**, y ⛔ no es un olvido: «¿esto es una
  frase?» ⛔ no lo decide un regex. El proxy barato —un `?` en el rótulo— da **46 casos y la mayoría
  son legítimos** (ayudas en voz de pregunta: «¿De qué marca?»). Un test así **nace rojo sobre lo que
  está bien**, y ése es el que alguien apaga.
- 🏁 **«La pieza más grande es el 32%» era el 52%, y la tarjeta se dibujaba NEUTRA — HECHO el
  30-ago (noche).** La concentración agrupaba los avisos por **nombre exacto**, y el mismo video
  corre con la fecha de lanzamiento cambiada, con el `- Copia` de Meta y con el gemelo de
  Advantage+ (`<base> -  ADV+ -18/8`). Como la tarjeta se pinta de aviso recién a partir del 40%,
  **la marca de riesgo estructural más grande de la cuenta salía en neutro**. Ahora agrupa por
  `firmaDePieza()` y dice **«+N nombres»**, para poder vetar una fusión de un vistazo. 📊 El
  instrumento es `scripts/medir-concentracion-pieza.mjs` y **trae el control adentro**: reproduce
  los 32,0% en 1 caja de BDI 18→24-ago antes de medir nada, y si no le da, para.
  ⛔ **Corrige lo que decía este plan**: *«el arreglo es sumarle `creative{id}`»* ⛔ no arreglaba el
  caso —duplicar un aviso crea un creativo nuevo con id nuevo—. ▶️ **Lo que queda es guardar en la
  foto la firma del CONTENIDO** (`video_id` ‖ `image_hash` ‖ `effective_object_story_id`), que
  `lib/meta-ads/creativos.core.js` ya trae viva de Graph para la Biblioteca. Es **hacia adelante**:
  el nombre va a seguir siendo el respaldo de todo lo anterior al día que se prenda.
  ▶️ **La mano de Bruno**: ver la tarjeta en ~52% con el color de aviso. Y las otras cuatro fusiones
  de BDI ⛔ no están verificadas contra el video — la de GIRLHOOD sí, en prod el 26-ago.
- **El puente MAKETA → «Anuncio nuevo»**: una pieza terminada allá ⛔ no llega sola acá. Hoy el camino
  es Drive → arrastrar. ⛔ No lo cubre ninguna de las dos apps.
- 🏁 **«¿Cuánta plata le compra a gente que YA nos conocía?» — HECHA el 30-ago (tarde).** Era el
  único renglón de código que dejó abierto la caminata de Bruno: su objeción al Embudo —*«contesta
  qué etapa está vacía y esa pregunta ⛔ no tiene una acción del otro lado»*—. Nueva pestaña **«Fría
  vs remarketing»** en Analizar, al lado del Embudo: cruza el `targeting` de cada conjunto con la
  plata de la foto. 🔴 **Son TRES públicos y el tercero es el hallazgo**: «abierto» ⛔ **no es «gente
  nueva»** —Meta elige y le habla a los dos—, y si se lleva la mayoría de la plata el veredicto es
  que la pregunta ⛔ no se puede contestar, **con la mano al lado** (excluir compradores en esos
  conjuntos). Relato en la ficha.
  ▶️ 🔴 **La primera apertura ES la medición**: ⛔ no hay token en el entorno local, así que el
  reparto real de BDI ⛔ **no se midió**. La hipótesis a tumbar es que casi todo esté en «abierto».
- ⛔ **El Embudo NO estaba pendiente, y este renglón estaba mal leído** (corregido el 30-ago-2026).
  Decía *«📊 `meta_ads_etapa` en 0 filas»* como si fuera un módulo que nace mudo. 📌 **Esa tabla es
  el OVERRIDE MANUAL**, y lo dice su propio núcleo (`lib/meta-ads/etapas.core.js`): la clasificación
  sale del `objective` de cada campaña vía `ETAPA_POR_OBJETIVO`, y la tabla sólo guarda **las
  correcciones a mano**. ⇒ **0 filas = nadie corrigió ninguna clasificación**, que es lo esperable y
  ⛔ no un agujero. 🔑 **El cero afirma, y acá afirmaba lo contrario de lo que se le leyó**: el
  tripwire —«que esa tabla se mueva»— sigue en pie, pero mide **cuándo el objetivo miente**, ⛔ no si
  el Embudo tiene datos.
  🏁 **Y al medirlo aparecieron DOS cosas que sí eran trabajo, hechas el 30-ago** (relato en la
  ficha): la **premisa del módulo estaba al revés** —decía que toda la pauta es de la primera etapa
  y el 84% del gasto es de la de compra; el agujero real es **MOFU, en cero**— y el Embudo **se
  moría con el token vencido**, cuando el dato ya estaba en la foto. Ahora tiene respaldo y la
  pantalla dice de dónde salió.
  🏁 **HECHO el 30-ago (tarde): el respaldo está EJERCITADO con el token caído de verdad**, y el
  cartel ya estaba en las dos pantallas —el renglón pedía algo que el código tenía—. 15 tests
  nuevos (`tests/meta-etapas-handler.test.ts`, `tests/meta-de-donde-sale.test.tsx`), **8 mutantes
  muertos**. Lo que ⛔ no veía el test del núcleo son las tres decisiones que **sólo toma el
  handler**: cuándo cae a la foto (sin token, y con Graph caído en **todas** las cuentas — con UNA
  sola caída ⛔ **no**, mezclar los dos censos cuenta una campaña dos veces), qué ventana mira (el
  cierre sale de las filas de **conjunto**) y que lo **diga** (`fuente`/`completo`/`motivo`). El
  token vencido se ejerce como lo manda Meta de verdad: **Graph contestando código 190**, ⛔ no una
  variable de entorno vacía.
  ▶️ **La mano que queda es de Bruno**: abrir el Embudo con el token vencido y ver el cartel
  dibujado. El test ve que la pantalla lo **usa**, ⛔ no que se dibuje.
- **Informes**: 2 filas, las dos **sin publicar**. Se quedó como pestaña y ⛔ no subió al menú. Si en
  un mes sigue en dos, se elimina.
- **«Hoy + ayer + anteayer» como una suma sola** ⛔ no se ofrece: pediría cruzar Graph con la foto por
  celda, y ese gesto ya lo contesta la **tira de días**.

⚠️ **Y un rojo que ⛔ NO es de esta tanda**: `tests/seccion-header.test.ts` falla porque
`organizacion` se registró en `SECCIONES` sin entrada en `DESCRIPCIONES` (commit `e0f4eff`).
Verificado: ya fallaba en `HEAD` antes de tocar nada. ⛔ No se arregló desde acá para ⛔ no pisarle el
texto a la sesión que la está escribiendo — **es una línea en `lib/nav.ts`**.

## 4. ✅ CONTESTADO: se construye PARA BRUNO

**Lo contestó Bruno el 25-ago-2026: «todo para Bruno».** El módulo se construye para que **una sola
persona experta decida más rápido**, ⛔ no para que el equipo pueda operar la pauta sin ella.

🔑 **Y eso reordena la lista de arriba**, porque lo escaso pasa a ser el TIEMPO de esa persona, no
su comprensión:

- **P2 (motor de reglas) y P3 (el parte como pantalla) SUBEN a lo primero.** «Qué hago hoy» es
  exactamente lo que le falta a alguien que ya sabe leer los números.
- **P4 (que salga a buscarte) sube también**: si hay un solo operador, lo que no le llega no existe.
  🏁 **Hecho**: el badge del sidebar y el mail de las 07:50. ▶️ Falta la mano de la key.
- **P1 se angosta**: de las dos mitades —«qué hace» y «qué ESCRIBE»— la que sigue valiendo es la
  segunda. No hace falta enseñarle qué es un conjunto; hace falta que antes de apretar sepa **qué
  se toca, dónde, y si se puede volver atrás**. Es lo que pidió textual.
- **P5 (traducir el idioma) BAJA casi a cero.** Era para un lector no experto y no lo hay.

⚠️ Si algún día entra otra persona a operar la pauta, **P5 vuelve y P1 se ensancha**. Anotarlo acá
antes de rehacerlo.

## 5. Fricción concreta ya detectada (chica, y se arregla sola)

- **`prepararPiezas` exige un aviso modelo en Meta para tomar el copy** (`api/_meta-planes.js`,
  `copyDeCreativo` en `lib/meta-ads/pieza.core.js`). Para estrenar un copy nuevo hay que ir a Ads
  Manager a crear un aviso — que es exactamente la fricción que el usuario señala. ⇒ **Aceptar el
  copy en el pedido** (título, mensaje, descripción, destino, CTA) y dejar el aviso modelo sólo para
  la página y el Instagram.
  📊 **Medido el 26-ago-2026 con `TANDA VIDEOS 26-8` (4 videos)**: la tanda salió con el copy del
  modelo en las 4 y hubo que **editar las 4 a mano en Ads Manager**. Lo que más costó no fue el
  texto: fue el **destino**, que viaja adentro del copy — las 4 nacieron apuntando a
  `/fundas/girlhood-collection/` y dos de ellas iban a otra página (`/productos/stellar-case/` y
  `/new-in/`). ⇒ **el campo que más se paga por no poder mandar es el `link`, no el `message`.**
  🔴 Y las ediciones **quedaron en BORRADOR**: releyendo Graph, Meta seguía teniendo el copy del
  modelo cuando ya se las daba por editadas. ⇒ si el plan aceptara el copy, no habría paso manual
  que se pueda olvidar de publicar.

- ✅ **El memo mostraba el estado de la semana ANTERIOR al cambiar de semana** (reportado por Bruno
  el 29-ago-2026, arreglado el mismo día). El chip, la firma del cierre y el botón «Cerrar la
  semana» viven fuera del esqueleto de carga, así que durante los segundos de la lectura quedaba el
  título de una semana con el estado de otra. ⇒ el dato viaja sellado con su semana (`deLaSemana`)
  y el encabezado acepta `estado: null` = "no lo sé", que dice «Leyendo la semana…» y ⛔ no ofrece
  cerrar. 3 mutantes, 3 muertos. El relato está en `docs/secciones/memo.md`.

- ✅ 🔴 **El post-venta ⛔ no tenía UN SOLO NÚMERO que dijera si está midiendo bien** (30-ago-2026).
  Salió el medidor: **reclamos registrados por cada 100 ventas online**, seis meses, por marca, en
  Reclamos (Administración). El relato entero está en `docs/secciones/reclamos.md` § «El medidor».
  📊 **Lo que se ve al prenderlo, medido contra las dos bases**: BDI tiene **2 reclamos sobre 283
  ventas online de agosto** y **Zattia ⛔ NUNCA registró ni uno** (167 ventas online en agosto, 0
  reclamos, y ninguno en toda la tabla). ⚠️ Eso ⛔ **no es una tasa baja: es que el reclamo que se
  resuelve en un chat ⛔ no deja fila** — y por eso el número sale con los meses de atrás diciendo
  *«todavía no se registraban reclamos»* en vez de un cero, que afirmaría lo contrario.
  ▶️ **Lo que sigue estando trabado por falta de datos**: los cuatro diales de la válvula (§5 del
  plan) y las tres decisiones de Bruno (§6) — el piso del retorno, cuánto vale un cupón y el costo
  operativo. Se destraban con un mes de volumen del alta pública, que es la mitad de Darío.

- ✅ 🔴 **El paso 1 del alta pública: la llave orden + mail** (30-ago-2026). Está en `bdi-catalogo`
  (`api/_verificacion-orden.js`), no acá; el relato entero en `docs/secciones/reclamos.md` § «La
  llave del alta pública». 🔑 **No hubo que traer ningún dato nuevo**: Tienda Nube ya mandaba el mail
  del comprador y `mapOrdenTN` lo tiraba una línea después. ✅ Confirmado en las dos órdenes reales
  de BDI (`?mail_diag=1` → `tiene_mail: true`) y caminado en prod: el mail correcto abre, una letra
  cambiada da 404.
  ✅ **Y se cerró el `GET ?orden=N`**, que estaba abierto a internet: devolvía nombre del comprador,
  lo que pagó, forma de pago, envío, seguimiento y cada producto, por un número **correlativo**, con
  el repo público en GitHub. No era una decisión sino un olvido de una migración ya hecha (quedaban
  dos llamadores). Caminado en prod: sin credencial 403, con credencial 200 como siempre.
  ✅ **Caminado en el navegador el mismo día**: `/postventa?tab=reclamos`, orden 21033, aparece con
  sus 2 productos. Nada que hacer acá.

- ✅ **BKL-01: «Borrador» era un mal nombre y encima tapaba DOS estados** (30-ago-2026). El informe
  pedía llamarlo «Pendiente» ⛔ **y esa palabra ⛔ no se podía usar**: en la misma fila, la columna de
  al lado dice *«Pendientes: anular la venta · devolver la plata»*. Y «Sin revisar» tampoco, porque
  `en_revision` es «Para revisar».
  🔴 🔑 **Y abajo estaba lo que el informe ⛔ no vio**: un **cambio decidido vuelve a `borrador` a
  propósito**, esperando que el cliente pague — las dos poblaciones mostraban el mismo cartel, así
  que renombrarlo plano dejaba el defecto intacto con otro nombre. El discriminador **ya existía**
  (`compensacion`, el mismo que usa `alertasDe`). ⇒ «Sin escribirle» / «Esperando que pague», ⛔ sin
  tocar la base. **5 mutantes, 5 muertos + 1 control vivo.** Relato en
  `docs/secciones/reclamos.md` § «BKL-01».
  ⇒ 🏁 **con esto el informe de post-venta del 30-ago queda CERRADO ENTERO: los 10 BKL contestados.**

- ✅ 🔴 **BKL-05, lo último que quedaba del informe de post-venta: el texto largo rompía la tabla**
  (30-ago-2026). El informe señalaba la columna de **pendientes** —que ya estaba arreglada— y el
  desborde real estaba en la **primera columna**, y ⛔ no lo produce el nombre del cliente: **es la
  alerta**. `<Td>` hereda `white-space: nowrap`, así que sale en una línea indivisible y empuja la
  tabla entera.
  🔴 🔑 **Y lo empeoró un arreglo del MISMO DÍA**: el aviso de D4 pasó a ser el texto más largo del
  módulo —**77 caracteres medidos**, 20 más que el anterior— ⇒ arreglar una cosa alargó el texto
  que rompía otra, y los dos salieron verdes por separado.
  ⚠️ **La barra de acciones ⛔ NO desbordaba**: su div es un flex con `flexWrap` y ahí corta
  flexbox, ⛔ no `white-space` — la primera versión del test la daba por rota.
  ✅ `tests/reclamos-tabla-desborde.test.tsx` lo cuida sobre **toda celda** · **3 mutantes, 3
  muertos + 1 control vivo** · el relato en `docs/secciones/reclamos.md` § «BKL-05».

- ✅ 🔴 **La auditoría de post-venta quedó CERRADA: 19 de 19** (30-ago-2026). El último era **D4**,
  y estaba trabado en **B1**, que Bruno contestó ese día: *«se parte en dos — armar la oferta exige
  la decisión, contestarla siempre se puede»*. El relato entero en `docs/secciones/reclamos.md`
  § «D4».
  🔴 **Lo que estaba vivo**: `liberar-decision` borra la resolución y **deja la oferta en pie a
  propósito**, así que existe la fila con oferta viva y ninguna rama guardada (así quedó R-0022).
  Ahí apretar «Registrar que no aceptó» **apagaba las tres formas que el caso tenía de aparecer** —
  el aviso de la oferta, la columna de mensajes, y el reloj de «hay que decidir», que contaba desde
  `updated_at` y **el propio gesto de anotar el «no» lo ponía en cero**.
  🔑 **Y la premisa falsa estaba escrita en tres lugares**: el núcleo, la nota del historial y **el
  confirm de la pantalla**. ⛔ Sin migración · **18 mutantes, 18 muertos** (2 controles inocuos
  vivos) · **18 de 18 caminado contra la base real de BDI**, 3 filas sembradas y borradas y las 2
  reales intactas.
  ✅ ~~Lo que queda de post-venta no es código: son las decisiones de Bruno (`PISO_RETORNO`, cuánto
  vale un cupón, el costo operativo, y los cuatro plazos)~~ — **las cuatro contestadas el 30-ago**
  (B4/B5/B6/B7), en prod y verificadas; ver la entrada del final de este archivo.
  ▶️ **Lo que sigue abierto es «que alguien lo apriete»**: el módulo tiene **2 filas en BDI y 0 en
  Zattia**, así que casi nada de esto lo tocó una persona.

- ✅ 🔴 **El alta pública, paso 2 y paso 3: la puerta que CREA, y LA PANTALLA** (30-ago-2026). El
  núcleo (`lib/reclamos/alta-publica.core.js`) y el servidor (`api/_reclamo.js`, acción `alta`) están
  y probados; el relato entero en `docs/secciones/reclamos.md` § «El alta pública, paso 2».
  🔑 **Lo que hay que saber**: la verificación del mail corre **en el servidor, adentro del mismo
  pedido que crea la fila** —hacerla en el navegador es no hacerla— y los productos salen de la orden
  verificada, ⛔ nunca del body: el cliente manda **índices**. Las cinco opciones son **familias** de
  motivos y entran por el que ⛔ no afirma lo que el cliente no sabe ni enciende un pendiente (por eso
  «todavía no me llegó» entra por `demora` y ⛔ no por `no_llego`).
  🔴 **Y destapó una CUARTA copia de la regla del portal**: `reemitir-token` acuñaba un link nuevo
  para un cambio ya decidido y contestaba «listo», y el portal después le daba **404 al cliente**.
  ⛔ Sin migración · **31 mutantes, 31 muertos** (2 controles inocuos vivos) · ✅ **caminado contra
  PRODUCCIÓN, 16 de 16** (`node scripts/caminar-alta-publica.mjs`), con una fila sembrada y borrada y
  **las 2 reales intactas**.
  ✅ **Y la pantalla salió el mismo día** (`10fc671` + `a468879`): la puerta es **`/reclamo?m=bdi`**
  (o `m=zattia`), **caminada en el navegador contra producción** con la orden real 21148, 1 fila
  sembrada y borrada. 🔑 Fue **la primera pantalla de postventa que se pudo caminar sin Bruno**, y
  ⛔ no por suerte: **el portal ⛔ no pide login**.
  ⚠️ **STUNNED ⛔ no tiene puerta pública, y ⛔ no es un olvido**: sus reclamos vivirían en la base de
  Zattia, donde el freno «un reclamo abierto por orden» compara `(store, orden_tn)` ⇒ dos órdenes
  con el mismo número le contestarían a una persona **el token del reclamo de otra**.
  ✅ **Y por dónde le llega el link, contestado por Bruno el mismo día**: *«mandan la consulta a
  algún canal de comunicación, y le enviamos el link»* ⇒ **lo pega una persona**, ⛔ no un
  automatismo. La puerta estaba abierta y **⛔ no estaba en ninguna pantalla**: quien contesta el
  canal tenía que saberla de memoria, y ⛔ no había mensaje para mandarla —era el único momento del
  circuito sin texto, porque los doce mensajes **cuelgan de una fila** y acá todavía no hay
  reclamo—. Ahora hay dos botones arriba de «Nuevo reclamo», en Reclamos **y en la pantalla del
  local**, que es quien atiende el canal.
  🔴 🔑 **La mitad útil del mensaje es decir qué le va a pedir la puerta**: el número de pedido **y
  el mail con el que compró**. Sin las dos ⛔ no entra, y el link a secas deja a la persona
  rebotando en el primer paso creyendo que no anda.
  **9 mutantes, 9 muertos** + 1 control vivo. El relato entero en `docs/secciones/reclamos.md`
  § «Por dónde le llega el link».
  ▶️ **De Bruno, más adelante**: sumar el canal de reclamos **al mail de la venta o al de
  post-venta** — decidió dejarlo para después.

- ✅ 🔴 **Las cuatro decisiones que trababan post-venta, contestadas — y prenderlas destapó un
  defecto vivo** (30-ago-2026). B4, B5, B6 y B7 de `docs/postventa-auditoria-2026-08-28.md`. Eran
  política, ⛔ no defectos, y el relato entero está en `docs/secciones/reclamos.md` § «Las cuatro
  decisiones de la auditoría».
  🔴 🔑 **Lo que hay que saber, porque cambia números que ya se muestran**:
  **B4** el piso del retorno pasó de ser un **monto por marca** a un **múltiplo de lo que sale
  traerlo** (`MULTIPLO_PISO_RETORNO = 2`) — el monto fijo vivió en `null` en las dos desde que
  existió y **nunca cambió una cuenta**, porque un corte en pesos al lado del flete envejece solo.
  ⚠️ **`2` da vuelta el caso testigo de BDI**: $12.000 recuperables contra $7.500 de costo pasan de
  «conviene pedirlo» a «apenas empata». Se cambia en una línea.
  **B5** el costo operativo es **$1.500 por unidad** en las dos marcas (`COSTO_OPERATIVO_RETORNO`),
  el parámetro pasó a ser **obligatorio y por unidad**, y el techo de un sano de BDI subió de
  $6.000 a $7.500 ⇒ **se le puede ofrecer más**.
  **B6** el cupón vale **×2** (`MULTIPLO_CUPON`): mueve el techo Y el sugerido, y **avisa sin
  trabar** cuando el monto se pasa. **B7** los cuatro plazos, confirmados como estaban.
  🔴 🔑 **Y el hallazgo, que ⛔ no estaba en el informe: el envío SIN CARGAR valía cero.** La
  pantalla lo aplastaba con `Number(envioVuelta) || 0`, así que «sin cargar» y «traerlo es gratis»
  eran el mismo número. Con el costo operativo en 0 ⛔ **no se veía** —contestaba «no perdés plata
  porque vuelva», que suena a veredicto prudente—; con el costo prendido la misma pantalla pasó a
  decir **«Ofrecele $750»**, o sea **plata sugerida sobre un dato que nadie cargó**. Ahora
  `cuentaDescuento` recibe `number | ''` y contesta `falta: 'envio'`, como ya hacía con el PVP de
  feria. ⚠️ **Un 0 tipeado sigue siendo un dato** —«lo trae al local»— y ahí sí queda el trabajo de
  recibirlo que ofrecer.
  ⛔ **Sin migración** (⛔ no hay columnas nuevas) · **17 mutantes, 17 muertos + 2 controles vivos**;
  🔴 **cinco sobrevivieron a la 1ª tanda y los cinco eran reales**, entre ellos el peor: los casos
  del cupón se medían **contra la propia constante**, así que bajarla a 1 los dejaba verdes.
  ▶️ **Quedan B3** (si «Volver a decidir» borra también los montos) **y B8** (si un cambio sale por
  cadete: `VIAS_CAMBIO` lo sigue ofreciendo y Reclamos lo sacó el 27-ago).
  🔴 ▶️ **NO deployado**: el commit está sin pushear y la pantalla ⛔ no se caminó en el navegador
  —el login pide contraseña—; los tres números que cambian se ven en **Reclamos → Decidir → El
  producto**.

- ✅ 🏁 **B3 y B8: las dos últimas decisiones de post-venta, contestadas ⇒ NO QUEDA NINGUNA**
  (30-ago-2026). El relato en `docs/secciones/reclamos.md` y en la § 3 de
  `docs/postventa-auditoria-2026-08-28.md`, que **queda cerrada entera: las ocho**.
  **B3 · «Volver a decidir» ahora borra la decisión ENTERA.** La línea es **qué se DECIDIÓ contra
  qué se MIDIÓ**: se van los cuatro montos, `costo_caso`, `retorno_sugerido`, `devolver_envio`,
  `destino_prenda`, `via_retorno`, `cupon_codigo` y los dos booleanos del retorno; **se quedan** el
  flete, el PVP de feria, `items_correctos`, el escenario **y la oferta de retención** (eso ya lo
  decidió B1: *«contestarla siempre se puede»*).
  🔴 🔑 **Y se borra el destino POR UNIDAD del jsonb junto con la columna**: `destinoDeUnidad` es
  `item.destino || fila.destino_prenda`, así que borrar sólo la columna dejaba a las unidades con
  destino propio contestando por una decisión que ya nadie sostiene ⇒ **media decisión borrada**.
  📊 **Lo que hizo barata la respuesta**: `DecidirReclamo` ⛔ **no prefila ninguno** de los campos que
  se borran (los ocho `useState` que leen la fila son otros) ⇒ limpiarlos ⛔ no le saca nada a nadie.
  ⚠️ **Hoy ninguno se leía con la decisión soltada** —los cuatro caminos vivos están gateados por
  `compensacion`, por los pendientes o por `estado`— y eso ⛔ **no era razón para dejarlos**: una
  columna que dice «lo que costó el caso» sobre un reclamo sin decisión **afirma**. La invariante
  quedó **fijada por test** (`tests/reclamos-soltar-decision.test.ts`).
  **B8 · un CAMBIO sí sale por cadete** y la diferencia con Reclamos es **a propósito** ⇒ la lista
  se mudó de `ArmarCambio.tsx` a `tipos.ts`, **al lado de `VIAS_VIGENTES`**, con el porqué y fijada
  por test: escritas en dos archivos distintos, el próximo que viera la diferencia la iba a
  «emparejar». 📊 ⚠️ **El dato ⛔ NO pudo contestarla**: **0 cambios en toda la historia de las dos
  bases** ⇒ el cero acá significa «no hay nada medido», ⛔ no «no se usa».
  ⛔ **Sin migración** · **12 mutantes, 12 muertos + 2 controles vivos** (uno tenía el **ancla
  repetida** —estaba en las dos funciones del archivo— y hubo que re-apuntarlo antes de leerlo).
  ▶️ **De post-venta queda SÓLO que se use**: 2 reclamos en BDI, 0 en Zattia.

---

## 🆕 MEDIDAS — el flujo para que las saque el local (1-sep-2026, pedido de Bruno)

### 🏁 DÓNDE QUEDÓ AL CERRAR EL 1-sep-2026

**Construido y en producción** (`cb3ef88` → `62c38ad`), con el relato entero en
`docs/secciones/gen-desc.md`:

- 🏁 La sección se llama **«Descripción y medidas»** (Bruno: *«no me gusta que diga redacción»*).
  ⚠️ Cambió el **rótulo**, ⛔ no la key `gen-desc` ni la ruta.
- 🏁 Las **medidas viven adentro de la fila**, con la tabla `tn_medidas` (migración **corrida en las
  dos bases**), los talles saliendo de las variantes, el ×2 de la cintura del lado del sistema, el
  botón «estira» —que ⛔ no existe en el largo— y el «No lleva tabla» con motivo.
- 🏁 El **bloque que sale a la tienda** reemplaza al de la Tabla de talles vieja, con el vocabulario
  de la guía y sin filas vacías.
- 🏁 Los **tres pedidos de Redacción**: la foto se agranda y son todas · «no aplica» · «+ agregar un
  dato de otra prenda» · y la **palabra propuesta** con su aviso.
- 🏁 El **aviso de la cola**, en tres formas —aprobadas sin publicar · cargadas sin descripción ·
  palabras propuestas—, y **sólo lo ve quien puede publicar**.
- 🏁 Se cerró un agujero que la decisión de Bruno destapó: `gen-talles` ⛔ no tenía sub de publicar y
  las dos que cargan lo tenían tildado ⇒ ese botón les escribía en la tienda viva.
- 🏁 **Novedad publicada** por Bruno (`n1788310480693_vmmg5h`), y el WhatsApp para el equipo quedó
  en `~/Desktop/whatsapp-descripcion-y-medidas.txt`.

🔑 **MEDIDO CONTRA LA BASE DE ZATTIA AL CERRAR** —y esto es lo que dice qué falta de verdad:

| | |
|---|---|
| productos con la ficha empezada | **44** (41 con los 7 campos) |
| **medidas cargadas** | **0** — ⛔ ni una |
| párrafos escritos y aprobados | **0** |
| palabras propuestas | **0** |
| las cargó | **`josefinabatter`**, ⛔ no Bruno |

- 🔑 **El diccionario aguantó 44 prendas reales sin que nadie necesitara una palabra nueva.** Es lo
  que valida haber empezado chico con las propuestas: mover las listas a la base ⛔ no hace falta
  todavía.
- 🔴 **La ficha se usa y las medidas ⛔ no las tocó nadie**: el circuito completo —cargar, escribir,
  aprobar, publicar y **mirarlo en TiendaNube**— sigue sin ejercerlo una persona **ni una vez**. Es
  el único oráculo que vale y sigue pendiente.
- 📌 **5 prendas quedaron con la tela en «no identifico»**: alguien las miró y no supo. Son las que
  hay que volver a mirar, y ese dato ⛔ no existía antes de esta sección.

### ▶️ Lo que queda

1. 🔴 **Que alguien cargue UNA prenda entera y se publique**, mirándola en la tienda. ⛔ Ningún test
   toca el verbo que escribe.
2. ▶️ **Los 7 dibujos de la guía**, subidos al Blob con **pathname fijo** —una vez adentro de 300
   fichas publicadas esa URL ⛔ no se puede mover— y cableados por familia. `diagramaUrl` existe en
   las plantillas viejas y **⛔ ninguna ficha lo publica**; el único cargado es un screenshot en
   `postimg.cc`, que ⛔ no es nuestro.
3. ▶️ **Rehacer `lib/gen-talles/plantillas.ts` contra la guía**, o retirar la Tabla de talles: su
   vocabulario (`Contorno busto`, `Ancho de hombros`, `Tiro`) ⛔ ya no es el que se mide.
4. ▶️ **Importar las 205 tablas ya escritas** en la tienda, clasificando por convención y **marcando**
   las que no coinciden. ⛔ Importar a ciegas mete los dos criterios en la misma columna.
5. ▶️ **Partir `SHORTS` en familia propia**: la guía los mide como pantalón, y su `largo` de pollera
   ⛔ no les sirve.


Sigue a Redacción (`gen-desc`), que Bruno dio por buena: *«descripción está bastante bien, me gusta
lo que vi»*. La pregunta que abre esto es suya: **«¿cómo sería el flujo de medidas para el local que
las saque?»**

### La cola, medida contra la tienda viva el 1-sep-2026

| | |
|---|---|
| publicados de Zattia | **316** |
| ya tienen tabla | **205** — 49 con nuestra firma `AREBEN-TALLES`, **156 escritas a mano** |
| sin ninguna medida | **111**, de los cuales 9 son bags/accesorios ⇒ **102 prendas** |
| de esos 111, con eje de TALLE en las variantes | **13** |
| BDI | ⛔ fuera de alcance: son fundas de iPhone (165 publicados, 0 tablas, 0 talles) |

🔴 **Sólo 13 de los 111 tienen talles: para las otras 89 la tabla es UNA columna de 3-4 números.**
Hoy `GEN_TALLES_PLANTILLAS` arranca con `['S','M','L','XL']` clavados ⇒ le pone al que carga una
grilla de cuatro columnas a una prenda que tiene un solo talle, e invita a inventar tres. El trabajo
real de la cola son **~480 números sobre ~102 prendas**, no 370 productos.

🔑 **Y son DOS caminos, no uno**: 205 productos ya tienen las medidas escritas en el texto de TN y
ésos ⛔ no se vuelven a medir con cinta — se importan (`extraerTabla` + `emparejarMedidas` ya
existen). La cinta es para 102.

### 🔴 La convención — la decisión de Bruno del 1-sep-2026

> **«media prenda apoyada, es como mide el local»**

⚠️ **Pero medido, la convención publicada no es una por prenda: es una por MEDIDA**, y el local ya
la tiene decidida por el uso. Contado sobre las tablas publicadas de Zattia:

| medida | n | apoyada (<45 cm) | contorno (≥45) | lo aclara el texto |
|---|---|---|---|---|
| busto | 39 | **26** | 13 | 2 |
| cintura | 69 | 6 | **63** | 12 |
| cadera | 47 | 2 | **45** | 5 |

⇒ «apoyada para todo» choca con **108 de 116** filas de cintura y cadera ya publicadas, y
convertirlas dividiendo por dos es lo que ⛔ no se puede hacer a ciegas: una faja elastizada apoyada
⛔ no es contorno ÷ 2. ▶️ **Propuesto a Bruno y esperando su confirmación**: apoyada donde el local
ya mide apoyado (busto, ancho, hombros, largo) y **contorno en cintura y cadera**.

🔴 **Y el texto que hoy publicamos dice lo contrario de lo que publicamos.** `GT_M.busto` dice
«Medir alrededor de la parte más ancha del busto» —contorno— mientras 26 de 39 fichas publicaron la
prenda apoyada. La instrucción publicada contradice al número publicado en la misma ficha.

### La bajada de línea son tres cosas, y ninguna es un manual

1. **La etiqueta lo dice en la ficha publicada** («Busto (prenda apoyada)»). Hoy lo aclaran **19 de
   155 filas**: el cliente lee «BUSTO 32 CM» y tiene que adivinar si lo duplica.
2. **El casillero lo dice al cargar, con el dibujo al lado.** 📌 `diagramaUrl` está vacío en 12 de
   las 13 plantillas y el único que hay es un screenshot en `postimg.cc` — ⛔ no es nuestro, y el día
   que lo borren la ficha publicada queda con una imagen rota.
3. 🔴 **Lo que frena es un rango por (medida, familia), no el texto.** Un busto de 64 en un top es un
   contorno tipeado por error y hoy ⛔ no hay nada que lo mire.
   📌 [[feedback_areben_invariante_escrito_no_frena]].

⚠️ **Y por eso la importación de las 205 tablas viejas ⛔ no puede ser ciega**: clasifica por
convención, importa las que coinciden y **marca** las que no, en vez de meter los dos criterios en la
misma columna.

### El flujo propuesto — calcado del de descripciones

1. **La cola dice qué medir y arranca por lo accionable**: 102 prendas, sin accesorios, y con el
   camino de importar separado del de la cinta.
2. **La familia decide qué medidas se piden** — la misma `familiaDe` que ya decide los atributos, ⛔
   no un desplegable de 13 tipos que hoy se adivina por el nombre del producto (`tipoDesdeNombre`).
3. **Los talles salen de las variantes de TN, ⛔ no se tipean.** Sin eje de talle, una sola columna.
4. **Se guarda al tipear, sin botón**, en `tn_medidas`, **una fila por (producto, talle, medida)** —
   igual que `tn_atributos`: sumar una medida ⛔ no es una migración, y queda quién midió y cuándo.
   Teclado numérico y un talle por pantalla: el que mide tiene la cinta en la otra mano.
5. **Publica Marketing**, con el verbo que ya existe (respaldo → CAS → relectura). El local carga,
   Marketing publica — la misma línea que en `gen-desc`; hoy `gen-talles` es sólo `marketing` y sin
   sub-permiso.

### 🔑 La dinámica real, dicha por Bruno el 1-sep-2026

> «hoy miden Camila Quintana y Josefina Batter de Zattia, la dinámica es entra la mercadería al
> depósito, y luego se va la ropa al local. y ahí se hace la descripción y las medidas»

1. 🔴 **La descripción y las medidas son EL MISMO MOMENTO, con la misma prenda en la mano** ⇒ ⛔ no
   pueden ser dos pantallas. Hoy son dos, cada una con su cola y su buscador: Redacción
   (`/tncat/redaccion`) y Tabla de talles (`/tncat/descripciones`). ⇒ **las medidas van ADENTRO de
   la fila de Redacción**, debajo de la ficha: se abre el producto una vez y se contesta todo.
   📌 Es la misma lección que la prenda que pasa una sola vez por la mesa.
2. ✅ **Las dos ya tienen los permisos.** `josefinabatter` y `camilaquintana` tienen `gen-desc` y
   `gen-talles` tildados **desde el día uno**, verificado contra el padrón el 27-ago-2026
   (`tests/nav-estructura.test.ts`). ⚠️ Y hasta ese día **la Tabla de talles no les abría** por el
   guard que resolvía sólo el primer tramo de la ruta: la puerta está abierta hace días y ⛔ no
   entró nadie.
3. 🔑 **El disparador es la llegada AL LOCAL, ⛔ no el alta en TiendaNube** — y el sistema lo puede
   saber. Gestión Nube trae el stock separado `local` / `deposito` por variante, y está medido
   (31-jul-2026, `lib/tncat/stock-variante.ts`) que **en Zattia el stock de TiendaNube coincide con
   el Local en el 98%**. ⇒ ⚠️ **Se corrige lo que decía este pendiente**: la cola SÍ se puede
   ordenar por lo que está en el local. Medido el 1-sep: de las 111 sin medidas, **110 tienen
   stock** ⇒ están casi todas en el local y la cola nace accionable.
4. ⚠️ **Lo que se queda en el depósito ⛔ no lo mide nadie**: si una prenda no baja al local, no hay
   mano que le ponga la cinta. La cola lo tiene que decir **aparte** —«esperando llegar al local»—
   en vez de mezclarlo con lo que sí se puede hacer hoy. Misma lección que la cola de fotos: 441
   aparentes contra 168 reales.
5. **Dos personas sobre la misma tanda**: se guarda al tipear (ya es la regla de la ficha) y queda
   **quién cargó cada valor** — `tn_atributos.por` ya lo hace y las medidas van igual. El reparto es
   físico (cada una agarra una prenda) ⇒ ⛔ no hace falta reservar nada; lo que sí hace falta es que
   la fila muestre lo cargado al toque, para que no midan dos veces la misma.

### 🆕 ▶️ REDACCIÓN — los tres cambios que pidió Bruno el 1-sep-2026

Salieron de usarla, no de leer el código:

> «no se puede agrandar foto. Principalmente para poder completar información complementaria del
> producto» · «hay un short de ecocuero que tiene puesto como short minis y demás, pero habla de
> tiro y demás» · «capaz ver de no cerrar las opciones, ver la opción de sumar *no aplica*, y poder
> sumar alguna información de otra categoría»

1. ▶️ **La foto se agranda, y son TODAS.** `components/gen-desc/GenDesc.tsx:269` la dibuja en
   **44×55 px** y ⛔ no es cliqueable; `components/ui/Lightbox.tsx` ya existe en el kit (Escape y
   toque para cerrar) ⇒ es reusar. 🔑 **Y la mitad que falta es otra**: hoy se muestra sólo
   `imagenes[0]`, la de portada, y el tajo, el botón, el escote de atrás o el largo real casi nunca
   están ahí. Sin las otras fotos, agrandar la portada ⛔ no contesta «información complementaria».
2. ▶️ **El desajuste del short NO es Tiro: es Calce.** Verificado — `SHORT HILTON`, `SHORT VITTORIA`
   y 12 más están en `SHORTS, MINIS y FALDAS` ⇒ familia `faldas`, cuyo `calce` ofrece palabras de
   pollera (`al cuerpo`, `recta`, `con vuelo`, `plisada`), y un short de ecocuero ⛔ no es ninguna de
   las cuatro. La familia mezcla porque **la categoría de TiendaNube los tiene juntos**. 📌 Medido el
   1-sep-2026: de los **40 publicados** de esa familia, **14 son shorts o bermudas** y 26 son minis,
   polleras y faldas.
3. ▶️ **De los tres pedidos, sólo uno toca la decisión del 27-ago:**
   - **«No aplica»** — entra sin discusión, con el precedente exacto de `TELA_SIN_IDENTIFICAR`: se
     guarda y ⛔ no sale a la ficha. «No tiene» es distinto de «nadie lo cargó», y esa diferencia es
     la que dice si hay que volver a mirar la prenda.
   - **«+ agregar un dato» de otra familia** — ⛔ no rompe nada: el valor sigue saliendo de una lista
     cerrada y lo único que se afloja es **qué se le pregunta** a cada familia, que hoy es la lista
     fija de `FAMILIAS[x].atributos`. Con esto los 14 shorts se arreglan **sin tocar el mapa de
     familias**, y partir `SHORTS` en familia propia queda para el final.
   - 🔴 **No cerrar las opciones** — es exactamente lo que la lista cerrada existe para impedir: con
     texto libre el catálogo deja de poder SUMARSE, que era el motivo de fondo. ⇒ **válvula**: se
     escribe igual y queda **marcado como valor propuesto**, afuera del análisis hasta que Bruno lo
     apruebe; ahí entra a la lista con su palabra, como entraron `bandó` y `volcado`.
     ⚠️ Y el valor propuesto necesita **su propio reloj**: sin un aviso de «hace X días que nadie
     mira esto», la bandeja se convierte en el campo libre por la puerta de atrás.
     📌 [[feedback_areben_freno_sin_valvula]].

▶️ **Orden recomendado**: «no aplica» + «+ agregar un dato» primero (cubren cualquier desajuste de
familia, no sólo el del short), el valor propuesto después, el corte de `SHORTS` al final.

### 🆕 📌 La guía de medidas de Bruno — el PDF (1-sep-2026)

`~/Downloads/TOMA DE MEDIDAS CON GUÍA.pdf`, **9 páginas**. Leída la 1: dibujo técnico de la prenda
**apoyada y plana**, con las flechas `ANCHO`, `LARGO` y `LARGO DE MANGA`, y la lista de a qué prendas
aplica (buzos, sweaters, camperas, blazers, remeras con mangas, tops con mangas) — o sea **nuestra
familia `abrigo` entera más parte de `tops`**.

🔑 **Confirma la convención y además la NOMBRA bien**: la guía dice **ANCHO**, no «contorno de
busto». `GT_M.busto` de `lib/gen-talles/plantillas.ts` dice «Contorno busto / Medir alrededor de la
parte más ancha del busto», que es **otra medida**.

🏁 **Las 9 páginas, leídas el 1-sep-2026.** ⚠️ `brew install poppler` quedó colgado sin escribir una
línea de log; el camino que sirvió es **sin instalar nada**: partir el PDF con Quartz vía
`osascript -l JavaScript` (`PDFDocument`) y pasar cada hoja por `sips -s format png`.

### 🔴 La guía contesta la convención, y de una manera que no habíamos considerado

Página 9, textual: **«CONTORNO DE CINTURA: ESTE SE MIDE AGARRANDO LA CINTURA POR LA MITAD, Y
MULTIPLICANDO POR 2 LA CIFRA MEDIDA.»**

⇒ ⛔ **No hay dos convenciones**: se mide **siempre la prenda apoyada**, y la cintura **se publica
× 2**. Encaja con lo medido en la tienda (busto en media prenda, cintura en contorno): ⛔ no era una
inconsistencia, era la guía. Y explica los **6 casos de cintura por debajo de 45 cm sobre 69**: son
las veces que alguien **se olvidó de multiplicar**.

🔑 **La multiplicación la hace el SISTEMA, ⛔ no la persona.** El local tipea lo que midió y la
pantalla publica el doble ⇒ ese olvido **deja de poder ocurrir**.
📌 Es la misma forma que los bullets: [[feedback_areben_escribir_la_regla_no_el_caso]].

### Las 7 hojas de dibujos, contra qué familia van

| hoja | prendas | → familia |
|---|---|---|
| 1 | buzos, sweaters, camperas, blazers, remeras y tops **con** mangas | abrigo + parte de tops |
| 2 | tops sin mangas, musculosas, chalecos, corsets | tops |
| 3 | jeans, pantalones, **shorts, bermudas** | pantalón |
| 4 | monos | vestidos |
| 5 | minis, polleras largas | faldas |
| 6 | vestidos cortos y largos | vestidos |
| 7 | bodys | tops |

Las páginas **8 y 9 ⛔ no son dibujos de prenda**: son la bajada de línea A/B/C, una para prendas de
arriba y otra para prendas de abajo.

### 🔴 La guía manda partir SHORTS, y ⛔ no van a `pantalon`

Pone **shorts y bermudas con jeans y pantalones**, ⛔ no con minis y polleras ⇒ los 14 shorts de la
familia `faldas` se **miden** como pantalón. Sube «partir SHORTS» de «para el final» a decisión ya
tomada. ⚠️ **Pero tampoco entran en `pantalon` tal cual**: su `largo` ofrece `capri / al tobillo /
al piso`, que a un short ⛔ no le sirve. Es **familia propia**.

### 🔴 Las plantillas de la Tabla de talles hay que REHACERLAS, no ajustarlas

De las 3-4 medidas que pide cada una, entre 2 y 3 ⛔ no son las que la guía mide:

| pide la plantilla hoy (`lib/gen-talles/plantillas.ts`) | mide la guía |
|---|---|
| `Contorno busto` — «medir alrededor de la parte más ancha» | **Ancho**, de sisa a sisa, prenda apoyada |
| `Ancho de hombros` | ⛔ no existe en la guía |
| `Contorno cadera` | **Ancho**, desde donde termina el tiro hasta el lateral |
| `Tiro` | ⛔ no se mide: sólo es la referencia de dónde va el Ancho |
| `Contorno cintura` | ✅ coincide — y la guía dice cómo: mitad × 2 |

⚠️ **Y una consecuencia de forma**: la tabla publicada rotula las filas con letras (`a. Contorno
busto`) y **los dibujos ⛔ no tienen letras** — rotulan con la palabra (ANCHO, LARGO, LARGO DE
MANGA). Publicando el dibujo al lado, las filas pasan a la palabra o el cliente busca una «a» que en
la imagen no está.
