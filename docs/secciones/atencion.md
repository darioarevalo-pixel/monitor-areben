# Atención al cliente — ficha de sección

Sección `atencion`, área `local`. Links y mensajes listos para copiar y pegar en Instagram y
WhatsApp, más el buscador de productos de la tienda con el precio de hoy. **Se usa mientras hay
alguien esperando del otro lado**, y esa frase explica casi todas las decisiones de abajo.

Ficha escrita el 23-ago-2026 al sumarle el alta de Faltantes (la sección no tenía).

## Dónde vive

`components/atencion/` (`Atencion.tsx` ~500 líneas · `useAtencion.ts` · `useProductosTienda.ts`) ·
`lib/atencion/` (`core.ts` puro · `modelos.core.js` el parser del menú · `cliente.ts` · `tipos.ts`) ·
handler `api/_atencion.js` por `api/datos.js?recurso=atencion` · tabla `atencion` en la base de cada
marca (`sql/migrate-atencion.sql`).

## ⛔ Lo que comparte con otras secciones

- **`components/pedidos-clientes/AnotarFaltante.tsx`** se monta acá, en dos lugares: el botón del
  encabezado y el `action` del `EmptyState` de «Productos de la tienda». ⛔ Antes de tocarlo, leer
  `docs/secciones/pedidos-clientes.md` — es la misma pieza en las dos pantallas.
- **`BandaPromoHoy`** (`components/agenda/`) con `canal="web"`.
- **`traerAudit`** (`lib/tn-audit.ts`), que también usan las pantallas de Tienda Nube.

## Reglas que el código no dice

- 🔑 **Todo está pensado para el camino corto porque hay alguien esperando.** El foco arranca en el
  buscador, cada fila copia con un clic, las escrituras son **optimistas con vuelta atrás**
  (`useAtencion.persistir`), y el catálogo se baja recién al primer tipeo. Una decisión que agregue
  un paso acá se paga en cada conversación, no una vez.
- 🔑 **Un bloque sin nada no se dibuja, y eso resuelve Zattia sin un solo condicional por marca**:
  Zattia no vende fundas por modelo, así que ese bloque desaparece solo. ⚠️ La excepción es
  «Productos de la tienda», que se dibuja **siempre** aunque esté vacío: es la única señal de que se
  puede buscar un producto, y un buscador que aparece cuando ya sabés que existe no lo usa nadie.
- 🔴 **Un precio viejo es peor que esperar dos segundos.** Por eso el catálogo **no** se persiste en
  IndexedDB y no tiene semilla, al revés que los modelos por marca: una lista de modelos vieja
  sigue llevando a links que funcionan, un precio viejo es un precio que la tienda no cobra. Y los
  despublicados se filtran: su URL pública da 404, y un link roto pegado en un chat es peor que no
  encontrar el producto.
- 🔴 **La banda de promos es la de la WEB, no la del mostrador** (`canal="web"`). Una promo del
  posnet no le sirve a quien está comprando por Instagram, y contestarle que sí es peor que no
  contestar.
- 🔑 **Las dos plantillas se guardan como un item más, con id fijo** (`ID_PLANTILLA_MODELO` /
  `ID_PLANTILLA_PRODUCTO`) para no necesitar otra tabla — y se filtran de la lista al mostrarla. Si
  alguna aparece como un link suelto en la pantalla, ese filtro se rompió.
- 🔑 **Ver no es editar.** Copiar y pegar lo puede hacer cualquiera que vea la sección; tocar la
  lista pide el sub-permiso `atencion.editar`, que es de los que **no se heredan de la función** y
  se tildan a mano. ⚠️ **Anotar un faltante NO pide ese sub**: lo hace cualquiera que esté
  atendiendo, que es exactamente el punto — ver la ficha de Faltantes.
- ⚠️ **Los modelos se traen en el SERVIDOR** (`traerModelos`, tope de 6 s) porque la tienda está en
  otro dominio y no manda CORS. Si no contesta, se cae a la semilla y la pantalla **lo dice**: el
  front distingue «la tienda no contestó» de «esta marca no tiene modelos» a propósito.
- ⚠️ **Un marcador `{asi}` que no existe se deja tal cual, no se borra.** Ver el mensaje `{Modelo}`
  crudo en lo copiado dice qué pasó; un hueco en blanco, no. Pero un valor **vacío** sí se
  reemplaza, y el renglón que queda vacío se cae — es el producto sin precio: mejor una línea de
  menos que un `$0` viajando a un WhatsApp.

## Lo que ya se rompió acá

- 🔴 **13-ago-2026: el gate usaba `puedeVer` pelado y la `store` la elige el request.** Los puestos
  compartidos `local` (clavado a Zattia) y `bdilocal` (a BDI) tienen `atencion` por su función y
  podían pedir la bandeja de la **otra** marca con un `?store=` a mano. En la pantalla no se nota:
  una cuenta clavada no puede cambiar de marca en el header y nunca pregunta por la otra. El
  arreglo es `puedeVerAlguna`, y de los cinco handlers que se corrigieron ese día éste fue **el
  único con efecto medible**. → `api/_atencion.js`, y `tests/handlers-autorizacion.test.ts`.

## Pendiente

- ⚠️ `ProductoTienda` es el nivel **liviano** del payload de audit: no trae stock ni variantes. El
  día que haga falta el stock por talle se pide `{ variantes: true }` y el tipo crece — pesa el
  doble, así que no se hace «por las dudas».

## Cómo se prueba

No tiene test propio de pantalla. Lo que la cubre: `tests/handlers-autorizacion.test.ts` (el 403 y
la cuenta fija) y los tests de `lib/atencion/core.ts` que haya en la suite.

**Lo que hay que ejercer a mano**: buscar un producto y copiar su mensaje (que el precio salga
formateado y sin `$0`), y **cambiar de marca con el buscador escrito** — los productos de la marca
anterior no pueden quedar dibujados, que es lo que sostiene el `estado.marca` de
`useProductosTienda` en vez de un efecto que limpie.
