# monitor-areben

Monitor interno de BDI y Zattia. Next 15 (App Router) + Supabase + Vercel.

Este archivo se carga en **cada** sesión de IA: cada línea se paga siempre. Entra solo lo que evita
un error caro o una búsqueda repetida. **Techo: 160 líneas propias** (el bloque de `next dev`, no).

## ⛔ Invariantes — romper una de estas cuesta caro

**Vercel Hobby admite 12 funciones. Hay 7 usadas, quedan 5.**
Cada archivo de ruta en `api/` **sin** prefijo `_` cuenta como función. Pasarse **frena todos los
deploys sin error visible**: Vercel sigue sirviendo la versión anterior y no avisa. Ya pasó una vez.
Para sumar un recurso no se crea un archivo: entra por una puerta existente con `?recurso=`, como
hace `api/datos.js`. Los `_*.js` no son rutas y no cuentan.
Funciones actuales: `blob-upload crear-venta datos deposito meta-ads postventa sku-map`. Eran 9:
`sync.js` y `proxy.js` se borraron el 13-ago-2026 por abandonados y abiertos (`git show 42c43b8`).
⚠️ **Vercel sólo lee el `vercel.json` de la RAÍZ**: el que vivía en `api/` nunca se aplicó.

**Permisos: una sola implementación, `lib/permisos.core.js`. Nunca se copia.**
Es `.js` plano porque los handlers de `api/*.js` corren en Node sin pasar por el compilador de Next
y no pueden importar TypeScript. `lib/permisos.ts` es el re-export tipado que usa la app (~32
archivos importan de ahí). Los `api/` **sí** pueden importar de `lib/` — está probado en prod.
Duplicar un chequeo adentro de un handler es lo que dejó a todo el equipo sin ver el padrón de
Canjes y lo que permitió pausar campañas de Meta a quien tenía el permiso excluido.

**`SECCION_AREA` (`lib/permisos.core.js`) es espejo de `PERM_CAT.area` (`lib/nav.datos.ts`).**
`tests/permisos-espejo.test.ts` exige que coincidan exactamente. Agregar una sección sin tocar el
espejo rompe la suite.

**En `components/secciones/registro.ts`, el 2º argumento de `dynamic()` va como objeto literal
inline.** Turbopack lo exige en build ("options must be an object literal") aunque `next dev` lo
perdone. Por eso `{ loading: Cargando }` se repite en cada línea en vez de salir de una variable.

**`.shell-content button` fija altura.** Un botón de dos renglones se desborda — los números salen
cortados afuera de su caja. Un `<button>` crudo lleva **`height` explícita** (`'auto'` para uno de
texto o de varios renglones). Amarrado por `tests/boton-crudo-altura.test.ts`, porque esta línea sola
ya no alcanzó: se pisó el 26-ago-2026 con la tira de días de Meta.

**`index.html` no es código vivo.** El iframe legacy murió en julio de 2026 y sobrevive sólo como
fuente de los tests de paridad (`tests/legacy-*.ts`): no se edita para cambiar la app.

**El caché del ETL vive en IndexedDB (`lib/cache.ts`), no en localStorage**: el payload de BDI pesa
~14,7 MB y en localStorage no se guardaba nunca, en silencio.

## Arquitectura

Ruta catch-all `app/[[...seccion]]/page.tsx` (cliente): resuelve sección, permiso y marca, y monta
el componente que le da `componenteDe(key)` de `components/secciones/registro.ts`. Cada sección se
carga con `next/dynamic`, así que su JS es un chunk aparte.

Datos de Supabase por `lib/supabase/rest.ts`; el ETL que arma el payload está en `lib/etl/` y se
cachea en IndexedDB. Estado en Zustand (`store/`). Dos marcas: `bdi` y `zattia`.

**Cerrada la Fase S: el navegador NO le pide una sola fila a Supabase.** Todo entra por `api/`:
`clientes` y la plata del CRM por `api/_crm.js`, los costos por `api/_costos.js`, el resto por
`api/_espejo.js` — un **pase** con lista blanca de tabla y de columna, sin gate de permiso porque
**no lleva plata ni PII**: ése es el contrato de su `CATALOGO`, y la columna que lo vuelva falso va
por una puerta con nombre. El desvío vive en `pedir()` (`lib/supabase/rest.ts`), que **tira error**
si la tabla no está en `POR_EL_SERVIDOR` — si no, cae a la anon key y vuelve `[]` con 200, o sea
pantalla vacía sin error. 🔴 **`apply-rls.mjs` deshace los cinco escalones**, y avisa de cada uno.

Portales públicos, sin sesión y fuera del nav: `/reclamo/<token>` (cliente) y `/canje/<token>`
(creadora). Se resuelven antes del guard de permisos.

**Ninguna sección consulta Gestión Nube en vivo, salvo los Conteos.** Todo lo demás lee el espejo
de Supabase (`productos` + `inventario`), y la tabla `inventario` ya trae sku, barcode y stock por
variante. El único camino en vivo es `api/_inventario-vivo.js` (10-30 s por marca). Ante "no
aparece un producto nuevo", el problema es el cruce o la frescura del espejo, no el endpoint.

**⛔ Antes de tocar `scripts/`, `sql/` o `lib/etl/`, leer `docs/sync-ventas.md`** — sync de ventas,
refresco de vistas materializadas y ETL: por qué la purga va **después** del upsert, por qué el
refresco es una llamada por vista, y el paso que estuvo roto una semana con el job en verde.

## Fichas de sección

**⛔ Antes de tocar una sección que tenga ficha, leerla — no es opcional y no se carga sola.**
**Medido el 16-ago-2026 borrando este bloque**: la sesión nueva no la abre ni una vez —ni con
`docs/secciones/` a la vista—, tarda el doble e inventa un dato. Un `CLAUDE.md` ahí tampoco entra.

**Y el que toca una sección que NO tiene ficha, la escribe al terminar** — con
`docs/secciones/_plantilla.md`, que dice qué va adentro y qué no. Es el único momento en que el
conocimiento está fresco y escribirlo cuesta cinco minutos. No se escriben las 49 de una. Las que
ya tienen ficha:

- Redacción (descripciones de producto) → **leer `docs/secciones/gen-desc.md`** antes de tocar
  `components/gen-desc/`, `lib/tn-desc/` o `api/_tn-desc.js`. ⛔ `lib/tn-desc/bloques.ts` decide
  qué se conserva del campo `description` de TiendaNube, que **no tiene historial**.
- Diseños → **leer `docs/secciones/disenos.md`** antes de tocar `components/disenos/`,
  `lib/disenos/`, `api/_disenos*.js` o `sql/migrate-disenos*.sql`. ⛔ **`/votacion/<token>` es un
  portal ABIERTO**, y los resultados de la ronda no se escriben nunca en el diseño. ⛔ Los
  confirmados salen a Ingresos por `lib/ingresos/puente.ts`, que escribe en el KV de Darío.
- Envíos del día → **leer `docs/secciones/envios.md`** antes de tocar `components/envios/`,
  `lib/envios/`, `api/_envios.js` o `api/_cadete.js`.
- Mensajes de clientes → **leer `docs/secciones/buzon.md`** antes de tocar `components/buzon/`,
  `lib/buzon/`, `api/_buzon.js` o `sql/migrate-buzon.sql`. ⛔ **`lib/buzon/core.ts` es el freno de
  Envíos**: un paquete con un mensaje sin resolver no avanza sin que alguien lea.
- Faltantes y Atención al cliente → **leer `docs/secciones/pedidos-clientes.md` y
  `docs/secciones/atencion.md`** antes de tocar `components/pedidos-clientes/`,
  `components/atencion/`, sus `lib/` o sus dos handlers: Atención **monta el alta de Faltantes**, y
  ahí **anotar ≠ decidir** — dos permisos distintos en el mismo handler.
- Ventas mensuales → **leer `docs/secciones/ventas-mensuales.md`** antes de tocar
  `components/ventas-mensuales/`, `lib/ventas-diarias/` o `api/_ventas-diarias.js`. ⛔ Son **dos
  pestañas con dos fuentes**: «Por mes» sale del ETL y «Día a día» del servidor, porque **el ETL no
  baja la plata**.
- Conteo de depósito → **leer `docs/secciones/conteo-deposito.md`** antes de tocar
  `components/conteo-deposito/`, `lib/conteo-deposito/` o `api/_conteos-deposito.js`.
  ⛔ **`lib/conteo-deposito/core.ts` es de las CUATRO pantallas de conteo**, que ajustan stock.
- Canjes → **leer `docs/secciones/canjes.md`** antes de tocar `components/canjes/`, `lib/canjes/`,
  `api/_canjes.js`, `api/_canje-portal.js` o `components/cupones/CanjesLocal.tsx` (la pestaña del
  mostrador, que vive en Cupones y entrega canjes creando una venta en GN).
- Tienda Nube → **leer `docs/secciones/tncat.md`** antes de tocar `components/tncat/`, `lib/tncat/`,
  `lib/tn-audit.ts`, `api/_tn-ignorados.js` o `api/_tn-fotos-verificadas.js`. ⛔ **Lo que escribe la
  tienda vive en OTRO repo** (`bdi-catalogo`) y un POST con una acción que ese deploy no conoce
  **recategoriza la tienda entera**.
- Sesión de fotos → **leer `docs/secciones/sesionfotos.md`** antes de tocar `lib/sesionfotos/`,
  `components/sesionfotos/`, `components/solicitudes/` o `components/solicitudes-internas/`.
  ⛔ **`lib/sesionfotos/` NO es solo de esta sección**: es el motor de las solicitudes, que montan el
  MISMO componente con otro preset. ⛔ **Crear la venta pega por URL absoluta a PROD**, también
  desde localhost.
- Liquidación → **leer `docs/secciones/liquidacion.md`** antes de tocar `components/liquidacion/`,
  `lib/liquidacion/` o `api/_liquidacion.js` — ⛔ ese handler lo abren también Etiquetas y Análisis.
- Etiquetas → **leer `docs/secciones/etiquetas.md`** antes de tocar `components/etiquetas/` o
  `lib/etiquetas/`. ⛔ **La geometría del PDF sale en una Zebra real**: el dibujo se toca sólo con
  el test de paridad delante.
- Norte → **leer `docs/secciones/norte.md`** antes de tocar `components/norte/`, `lib/norte/`,
  `api/_norte.js` o `sql/migrate-norte.sql`. ⛔ **La otra mitad de cada importación es la sección
  `ingresos`**, y su KV tiene el GET abierto: por eso el costo y los plazos van a la base.
- Memo semanal → **leer `docs/secciones/memo.md`** antes de tocar `components/memo/`, `lib/memo/`,
  `api/_memo.js` o `sql/migrate-memo.sql`. ⛔ **Cerrar la semana congela también el acta y los
  avances, y no hay verbo de reabrir.**
- Ventas de Marketing → **leer `docs/secciones/mkt-ventas.md`** antes de tocar
  `components/mkt-ventas/`, `lib/mkt-ventas/` o la llave `?metas=1` de `api/_norte.js` — ⛔ esa
  llave saca objetivos del área de Dirección: por ahí puede viajar la meta, **nunca plata**.
- Ingresos proyectados → **leer `docs/secciones/ingresos.md`** antes de tocar
  `components/ingresos/`, `lib/ingresos/`, `lib/media.core.js` o `api/blob-upload.js`. ⛔ **Sacar un
  ítem de la galería BORRA el archivo del Blob** — y `api/blob-upload.js` lo comparten Fundas,
  Diseños, las piezas de Meta y **el contenido que sube la creadora de un canje SIN SESIÓN**: esa
  rama va antes de `exigirUsuario`, así que un guard nuevo "arriba de todo" no tiene sesión detrás.
- Ingresos / «lo que entró» (las OC recibidas, key `recepciones`) → **leer `docs/secciones/recepciones.md`** antes de tocar
  `components/recepciones/`, `lib/recepciones/`, `api/_oc-webhook.js`, `api/_recepciones.js` o
  `sql/migrate-recepciones.sql`. ⛔ **`_oc-webhook.js` NO pide sesión** —lo llama otro servidor y se
  defiende con la firma HMAC—, y ⛔ **el cuerpo se lee del STREAM, no de `req.body`**: la firma es
  sobre los bytes y reparsear el JSON la rompe.
- Clientes (CRM) y el panel de WhatsApp → **leer `docs/secciones/crm.md`** antes de tocar
  `components/crm/`, `components/panel/`, `lib/crm/` o la acción `panel` de `api/_crm.js`. ⛔ **La
  clave `crm:seg:bdi` no tiene backup**: 305 clientes y sus notas, reescritos enteros en cada
  guardado. ⛔ **`lib/crm/telefono.core.js` es también de Envíos, Canjes y el portal del cadete.**
- Meta Ads → **leer `docs/secciones/meta-ads.md`** antes de tocar `components/meta-ads/`,
  `lib/meta-ads/`, `api/meta-ads.js`, `api/_meta-*.js`, `scripts/*meta*` o los cuatro workflows de
  Meta. ⛔ **Escribe en una API externa y gasta cupo**: los cinco candados de permisos, qué está
  medido y qué nunca se ejerció están ahí, no en el código.
- Integraciones (GN↔TN de Stunned) → **leer `docs/secciones/integraciones.md`** antes de tocar
  `components/integraciones/`, `lib/sku-map/`, `lib/sync-tn/`, `api/sku-map.js` o `api/_sync-tn.js`.
  ⛔ **Escribe en la TIENDA VIVA y en la contabilidad**, y la mitad que escribe la tienda está en
  otro repo (`bdi-catalogo`). ⛔ **Gestión Nube no anula ventas por API**: por eso stock tiene botón
  masivo y ventas no, y eso NO se empareja.
- Novedades → **leer `docs/secciones/novedades.md`** ⛔ **antes de ESCRIBIR una novedad**, no sólo
  antes de tocar `components/novedades/`, `lib/novedades/` o `scripts/novedad.mjs`. Ahí está **cómo
  se escribe**: a quién le llega, los ~600 caracteres, y que se cuenta **qué se incorporó y cómo se
  usa**, nunca cómo está hecho por detrás — el nombre en criollo primero y el término técnico entre
  paréntesis. ⛔ **Lo que es para admin no lleva novedad.**
- Manuales → **leer `docs/secciones/manuales.md`** antes de tocar `components/manuales/`,
  `lib/manuales/`, `lib/markdown/`, `components/ui/Markdown.tsx` o `components/ui/BarraFormato.tsx`. ⛔ **El parser NO es de Manuales**:
  lo comparten Novedades, la Guía y la Agenda —incluidos los pasos de la promo bancaria que se leen
  con el cliente delante—, así que un cambio ahí se camina en cinco pantallas.
- PRM y Recorridas → **leer `docs/secciones/prm.md`** (y `docs/secciones/recorridas.md`) antes de
  tocar `components/prm/`, `components/recorridas/`, `lib/prm/` o `api/_prm.js`. ⛔ **Son DOS
  secciones de dos áreas sobre las MISMAS tablas y el MISMO handler**, y el permiso se parte acción
  por acción. ⛔ **La visita no lleva monto**: la compra vuelve contada por la OC.
  ⛔ `lib/prm/geo.core.js` es JS plano porque lo importa el handler, y **le sacó a `api/_georef.js`
  la provincia clavada en «Santa Fe»** — ese cambio toca Envíos. ⛔ **El bloque «Cómo se mueve lo
  que le compro» lee la base de la OTRA marca** (las ventas salen del espejo de cada una) y su
  puente es `recepcion_linea.producto_id`: es el PRODUCTO, ⛔ no la unidad — vendido puede dar más
  que comprado y ⛔ no es un error. ⛔ **`api/_oc-webhook.js` también
  escribe en `proveedor_local`** (le abre la ficha al proveedor nuevo, con `lib/prm/sembrado.core.js`):
  el alta de un local tiene **dos llamadores**, y ese no pasa por `api/_prm.js` ni por su permiso.
- Insumos → **leer `docs/secciones/insumos.md`** antes de tocar `components/insumos/`,
  `lib/insumos/` o `api/_insumos.js`. ⛔ **El stock no es una columna: se suma del libro**, y de ahí
  sale el «desde cuándo falta» que es el `ts` del aviso. ⛔ Un traslado son DOS filas.
- Organización (de quién es cada cosa, sin fecha) → **leer `docs/secciones/organizacion.md`** antes
  de tocar `components/organizacion/`, `lib/organizacion/` o `api/_organizacion.js`. ⛔ **`persona =
  null` es una fila válida** —es el gris, y es lo que justifica la sección—, y ⛔ **las rutinas no se
  copian acá**: se leen de la Agenda.
- Agenda operativa → **leer `docs/secciones/agenda.md`** antes de tocar `components/agenda/`,
  `lib/agenda/` o `api/_agenda.js`. ⛔ **La ve todo el equipo** (`KEYS_PARA_TODOS`) y **tildar no
  pide permiso**: no hay nada que destrabar. ⛔ Las promos y los pendientes son **un solo motor**
  (`reglas.core.js`) — una rutina nueva se carga, no se construye.
- Reclamos y Cambios → **leer `docs/secciones/reclamos.md`** antes de tocar `components/reclamos/`,
  `components/postventa/`, `lib/reclamos/`, `api/_reclamos.js` o `api/_reclamo.js`. ⛔ **Acá vive la
  plata**, y un error no rompe ninguna pantalla: se ve en la caja o en el stock. ⛔ Los pendientes de
  cada resolución salen SOLO de `lib/reclamos/efectos.core.js` — duplicar esa derivación es el bug
  que ya tuvo. ⛔ `/reclamo/<token>` es un portal ABIERTO.
- Retornos (lo que estamos esperando que vuelva) → **leer `docs/secciones/retornos.md`** antes de
  tocar `components/retornos/`, `lib/reclamos/retornos.ts` o la vista `retornos` de
  `api/_reclamos.js`. ⛔ **No es Envíos**, que es lo que SALE.

## Mapa de secciones

**⛔ Para ubicar cualquier sección, leer `docs/mapa-secciones.md`** — `key → components/… + lib/…`,
el área de cada una, y lo que no se adivina (el portal del cadete, las once vistas de Meta, las tres
secciones sin `store`). El menú y los permisos se definen a mano en `lib/nav.datos.ts`.

## Clavados

**⛔ Antes de tocar `lib/clavados/`, `api/_clavados.js`, `components/clavados/` o el bloque de
clavados del memo, leer `docs/clavados.md`.** No lo calcula el sistema: es una decisión que se marca
en la fila del producto. 🔴 **El recupero de una semana sale de la venta de esa semana, nunca del
estado de hoy**, y **sin costo no hay porcentaje** (un costo 0 lo haría dar 100 %).

## Líneas de negocio

**⛔ Antes de tocar `lib/lineas.core.js`, `lib/etl/linea.ts`, `lib/margenes.ts`, `lib/tienda.core.js`
o de darle el selector de línea a una pantalla, leer `docs/lineas.md`.** Stunned **no es una
`Marca`**: es una línea adentro de Zattia y lo único que la separa es el prefijo de SKU. El corte es
**opt-in por pantalla** (`useDatosMonitor({ porLinea: true })`) porque las operativas tienen que
seguir viendo la mercadería del local entera, y **«Ventas mensuales» no puede llevarlo**.

🔴 **Stunned tiene TRES stores según a quién se le hable, y confundirlos no falla solo**: la base de
Supabase y Gestión Nube son los de **Zattia** (`baseDeLinea`), pero la **Tienda Nube es propia** y
las filas de `solicitudes` van con `store='stunned'`. Mandarle `stunned` a `api/crear-venta.js` crea
la venta sin cliente; mandarle `zattia` a Tienda Nube sube la foto a la tienda equivocada.

## Comandos

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test        # vitest run
npm run build       # next build
```

**El CI corre las cuatro.** El lint es el que se saltea y el que dejó el CI en rojo cinco commits
seguidos: correlo siempre antes de pushear.

**Localhost: `vercel dev`, no `next dev`.** Todo lo que pega a `/api/*` necesita el primero.

Leyendo la salida de tests: `Test timed out` es ruido conocido de la máquina (`testTimeout` está en
30 s). `AssertionError` es una falla real.

## Higiene de contexto

Todo lo que entra al contexto se re-paga en cada turno posterior: un output largo temprano cuesta
varias veces su tamaño.

- **Tests: uno por vez.** `npx vitest run tests/<archivo>.test.ts --reporter=dot`. La suite completa
  son 206 archivos y su salida entera queda en contexto — correrla solo si se pide.
- **Comandos largos van cortados**: `git log`, builds y deploys con `| tail -30`.
- **Avisar el `/clear` al cerrar cada unidad de trabajo** — Bruno no lo tiene que pedir; el marcador
  natural es después de deployar y verificar. El criterio no es "cambió el tema" sino **"¿vamos a
  volver a abrir los mismos archivos?"**, y donde más rinde es justo después de un bug difícil: ese
  contexto es casi todo intento fallido. Dentro de una tarea sin terminar va `/compact`.
- **Los archivos caros se leen por rango, no enteros.** Arriba de 850 líneas: `api/_canjes.js`
  (2.227) · `components/sesionfotos/SesionFotos.tsx` (1.820) · `lib/reclamos/tipos.ts` (1.372) ·
  `lib/canjes/tipos.ts` (1.261) · `tests/reclamos.test.ts` (1.192) · `components/reclamos/
  ArmarCambio.tsx` y `components/conteo-estandar/ConteoEstandar.tsx` · `lib/nav.datos.ts` (750, es
  data).

## Estado del trabajo

- **Reclamos y Cambios: los 11 casos y el ESCENARIO ya están (25-ago-2026).** El módulo es un
  chasis de tres bandas: inicio común, **el escenario** (`lib/reclamos/casos.core.js`) y final
  común. 🔴 **El escenario decide la plata en tres casos**, así que es parámetro **obligatorio** de
  todo lo que deriva plata o stock. Las dos migraciones están **corridas en BDI y ZATTIA**
  (verificado leyendo la columna, no el script). El detalle, en la ficha.
- **Repo compartido con Darío.** Los refactors grandes se coordinan antes de empezar.

## Estilo

Acento **índigo**; el kit vive en CSS real (`app/tokens.css`) y en `components/ui/`. Íconos por
`components/ui/Icono.tsx`. Reusar los componentes del kit antes de escribir uno nuevo.

🔴 **El estilo también son las PALABRAS: ⛔ antes de escribir un botón, un título o un cartel de
vacío, leer `VOCABULARIO.md`** — el glosario compartido con MAKETA (`areben-marketing`), **el mismo
archivo en los dos repos**, clavado por `tests/vocabulario.test.ts`. **Eliminar / Sacar / Archivar /
Descartar** según *¿sigue existiendo después?* (⛔ nunca «borrar» ni «quitar»), **Pendientes** (⛔ no
«lo que falta»), botones en **infinitivo** y voseo sólo en las ayudas.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
