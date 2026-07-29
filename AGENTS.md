# monitor-areben

Monitor interno de BDI y Zattia. Next 15 (App Router) + Supabase + Vercel.

Este archivo se carga en **cada** sesión de IA: cada línea se paga siempre. Entra solo lo que
evita un error caro o una búsqueda repetida. Techo: 160 líneas.

## ⛔ Invariantes — romper una de estas cuesta caro

**Vercel Hobby admite 12 funciones. Hay 9 usadas, quedan 3.**
Cada archivo de ruta en `api/` **sin** prefijo `_` cuenta como función. Pasarse **frena todos los
deploys sin error visible**: Vercel sigue sirviendo la versión anterior y no avisa. Ya pasó una vez.
Para sumar un recurso no se crea un archivo: entra por una puerta existente con `?recurso=`, como
hace `api/datos.js`. Los `_*.js` no son rutas y no cuentan.
Funciones actuales: `blob-upload crear-venta datos deposito meta-ads postventa proxy sku-map sync`.

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

## Mapa de secciones

41 secciones. `key → components/… + lib/…`. Cuando no figura `lib/`, la lógica está en un archivo
suelto de `lib/` con el mismo nombre (`resumen.ts`, `variantes.ts`, …).

**Análisis** — `resumen` · `productos` · `variantes` · `ventas-mensuales` · `margenes` · `talles` ·
`colores` (cada una en `components/<key>/`) · `comisiones` · `verif-ventas` (con `lib/` propio)

**Compras** — `fundas-modelo → components/fundas + lib/fundas` · `proveedores` · `ingresos` ·
`disenos`

**Clientes** — `clientes → components/crm + lib/crm`

**Local** — `conteo → components/conteo-local-bdi` · `conteo-estandar-zattia` y
`conteo-estandar-stunned → components/conteo-estandar` · `cupones` · `etiquetas` · `exhib` ·
`ubicaciones` · `solicitudes` · `solicitudes-internas` · `postventa-local → components/postventa` ·
`reclamos-local` y `cambios-local → components/reclamos + lib/reclamos`

**Depósito** — `conteo-deposito` · `postventa-deposito → components/postventa`

**Marketing** — `marketing` · `tncat` · `sesion-fotos → components/sesionfotos` · `meta-ads` ·
`canjes` · `gen-talles`

**Administración** — `caducados` · `postventa` · `reposicion`

**Dirección** — `gerencial` · **Integraciones** — `integraciones`

**Sin permiso (todos las ven)** — `inicio` · `usuarios`

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
- **Los archivos caros se leen por rango, no enteros.** Los peores:
  `components/sesionfotos/SesionFotos.tsx` (1.803 líneas) · `lib/reclamos/tipos.ts` (1.372) ·
  `tests/reclamos.test.ts` (1.192) · `api/_canjes.js` (1.146) · `lib/canjes/tipos.ts` (871) ·
  `components/reclamos/ArmarCambio.tsx` y `components/conteo-estandar/ConteoEstandar.tsx` (870) ·
  `lib/nav.datos.ts` (750 — es data, casi nunca hace falta entero).

## Estado del trabajo

- **⛔ Reclamos y Cambios: frenado.** El flujo no convence; no construir ahí hasta que Bruno
  devuelva el mapa marcado.
- **⏸️ Canjes: terminado y vacío.** Las 4 fases están en prod con 0 canjes reales, esperando los
  ajustes del sector. No tocar código hasta que lleguen.
- **Repo compartido con Darío.** Los refactors grandes se coordinan antes de empezar.

## Estilo

Acento **índigo**; el kit vive en CSS real (`app/tokens.css`) y en `components/ui/`. Íconos por
`components/ui/Icono.tsx`. Reusar los componentes del kit antes de escribir uno nuevo.
