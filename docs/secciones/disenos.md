# Diseños — ficha de sección

Sección `disenos`, área `compras`. El tablero donde se eligen las fundas que se van a producir: se
cargan las fotos, el equipo las puntúa por link, y las confirmadas se pasan a una importación de
Ingresos proyectados, que es donde se vuelven una orden.

Tres pestañas, que son los tres momentos de esa dinámica: **Tablero** (probar) · **Votaciones**
(votar) · **Elegidos** (confirmar y mandar).

## Dónde vive

`components/disenos/` — `Disenos.tsx` (el armador: carga, persistencia y pestañas; **no pinta
ninguna tarjeta**), `Tablero.tsx`, `TarjetaDiseno.tsx`, `BarraLote.tsx`, `RevisionRapida.tsx`,
`ReportePDF.tsx`, `Elegidos.tsx`, `VotacionPanel.tsx` y `useResumenRonda.ts`.
`lib/disenos/` — `core.ts` (normalizar, filtrar, ordenar, lote), `tipos.ts`, `persistencia.ts`,
`pdf.ts`, `votacion.core.js` (**`.js`**: lo comparten los handlers) y `votacion.ts`.
El puente a Ingresos vive **del otro lado**: `components/ingresos/PasarAImportacion.tsx` y
`lib/ingresos/puente.ts` (ver `docs/secciones/ingresos.md`).
Handlers, todos por `api/datos.js`: `_disenos.js` (`?recurso=disenos`), `_disenos-rondas.js`
(`?recurso=disenos-rondas`, con sesión) y `_disenos-votacion.js` (`?recurso=votacion`, **abierto**).
Tablas: `disenos` (`sql/migrate-disenos.sql`) · `disenos_rondas` + `disenos_votos`
(`sql/migrate-disenos-votacion.sql`, dual-base).
Tests: `disenos-core` · `disenos-persistencia` · `disenos-votacion` · `disenos-votacion-portal` ·
`ingresos-puente`.
Ruta pública: `/votacion/<token>`, montada en `app/[[...seccion]]/page.tsx` (`esPortalCliente`).

## ⛔ Lo que comparte con otras secciones

- **`api/blob-upload.js` es de Fundas, Ingresos, las piezas de Meta y Diseños.** El prefijo de
  carpeta (`'disenos'`) es lo único que separa a uno del otro.
- **`lib/imagenes.ts` (`imgAThumbYSubir`) lo usan varias secciones.** Diseños le pasa lado 600 (el
  default es 256) porque estas fotos se miran para decidir, no como miniatura.
- **El puente escribe en el KV de `bdi-catalogo`**, que es de Ingresos y también lo lee Norte. Por
  eso vive en `components/ingresos/` y no acá → `docs/secciones/ingresos.md`.

## Reglas que el código no dice

- 🔴 **El resultado de la ronda NUNCA se escribe en el documento del diseño.** Es derivado: vive en
  `disenos_votos` y se calcula al leer. Volcarlo trae de vuelta el defecto de la votación vieja
  —"traer votos" pisaba lo que el equipo había puesto a mano— y además manda el tablero entero, con
  las fotos, a la base en cada refresco. El ★ de la tarjeta sale de `useResumenRonda`, un estado
  aparte, y **por construcción no puede entrar al diff de `ultimo.current`**.
- 🔴 **`normalizarDiseno` (`core.ts`) es lo que evita la regresión más cara.** Las filas viejas
  todavía traen `up`/`down`/`nota` adentro de `datos`; si entraran al estado, el primer `setDisenos`
  los perdería y el diff vería los 37 como cambiados. Las claves viejas **no se borran de la base**
  a propósito: nadie las lee y migrar 37 filas con la nota vacía y los votos en 0 es riesgo sin
  pago.
- 🔑 **`ordenar(…, 'puntaje')` copia la regla de `ranking()`, no la reinventa.** Si divergieran, la
  grilla y la tabla de resultados dirían cosas distintas del mismo lote.
- 🔑 **El promedio sin votos es `null`, no `0`.** En una escala de 1 a 5 un cero es la peor nota, no
  "sin datos". `etiquetaPuntaje` dice **«sin votos»** con todas las letras, y el ranking manda esos
  diseños al final.
- 🔑 **`vista=resumen` existe por PESO, no por gusto.** El snapshot de la ronda congela la `url`, y
  los diseños viejos la tienen en base64: la misma ronda pesa **1.855 bytes** por `vista=resumen` y
  **279.760** por `vista=resultados` (medido el 24-ago-2026 sobre «Ingreso BDI Diciembre»). Como el
  ★ se pide **al entrar a la sección**, hacerlo por la otra puerta costaría esas fotos en cada
  entrada, cada cambio de pestaña y cada cambio de marca. `resumenLiviano` es la misma disciplina
  de whitelist que `paraElVotante`, pero por peso en vez de por privacidad. **Y el listado de
  rondas tampoco manda el snapshot**: devuelve `nDisenos`, que es lo único que la pantalla usaba.
- 🔑 **El resumen viaja pegado a su marca y se descarta al leer si no coincide** (`useResumenRonda`).
  Sin eso, volver de BDI a Zattia con una bajada en vuelo publica el ★ de BDI bajo el rótulo de
  Zattia — el mismo defecto que tuvo el store del ETL.
- 🔑 **La selección del lote se poda a lo visible al LEER, no con un efecto** (`podarSeleccion`).
  Tildar doce, cambiar el chip y apretar "Confirmar los 12" movería doce que ya no se ven.
- 🔑 **El snapshot de la ronda va congelado, y son TRES campos.** `snapshotDeRonda` recorta a
  `{id, name, url}` **en el servidor**, al crear. Congelado además para que el link abra aunque
  después alguien saque el diseño del tablero.
- 🔴 **El portal busca el token en LAS DOS bases** (`buscarPorToken`), porque el link no dice de qué
  marca es. Si mañana se suma una marca, se suma acá también.
- ⚠️ **La ronda no se entera de lo que pase después en el tablero.** Si se agregan diseños hay que
  crear una ronda nueva; el link viejo sigue mostrando los de su snapshot.
- ⚠️ **El link vive 30 días** (`DIAS_TOKEN`) y "Cerrar la votación" lo revoca antes. Cerrada,
  vencida e inexistente contestan **el mismo 404 pelado**.
- ⚠️ **Cualquiera con permiso de la sección borra lo de cualquiera**: no hay subpermisos
  (`disenos.editar` no existe) ni registro de quién confirmó un diseño.
- ⚠️ **`ACCESO_POR_FUNCION` no le da el área `compras` a NINGUNA función**, y el comentario de
  Marketing la excluye a propósito. O sea: Diseños la ven **los admins y quien tenga la tilde a
  mano**. Las 10 personas que votaron la primera ronda entraron por el link público justamente
  porque no pueden entrar a la sección — el link no es un lujo, es el único acceso que tienen.

## Lo que se sacó, y con qué número

Medido con `psql` contra las dos bases el 24-ago-2026, sobre los 37 diseños de BDI (Zattia tenía 0):

| Qué se sacó | El número que lo decidió |
|---|---|
| Los 👍/👎 de la mesa y «Reiniciar votos» | **0 pulgares arriba y 0 abajo**, nunca se usaron |
| La `nota` «Pros / contras» | **0 de 37** la tenían |
| Los órdenes `tildes`/`cruces`/`saldo` | los tres leían `up`/`down` |
| El kanban de 4 columnas | **3 columnas vacías siempre**: los 37 vivían en «Por revisar» |
| Exportar / Importar JSON | legacy del tablero local; «Importar» reemplazaba el tablero **entero para todo el equipo** |
| Los 3 botones de PDF | tres variantes del mismo papel, y los tres imprimían «A favor: 0 · En contra: 0» |

Y lo que se agregó por el mismo motivo: **10 personas habían votado 34 diseños con un ranking de
5,00 a 1,29 y no se había movido ni uno a Confirmado.** No existía el verbo. Ahora existe dos
veces: la barra de lote del Tablero y «Confirmar los N mejores» en la tabla de resultados.

## Lo que ya se rompió acá

- **Hasta el 13-ago-2026 `api/_disenos.js` sólo pedía sesión, no permiso**: cualquier cuenta válida
  entraba a las dos marcas y borraba tarjetas ajenas. Fijado en `tests/handlers-autorizacion.test.ts`.
  ⚠️ Ese test mira el handler entero, **no vista por vista**: si alguien mueve el `puedeVerAlguna`
  abajo de una vista nueva, ningún test avisa.
- **El tablero entero volvía a la base en cada entrada a la sección**, con las fotos adentro, porque
  el diff arrancaba con el mapa vacío. La siembra de `ultimo.current` **antes** de publicar los
  diseños es lo que lo evita → `Disenos.tsx`. Al cambiar de marca, además, mandaba a borrar los ids
  de la marca anterior contra la nueva.
- 🔴 **El aviso del tablero viejo del navegador no se podía callar, y ofrecía duplicar una marca
  adentro de la otra.** «Ahora no» era un `useState` (volvía con cada F5) y `leerLocales()` **no
  distinguía marca** mientras los remotos sí: parado en Zattia —0 diseños— ofrecía subir el tablero
  entero de BDI. El arreglo no fue enseñarle marcas: fue que **el array local no salga del módulo**.
  `persistencia.ts` sólo exporta `contarLocales()` (un número) y `olvidarLocales()`, y
  `tests/disenos-persistencia.test.ts` afirma que `leerLocales`/`localesParaImportar` **no están
  exportadas**. Sin un array que subir, el bug no está arreglado: no se puede escribir.

## Pendiente

- 🔴 **Los blobs de Diseños no se borran nunca.** `CARPETAS_BORRABLES = ['ingresos']`
  (`api/blob-upload.js`) y la sección no llama a `borrarDeBlob`. ⛔ **Y no se puede arreglar de
  oficio**: el snapshot de la ronda congela la URL, así que borrar el blob de un diseño **rompe la
  foto de un link de votación vivo**. Cualquier borrado tiene que mirar las rondas abiertas primero.
- ⚠️ **Diseños viejos con la foto en base64** (9 de 37 en BDI). El Tablero los cuenta en un aviso.
  Falta el verbo de re-subirlos al Blob; adelgazaría el POST del lote, el snapshot de la próxima
  ronda y el PDF.
- ⚠️ La columna `estado` de la tabla `disenos` es un espejo denormalizado que **nadie lee**: el GET
  devuelve sólo `datos`. Con 37 filas no hace falta filtrar en el servidor.
- ▶️ **`bdi-catalogo` quedó con la votación vieja huérfana**: `api/votacion.js`, `votar.html` y su
  rewrite en `vercel.json`. Ya nadie los llama desde acá, y desde este repo **no hay endpoint, ni
  credencial, ni script** para tocarlos. Borrarlos mata cualquier link viejo que siga circulando,
  así que se decide con Bruno, no de oficio.

## Cómo se prueba

```bash
npx vitest run tests/disenos-core.test.ts tests/disenos-persistencia.test.ts --reporter=dot
npx vitest run tests/disenos-votacion.test.ts tests/ingresos-puente.test.ts --reporter=dot
```

Lo que los tests **no** ejercen y hay que hacer a mano, con `vercel dev` (no `next dev`). El oráculo
es `psql` o el `curl` al KV, ⛔ **nunca la pantalla que escribió el dato**:

- 🔴 **Que el tablero NO se re-suba al entrar.** Sólo se ve en Network: entrar, cambiar de pestaña
  ×3, cambiar de marca y volver → **cero POST** a `?recurso=disenos`. Es la interacción entre un
  efecto y una ref: ningún unitario la ve.
- 🔴 **El ★ en las tarjetas sin abrir nada.** Cotejar tres contra
  `select round(avg(p),2) from (select (jsonb_each_text(puntajes)).* from disenos_votos) …`,
  incluida una de 5,00 y una de 1,29, y que los que no entraron a la ronda digan «sin votos».
- 🔴 **Cambiar a Zattia**: tablero vacío, el ★ desaparece, y **ningún DELETE contra Zattia con ids
  de BDI**.
- **El aviso del tablero viejo, con la clave real en el navegador**: «Borrar» → recargar dos veces →
  no vuelve. Oráculo: `localStorage.getItem('monitor_designboard_v1')` → `null`.
- **El lote sobre los 37**: tildarlos, «Confirmar los 37», y que en Network sea **un** POST.
- **«Confirmar los N mejores»** desde la tabla de resultados.
- **El PDF**: la geometría sólo sale impresa. Con una foto en base64, una del Blob y uno de
  `promedio: null` — tiene que decir «sin votos», nunca «★ 0,0».
- **Crear la ronda, copiar el link y abrirlo en una ventana SIN sesión.** Si aparece el login, la
  key no entró bien en `esPortalCliente`. Votar, recargar, y votar desde un segundo dispositivo
  (ventana privada, que estrena `votanteId`). Cerrar la votación y recargar: 404.
- **El puente**: ver `docs/secciones/ingresos.md`, y **empezar por UN diseño, no por 34**.
