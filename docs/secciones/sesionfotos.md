# Sesión de fotos — ficha de sección

Sección `sesion-fotos`, área `marketing`. Marketing pide productos para fotografiar: se eligen las
variantes, el sistema decide depósito o local, se crea la venta en Gestión Nube (que **separa** el
stock), se retira, se fotografía y **vuelve**. El eje es que el retiro es reversible: cada ítem se
cuenta dos veces —preparado y devuelto— y la solicitud no cierra hasta que GN confirma que la venta
se anuló. Reemplazó a la pantalla `sfXxx` del `index.html` legacy, de la que es un port literal.

⚠️ **Ya no es una entrada del menú.** La absorbió `solicitudes` (la vista unificada de estado); a
esta pantalla se llega por el botón «Ver» de ahí, o por el puente de Marketing. Ver `DETALLE_DE` y
`ALIAS_COMPAT` en `lib/permisos.core.js:121-152`, que explican por qué el permiso viaja solo.

## Dónde vive

| qué | dónde |
|---|---|
| pantalla | `components/sesionfotos/SesionFotos.tsx` (**1.820 líneas** — leer por rango) + `useSesionFotos.ts` |
| lógica pura | `lib/sesionfotos/` (10 archivos, 1.781): `core` `draft` `escaneo` `combinada` `ventas` `pdf` `ticket` `puente` `cfg` `tipos` |
| motor compartido | `components/solicitudes/useHistorialSolicitudes.ts` · `components/solicitudes/preset.ts` |
| dónde se guarda | tabla `solicitudes` por `lib/solicitudes/cajon.ts` → `api/_solicitudes.js`, que entra por la puerta **`/api/postventa?recurso=solicitudes`** (límite de 12 funciones de Vercel) |
| escritura irreversible | `lib/sesionfotos/ventas.ts` → `api/crear-venta.js` (GN) |
| tests | `tests/sesionfotos-{core,draft,escaneo,ventas}.test.ts` + `tests/legacy-sesionfotos.ts` (paridad) + `tests/solicitudes-cajon.test.ts` |

`tests/blob-upload-sesion.test.ts` **no es de acá** (es la sesión del Monitor, en piezas de Meta).

## ⛔ Lo que comparte con otras secciones

🔴 **`lib/sesionfotos/` no es de Sesión de fotos: es el motor de las solicitudes.** Un cambio ahí
toca **seis** lugares, y ninguno tiene su propia copia de la cuenta:

- **Solicitudes internas** (`components/solicitudes-internas/`, `lib/solicitudes-internas/`) monta
  **el mismo componente** (`SolicitudesInner`, que vive en `components/sesionfotos/SesionFotos.tsx`)
  y **el mismo hook** con otro `preset`. Eran dos gemelos byte por byte hasta la convergencia; hoy
  difieren solo en `kind`, el `comments` de GN y el estado post-venta.
  🔑 **Medido el 16-ago: `components/solicitudes-internas/` son 60 líneas y las dos son wiring** —
  no hay una sola copia de la cuenta. ⇒ **«¿este arreglo toca también a internas?» no es una
  decisión: es el mismo código.** La única forma de arreglar uno sin el otro sería duplicar.
- **Solicitudes** (`components/solicitudes/`) — la vista unificada, y el alta que rutea por motivo.
- **Inicio** y **Marketing** empujan por los tres puentes de `lib/sesionfotos/puente.ts`.
- **Gerencial** y **Notificaciones** (`lib/notificaciones/derivar.ts`) leen `salio`/`faltantes`.

⇒ Antes de tocar `core.ts`, `escaneo.ts` o `ventas.ts`, correr **los dos** juegos de tests
(`sesionfotos-*` y `solicitudes-internas-*`): la mitad de las funciones son genéricas con la
variante de internas pasada por parámetro.

## Lo que ya está comentado, y hay que leer antes de tocar

- El modelo entero, en 10 líneas → `lib/sesionfotos/tipos.ts:1`; el enum es la **unión** de los dos
  ciclos → `:26`; **venta creada = SEPARADO, no retirado** → `:108` y `:113`.
- La regla que parte el ciclo en dos mitades (`esperadoEn`) → `lib/sesionfotos/core.ts:64`.
- «Salió sin que nadie escanee» y por qué un **`0` explícito no es una ausencia** →
  `lib/sesionfotos/core.ts:23` y `:41`.
- El recorte por sector del historial (Local ve lo de local) → `lib/sesionfotos/core.ts:189`.
- El único choke point contra GN, y por qué el payload se verifica offline →
  `lib/sesionfotos/ventas.ts:1`; el `estado` que pasó a ir con sesión → `:129`.
- Asignación de origen (prioridad + fallback por stock) → `lib/sesionfotos/draft.ts:194`.
- El escáner que se come el cero de adelante → `lib/sesionfotos/escaneo.ts:23`.
- Los manuales **no** se agregan entre solicitudes → `lib/sesionfotos/combinada.ts:1`.
- Los dos ejes del modelo nuevo, MOTIVO vs DESTINO → `components/solicitudes/preset.ts:4`.
- Las dos disciplinas del guardado (`cargado`, re-leer fresco) →
  `components/solicitudes/useHistorialSolicitudes.ts:12`; el diff por solicitud →
  `lib/solicitudes/cajon.ts:108`.
- El autoguardado con debounce + flush al desmontar → `components/sesionfotos/SesionFotos.tsx:291`.

## Reglas que el código no dice

- 🔴 **`ventas.ts` pega a `https://monitorareben.vercel.app/api/crear-venta` por URL ABSOLUTA.**
  Desde `localhost` o desde un preview, crear una venta **crea una venta REAL en Gestión Nube de
  producción**. No hay entorno de prueba: la única forma de ejercerlo sin ensuciar es el test con
  `fetch` mockeado. Su CORS abierto es a propósito y no se puede sacar (Reclamos y Fallas también
  le pegan absoluto).
- 🔑 **La venta sale por lo PREPARADO, no por lo pedido — decisión de Bruno.** Se piden 10, se
  encuentran 7, la venta va por 7 y la devolución espera 7. Lo no encontrado no se vende, así que
  tampoco se devuelve.
- 🔴 **La prioridad de retiro sale de OTRO repo** (`bdi-catalogo/api/reposicion`, la config de
  Reposición). Ese endpoint exige la sesión del Monitor —**medido el 16-ago: sin sesión contesta
  403**— y `leerPrioridadRetiro` se traga cualquier error y **cae a `deposito` en silencio**. Si la
  cadena de logins se cortó, el banner dice «Depósito primero» y el armado asigna depósito sin que
  nada avise. Es el mismo patrón del 403 leído como «sin datos».
- ⚠️ **El escaneo depende del ETL.** El mapa código-de-barras → vid se arma de `allVariantes`; hasta
  que el catálogo baja, el escaneo va deshabilitado, no fallado.
- ⚠️ **Los ítems «nuevo» y «a mano» no generan venta ni tocan stock.** Un producto que todavía no
  está en GN viaja por código de barras (`bc_`) y el «a mano» por descripción (`man_`): salen de la
  solicitud pero no del sistema.

## Lo que ya se rompió acá

- **La devolución pedía lo que se había pedido, no lo que salió** (`8d8265e`, 26-jul). La lógica
  pura ya estaba bien; el render había quedado atrás. Se unificó en `esperadoEn`. 🔑 **La regla
  estaba escrita tres veces en tres archivos** — por eso hoy vive una sola.
- **El reporte PDF cortaba nombre y variante por cantidad de caracteres** y con `'…Pro Max'` el
  color desaparecía **entero, sin puntos suspensivos**: cinco fundas de cinco colores salían
  impresas idénticas. 1.578 de 6.765 filas del inventario de BDI. → `lib/sesionfotos/pdf.ts:48`.
- **Dos puertas al mismo dato con criterios distintos**: por `/sesion-fotos` se veían TODAS las
  solicitudes de la marca y por `/solicitudes` solo las del sector. → `core.ts:189`.
- **La lista se veía pero la pantalla rebotaba a Inicio sin decir nada** (Depósito y Administración
  entraban por `solicitudes` pero el detalle pedía `sesion-fotos`). → `permisos.core.js:132`.
- 🔴 **Hasta el 13-ago cualquier cuenta válida del Monitor leía y borraba las solicitudes de las dos
  marcas**, puestos compartidos incluidos: el control terminaba en `exigirUsuario`. →
  `api/_solicitudes.js:65`.
- 🔴 **`escanearCombi` quedó afuera de la unificación de `8d8265e` y la vista combinada aceptaba
  devolver más de lo que salió** (arreglado el 16-ago). La regla se había llevado a `esperadoEn` y
  aplicado en cuatro de los cinco lugares; acá seguía topeando contra `it.qty`, lo PEDIDO. Con 10
  pedidos, 7 salidos y 7 devueltos, el detalle rebotaba el 8º escaneo y la combinada lo aceptaba; y
  un ítem que nunca salió se devolvía por la combinada aunque `agregarCombinada` ni lo mostrara.
  🔑 **Sobrevivió tres semanas porque los tres tests que cubrían `escanearCombi` eran todos de fase
  `retiro`, y ahí `esperadoEn` ES `i.qty`**: el defecto sólo existe en la otra mitad del ciclo. La
  lección no es «faltaba un test» sino **«faltaba ejercer la fase»**.
  🔑 **El tope es por SOLICITUD, no por ítem**: dos solicitudes con el mismo ítem pueden haber
  sacado cantidades distintas, así que se recalcula en cada vuelta del loop.
  🔑 **Medido contra las dos bases: no ensució ningún dato.** 335 ítems, 301 con devolución, **0**
  con `devuelto` mayor a lo que salió. El agujero era real y nunca se materializó.
## Pendiente

- ▶️ **El select de prioridad de retiro está DESHABILITADO para siempre**
  (`SesionFotos.tsx:350`), con el cartel «Disponible al completar la migración» — que terminó el
  **31-jul**. Hoy la prioridad solo se cambia en Reposición, en `bdi-catalogo`.
- ▶️ Las claves viejas del KV (`sesionfotos:<marca>`) quedaron **intactas como respaldo** y nadie
  las lee desde el 31-jul (`MIGRACION_LISTA = true`). Volver atrás es poner el flag en false.

- ▶️ 🔴 **Stunned hace sesiones de fotos y no tiene dónde pedir la ropa.** Bruno lo dijo el
  22-ago-2026 con estas palabras: *«sí se le hacen sesiones, pero no tiene sección en el monitor
  todavía; es un creador de problemas»*. 🔑 **La pregunta no es "crear la sección": es si Stunned
  pasa a ser una tercera `Marca` o sigue siendo una LÍNEA de Zattia** — y el repo ya la contestó
  cuatro veces por el segundo camino (`lib/meta-ads/lineas.ts` con `baseDeLinea('stunned') ===
  'zattia'` y su test, más `memo`, `conteo-estandar`, `sku-map` y `canjes`). ⛔ Tercera `Marca` no:
  `CUENTAS` es `Record<Marca, Cuenta>` y pediría una tercera base de Supabase **que no existe**
  (Stunned comparte el GestiónNube de Zattia), más los `brands` de las ~40 secciones y el padrón —
  `bdi | zattia` son **514 apariciones en 143 archivos**.
  Como línea, lo medido el 22-ago es que falta poco y **ninguna migración**:
  1. `api/_solicitudes.js:63` rechaza con 400 todo store que no sea `bdi|zattia` ⇒ aceptar
     `stunned` y mandarlo a la base de Zattia en `cfgFor`. 🔑 **La tabla `solicitudes` ya tiene
     columna `store` y la clave es `store,id`**: entran como filas nuevas.
  2. El permiso de esa misma puerta (`puedeVerAlguna`) lo contesta `baseDeLinea`, el helper que ya
     usa Meta Ads.
  3. 🟢 **La cola de "qué falta fotografiar" de Stunned YA se puede leer hoy**:
     `tiendanube-audit?store=stunned` tiene storeId (7516263) y token propios en `bdi-catalogo`.
  4. 🔴 **El agujero real: `api/tn-subir-imagen.js:6-8` sólo conoce `bdi` y `zattia`** — y es la
     puerta por la que se sube la foto a la web, que es el final del ciclo. Son dos líneas; las
     envs `TIENDANUBE_*_STUNNED` **ya existen**, las usan `tn-categorias` y `tiendanube-audit`.
  5. `lib/nav.datos.ts` (`sesion-fotos` → `brands: ["bdi","zattia"]`): acá está la decisión de
     diseño, no el trabajo — selector de línea **adentro de Zattia** (como Meta Ads, y el equipo no
     aprende un lugar nuevo) o entrada aparte.
  ⚠️ **Lo que decide si esto alcanza y no se puede saber leyendo**: si el stock de Stunned en el GN
  de Zattia se separa del de Zattia. De eso depende que *«el sistema decide depósito o local según
  stock»* no le prometa al equipo una prenda de la marca de al lado. Si no se separa, el punto 1 no
  alcanza y hay que mirar el ETL.

## Lo que se midió, y lo que nunca se ejerció (16-ago-2026)

Contra las dos bases, no contra la memoria: **BDI 10 solicitudes** (todas de fotos, 1-jul → 28-jul,
9 cerradas + 1 devuelta) · **Zattia 20** (14 de fotos + 6 internas, 30-jun → **13-ago**, con una
`cargada` del 11-ago todavía abierta). Zattia es donde la sección se usa.

Sobre esas 30 filas:

- 🔴 **El destino `consumo` NUNCA se usó**: 30 de 30 son `retornable` ⇒ la aprobación, el rechazo y
  `necesitaAprobacion` —toda la mitad de la Fase 2— están en prod **sin ejercer una sola vez**.
- 🔴 **Las bolsas numeradas nunca se usaron**: 0 ítems con `bolsa` en las dos marcas. El armado por
  bolsas, la etiqueta 5×2,5 y el reporte por bolsa se construyeron enteros y no se estrenaron.
- ⚠️ El historial de cambios de la Fase C tiene **un** uso (BDI); `eliminados`, dos (Zattia).
- ⚠️ **19 de 30 no tienen `motivo`**: son anteriores a la Fase 2 y el catálogo viejo tenía otras
  opciones. Abrir una vieja no le cambia el motivo por mirarla, y eso es a propósito
  (`SesionFotos.tsx:1288`). Los que sí hay: Moldería 5, Sesión de fotos 5, Video/contenido 1.

## Cómo se prueba

```bash
npx vitest run tests/sesionfotos-core.test.ts --reporter=dot   # y draft / escaneo / ventas
```

- 🔴 **Verde no dice nada sobre la venta.** Los tests de `ventas.ts` verifican que el **payload** sea
  byte-idéntico al del legacy con `fetch` mockeado (cero POST). Que GN acepte el pedido, que el
  stock se separe y que la anulación se detecte **solo se sabe ejerciéndolo a mano en prod**.
- **La tabla `solicitudes` no se puede mirar con la anon.** Medido el 16-ago: RLS prendido y **cero
  políticas** en las dos bases, con `GRANT SELECT` a `anon` ⇒ la consulta devuelve **`[]` con 200**,
  que se lee como «no hay solicitudes». En local se mira con `psql "$DATABASE_URL_BDI"` (o
  `_ZATTIA`), o con `SUPABASE_SERVICE_KEY`; **la service key de Zattia no está en el `.env`**.
- **Lo que hay que ejercer a mano**: el lector de código de barras (el mapa contempla el cero
  inicial comido, pero eso se ve con el lector puesto), el **ticket 80 mm en la térmica real**, y
  la hoja de compartir del reporte de faltantes, que solo existe en el teléfono.
- El mutante que hay que ver caer al tocar la cuenta de la devolución: poner `i.qty` en lugar de
  `esperadoEn(...)` en `escaneo.ts` o `combinada.ts` tiene que romper `sesionfotos-core` y
  `sesionfotos-escaneo`. **Los cinco lugares están cubiertos desde el 16-ago**, `escanearCombi`
  incluido (4 mutantes, uno por caso).
- 🔑 **Un test de escaneo que no dice la fase está probando `retiro`, y `retiro` no distingue nada**
  (`esperadoEn` devuelve `i.qty`). Todo caso nuevo sobre topes va **en devolución** o no mide.
