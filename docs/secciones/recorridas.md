# Recorridas — ficha de sección

Sección `recorridas`, área `compras`. Los locales de proveedores que hay que visitar y el viaje a
verlos: se cargan en tanda, se arma la recorrida del día ordenada por cercanía, y en la calle se
anota desde el celular qué pareció el local, qué producto interesa, si se compró y qué quedó
prometido. **Reemplazó una nota de texto, los lugares guardados de Google Maps y la cabeza.**

⛔ **No es el PRM.** La ficha del proveedor —su historia, si entrega lo que le pedimos, cómo vendió—
vive en `prm`, área Proveedores. **La ficha larga está en `docs/secciones/prm.md`: leer ésa primero**,
acá va sólo lo propio de la calle.

## Dónde vive

`components/recorridas/` (`Recorridas.tsx` el padrón + los viajes · `Importar.tsx` la carga en
tanda · `Viaje.tsx` la recorrida · `Parada.tsx` la pantalla de la calle · `useRecorridas.ts`) ·
`lib/prm/` (compartido) · `api/_prm.js` (compartido) · las mismas seis tablas de
`sql/migrate-prm.sql`.

## ⛔ Lo que comparte con otras secciones

Todo el dominio y el handler son de `prm`. Ver `docs/secciones/prm.md` § «Lo que comparte».

## Reglas que el código no dice

- 🔴 **La compra NO se carga acá, y es una decisión de Bruno**: *«generalmente las mando vía WhatsApp
  para que lo carguen desde esa app»*. La compra entra al sistema de Ingresos y vuelve **contada**
  por el webhook de la OC — unidades pedidas, contadas, diferencia. Por eso `proveedor_visita.compre`
  es un **booleano** y `que_compre` es texto para acordarse: un monto tipeado al lado de uno medido
  envejece, pero es el que está más a mano, así que es el que se termina leyendo. Atado por test
  (un `monto` mandado a mano no encuentra dónde guardarse).
- 🔑 **`proveedor_interes.precio_visto` es el caso OPUESTO y por eso sí va.** Lo que se ve colgado en
  la galería no lo tiene ningún sistema —no hay OC, no hay factura— y es lo único que contesta
  *«¿me lo subieron?»* seis meses después. Va con `visto_en` al lado y **un precio nuevo es una FILA
  nueva**: pisarlo borra la comparación, que es para lo que existe.
- 🔴 **Toda la recorrida se baja en UN GET** (`action=recorrida`), con los intereses abiertos, los
  compromisos abiertos y la última visita de cada parada adentro. En las galerías de Avellaneda no
  hay señal: moverse entre paradas ⛔ no puede pedir red.
- 🔴 **Lo tipeado en la calle se guarda en `localStorage` mientras se escribe** (`prm:borrador:<parada>`)
  y se limpia **recién cuando el servidor confirmó**. Un formulario que se vacía con un error rojo
  es la última vez que alguien anota algo. ⚠️ **Esto NO es offline de verdad**: una carga en frío sin
  señal no abre nada. Todo acceso a `localStorage` va en try/catch — en una ventana privada tira.
- 🔑 **El orden de las paradas se GUARDA en `recorrida_parada.orden` y ⛔ no se recalcula al abrir.**
  Si se recalculara, tildar una parada movería a las demás de lugar mientras se camina.
- 🔑 **Los locales sin punto van al final Y salen nombrados** (`sinPunto` viaja en la respuesta de
  `recorrida.crear`). Intercalarlos los volvería invisibles: la lista se ve completa y el recorrido
  es peor sin que nadie sepa por qué. Y se dice **al armar el viaje**, ⛔ no cuando la persona está
  parada en la calle mirando la lista.
- 🔑 **El punto SE GUARDA, al revés que en Envíos.** `api/_georef.js` no cachea nada a propósito
  —una dirección de clienta se corrige seguido y el punto viejo le sobreviviría—, pero una galería
  de Avellaneda no se muda. Se guarda el punto **y con qué forma de la dirección se resolvió**
  (`geo_usada`), que es lo que después permite revisar uno sospechoso sin volver a consultar.
  ⇒ Como acá sí se cachea, **editar la dirección borra el punto a mano** (atado por test).
- 🔑 **Que el geocoder esté caído ⛔ no voltea el armado del viaje**: la parada entra sin punto, con
  el motivo escrito. Poder salir a la calle vale más que el orden.
- ⚠️ **Un local recién visitado pasa de `por_visitar` a `visitado` (o a `compro`) solo, y ⛔ nada
  más**: `compro` y `descartado` son decisiones, no observaciones, y no se pisan.
- ⚠️ **El importador muestra SIEMPRE la línea cruda al lado de lo que entendió**, y lo que no entendió
  va listado aparte con su motivo. Un parser que acierta el 90% y no muestra el original hace que
  nadie revise el 10%. La invariante —ninguna línea se pierde— está atada por test.
  📌 **Límite conocido y escrito**: un título de la nota («FLORES - EFICIENCIA EN VIAJES - …») entra
  como candidato y se saca a mano. Es mejor que un parser que adivina encabezados y se come uno real.

## Lo que ya se rompió acá

Ver `docs/secciones/prm.md` § «Lo que ya se rompió»: la provincia clavada del geocoder y el punto
del CSV de Maps que se perdía callado. Las dos salieron construyendo esta pantalla.

## Pendiente

- ▶️ **Falta el primer viaje de verdad.** Todo lo de la calle está probado en test y en el navegador,
  ⛔ no caminando Flores. Lo que más chance tiene de estar mal es el tamaño de los botones y qué se
  ve sin scrollear.
- ▶️ **Punto de arranque de la recorrida**: `recorrida.crear` acepta `desde` pero la pantalla todavía
  no lo manda (sería la ubicación del navegador). Sin él se empieza por el primero en orden de id.
- ⚠️ **Sin novedad, a propósito**: es para admin.

## Cómo se prueba

```bash
npx vitest run tests/prm-core.test.ts tests/prm-handler.test.ts --reporter=dot
```

🔴 **Y a mano, en el celular, que es lo único que prueba lo que importa**: que la foto salga de la
cámara, que los botones se aprieten con el pulgar, y **que cortando la red lo escrito no se pierda**
(escribir, poner el teléfono en modo avión, apretar Guardar, ver el error, volver la red, guardar).
