# Diseños — ficha de sección

Sección `disenos`, área `compras`. El tablero donde se eligen los diseños que se van a producir:
se cargan las fotos, el equipo las clasifica en cuatro columnas y sale un PDF para decidir. Desde
el 21-ago-2026 tiene además **votación por link**, para que puntúe gente que no entra al Monitor.

Reemplazó a un tablero que vivía en el `localStorage` de cada navegador (`monitor_designboard_v1`):
lo que cargaba una diseñadora no lo veía nadie, y limpiar el navegador borraba todo.

## Dónde vive

`components/disenos/` — `Disenos.tsx` (el tablero, ~480 l.), `VotacionPanel.tsx` (las rondas, desde
adentro) y `VotacionPortal.tsx` (lo que se abre con el link).
`lib/disenos/` — `core.ts` (orden e import), `tipos.ts`, `persistencia.ts`, `pdf.ts`,
`votacion.core.js` (**`.js`**: lo comparten los handlers) y `votacion.ts` (el cliente tipado).
Handlers, todos por `api/datos.js`: `_disenos.js` (`?recurso=disenos`), `_disenos-rondas.js`
(`?recurso=disenos-rondas`, con sesión) y `_disenos-votacion.js` (`?recurso=votacion`, **abierto**).
Tablas: `disenos` (`sql/migrate-disenos.sql`) · `disenos_rondas` + `disenos_votos`
(`sql/migrate-disenos-votacion.sql`, `node scripts/apply-disenos-votacion.mjs`, dual-base).
Tests: `tests/disenos-core.test.ts` · `tests/disenos-persistencia.test.ts` ·
`tests/disenos-votacion.test.ts` · `tests/disenos-votacion-portal.test.ts`.
Ruta pública: `/votacion/<token>`, montada en `app/[[...seccion]]/page.tsx` (`esPortalCliente`).

## ⛔ Lo que comparte con otras secciones

- **`api/blob-upload.js` es de Fundas, Ingresos, las piezas de Meta y Diseños.** El prefijo de
  carpeta (`'disenos'`) es lo único que separa a uno del otro → `api/blob-upload.js:39`.
- **`lib/imagenes.ts` (`imgAThumbYSubir`) lo usan varias secciones.** Diseños le pasa lado 600 (el
  default es 256) porque estas fotos se miran para decidir, no como miniatura.

## Reglas que el código no dice

- 🔑 **Hay DOS votaciones y no se tapan.** Los 👍/👎 de cada tarjeta son el voto rápido de la mesa:
  un contador plano, sin autor, que cualquiera sube. La ronda por link es puntaje **1 a 5** con
  nombre. Antes había una sola y el "traer votos" **pisaba** los 👍/👎 del tablero con el conteo
  online; por eso hoy los resultados de la ronda **no se escriben nunca en el documento del
  diseño** — se calculan al leer, desde `disenos_votos`. Si alguien "simplifica" volcándolos, el
  bug vuelve, y de paso vuelve a mandar el tablero entero (con las fotos) a la base en cada
  refresco.
- 🔑 **El snapshot de la ronda va congelado, y son TRES campos.** `snapshotDeRonda` recorta a
  `{id, name, url}` **en el servidor**, al crear: la `nota` del tablero ("Pros / contras") es un
  juicio interno del equipo y no puede viajar a un link abierto, ni siquiera quedar guardada. Y
  congelado además para que el link abra aunque después alguien saque el diseño del tablero. Mismo
  criterio que la vitrina de canjes → `lib/disenos/votacion.core.js`.
- 🔑 **El promedio sin votos es `null`, no `0`.** En una escala de 1 a 5 un cero no es "sin datos":
  es la peor nota. Quien pinta el resultado dice "sin votos" con todas las letras, y el ranking
  manda esos diseños al final.
- 🔴 **El portal busca el token en LAS DOS bases** (`buscarPorToken`), porque el link no dice de
  qué marca es y el tablero es dual-base. Si mañana se suma una marca, se suma acá también.
- ⚠️ **La ronda no se entera de lo que pase después en el tablero.** Si se agregan diseños hay que
  crear una ronda nueva; el link viejo sigue mostrando los de su snapshot.
- ⚠️ **El link vive 30 días** (`DIAS_TOKEN` en `api/_disenos-rondas.js`) y "Cerrar la votación" lo
  revoca antes. Cerrada, vencida y inexistente contestan **el mismo 404 pelado**: desde afuera el
  link no sirve para averiguar nada.
- ⚠️ **Cualquiera con permiso de la sección borra lo de cualquiera**: no hay subpermisos
  (`disenos.editar` no existe) ni registro de quién confirmó un diseño.

## Lo que ya se rompió acá

- **Hasta el 13-ago-2026 `api/_disenos.js` sólo pedía sesión, no permiso**: cualquier cuenta válida
  —los puestos compartidos incluidos— entraba a las dos marcas y borraba tarjetas ajenas. Está
  comentado en `api/_disenos.js:33` y fijado en `tests/handlers-autorizacion.test.ts`.
- **El tablero entero volvía a la base en cada entrada a la sección**, con las fotos adentro,
  porque el diff arrancaba con el mapa vacío. La siembra de `ultimo.current` **antes** de publicar
  los diseños es lo que lo evita → `components/disenos/Disenos.tsx:56`.
- **Al cambiar de marca mandaba a borrar los ids de la marca anterior contra la nueva.** Mismo
  arreglo.

## Pendiente

- 🔴 **Los blobs de Diseños no se borran nunca.** `CARPETAS_BORRABLES = ['ingresos']`
  (`api/blob-upload.js:69`) y la sección no llama a `borrarDeBlob`: quitar un diseño o vaciar el
  tablero deja el archivo huérfano para siempre. Nadie lo pidió todavía; está acá para que no se
  redescubra.
- ⚠️ **Diseños viejos con la foto en base64.** Si el Blob falla se guarda la data URL embebida
  (`Disenos.tsx:151`). Funciona en todos lados —el portal incluido— pero engorda la fila, y el
  snapshot de la ronda se la lleva puesta.
- ⚠️ La columna `estado` de la tabla `disenos` es un espejo denormalizado que **nadie lee**: el GET
  devuelve sólo `datos`.
- ▶️ **`bdi-catalogo` quedó con la votación vieja huérfana**: `api/votacion.js`, `votar.html` y su
  rewrite en `vercel.json`. Ya nadie los llama desde acá. Borrarlos mata cualquier link viejo que
  siga circulando, así que se decide con Bruno, no de oficio.

## Cómo se prueba

```bash
npx vitest run tests/disenos-votacion.test.ts tests/disenos-votacion-portal.test.ts --reporter=dot
```

El primero fija la barrera de salida (`paraElVotante` con la `nota` adentro, verificando que no
sale) y la aritmética; el segundo, que un token con forma inválida muere en 404 **antes de tocar la
base** — con `createClient` mockeado para que tire si llega.

Lo que los tests **no** ejercen y hay que hacer a mano, con `vercel dev` (no `next dev`):

- **Crear la ronda, copiar el link y abrirlo en una ventana SIN sesión.** Si aparece el login, la
  key no entró bien en `esPortalCliente` (`app/[[...seccion]]/page.tsx`).
- **Votar, recargar y ver que vuelve lo que se puso**, y **votar desde un segundo dispositivo**
  (ventana privada, que estrena `votanteId`) para que sean dos boletas y no una corregida.
- **Cerrar la votación y recargar el mismo link**: tiene que dar 404.
- El oráculo de todo eso es la fila en `disenos_votos` leída **con `pg` directo**, no la pantalla
  que la escribió.
