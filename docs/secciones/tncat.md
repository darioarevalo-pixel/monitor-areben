# Tienda Nube (tncat) — ficha de sección

Sección `tncat`, área `marketing`, las **dos marcas**. Las herramientas que **escriben sobre la
tienda online**: subir fotos y pegarlas al color que va, asignar y sacar categorías, decidir qué se
muestra y qué se esconde según el stock, y la tabla de talles en la descripción.

🔴 **No hay staging ni previsualización de la tienda: todo lo que se aprieta acá sale en vivo, para
el cliente, en el momento.** Y del otro lado no hay historial: lo que se pisa, se pisó.

## Dónde vive

| | |
|---|---|
| panel | `components/tncat/` (11 archivos; los caros: `FotosCard.tsx` **816** · `FichaProducto.tsx` 492 · `ImagenesCard.tsx` 443 · `AsignarCard.tsx` 310) |
| lógica | `lib/tncat/` (16 archivos; `auditoria.ts` **451** · `prioridad.ts` **371** · `cliente.ts` 204) |
| caché del catálogo | `lib/tn-audit.ts` — **no es de esta sección**, lo comparten cinco más |
| servidor que escribe | **ninguno del monitor**: `tn-categorias`, `tn-subir-imagen` y `tiendanube-audit` son de **`bdi-catalogo`** (otro repo, otro proyecto de Vercel) |
| puertas propias | `api/_tn-ignorados.js` y `api/_tn-fotos-verificadas.js`, las dos por `api/datos.js?recurso=ignorados\|fotos-verificadas` |
| base | `tn_ignorados` y `tn_fotos_verificadas`, **una por marca** (`sql/migrate-tn-*.sql`) |
| tests | 9 archivos `tests/tncat*.test.ts`, ~1.330 líneas |

🔑 **No es una pantalla: son CUATRO subáreas**, cada una con su URL y su entrada de sidebar
(`/tncat/fotos` · `/categorias` · `/visibilidad` · `/descripciones`). La subárea sale del **2º tramo
de la URL**, no de una pestaña interna → `components/tncat/Tncat.tsx:24`. Y la cuarta **no es de
tncat**: monta `components/gen-talles/GenTalles`, que es otra sección con su propio permiso.

## ⛔ Lo que comparte con otras secciones

- 🔴 **El servidor que escribe está en OTRO repo.** Cambiar un payload de `lib/tncat/cliente.ts` sin
  el deploy de `bdi-catalogo` del otro lado no falla: **cae al flujo por defecto**. Pasó el
  13-ago-2026 con la acción `desasignar` y **corrió la auto-categorización sobre Zattia**; salió
  gratis de casualidad. Antes de mandar una acción nueva, sondear con `{accion:'…', items: []}`, que
  entra al modo lote y no toca nada.
- 🛑 **NUNCA `curl -X POST` a `tn-categorias` para "probar que anda"**: un POST sin body
  **recategoriza la tienda BDI entera**. La lectura inofensiva es
  `GET .../api/tn-subir-imagen?store=bdi&productos=1`.
- **`lib/tn-audit.ts` es de toda la app**: lo consumen Márgenes, Comisiones, Reposición, Productos y
  Gerencial además de las cards de acá. Tocar el caché o el `bustAudit` los toca a todos →
  `lib/tn-audit.ts:1`.
- **`FotoTn` + `thumb.ts` los usa Canjes** (`PortalFotos`, `Vitrinas`, `PortalVitrina`): un cambio en
  cómo se achica una foto se ve en el teléfono de una creadora.
- **`lib/tncat/puente.ts` lo llenan Comisiones y Liquidación**, que dejan los nombres de la lista de
  sale y navegan a `/tncat/categorias`. Es un singleton de módulo: sobrevive la navegación
  client-side y **no** un reload, a propósito → `lib/tncat/puente.ts:1`.
- `lib/ingresos/gn.ts` importa `norm` de `lib/tncat/matching`, no lo copia.
- Los dominios de la tienda salen de **`lib/tienda.core.js`**, no de acá: `export.ts` y
  `FichaProducto.tsx` los tenían escritos a mano con `www` y hoy son un re-export.
- El `.xlsx` entra y sale **sólo** por `lib/excel.ts` (`write-excel-file` / `read-excel-file`).

## Lo que ya está comentado, y hay que leer antes de tocar

Esta sección está **muy documentada adentro**. La ficha no lo repite: acá va qué mirar con cuidado.

- **Por qué todo va con `apiFetch` y no `fetch`**, y qué endpoint escribe qué →
  `lib/tncat/cliente.ts:1`.
- **Qué detecta la auditoría que el chequeo viejo no veía** (la misma foto en DOS colores) y las dos
  colas —"se arregla acá" vs. "hay que fotografiar"— → `lib/tncat/auditoria.ts:1`.
- **Por qué la unidad es la PUBLICACIÓN y no el producto** (BORDER CASE ensucia 3, PROTECTOR DE
  CÁMARA METALIZADO ensucia 63) → `lib/tncat/prioridad.ts:1`.
- **Por qué el stock por variante NO sale del payload de TiendaNube**, con la medición por marca y
  la cobertura del cruce por código → `lib/tncat/stock-variante.ts:1`.
- **La huella del "Verificado"**: por qué caduca sola y por qué el POST la exige →
  `lib/tncat/verificadas.ts:1` + `api/_tn-fotos-verificadas.js:1`.
- **`ignorados` ≠ `verificadas`**: "no revisar nunca" contra "ya lo miré" → `lib/tncat/ignorados.ts:1`.
- **Las miniaturas pasan por `images.weserv.nl`** (1,3 MB → 9,8 KB) y por qué la foto ampliada no →
  `lib/tncat/thumb.ts:1`.
- **TiendaNube no tiene "quitar categoría"**: se manda el conjunto COMPLETO → `lib/tncat/categorias.ts:1`.
- **El selector de categorías muestra la RUTA**, porque dos categorías con el mismo nombre existen de
  verdad (`JEANS` duplicada en Zattia) → `components/tncat/AsignarCard.tsx:14`.
- **Los dos sentidos de la visibilidad** —ocultar lo agotado y volver a mostrar lo que reingresó— y
  por qué el segundo no lo dispara nadie → `components/tncat/ConStockCard.tsx:13`.
- **Por qué existe la ficha de producto en grande**: nadie puede mirar una foto y decir de qué color
  es → `components/tncat/FichaProducto.tsx:3`.
- **Las tres decisiones que ordenan la pantalla de fotos** (publicaciones, buscador fuera de los
  filtros, verificado que caduca) → `components/tncat/FotosCard.tsx:3`.

## Reglas que el código no dice

- 🔴 **El permiso NO alcanza con estar logueado, y hasta el 15-ago-2026 sí alcanzaba.** Los dos
  handlers de acá estaban entre los nueve que pedían sesión y no permiso (`37dcc14`): con la
  contraseña del puesto compartido `Depósito` se podía **marcar "verificado" sin mirar**. Cualquier
  handler nuevo de la sección va con `exigirUsuario` **y** `puedeVerAlguna`.
- 🔴 **`tn_fotos_verificadas` tiene RLS PRENDIDO y sin políticas** —es la única así de las tablas
  viejas del monitor— y por eso **en local no se puede reproducir**: el `.env` del repo no trae
  `ZATTIA_SUPABASE_SERVICE_KEY`, y con la anon la consulta no falla: **devuelve `[]`**. Eso se lee
  como "nadie verificó nada" y manda a arreglar lo que no está roto. 🔑 **Para mirar de verdad, la
  puerta de prod**: `GET https://monitor.arebensrl.com/api/datos?recurso=fotos-verificadas&store=…`
  con el header `x-monitor-auth` (el que arma `scripts/lib/kv-auth.mjs`).
- 🔑 **Medido el 16-ago-2026 contra prod**: hay **18 verificadas en BDI y 91 en Zattia**, todas de
  Darío y **ninguna posterior al 31-jul**. O sea que Vercel **sí** tiene la service key de Zattia
  (eso quedaba en duda desde `dfb58f0`), y que el repaso visual está parado hace dos semanas.
- 🔑 **`tn_ignorados` está VACÍA en las dos marcas** (medido el mismo día): "apartar un producto de la
  revisión" está construido, con su puerta y su tabla, y **no se usó nunca**. Antes de tocarlo,
  preguntar si hace falta.
- 🔑 **`categorias` es sólo de BDI y `asignar` sólo de Zattia**, y no es una restricción de permisos:
  la auto-categorización por modelo de iPhone no tiene sentido en Zattia, y el Excel de nombres es
  el flujo de los sales de Zattia. El componente lo chequea por `marca`, no por perfil.
- ⚠️ **"Explorar categoría" escribe en la tienda y NO tiene sub-permiso propio**: entra con
  `categorias` (BDI) o con `asignar` (Zattia), o sea que se hereda del que sí lo tiene.
- 🔑 **Una foto que no carga se ve igual que un color sin foto** — por eso `FotoTn` cae sola a la
  original si el optimizador no contesta: sin ese respaldo, un problema de red se lee como un
  problema del catálogo y manda a fotografiar de nuevo algo que ya está.
- ⚠️ **Los filtros de stock y ventas dependen del ETL**, que carga aparte y tarda: hasta que llega
  quedan atenuados. Un cambio que los prenda antes vuelve a mostrar "0 problemas" mientras carga.

## Lo que ya se rompió acá

Todos los modos de falla de esta sección son **el mismo**: la pantalla dice que está todo bien
cuando en realidad **no pudo mirar**. Es la única sección donde ese error llega al cliente final —
cada combinación color × modelo es una publicación distinta en Mercado Libre.

- **Un tablero en cero decía "está todo bien"** (`936e3dd`): el error del catálogo se comía en un
  `catch {}`. Y del otro lado, "sólo con stock" viene tildado por defecto y podía esconder todo lo
  roto. Hoy distingue "no hay nada" de "está filtrado".
- **Verificar un producto roto lo escondía y le bajaba el número al tablero** (`82a9966`). La regla
  que quedó: **"Verificado" esconde lo que el ojo resolvió, no lo que el sistema ya PROBÓ que está
  roto** → `components/tncat/FichaProducto.tsx:75`.
- **Los productos sin ninguna foto se habían vuelto invisibles** (`415462c`): "está roto" miraba sólo
  los colores, y un producto sin colores ni fotos salía sano. Volvió como estado propio
  (`sinNingunaFoto`, `lib/tncat/auditoria.ts:180`) y pesa en el orden por sus variantes.
- **No poder leer las revisiones dejaba el trabajo hecho como trabajo por hacer** (`fa21f41`).
  🔑 Los dos lados fallan distinto **a propósito**: `leerVerificadas` **avisa**, `leerIgnorados` falla
  callado — no poder leer los apartados muestra productos **de más**, que es el lado seguro.
- **Chequeaba el nombre de la variable, no si la clave servía** (`babd080`): en Vercel la service key
  puede estar cargada como `SUPABASE_KEY` a secas. Se mira el **rol adentro del JWT**.
- **El mismo producto tenía dos direcciones** según de qué pantalla saliera (`9fdd945`): `www` acá,
  apex allá. Dejó de ser inocuo cuando Atención empezó a mandar el link por WhatsApp.

## Pendiente

- ▶️ **La variante suelta no se puede ocultar**: TiendaNube sólo expone `published` a nivel producto.
  `VariantesSinStockCard` es la lista de trabajo **para hacerlo a mano** en el panel de TN; no es una
  pantalla a medio hacer. Si TN algún día lo permite, ahí entra el botón.
- ▶️ **El repaso visual está parado desde el 31-jul** y las dos colas siguen ahí. No es deuda de
  código.
- ⚠️ **Chequeo de permiso por acción, diferido** (del cierre de `bdi-catalogo`): hoy el portero de
  allá sólo verifica que estés en el padrón. La primera candidata es `accion:'stock'` de
  `tn-categorias`, que pisa hasta 500 variantes de una.
- ⚠️ `tiendanube-audit` **sigue abierto sin credencial** y expone `unit_cost` de todo el catálogo. Es
  a propósito —el catálogo y bdi-mercadolibre calculan margen en el browser— y taparlo es otro
  proyecto.

## Cómo se prueba

```bash
npx vitest run tests/tncat.test.ts --reporter=dot        # y los otros 8 tests/tncat-*.test.ts
```

🔴 **Los 9 tests son de lógica pura y NINGUNO toca `lib/tncat/cliente.ts`.** Cubren el cruce, el
orden, la auditoría, los recortes, el texto del renglón y el stock por variante — o sea **todo menos
lo que escribe**. Verde acá no dice nada sobre si subir una foto, publicar, ocultar o asignar una
categoría funciona.

⇒ **Lo que escribe se ejerce a mano, en la tienda real, y no hay otra forma.** Con un producto de
prueba, y sabiendo que **el "Deshacer" de ocultar sólo vive en la sesión** (para revertir después hay
que buscarlo en "Mostrar con stock"). El orden seguro: mirar el GET de lectura → confirmar que el
deploy de `bdi-catalogo` llegó → recién ahí el POST.

Para mirar el estado de las dos tablas sin abrir la pantalla, la puerta de prod con `x-monitor-auth`
(arriba, en «Reglas que el código no dice»). **La base local no sirve para `tn_fotos_verificadas`.**
