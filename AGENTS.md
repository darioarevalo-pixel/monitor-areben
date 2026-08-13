# monitor-areben

Monitor interno de BDI y Zattia. Next 15 (App Router) + Supabase + Vercel.

Este archivo se carga en **cada** sesión de IA: cada línea se paga siempre. Entra solo lo que
evita un error caro o una búsqueda repetida. Techo: 160 líneas.

## ⛔ Invariantes — romper una de estas cuesta caro

**Vercel Hobby admite 12 funciones. Hay 7 usadas, quedan 5.**
Cada archivo de ruta en `api/` **sin** prefijo `_` cuenta como función. Pasarse **frena todos los
deploys sin error visible**: Vercel sigue sirviendo la versión anterior y no avisa. Ya pasó una vez.
Para sumar un recurso no se crea un archivo: entra por una puerta existente con `?recurso=`, como
hace `api/datos.js`. Los `_*.js` no son rutas y no cuentan.
Funciones actuales: `blob-upload crear-venta datos deposito meta-ads postventa sku-map`.
Eran 9: `sync.js` y `proxy.js` se borraron el 13-ago-2026 (abr-2026, sin un solo consumidor, con
`Access-Control-Allow-Origin: *` y sin `exigirUsuario`; `sync.js` además hacía upserts masivos en
`productos/inventario/ventas` de BDI para cualquiera que trajera un token de GN propio). Con ellos
se fue `api/vercel.json`, que declaraba un rewrite para `proxy` y **nunca se aplicó**: Vercel sólo
lee `vercel.json` en la raíz del proyecto.

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

**`.shell-content button` fija altura.** Un botón de dos renglones se desborda.

**`index.html` no es código vivo.** El iframe legacy murió en julio de 2026. Sobrevive solo como
fuente de los tests de paridad (`tests/legacy-*.ts`). No se edita para cambiar la app.

**El caché del ETL vive en IndexedDB (`lib/cache.ts`), no en localStorage**, y no tiene tope de
tamaño: el payload de BDI pesa ~14,7 MB y en localStorage no se guardaba nunca, en silencio.

## Arquitectura

Ruta catch-all `app/[[...seccion]]/page.tsx` (cliente): resuelve sección, permiso y marca, y monta
el componente que le da `componenteDe(key)` de `components/secciones/registro.ts`. Cada sección se
carga con `next/dynamic`, así que su JS es un chunk aparte.

Datos de Supabase por `lib/supabase/rest.ts`; el ETL que arma el payload está en `lib/etl/` y se
cachea en IndexedDB. Estado en Zustand (`store/`). Dos marcas: `bdi` y `zattia`.

Portales públicos, sin sesión y fuera del nav: `/reclamo/<token>` (cliente) y `/canje/<token>`
(creadora). Se resuelven antes del guard de permisos.

**Ninguna sección consulta Gestión Nube en vivo, salvo los Conteos.** Todo lo demás lee el espejo
de Supabase (`productos` + `inventario`), y la tabla `inventario` ya trae sku, barcode y stock por
variante. El único camino en vivo es `api/_inventario-vivo.js` (10-30 s por marca). Ante "no
aparece un producto nuevo", el problema es el cruce o la frescura del espejo, no el endpoint.

**El sync de ventas relee los últimos 90 días y borra lo que GN ya no tiene.** Nació solo-upsert
con ventana incremental, así que una venta quedaba congelada en la foto de su primer día y una
anulada seguía sumando plata (GN no devuelve las anuladas con un estado: dejan de venir). El mapeo
y el guardado son de `scripts/lib/ventas-espejo.mjs` —una sola implementación para las dos marcas,
`completo: false` es Zattia, cuya tabla todavía no tiene cliente ni costo— y el borrado, de
`scripts/lib/purga-ventas.mjs`. **La purga va DESPUÉS del upsert**: si una venta cambió de fecha,
mirarla antes la mostraría con la fecha vieja y se borraría por "desaparecida". Para el histórico
anterior a la ventana existe `scripts/purga-historica.js`, que arranca en simulación.

**El `statement_timeout` de la API de Supabase es de 8 segundos**, y las tres vistas materializadas
juntas ya no entran. Por eso el refresco va **una llamada por vista**
(`scripts/lib/refrescar-vistas.mjs` + `sql/migrate-refresco-vistas.sql`, que les sube el tiempo a
120s). Mientras ese SQL no esté aplicado en una base, el módulo cae solo a `refresh_all_views()`.

**Un paso que falla sin frenar el sync se junta en `problemas[]` y el script sale con código 1.**
Antes eran `console.warn` con salida 0: el refresco de vistas estuvo roto una semana con el job en
verde. Si el job queda en rojo, el Monitor lo muestra solo (`fetchUltimoSync` lee el `conclusion`).

**`allVariantesHuerfanas` (ETL) se lee SIEMPRE con `?? []`.** Son las variantes con stock cuyo
producto todavía no está en `productos`; van aparte de `allVariantes` a propósito, porque varias
secciones joinean contra el producto. Los cachés de IndexedDB anteriores al campo no lo traen.

## Mapa de secciones

45 secciones. `key → components/… + lib/…`. Cuando no figura `lib/`, la lógica está en un archivo
suelto de `lib/` con el mismo nombre (`resumen.ts`, `variantes.ts`, …).

**Análisis** — `resumen` · `productos` · `variantes` · `ventas-mensuales` · `margenes` · `talles` ·
`colores` (cada una en `components/<key>/`) · `comisiones` · `verif-ventas` (con `lib/` propio)

**Compras** — `fundas-modelo → components/fundas + lib/fundas` · `proveedores` · `ingresos` ·
`disenos`

**Clientes** — `clientes → components/crm + lib/crm`

**Local** — `atencion → components/atencion + lib/atencion` ·
`conteo → components/conteo-local-bdi` · `conteo-estandar-zattia` y
`conteo-estandar-stunned → components/conteo-estandar` · `cupones` · `etiquetas` · `exhib` ·
`ubicaciones` · `solicitudes` · `solicitudes-internas` · `postventa-local → components/postventa` ·
`reclamos-local` y `cambios-local → components/reclamos + lib/reclamos`

**Depósito** — `conteo-deposito` · `postventa-deposito → components/postventa`

**Marketing** — `marketing` · `tncat` · `sesion-fotos → components/sesionfotos` · `meta-ads` ·
`canjes` · `gen-talles` · `calendario`

**Administración** — `caducados` · `postventa` · `reposicion`

**Dirección** — `gerencial` · **Integraciones** — `integraciones`

**Sistema** — `novedades` y `manuales → components/… + lib/…`, los dos por `?recurso=sistema` en
la base de BDI y **sin `store`**: no son de una marca. Las novedades se cargan como borrador desde
`scripts/novedad.mjs` y se publican a mano; el manual de una sección lo muestra `SeccionHeader`.

**Sin permiso (todos las ven)** — `inicio` · `usuarios` · `novedades` · `manuales`

El menú y los permisos se definen a mano en `lib/nav.datos.ts`: `PERM_CAT` (qué secciones existen,
con su área y sus sub-permisos) y `NAV_CATS` (cómo se agrupan en el sidebar).

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

Estas reglas bajan el gasto de tokens por sesión. Todo lo que entra al contexto se re-paga en cada
turno posterior, así que un output largo temprano cuesta varias veces su tamaño.

- **Tests: uno por vez.** `npx vitest run tests/<archivo>.test.ts --reporter=dot`. La suite completa
  son 89 archivos y su salida entera queda en contexto — correrla solo si se pide.
- **Comandos largos van cortados**: `git log`, builds y deploys con `| tail -30`.
- **Avisar el `/clear` al cerrar cada unidad de trabajo** — Bruno no lo tiene que pedir. El marcador
  natural es después de deployar y verificar. El criterio no es "cambió el tema" sino **"¿vamos a
  volver a abrir los mismos archivos?"**. Donde más rinde es justo después de resolver un bug
  difícil: ese contexto es casi todo intento fallido. Dentro de una tarea sin terminar va
  `/compact`, no `/clear`.
- **Los archivos caros se leen por rango, no enteros.** Los peores:
  `components/sesionfotos/SesionFotos.tsx` (1.803 líneas) · `lib/reclamos/tipos.ts` (1.372) ·
  `api/_canjes.js` (1.700) · `tests/reclamos.test.ts` (1.192) · `lib/canjes/tipos.ts` (1.091) ·
  `components/reclamos/ArmarCambio.tsx` y `components/conteo-estandar/ConteoEstandar.tsx` (870) ·
  `lib/nav.datos.ts` (750 — es data, casi nunca hace falta entero).

## Estado del trabajo

- **⛔ Reclamos y Cambios: frenado.** El flujo no convence; no construir ahí hasta que Bruno
  devuelva el mapa marcado.
- **▶️ Canjes: entraron las tandas 1 (la propuesta), 2 (la vitrina) y 3 (la carga a TN)**, 2-ago-2026. La
  vitrina es un **espejo curado de Tienda Nube**: se trae por categoría o buscando, se congela con
  foto y precio (el portal no tiene sesión y no puede pedirle nada a TN), y la creadora elige desde
  el link. Lo suyo entra como `origen:'persona'` + `estado:'propuesto'` y el equipo lo confirma. El
  tope lo hacen cumplir los dos handlers con `api/_canjes-reglas.js`. **De TN sólo se lee: el
  monitor no escribe en la tienda** — la orden se tipea a mano con el cupón de 100% de la config y
  los botones de copiar campo por campo. Ya no está vacío: 20 personas y 3 canjes.
  **Nada de esto se probó a mano todavía.**
- **Repo compartido con Darío.** Los refactors grandes se coordinan antes de empezar.

## Estilo

Acento **índigo**; el kit vive en CSS real (`app/tokens.css`) y en `components/ui/`. Íconos por
`components/ui/Icono.tsx`. Reusar los componentes del kit antes de escribir uno nuevo.
