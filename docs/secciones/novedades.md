# Novedades — ficha de sección

Sección `novedades`, área `sistema`. **«Esto cambió, leelo una vez.»** Nació de que los sistemas
avanzan y nadie se entera: grabar un Loom es fricción, así que nadie graba. Está en
`KEYS_PARA_TODOS`; lo que se tilda es el sub `novedades.publicar`.

⚠️ No confundir con **Manuales** —el procedimiento, que no vence— ni con la **Agenda** —«esto va
hoy»—. Ver `docs/secciones/manuales.md`, que es su hermana y comparte handler y parser.

## Dónde vive

`components/novedades/` · `lib/novedades/` (`destino.core.js` es JS plano porque el filtro corre en
el **servidor**; `postergar.ts` es el «Después» de 10 minutos) · handler **`api/_sistema.js`,
compartido con Manuales**, por `datos.js?recurso=sistema` · tablas `novedades` y `novedades_leidas`
**en la base de BDI, sin columna `store`** (una novedad es del sistema) · `sql/migrate-novedades.sql`
+ `scripts/apply-novedades.mjs` · CLI de carga `scripts/novedad.mjs`.

## 🔑 CÓMO SE ESCRIBE UNA NOVEDAD

Esto es lo que más se rompe, y no se rompe en el código. **Antes de escribir una, leer las seis.**

### 1. Primero: ¿quién la va a leer?

Si la respuesta es «Bruno y Darío», **no se escribe**. Regla de Bruno del 13-ago-2026: *«toda
novedad que es para admin no va a novedades, porque se la comento a Darío que trabaja conmigo»*.
🔑 **El filtro es el DESTINATARIO, no el tamaño del cambio**: Liquidación entera —el aplicador de
precios, las tres salidas del sale, el masivo— no llevó ninguna.

### 2. ~600 caracteres, y esa forma está medida

Bruno, 13-ago-2026: *«les cuesta leer, o no lo leen si es muy largo. Tiene que estar lo más resumido
posible»* — dicho de administración, local, depósito y marketing. Una novedad de 2.000 caracteres
bien escrita **no se lee**, y su costo real no es el ancho de la pantalla: es que se pierda **la que
sí importaba**. La forma que quedó:

- una frase de **qué cambia**
- 3-4 renglones de una línea
- un ⚠️ si **frena** algo · un 📌 si hay que **cargar un dato una vez**

### 3. Qué se incorporó, para qué sirve y cómo se usa — nunca cómo está hecho

🔴 La crítica que disparó esta ficha (25-ago-2026): *«la novedad da la sensación de estar enfocada en
mostrar parte de lo que se hizo técnicamente detrás de la funcionalidad»*. El caso real, y sirve de
molde de las dos formas:

| Salió así | Tenía que salir así |
| --- | --- |
| «En **Stock**, «Correr dry-run» sólo mira» | «Verificar diferencias de stock: te dice qué está distinto entre Gestión Nube y la tienda, sin tocar nada» |
| «**Validar verdes** valida de una todo lo confiable: match por SKU exacto o por código de barras» | «**Validar verdes** valida de una todas las que emparejaron con seguridad» |
| «Va **en tandas de 20**, no todas juntas» | «Se escribe de a 20 por vez» |
| «Gestión Nube **no anula ventas por API**» | «Gestión Nube no deja anular una venta desde acá: se borra a mano en su web» |

### 4. El nombre en criollo primero, el término técnico entre paréntesis

Criterio de Bruno, 25-ago-2026: *«me parecería mucho más claro llamarlo directamente «Verificar
diferencias de stock» y, si se quiere incorporar el término técnico, poner «Verificar diferencias de
stock (dry-run)». De esta forma se entiende inmediatamente qué hace la opción, sin necesidad de
conocer previamente el concepto»*. Vale para la novedad **y para el botón**: si la pantalla dice una
cosa y la novedad otra, la novedad no se puede seguir.

🔑 **Y va al revés también**: cuando un botón se renombra, hay que mirar si alguna novedad
**publicada** lo nombra. `n1786628123051_ddvrz6` (13-ago) describe una pestaña que dejó de existir
cuatro días después, y sigue publicada.

### 5. `--importante` sólo si frena el trabajo de quien la recibe

🔴 **Medido el 25-ago-2026: las 15 novedades publicadas están las 15 en importante.** Si todas frenan
con cartel bloqueante, ninguna frena — el cartel dejó de distinguir nada. Una mejora de una pantalla
no es importante; un cambio que hay que hacer distinto **hoy**, sí.

### 6. Se fusiona por PANTALLA, no por commit

Yo dejo una novedad al cerrar cada cambio, así que Agenda juntaba 3 e Inicio otras 3 — para quien
las lee es **una** cosa nueva, no seis. Y **vale el estado FINAL, no el historial**: dos borradores
que se contradicen (45 días, y después 15) publicados juntos le cuentan al equipo un cambio y su
arrepentimiento. El registro de cómo se llegó vive en el repo, no en `/novedades`.

## Reglas que el código no dice

- 🔑 **`paraMi` lo calcula el SERVIDOR.** Filtrar sólo en la pantalla sería peor que no filtrar:
  encendería el badge y frenaría con el cartel igual.
- 🔑 **El destino tiene cuatro tipos** (`todos` · `seccion` · `roles` · `personas`) **y la marca es
  ORTOGONAL a los cuatro** (`marca?: 'bdi'|'zattia'`), no una columna `store`. Ausente = las dos.
  Queda afuera **sólo quien está clavado a la otra marca** (`perfil.cuenta`).
- ⚠️ **`roles` no le llega a quien no tiene ninguno.** Del padrón, Stefania Scolari no tiene rol ⇒
  ninguna novedad por rol le llega jamás. Para incluirla va el destino **por pantalla**.
- 🔴 **El filtro NO se puede verificar entre Bruno y Darío**: los dos son admin y **el admin recibe
  todo por diseño** (salvo `personas`, que se evalúa antes del atajo). Pide un usuario `prueba-*`.
- 🔑 **La versión entra en la PK de `novedades_leidas`**: subirla hace releer **sin borrar** que ya se
  había leído.
- 🔑 **Una importante se marca leída SÓLO con «Entendido»** (`seMarcanAlEntrar` la excluye). Antes,
  entrar a la sección se tragaba la importante **antes de que el cartel existiera** — y el badge
  lleva a la sección, así que el cartel no se disparaba nunca.
- 🔑 **«Después» posterga 10 minutos, no registra nada, y vive en localStorage** keyeado por usuario
  + versión: la lectura es del usuario, posponer es de este navegador y este momento.
- ⚠️ **Entrar a la sección sigue marcando leídas las comunes** aunque queden plegadas. Atarlo a abrir
  la tarjeta suena más honesto y es peor: el badge quedaría prendido para siempre para quien mira la
  lista y decide que nada le hace falta.
- ⛔ **El cuerpo NUNCA es HTML.** Todo el camino está hecho para no tener HTML en ningún tramo — de
  ahí que el repo no tenga sanitizador. Por eso la barra de formato **escribe los caracteres** en el
  textarea en vez de reemplazar al markdown.
- ⚠️ En Config las filas «Novedades» y «Manuales» están en `KEYS_SIN_PERMISO` y **tildarlas no hace
  nada**: están para que los subs `novedades.publicar` y `manuales.editar` tengan dónde tildarse.

## Cómo se carga

```bash
node scripts/novedad.mjs "Título" cuerpo.md [--importante] [--destino=…] [--marca=…] [--id=n…] [--dry]
node scripts/novedad.mjs --listar
```

- ⛔ **El script escribe en PRODUCCIÓN siempre**, aun desde localhost. `--dry` antes.
- ⛔ **No hay `--publicar`, y es deliberado**: el handler ignora cualquier `estado` que venga en el
  body. Una novedad nace borrador y la publica Bruno de un click.
- El cuerpo va **por ARCHIVO**: markdown con saltos y comillas se escapa mal en `argv`.
- **Borrar un borrador** es `action:'novedad-borrar'` con `id` y el script **no lo expone**: va por
  script descartable, y **por id enumerado** — «borrar todos los borradores» se lleva puestos los
  que se acaban de cargar.

## Lo que ya se rompió acá

- 🔴 **El cartel de las importantes no se disparaba nunca, y era la propia sección.** Cada pieza
  estaba bien por separado y el agujero estaba ENTRE dos: no lo cazaba ningún test unitario, sólo
  mirar la pantalla.
- 🔴 **Una novedad de «local de Zattia» le llegaba al local de BDI**: el rol `local` no distingue de
  qué local se habla. Lo arregló la marca como campo del destino.
- ⚠️ **La hora de la lectura la decide el NAVEGADOR**: `toLocaleTimeString('es-AR')` sin
  `hour12: false` daba «12:36 p. m.». Se vio en prod, no en local.

## Cómo se prueba

`npx vitest run tests/novedades.test.ts tests/markdown.test.ts`. Lo que ningún test ejerce:
**el filtro por destino con un usuario que no sea admin**, y el cartel de una importante — que para
caminarlo hay que **publicarla**, o sea que le aparece en la cara a todo el grupo destinatario.
