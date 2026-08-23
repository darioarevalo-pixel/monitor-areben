# Mapa de secciones

Dónde vive cada pantalla del monitor. Vivía adentro de `AGENTS.md` y salió el 16-ago-2026: son 43
líneas que se pagaban en **cada mensaje** de cada sesión, y es una tabla de ubicaciones — se consulta
cuando hay que ubicar algo, no siempre. `AGENTS.md` dejó la orden de leer este archivo.

No está generado a propósito. `tests/agents-mapa-secciones.test.ts` ya lo amarra al código en las dos
direcciones (toda sección del registro figura acá, y todo lo que se nombra acá existe), que es lo
único que compraría generarlo; y lo que un generador no puede escribir —el portal del cadete, las
once vistas de Meta por el 2º tramo de la URL, las tres secciones sin `store`— es justo la parte que
el código no dice solo.

## El mapa

54 secciones. `key → components/… + lib/…`. Cuando no figura `lib/`, la lógica está en un archivo
suelto de `lib/` con el mismo nombre (`resumen.ts`, `variantes.ts`, …).

**Análisis** — `resumen` · `productos` · `variantes` · `ventas-mensuales` · `margenes` · `talles` ·
`colores` (cada una en `components/<key>/`) · `comisiones` · `verif-ventas` · `liquidacion`
(con `lib/` propio)

**Compras** — `fundas-modelo → components/fundas + lib/fundas` · `proveedores` · `ingresos` ·
`disenos` · `pedidos-clientes → components/pedidos-clientes + lib/pedidos-clientes` (Faltantes: lo
que los clientes piden y no tenemos. **Se anota desde `atencion`**, que es la pantalla abierta
mientras se atiende; acá se lee el ranking)

**Clientes** — `clientes → components/crm + lib/crm` (+ panel `/panel/<telefono>` →
`components/panel`, el iframe que la extensión de Chrome pega al costado de WhatsApp Web)

**Local** — `envios → components/envios + lib/envios` (+ portal `/cadete/<token>`) ·
`buzon → components/buzon + lib/buzon` (los mensajes de clientes sin resolver; su efecto real está
en Envíos, que pregunta antes de dejar avanzar el paquete de esa orden) ·
`atencion → components/atencion + lib/atencion` ·
`conteo → components/conteo-local-bdi` · `conteo-estandar-zattia` y
`conteo-estandar-stunned → components/conteo-estandar` · `cupones` · `etiquetas` · `exhib` ·
`ubicaciones` · `solicitudes` · `solicitudes-internas` · `postventa-local → components/postventa` ·
`reclamos-local` y `cambios-local → components/reclamos + lib/reclamos`

**Depósito** — `conteo-deposito` · `postventa-deposito → components/postventa`

**Marketing** — `mkt-ventas → components/mkt-ventas + lib/mkt-ventas` · `marketing` · `tncat` · `sesion-fotos → components/sesionfotos + lib/sesionfotos` · `canjes` ·
`gen-talles` · `gen-desc → components/gen-desc + lib/tn-desc` · `calendario`

**Meta** (área propia) — `meta-ads → components/meta-ads + lib/meta-ads`, once vistas por el 2º
tramo de la URL; el perfil de Marketing la ve porque tiene las dos áreas

**Administración** — `caducados` · `postventa` · `reposicion`

**Dirección** — `gerencial` · `memo` (semanal, por `?recurso=memo`, sin `store`) ·
`norte → components/norte + lib/norte` (cruza el ETL con el KV de `ingresos`, por `?recurso=norte`) ·
**Integraciones** — `integraciones`

**Sistema** — `novedades` y `manuales → components/… + lib/…`, los dos por `?recurso=sistema` en
la base de BDI y **sin `store`**: no son de una marca. Las novedades se cargan como borrador desde
`scripts/novedad.mjs` y se publican a mano; el manual de una sección lo muestra `SeccionHeader`.

**Agenda** — `agenda → components/agenda + lib/agenda` (área propia, por `?recurso=agenda`)

**Sin permiso (las ve todo el equipo)** — `inicio` · `novedades` · `manuales` · `agenda`

Son las de `KEYS_PARA_TODOS` (`lib/permisos.core.js`), que es lo que consulta `puedeVer`.
⚠️ **`usuarios` NO entra**, aunque esté en `KEYS_SIN_PERMISO` de `lib/nav.ts`: es de **admin**. Esta
línea lo listaba hasta el 16-ago-2026, arrastrado de `AGENTS.md`; medido corriendo `puedeVer` sobre
las 49 secciones, un perfil sin permisos ni función ve exactamente esas cuatro. **No tener área y
verse sin permiso son dos cosas distintas**: `usuarios` no tiene área (por eso ninguna función se lo
da) y además es admin-only.

El menú y los permisos se definen a mano en `lib/nav.datos.ts`: `PERM_CAT` (qué secciones existen,
con su área y sus sub-permisos) y `NAV_CATS` (cómo se agrupan en el sidebar).
