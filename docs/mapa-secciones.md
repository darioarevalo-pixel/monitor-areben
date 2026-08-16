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

49 secciones. `key → components/… + lib/…`. Cuando no figura `lib/`, la lógica está en un archivo
suelto de `lib/` con el mismo nombre (`resumen.ts`, `variantes.ts`, …).

**Análisis** — `resumen` · `productos` · `variantes` · `ventas-mensuales` · `margenes` · `talles` ·
`colores` (cada una en `components/<key>/`) · `comisiones` · `verif-ventas` · `liquidacion`
(con `lib/` propio)

**Compras** — `fundas-modelo → components/fundas + lib/fundas` · `proveedores` · `ingresos` ·
`disenos`

**Clientes** — `clientes → components/crm + lib/crm`

**Local** — `envios → components/envios + lib/envios` (+ portal `/cadete/<token>`) ·
`atencion → components/atencion + lib/atencion` ·
`conteo → components/conteo-local-bdi` · `conteo-estandar-zattia` y
`conteo-estandar-stunned → components/conteo-estandar` · `cupones` · `etiquetas` · `exhib` ·
`ubicaciones` · `solicitudes` · `solicitudes-internas` · `postventa-local → components/postventa` ·
`reclamos-local` y `cambios-local → components/reclamos + lib/reclamos`

**Depósito** — `conteo-deposito` · `postventa-deposito → components/postventa`

**Marketing** — `marketing` · `tncat` · `sesion-fotos → components/sesionfotos + lib/sesionfotos` · `canjes` ·
`gen-talles` · `calendario`

**Meta** (área propia) — `meta-ads → components/meta-ads + lib/meta-ads`, once vistas por el 2º
tramo de la URL; el perfil de Marketing la ve porque tiene las dos áreas

**Administración** — `caducados` · `postventa` · `reposicion`

**Dirección** — `gerencial` · `memo` (semanal, por `?recurso=memo`, sin `store`) · **Integraciones** — `integraciones`

**Sistema** — `novedades` y `manuales → components/… + lib/…`, los dos por `?recurso=sistema` en
la base de BDI y **sin `store`**: no son de una marca. Las novedades se cargan como borrador desde
`scripts/novedad.mjs` y se publican a mano; el manual de una sección lo muestra `SeccionHeader`.

**Agenda** — `agenda → components/agenda + lib/agenda` (área propia, por `?recurso=agenda`)

**Sin permiso (todos las ven)** — `inicio` · `usuarios` · `novedades` · `manuales` · `agenda`

El menú y los permisos se definen a mano en `lib/nav.datos.ts`: `PERM_CAT` (qué secciones existen,
con su área y sus sub-permisos) y `NAV_CATS` (cómo se agrupan en el sidebar).
