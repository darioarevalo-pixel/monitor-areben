# Ingresos proyectados — ficha de sección

Sección `ingresos`, área `compras`. **Las importaciones de fundas que están por llegar**: cada una
con sus bloques (un material por bloque), su grilla modelos × diseños con las cantidades, proveedor,
fecha estimada, estado y una galería de fotos y videos del pedido. Reemplazó una planilla que
viajaba por mail entre Bruno y la proveedora.

⚠️ **Es sólo de BDI** (`brands: ['bdi']` en `lib/nav.datos.ts`). Zattia no importa fundas: no hace
falta soportar ni probar la otra marca.

## Dónde vive

`components/ingresos/` (`Ingresos.tsx`, **981 líneas** — leer por rango) · `lib/ingresos/` (`core.ts`
es la lógica pura: grillas, totales, migración de formato) · tests: `tests/ingresos.test.ts`,
`tests/ingresos-gn.test.ts`, `tests/blob-borrar.test.ts`, `tests/blob-upload-sesion.test.ts`.

**No tiene tabla ni handler propio.** Los datos viven en el **KV de bdi-catalogo**
(`https://bdi-catalogo.vercel.app/api/ingresos`, clave `ingresos:<marca>`), por
`leerIngresos`/`guardarIngresos` de `lib/kv/cliente.ts`. Los archivos de la galería van a **Vercel
Blob**, carpeta `ingresos/`, por `api/blob-upload.js` (una de las 12 funciones del plan Hobby).

## ⛔ Lo que comparte con otras secciones

- **`api/blob-upload.js` es de tres pantallas**: Fundas y Diseños (miniaturas por el body), las
  **piezas de Meta Ads** y esta galería (las dos por el camino de cliente). Los topes y formatos de
  cada carpeta están en `CARPETAS_CLIENTE`; tocar el de una sin mirar la otra le cambia el límite a
  alguien que no pidió nada.
- **La tabla de formatos es `lib/media.core.js`**, compartida con Meta Ads (`pieza.core.js` la
  re-exporta con sus nombres de siempre). Un formato nuevo es **una línea ahí**, nunca una lista
  nueva: adentro de Meta llegó a haber tres listas sueltas y agregar un formato en una sola dejaba un
  archivo que la pantalla acepta y el servidor rechaza.
- **La otra mitad de cada importación es Norte** (`docs/secciones/norte.md`): la economía —costo,
  plazos— vive en la base, no en este KV, porque **el GET de este KV está abierto**.
- `useSubirGaleria.ts` es gemelo de `components/meta-ads/piezas/useSubirPiezas.ts`. Un bug del camino
  de subida está casi seguro en los dos.

## Reglas que el código no dice

- 🔑 **Dos permisos, no uno** (`ingresos.nombre` / `ingresos.editar`). El chico existe porque "poner
  el nombre comercial de un diseño" —una anotación, que además decide cómo se va a llamar el producto
  en GN— pedía el mismo poder que borrar una importación entera. `nombre` escribe **desde el Lector**,
  no abre Editar: un "Editar con todo deshabilitado" hay que acordarse de deshabilitarlo campo por
  campo, y el campo que se agregue mañana nace abierto.
- 🔴 **El KV se guarda ENTERO (LWW) con debounce de 600 ms.** Dos personas editando importaciones
  distintas al mismo tiempo se pisan: gana la última en guardar. Es de baja frecuencia y se eligió
  así, pero es la razón por la que no conviene dejar la sección abierta en dos pestañas.
- 🔴 **Sin lectura previa no se guarda nunca** (`cargado`). Es el modo de falla que casi borra el KV
  completo: un guardado optimista sobre una lista vacía se lleva puestas todas las importaciones.
- 🔑 **Sacar un ítem de la galería borra el archivo del Blob, y ESPERA a que el KV confirme.** Es lo
  único de la sección que no se puede deshacer: si el guardado falla, al recargar el ítem vuelve, y
  con el archivo ya borrado volvería roto. Todo lo demás es texto que una recarga repone. El aviso
  viaja por el segundo argumento de `guardar` (`components/ingresos/useIngresos.ts`).
- 🔑 **La foto se achica a 1.500 px antes de subir; el video va tal cual.** El tope de 4,5 MB del body
  no aplica en el camino de cliente, así que achicar no es por el límite: es que la foto de un celular
  pesa 4-8 MB y en la grilla se ve a 84 px. 1.500 es lo que hace que **ampliar sirva** —se subían a
  520 y la lupa mostraba una miniatura estirada— sin bajar cien megas al abrir una importación.
- ⚠️ **Las fotos de los DISEÑOS (las columnas de la grilla) siguen yendo por el camino viejo**:
  miniatura de 480 px por el body, con caída a base64 si el Blob falla. Son muchas y se cargan todas
  juntas; ahí el peso importa más que el detalle. No se unificó a propósito.
- ⚠️ **El "+ link" no es legado**: lo que ya vive en Drive o YouTube no se baja para volver a subirlo,
  y un link externo no ocupa espacio pago. Sacar ese botón sería obligar a duplicar archivos.
- 🔑 **El ✓ "ya está en GN" no es autoridad**: sale del espejo (`lib/ingresos/gn.ts`) y si el ETL no
  llegó, el índice queda vacío y **no se pinta ningún ✓**. Nunca afirma lo contrario, que sería el
  error caro (cargar dos veces un producto que ya está).

## Lo que ya se rompió acá

- 🔴 **La subida de piezas de Meta estuvo muerta en prod** (9-ago-2026) porque `upload()` de
  `@vercel/blob/client` no pasa por `apiFetch` y el header de sesión no viajaba: `exigirUsuario`
  contestaba **403 a un usuario logueado** y el SDK lo traducía a «Failed to retrieve the client
  token». Esta galería sube por el mismo camino y `useSubirGaleria.ts` le pasa el header a mano por
  la opción `headers`. Fijado para los dos hooks en `tests/blob-upload-sesion.test.ts`.
- ⚠️ **`.mov` no contaba como video** (`esVideoUrl` sólo miraba `.mp4`): el ítem nacía con
  `tipo: 'img'` y la galería dibujaba un video adentro de un `<img>` — recuadro roto y ningún cartel
  que dijera por qué. Es el formato que sale de un iPhone, o sea el caso real.
- ⚠️ **Nada borraba del Blob hasta el 19-ago-2026.** Cada foto sacada de una galería quedó arriba
  ocupando lugar desde que existe la sección; el borrado nuevo no las alcanza (no hay quién sepa
  cuáles son). Si el espacio del store empieza a molestar, se limpian con `vercel blob list`.

## Pendiente

- ▶️ **Probar la subida a mano en producción** — un video real de la proveedora, uno pesado (>8 MB,
  que es el que sube por partes) y un `.mov`. Nada de esto se puede ejercer desde los tests.
- ▶️ **Mirar cuánto pesa el store del Blob** cada tanto (`vercel blob list`): el plan Hobby incluye
  una cuota y los videos son el primer consumo real que tiene la cuenta.
- ⚠️ **El `<video>` puede no reproducir un `.mov`** según el códec con que lo exportó el celular. El
  visor ofrece "abrilo aparte ↗" debajo, que es la salida. Si pasa seguido, la respuesta no es
  convertir en el browser: es pedirle `.mp4` a la proveedora.
- ⚠️ **El guardado del KV valida admin del lado de bdi-catalogo** (`api/ingresos.js`), mientras la
  pantalla ya deja escribir a los permisos granulares. Si alguien con `ingresos.editar` y sin admin
  reporta que "no se guarda", el 403 viene del otro repo, no de acá.

## Cómo se prueba

```bash
npx vitest run tests/ingresos.test.ts --reporter=dot        # la lógica pura (grillas, totales, media)
npx vitest run tests/blob-borrar.test.ts --reporter=dot     # quién puede borrar y qué carpeta se firma
npx vitest run tests/blob-upload-sesion.test.ts --reporter=dot  # el header de sesión, los dos hooks
```

Lo que **no** prueba ningún test y hay que hacer a mano, con sesión del Monitor en producción (la
subida pega a `/api/*`, así que `next dev` a secas no alcanza): elegir un archivo con "+ foto" y con
"+ video", ver la fila "Subiendo…" ocupar su lugar en la galería, ampliar el video, y **sacar un ítem
y recargar** — que no vuelva es la mitad que se ve; que el archivo ya no esté en el Blob es la otra.
