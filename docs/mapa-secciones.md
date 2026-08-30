# Mapa de secciones

Dónde vive cada pantalla del monitor. Vivía adentro de `AGENTS.md` y salió el 16-ago-2026: son 43
líneas que se pagaban en **cada mensaje** de cada sesión, y es una tabla de ubicaciones — se consulta
cuando hay que ubicar algo, no siempre. `AGENTS.md` dejó la orden de leer este archivo.

No está generado a propósito. `tests/agents-mapa-secciones.test.ts` ya lo amarra al código en las dos
direcciones (toda sección del registro figura acá, y todo lo que se nombra acá existe), que es lo
único que compraría generarlo; y lo que un generador no puede escribir —el portal del cadete, las
doce vistas de Meta por el 2º tramo de la URL, las tres secciones sin `store`— es justo la parte que
el código no dice solo.

## El mapa

60 secciones. `key → components/… + lib/…`. Cuando no figura `lib/`, la lógica está en un archivo
suelto de `lib/` con el mismo nombre (`resumen.ts`, `variantes.ts`, …).

**Análisis** — `resumen` · `productos` · `variantes` · `ventas-mensuales` · `margenes` · `talles` ·
`colores` (cada una en `components/<key>/`) · `comisiones` · `verif-ventas` · `liquidacion`
(con `lib/` propio)

**Compras** — `fundas-modelo → components/fundas + lib/fundas` · `ingresos` ·
`recepciones → components/recepciones + lib/recepciones` (**Ingresos**: las OC que el sistema de
Ingresos confirma como recibidas. La escribe un webhook —`api/_oc-webhook.js`—, la pantalla sólo
lee. ⛔ No es `ingresos`, que es la importación que VIENE) ·
`disenos` · `pedidos-clientes → components/pedidos-clientes + lib/pedidos-clientes` (Faltantes: lo
que los clientes piden y no tenemos. **Se anota desde `atencion`**, que es la pantalla abierta
mientras se atiende; acá se lee el ranking) ·
`recorridas → components/recorridas + lib/prm` (los locales de proveedores que hay que visitar y el
viaje a verlos. Es el HACER; ⛔ el dominio es `lib/prm/`, compartido con la sección `prm`)

**Proveedores** — un grupo propio desde el 30-ago-2026, al mismo nivel que Clientes, porque
*«no es lo mismo comprar o querer comprar que analizar al partner»* (Bruno) —
`prm → components/prm + lib/prm` (la ficha de la relación: la historia, los compromisos abiertos, si
entrega lo que le pedimos y cómo vendió. Es el SABER) ·
`proveedores` (analítica de ventas y stock por proveedor sobre el ETL, **sólo Zattia**. Estaba en
Compras y se mudó acá: ⛔ no se le tocó una línea de código)

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

**Depósito** — `conteo-deposito` · `postventa-deposito → components/postventa` ·
`retornos → components/retornos + lib/reclamos/retornos.ts` (la bandeja de lo que esperamos que
vuelva; **también cuelga del menú de Local**, con rótulo propio, y lee la tabla de reclamos por la
puerta angosta `vista=retornos`)

**Marketing** — `mkt-ventas → components/mkt-ventas + lib/mkt-ventas` · `marketing` · `tncat` · `sesion-fotos → components/sesionfotos + lib/sesionfotos` · `canjes` ·
`gen-talles` · `gen-desc → components/gen-desc + lib/tn-desc` · `calendario`

**Meta** (área propia) — `meta-ads → components/meta-ads + lib/meta-ads`, doce vistas por el 2º
tramo de la URL (la doceava es `publicos`, fría vs remarketing, 30-ago-2026); el perfil de Marketing
la ve porque tiene las dos áreas

**Administración** — `caducados` · `postventa` · `reposicion` ·
`insumos → components/insumos + lib/insumos` (lo que se consume y no se vende: bolsas, rollos,
papel. Stock **por lugar** —depósito y los dos locales— porque el que se queda sin bolsas es el
local mientras el depósito tiene. ⛔ No es stock de mercadería: un insumo no existe en GN)

**Dirección** — `gerencial` · `memo` (semanal, por `?recurso=memo`, sin `store`) ·
`norte → components/norte + lib/norte` (cruza el ETL con el KV de `ingresos`, por `?recurso=norte`) ·
**Integraciones** — `integraciones`

**Sistema** — `novedades` y `manuales → components/… + lib/…`, los dos por `?recurso=sistema` en
la base de BDI y **sin `store`**: no son de una marca. Las novedades se cargan como borrador desde
`scripts/novedad.mjs` y se publican a mano; el manual de una sección lo muestra `SeccionHeader`.
Y `organizacion → components/organizacion + lib/organizacion`, por `?recurso=organizacion`, misma
base y también sin `store`: quién responde de qué es la misma persona en las dos marcas.
⚠️ **Es la contracara de la Agenda**: aquélla contesta «¿qué me toca hoy?» y ésta «¿de quién es
esto?». Tablas `organizacion_nodos` y `organizacion_resp`; el sub-permiso es `organizacion.editar`.
🔴 **Y ⛔ NO está en `KEYS_PARA_TODOS`, a diferencia de sus dos hermanas de área**: está en obra
(Bruno, 30-ago-2026) y hoy la ven **sólo los admin**, porque ninguna función hereda esa área.
Se abre al equipo con una línea, cuando la vista esté.

**Agenda** — `agenda → components/agenda + lib/agenda` (área propia, por `?recurso=agenda`).
⚠️ **Una sección con SEIS entradas de menú** (como Meta): `/agenda` · `/agenda/semana` ·
`/agenda/mes` · `/agenda/eventos` · `/agenda/rutinas` · `/agenda/cumplimiento`. Las tres últimas
piden el sub-permiso `agenda.cargar`; la subárea sale del 2º tramo de la URL.

**Sin permiso (las ve todo el equipo)** — `inicio` · `novedades` · `manuales` · `agenda`

Son las de `KEYS_PARA_TODOS` (`lib/permisos.core.js`), que es lo que consulta `puedeVer`.
⚠️ **`usuarios` NO entra**, aunque esté en `KEYS_SIN_PERMISO` de `lib/nav.ts`: es de **admin**. Esta
línea lo listaba hasta el 16-ago-2026, arrastrado de `AGENTS.md`; medido corriendo `puedeVer` sobre
las 49 secciones, un perfil sin permisos ni función ve exactamente esas cuatro. **No tener área y
verse sin permiso son dos cosas distintas**: `usuarios` no tiene área (por eso ninguna función se lo
da) y además es admin-only.

El menú y los permisos se definen a mano en `lib/nav.datos.ts`: `PERM_CAT` (qué secciones existen,
con su área y sus sub-permisos) y `NAV_CATS` (cómo se agrupan en el sidebar).
