# Modelos — ficha de sección

Sección `modelos`, área `marketing`. El padrón de las modelos que trabajan con nosotros: quién es
cada una, cómo se la contacta, quién la representa, qué talle usa y cuánto mide. Reemplaza al lugar
donde ese dato vivía hasta hoy, que era **la cabeza de quien estuvo en la sesión** — cuando hay que
armar la próxima producción, la lista de a quién llamar se reconstruye preguntando por WhatsApp.

Lo pidió Bruno el 3-sep-2026, punto 6 de los siete:

> «Sección en monitor de Model Management - fichas - Booker - Portafolio con mejores fotos de la
> modelo con nosotros. Principalmente para análisis. También que se pueda agregar ideas, modelos,
> como si fuese una base de datos.»

y eligió arrancar por **las fichas**. Esto es esa primera mano; el portafolio, el análisis y las
ideas están abajo, en Pendiente.

## Dónde vive

| qué | dónde |
|---|---|
| pantalla | `components/modelos/Modelos.tsx` (el padrón) + `FichaModelo.tsx` (la ficha) + `useModelos.ts` |
| núcleo compartido | `lib/modelos/core.core.js` (JS plano: lo importa el handler) |
| lo tipado y lo derivado | `lib/modelos/core.ts` · `tipos.ts` · `cliente.ts` |
| handler | `api/_modelos.js`, por la puerta **`/api/datos?recurso=modelos`** (límite de 12 funciones de Vercel) |
| tabla | `modelo`, **sólo en la base de BDI** (`sql/migrate-modelos.sql`, `node scripts/apply-modelos.mjs`) |
| tests | `tests/modelos-core.test.ts` · `tests/modelos-handler.test.ts` |

## ⛔ Lo que comparte con otras secciones

🔴 **La normalización del talle y de la altura es de acá, y la usa la SESIÓN DE FOTOS.**
`talleNormalizado` y `alturaNormalizada` nacieron el 3-sep en `lib/sesionfotos/modelo.ts` —cuando la
modelo se tipeaba a mano porque este padrón no existía— y el mismo día se mudaron a
`lib/modelos/core.core.js`. `lib/sesionfotos/modelo.ts` las **re-exporta**, así que `SesionFotos.tsx`
y `gen-desc` no se enteraron. ⇒ **tocarlas toca la descripción de los productos**, que es texto que
lee una clienta. `tests/modelos-core.test.ts` fija con un `toBe` que las dos puntas son **la misma
función**, ⛔ no dos que coinciden.

⚠️ **Hay otro componente llamado `FichaModelo`**, adentro de `components/sesionfotos/SesionFotos.tsx`:
aquél es **el campo de la sesión** (tres inputs), éste es la ficha del padrón. Son distintos.

## Reglas que el código no dice

- 🔑 **La tabla ⛔ NO tiene `store`.** La misma modelo hace las dos marcas, y Zattia no tiene
  service key. Vive en la base de BDI y en ninguna otra; que trabaje sólo para una se dice con
  `marcas`, que es una lista y **vacía quiere decir LAS DOS**. Mismo criterio que `insumo`,
  `agenda_items` y `manuales`. ⚠️ La puerta **sí** valida `store`, porque el permiso es por marca.
- 🔑 **Lo único obligatorio es el NOMBRE, y eso es al revés de la sesión de fotos**, donde lo
  obligatorio es el talle. ⛔ No es una inconsistencia: allá el dato que sirve es el que sale a la
  descripción del producto y el nombre puede no saberse en el momento; acá el nombre **es** la ficha,
  y exigir el talle dejaría sin cargar a la modelo que todavía no vino.
- 🔴 **La normalización pasa en el HANDLER, ⛔ no en la pantalla.** La pantalla es **un** llamador; el
  día que la sesión de fotos o un script den de alta una ficha, el que no normalice mete el talle
  torcido y nada falla. `tests/modelos-handler.test.ts` mira **la fila escrita**, no la respuesta.
- 🔑 **«Directa» se escribe con todas las letras.** Agencia, booker y su contacto vacíos ⛔ no son un
  dato faltante: acá es lo más común. Tres guiones hacen que una ficha completa se lea como una a
  medio cargar.
- 🔴 **Una medida vacía es AUSENTE, ⛔ nunca 0** (`Number('')` es 0). Y lo que cae fuera de rango se
  descarta: es un tipeo, no una persona.
- 🔑 **Los estados son DOS —activa y archivada— y ninguno dice nada sobre la persona.** ⛔ No existe
  «no trabajar más» como estado: ese motivo lo escribe alguien en la nota. Archivada sigue existiendo
  (VOCABULARIO.md §1.4) y por eso ⛔ no se elimina: lo que fotografió sigue en las sesiones.
- ⚠️ **El duplicado avisa y ⛔ no bloquea.** Dos modelos se pueden llamar igual; lo que ⛔ no puede
  pasar es cargar la segunda ficha de la misma persona sin enterarse. El Instagram es la llave
  fuerte, el nombre sin tildes la débil.
- 🔴 **Acá ⛔ NO va plata.** El cachet lo vería todo el que ve la sección, y el permiso de Modelos ⛔ no
  es el de la liquidación. Si tiene que entrar, entra por una puerta con permiso propio, como
  `_costos.js`.
- 🔑 **La altura se previsualiza mientras se tipea** (`170` → «Se guarda como 1,70 m»). Es el único
  campo que se guarda distinto de como se escribe **y que sale a una ficha que lee una clienta**:
  sin ese renglón, el que tipea `95` no se entera de que no se guardó nada.

## Lo que se midió antes de escribirlo

📌 **3-sep-2026, contra las dos bases**: `solicitudes` tiene **11 sesiones en BDI y 0 con modelo
anotada** (la funcionalidad se deployó ese mismo día); en **Zattia la tabla ⛔ no se pudo leer desde
afuera** —RLS, la clave pública no entra—, así que ese 0 significa «no se pudo medir», ⛔ no «no hay».

⇒ **Por eso la pantalla no dibuja ninguna columna medida**: cuántas sesiones hizo, qué vendió lo que
fotografió. Con 0 sesiones enganchadas, cualquiera de esas columnas diría **0 para todas** y un cero
afirma — se leería como «esta modelo no vendió nada».

## Pendiente

- ▶️ 🔴 **El puente con la sesión de fotos: que la sesión ELIJA del padrón** en vez de tipear. Es lo
  que hace que este padrón se llene solo y lo que habilita todo lo de abajo. El encabezado de
  `lib/sesionfotos/modelo.ts` ya lo anticipaba. Mientras no exista, las dos puntas no se cruzan por
  ningún lado: la sesión guarda `nombre` libre y la ficha tiene un `id`.
- ▶️ **El análisis** —«principalmente para análisis», dijo Bruno—: cuántas sesiones hizo cada una y
  cómo vendió lo que fotografió. Depende del puente de arriba; el camino ya existe
  (`talleDeModeloPorSku` cruza por SKU, 79 de 79 medidos en BDI).
- ▶️ **El portafolio** (las mejores fotos con nosotros). Van al Blob, por `api/blob-upload.js` —
  ⛔ ojo: sacar un ítem de una galería **borra el archivo del Blob**, ver `docs/secciones/ingresos.md`.
- ▶️ **Las «ideas»** del dictado: todavía ⛔ no está dicho si son ideas de producción, de looks o de
  modelos a contactar. Hoy entran en la nota de cada ficha. **Es una pregunta para Bruno**, no código.
- ▶️ ⚠️ **Sin caminar todavía**: la sección se deployó sin que nadie cargue una ficha en producción.
  ✅ **La migración YA está corrida en BDI** (3-sep-2026) y verificada **por otro camino que el que
  la corrió**: un GET a PostgREST contesta `200 []` y una tabla inventada contesta 404, que es el
  control. ⇒ lo que falta es sólo cargar una ficha de verdad y ver que quede.

## Cómo se prueba

```bash
npx vitest run tests/modelos-core.test.ts tests/modelos-handler.test.ts --reporter=dot
```

⚠️ **Lo que el test ⛔ NO puede decir**: la base falsa acepta cualquier columna. Que la tabla exista
y **acepte la fila** se prueba guardando una ficha de verdad. La migración
(`node scripts/apply-modelos.mjs`) ya corrió en BDI; es idempotente, así que re-correrla es seguro.
El control de que la tabla existe ⛔ no es la salida del script que la creó: es un `GET
/rest/v1/modelo` contra PostgREST, con una tabla inventada al lado como control negativo.
