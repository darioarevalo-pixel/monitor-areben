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
  **el mismo componente** (`SolicitudesInner`) y **el mismo hook** con otro `preset`. Eran dos
  gemelos byte por byte hasta la convergencia; hoy difieren solo en `kind`, el `comments` de GN y
  el estado post-venta.
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

## Pendiente

- 🔴 **`escanearCombi` quedó afuera de la unificación de `8d8265e`** — la regla se aplicó en cuatro
  de los cinco lugares. **Medido el 16-ago con dos mutantes**: con 10 pedidos, 7 salidos y 7 ya
  devueltos, el detalle rebota el 8º escaneo (`ya-completo`) y **la vista combinada lo acepta**
  (`done: 8, qty: 10`); y un ítem que nunca salió da `no-encontrado` en el detalle pero **se
  devuelve** por la combinada, aunque `agregarCombinada` ni lo muestre en la lista. Consecuencia:
  una devolución hecha desde la vista combinada puede registrar más unidades de las que salieron.
  Sin arreglar — el arreglo es cambiar `it.qty` por `esperadoEn(s, it, fase)` en `escaneo.ts:141` y
  filtrar como hace `escanearSol`, pero primero hay que decidir si toca también a internas.
- ▶️ **El select de prioridad de retiro está DESHABILITADO para siempre**
  (`SesionFotos.tsx:350`), con el cartel «Disponible al completar la migración» — que terminó el
  **31-jul**. Hoy la prioridad solo se cambia en Reposición, en `bdi-catalogo`.
- ▶️ Las claves viejas del KV (`sesionfotos:<marca>`) quedaron **intactas como respaldo** y nadie
  las lee desde el 31-jul (`MIGRACION_LISTA = true`). Volver atrás es poner el flag en false.

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
  `sesionfotos-escaneo`. En `escanearCombi` **no rompe nada** — ver Pendiente.
