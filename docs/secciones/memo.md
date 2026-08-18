# Memo semanal — ficha de sección

Sección `memo`, área Dirección, **sólo admins**. Es el depósito semanal de lo que pasó: los números
que arma el monitor (lunes a domingo), el avance de los ocho sistemas y el acta que escriben Bruno
y Darío. No reemplazó ninguna pantalla — nació el 15-ago-2026 como la otra mitad de Gerencial.

🔑 **Gerencial es "qué decidir ahora": señales vivas, sin memoria y sin corte. Éste es "qué pasó",
con fecha y con firma.** Sirve de criterio general: si una pantalla no tiene pasado, le falta la
mitad.

## Dónde vive

`components/memo/` (`Memo.tsx`, `useMemoSemanal.ts`) · `lib/memo/semana.core.js` (la semana en hora
de Buenos Aires, sobre fechas peladas) + `foto.core.js` + `tipos.ts` (el re-export tipado) ·
`api/_memo.js`, que **entra por `api/datos.js?recurso=memo`** y no es una ruta (ver la invariante de
las 12 funciones en `AGENTS.md`) · tablas `memo_semana` y `memo_campo`, creadas por
`sql/migrate-memo.sql` con `scripts/apply-memo.mjs` · `tests/memo.test.ts`.

⚠️ **Las tablas viven en la base de BDI y NO tienen columna `store`** — a propósito: el memo es de
la empresa, tiene las tres líneas adentro y el acta habla de todo. Mismo criterio que `novedades`, y
el motivo duro está escrito arriba del `create table`.

## ⛔ Lo que comparte con otras secciones

- **Las señales las calcula Gerencial, no este handler.** `BloqueSenales` monta `useGerencial()`
  cuando se aprieta el botón y manda lo que ese panel ya computó; `api/_memo.js` sólo lo guarda.
  Recalcularlas del lado del servidor sería una segunda implementación de la misma pregunta.
- **La venta sale de la consulta del servidor que usa Liquidación** (`lib/liquidacion/ventas.ts`),
  acotada por rango — **no del ETL**, y el porqué está comentado arriba de `ventaPorLinea`.
- **La pauta sale del snapshot de Meta Ads** (`lib/meta-ads/leer-snapshot.core.js` +
  `rentabilidad.core.js`): los techos de rentabilidad son los mismos que mira Meta.

## Reglas que el código no dice

- 🔴 **Cerrar la semana apaga MUCHO más que los números.** El botón dice "Cerrar la semana y
  congelar los números", pero `estaCerrado` gobierna además **el acta, los ocho avances y el botón
  de señales** (`puedeEscribir && !estaCerrado`, tres veces en `Memo.tsx`). Cerrar con el acta en
  blanco la deja congelada vacía, **y no hay verbo de reabrir**: se sale con un UPDATE a
  `memo_semana` (`estado='abierto'`, `cerrado_at`/`cerrado_por` a `null`, sin tocar `foto`). Pasó el
  18-ago-2026. ⇒ **el orden del ritual es parte del diseño: acta el viernes, cerrar el lunes.**
- 🔑 **Los avances los redacta la IA leyendo los mensajes de commit de los repos**, no los escribe
  el equipo: los repos de Areben commitean en prosa de negocio. Escala medida: ~640 commits en 14
  días, 10 repos. ⚠️ **No se ejecuta solo** — alguien tiene que correrlo el viernes.
- 🔑 **Una novedad NO es un avance** (dicho por Bruno). Por eso el memo no cuelga de `novedades`: la
  novedad hay que redactarla y decidir a quién le llega, y colgarlo de ahí obligaba a escribir dos
  veces lo mismo.
- 🔴 **HC Arévalo queda afuera** (es de Bruno, no de Areben). Stunned entra "más que todo para ver
  el progreso".
- ⚠️ **El cierre no lo dispara un cron** y está bien así: el plan Hobby no da cron por minuto, y
  venta y pauta no derivan — da igual cerrar el lunes o el jueves siguiente.

## Lo que ya se rompió acá

- 🔴 **El memo se leía entero desde internet sin login** (`75e9e8e`): toda tabla nueva nace legible
  por la anon key. Ver la Fase S en `AGENTS.md`.
- 🔴 **Cambiar de semana mientras la foto se calculaba** dejaba los números de la anterior bajo el
  encabezado de la nueva — a `useMemoSemanal` le faltaba número de pedido (`8668264`). Salió de
  LEER el hook: desde el navegador no se pudo forzar.
- 🔴 **Una excepción por NOMBRE DE LÍNEA tapó un número real** (`6b767ba`, 18-ago): el costo por
  compra de Stunned decía "sin píxel" porque su píxel nunca había registrado una compra — y cuando
  registró 1, la excepción siguió callando. El motivo está comentado en `foto.core.js:semaforoPauta`.
  🔑 **La regla estaba escrita DOS veces** —el núcleo y la pantalla recalculando inline— y por eso
  sacarla de un lado la dejaba viva en el otro. **Y el test que había defendía la excepción.**
- ⚠️ **El puente de Chrome se come el primer clic de esta pantalla** (comprobado por red: no sale la
  llamada de la semana nueva). Entran después de un screenshot. **No es un defecto de la app** —
  verificarlo antes de reportarlo.

## Pendiente

- ▶️ **"Tomar la foto de hoy" nunca se apretó.** 🔑 **El momento es el VIERNES**: se sella una sola
  vez (`senales_tomadas_at` y el handler contesta `yaEstaba` si ya está) y no se recalcula, así que
  apretarlo un martes deja el capital parado del martes como la foto de la semana.
- ▶️ **El acta**: la semana `w2026-08-10` se cerró **sin acta, por decisión de Bruno** ("va a ser
  complicado que lo armemos, lo armamos esta semana"). El acta arranca en la 17 al 23.
- ⚠️ **El costo por compra de Stunned sale de UNA sola observación** ($9.886 con 1 compra). Es un
  número real, no una medición.

## Cómo se prueba

`npx vitest run tests/memo.test.ts --reporter=dot` (26 casos).

Lo que no es obvio:

- 🔑 **El oráculo del cierre no es la pantalla**: `memo_semana` leída aparte con la service key.
  Medido el 18-ago con cuatro lecturas del mismo número en cuatro momentos (parcial, jsonb del
  cierre, recálculo en vivo tras reabrir, jsonb del segundo cierre) — **idénticas**.
- **El candado de dos autores se puede probar SOLO**, sin Darío: se siembra una fila con otro
  `autor` en una semana de sandbox y se escribe desde la pantalla en el MISMO tema. Quedan las dos
  filas. Borrar el sandbox después.
- **Los avances guardan solos** (`useAutoguardado`, `onChange` + `onBlur`): no hay botón, así que la
  prueba de que guardó es el rótulo "Guardando… → Guardado" **y después la recarga**.
- **El mutante que hay que ver caer**: meterle a `semaforoPauta` un `if` que calle un caso con
  compras (p. ej. `p.compras === 1`) y comprobar que el rojo es un `AssertionError`, no un error de
  compilación. Los dos mutantes de esa regla mueren.
