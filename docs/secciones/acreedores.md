# A quién le debemos / Cobranza — ficha de sección

Sección `acreedores`. Aparece **dos veces en el menú**: en Dirección como *«A quién le debemos»* y
en Clientes como *«Cobranza»* — es la misma pantalla, y la repetición es a propósito (la usa el que
paga y el que cobra).

Resuelve un arreglo que antes se hacía hablando y no quedaba en ningún lado: a un cliente mayorista
que nos debe plata se le pide que **transfiera directo** a la cuenta de un acreedor nuestro (el
contador, el abogado) o a una **cuenta nuestra para algo puntual** (la cuota del crédito). Con una
transferencia se cancelan las dos deudas. Lo que faltaba registrar es el rato del medio: quién
prometió, cuánto, a qué cuenta, y si ya pasó.

## Dónde vive

- Pantalla: `components/acreedores/` — `Acreedores.tsx` (los del dashboard) ·
  `CuentasManuales.tsx` (las de acá) · `Compromisos.tsx` (el circuito, común a las dos) ·
  `CuentaLinea.tsx` (el alias con copiar) · tres hooks (`useAcreedores`, `useCompromisos`,
  `useCuentas`), **uno por fuente y a propósito**.
- **También vive en el panel de WhatsApp**: `components/panel/Pagos.tsx` (la pestaña) y
  `NuevoCompromiso.tsx` (el formulario con el cliente adelante). ⛔ Es donde de verdad se usa.
- Reglas: `lib/compromisos/` (`core.ts`, `plata.core.js`, `destino.ts`, `cliente.ts`) ·
  `lib/cuentas/` (`core.core.js`, `base.js`, `cliente.ts`) · `lib/acreedores/puente.core.js`.
- Handlers, todos por `api/datos.js`: `_acreedores.js` (lee el dashboard) · `_compromisos.js`
  (anota y confirma) · `_cuentas.js` (las cuentas manuales).
- Tablas, en la base de **BDI**: `compromisos_pago`, `cuentas_manuales`,
  `cuentas_manuales_objetivos` (`sql/migrate-compromisos-pago.sql`,
  `migrate-compromisos-telefono.sql`, `migrate-cuentas-manuales.sql`).
- Tests: `compromisos-handler` · `compromisos-core` · `compromisos-plata` · `cuentas-core` ·
  `acreedores-handler` · `panel-pagos-pantalla`.

## ⛔ Lo que comparte con otras secciones

- **El otro repo.** `areben-dashboard` expone dos puertas: `GET /api/puente/acreedores` (el saldo,
  calculado allá) y `POST /api/puente/pagos` (escribe el pago en el ledger). La llave es
  `PUENTE_SECRET` / `DASHBOARD_PUENTE_SECRET`, el mismo valor en los dos lados.
- **El panel de WhatsApp** (`docs/secciones/crm.md`): la pestaña Pagos monta este circuito entero.

## Reglas que el código no dice

- 🔴 **Hay DOS clases de destino y sólo una toca el dashboard.** Un *acreedor* sale del dashboard
  (son sus gastos con proveedor asignado) y confirmar **escribe un pago real en su ledger**. Una
  *cuenta manual* se abre acá y confirmar **no sale del Monitor**. Lo que las unifica es
  `lib/compromisos/destino.ts`: la diferencia se traduce una vez, en la frontera.
- 🔑 **Por qué existen las cuentas manuales** (Bruno, 21-sep-2026, con la cuota del crédito
  encima): la cuota de un préstamo no es un gasto con proveedor, así que no aparece nunca en la
  lista de acreedores; y aunque apareciera, el pago confirmado no sabría imputarse contra la cuota.
  Se planteó conectarlo y lo frenó: *«prefiero que no tenga vinculación con el dashboard… sino
  vincularla con una cuota de un crédito lo haría larguísimo»*. ⛔ El precio, aceptado y dicho: **el
  pago de la cuota se sigue cargando en el dashboard a mano**. Esto registra quién puso qué.
- 🔑 **Una cuenta manual se prende con un monto y se apaga sola al llegar a él.** ⛔ No es un ciclo
  mensual — se diseñó con meses (cerrar septiembre, abrir octubre, arrastrar lo que faltó) y Bruno
  lo corrigió: *«capaz que este mes se paga por transferencia y el mes que viene no»*. Una cuenta
  que se renovara sola pediría plata para algo que ya nadie está juntando. Dormida es el estado
  **normal**, y por eso desaparece de las listas de "a quién pedirle" en vez de figurar en cero.
- 🔑 **Los dos números que no son el mismo.** *Falta juntar* (o *se le debe*) es la deuda; *se le
  puede pedir* descuenta lo ya comprometido y sin entrar. El segundo es el que decide: pedir contra
  el primero compromete dos veces la misma plata. Es `sePuedeComprometer` y vive en `.js` porque
  **el servidor la aplica de nuevo** antes de guardar (desde el 7-sep-2026).
- 🔴 **El único candado real del circuito es un índice**: `idx_objetivo_abierto_por_cuenta` (una
  sola vuelta abierta por cuenta). El control de "no pedir de más" ⛔ **no** lo es: dos `crear`
  simultáneos pasan los dos, porque el techo de un acreedor vive en otra base y un CHECK no lo ve.
- ⚠️ **El dashboard no sabe que hay plata comprometida.** Si alguien paga ese gasto desde allá, se
  enteran al confirmar, con la plata ya movida (queda saldo a favor, no se pierde). Por eso la
  pantalla muestra siempre *saldo del dashboard − lo comprometido acá*.
- 🔑 **Quién DEBE y quién TRANSFIRIÓ son dos datos.** `pagador_nombre` es siempre el cliente;
  `pagador_titular` sólo cuando la transferencia vino a nombre de otro (el novio, la razón social).
  ⛔ El titular **no se pregunta al prometer** —ahí es una adivinanza— sino al confirmar, mirando el
  extracto. Y ⛔ el resto de un cobro parcial **no lo hereda**: es otra transferencia.
- 🔑 **La llave del cliente que todavía no está en Gestión Nube es el TELÉFONO**, no el nombre. Con
  eso el panel ofrece reengancharlo solo cuando aparece en el ERP (acción `vincular`). ⛔ Un
  compromiso ya confirmado no se vincula: su pagador ya viajó al dashboard.
- ⚠️ **Entrar de menos abre un compromiso nuevo por el resto** (`abrirElResto`, la misma función
  para los dos caminos). En una cuenta manual, ⛔ si la vuelta ya se completó no se abre: no habría
  contra qué anotarlo.
- ⚠️ **Entrar de más en una cuenta manual se acepta y se avisa.** La plata ya se movió; rebotar no
  la devuelve. No hay saldo a favor en el modelo, así que lo único honesto es decir cuánto sobra.
- ⚠️ **Permisos**: ver la sección alcanza para leer; `acreedores.prometer` para anotar y para
  administrar las cuentas manuales; `acreedores.confirmar` para mover plata. ⛔ No se creó una key
  nueva para las cuentas manuales a propósito: una key nace apagada para todos y hay que tildarla
  usuario por usuario.

## Lo que ya se rompió acá

- 🔴 **El monto ×100** (7-sep-2026, `e944ccd`): el casillero se llenaba con `String(monto)` y se
  leía con el convenio de miles. Nunca llegó a producción. ⛔ **Hacia un input de plata va
  `paraEditar(n)`, nunca `String(n)`** — el porqué entero está en `lib/compromisos/plata.core.js`.
- 🔴 **La fecha proponía MAÑANA** después de las 21 (UTC en vez de local), y el cierre de mes imputa
  por esa fecha. ⛔ El día de hoy se pide con `hoyISO()`.
- 🔑 **Los dos bugs de plata salieron de lo mismo: dos formularios de confirmar que hacen lo mismo,
  y uno arreglado y el otro no.** Siguen siendo dos (el de la sección y el del panel).
- **El rename `prometer` → `comprometer`** (4-sep-2026) se llevó puesta la key del permiso: no
  rompió nada visible, sólo que todos los que lo tenían tildado lo perdieron.
- **Un 200 sin JSON dejaba el compromiso trabado para siempre** (chocaba contra el CHECK y el
  reintento fallaba igual). Por eso `confirmar` corta con 502 si la respuesta no se entiende.

## Pendiente

- ▶️ **Un solo formulario de confirmar** para el panel y la sección. Es la máquina que fabricó los
  dos bugs de plata.
- ▶️ **El grafo de estados en un solo lugar**: hoy en tres copias (`core.ts`, el handler, el CHECK
  del SQL), y la que tiene tests es la que no usa nadie (`puedeIr`/`porQueNo`).
- ⚠️ El `GET` de compromisos corta en **500 filas sin filtrar por estado**: los abiertos más viejos
  desaparecen solos (es el corte de 1.000 filas de siempre).
- ⚠️ El panel **no puede cargar la fecha comprometida**, así que la cola por urgencia es decorativa.
  Y `cliente_store` queda siempre en `'bdi'`.
- 🔴 **En el otro repo**: `POST /api/puente/pagos` **acepta cualquier monto sin compararlo con la
  deuda**. Es la red que hubiera atajado el ×100 antes del ledger.

## ✅ 21-sep-2026 — pasada de diseño de la pestaña Pagos

Sólo **cómo se ve y cómo se lee**: ni una regla de negocio cambió. Lo que hay que saber:

- 🔑 **La pestaña tiene UN margen lateral** (`MARGEN`, en `Pagos.tsx`). Había tres —tarjetas a 20 px,
  títulos a 12, avisos a 18— y en una columna de 350 px eso es lo que más se notaba. ⛔ Lo que se
  agregue acá arranca en esa línea, no en una propia.
- 🔑 **Filas a todo el ancho, como la solapa "Hoy"**, en vez de tarjetas flotantes. Las dos listas de
  trabajo del mismo panel se dibujaban con convenciones opuestas, y el borde lateral se comía el
  12 % del ancho para no separar de nada.
- 🔑 **La franja de color de la izquierda es la única diferencia visible entre las dos listas**:
  índigo = "te toca a vos" (mirar el banco), gris = "le toca al cliente". Antes las separaba sólo un
  título de 12 px, y separarlas es el sentido de la pestaña.
- 🔑 **El selector de vista está arriba y es `sticky`**, y es un control partido y no dos chips: se
  veía igual que los filtros de "Hoy" (🔥 🟡 ⚪ 🧊), que filtran en vez de cambiar de pantalla.
  ⛔ El nombre "A quién le debemos" **se queda** aunque con el chat adelante la pregunta sea "¿a
  dónde le digo que transfiera?": lo bautizó el menú de Dirección y VOCABULARIO §3 no deja que la
  pantalla lo llame de otra manera. ⚠️ Comparte el `top: 0` con el cartel de aviso del panel, que
  tiene más z-index y le pasa por encima los segundos que dura.
- **El total va ANTES del formulario**. Estaba en el medio, después del bloque de anotar. El
  formulario sigue siendo lo primero que se puede tocar.
- **Toda la plata pasa por `Monto`**, con `tabular-nums` y tres tamaños (`total` una sola vez por
  pantalla). Sin cifras de ancho fijo, en una lista de seis las comas caen en lugares distintos.
- **Los casilleros son los del kit** (`mo-input`), no bordes pintados a mano: foco, hover y alto
  salen de un solo lugar. Los avisos son `Notice` y los vacíos `EmptyState`, por lo mismo.
- 🔑 **`components/panel/DatosDeCuenta.tsx` es nuevo, y es el alias + banco + titular + CBU + los dos
  botones de copiar** que estaban escritos **tres veces** (las dos listas de `VistaAcreedores` y el
  formulario). Igual que `TarjetaDestino`, que era la misma tarjeta dos veces. Es la misma máquina
  que fabricó los dos bugs de plata.
- **El techo sólo se dice cuando no es el número grande**: sin nada comprometido, "faltan juntar
  $380.000" abajo de "$380.000 se le puede pedir" es la misma cifra dos veces.
- ⚠️ **Los `aria-label` de los dos íconos ahora nombran la fila** (`Ya entró lo de «Fulana»`),
  VOCABULARIO §3.3: diez "Ya entró" apilados son diez botones idénticos para quien no ve la
  pantalla. El `title` sigue llevando la frase sola. Los dos tests que lo fijaban se actualizaron.

▶️ **Lo que quedó afuera**: `Chapa` y `Bloque` siguen duplicados entre `Pagos.tsx`,
`PanelWhatsApp.tsx` y `AgendaDelDia.tsx` — se emparejaron las medidas (11 px / 600), pero juntarlos
de verdad es mudarlos a un archivo común y eso toca las tres solapas.

## Cómo se prueba

```bash
npx vitest run tests/compromisos-handler.test.ts tests/cuentas-core.test.ts --reporter=dot
```

A mano, y esto es lo que no se ve en los tests:

- **Los previews de Vercel no sirven para probar esto**: Chrome está logueado como Bruno, que no
  tiene acceso al proyecto, y el login con Google no vuelve a un preview. Se entra con usuario y
  contraseña, o se prueba en producción cuando la prueba no mueve plata: **anotar y cancelar no le
  hablan al dashboard**, confirmar sí (salvo en una cuenta manual, que nunca).
- **La migración de las cuentas manuales se corre a mano** en el SQL Editor de Supabase, en la base
  de **BDI** (`srqzzffmiiescffabtlc`) — ⛔ la del Monitor, **no** la del dashboard.
- Para ver el circuito entero sin tocar el ledger: crear una cuenta manual, cargarle un monto
  chico, anotar dos compromisos y confirmarlos. Al llegar al monto la cuenta tiene que quedar
  dormida sola.
