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
  días, 10 repos; la semana del 17 al 23 fueron **323 commits en 8 repos** (marketing 154, monitor
  104, y **Moldea y Creativa en cero — que también se escribe**). ⚠️ **No se ejecuta solo** —
  alguien tiene que correrlo el viernes.
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

## El ritual: quién hace qué, y qué se puede automatizar

El orden es **acta y foto el viernes, cerrar el lunes**, y no es una preferencia: cerrar apaga los
tres bloques (ver arriba).

| paso | quién | estado |
|---|---|---|
| Tomar la foto de señales | una persona, el **viernes** | 🏁 se ejerció el 21-ago-2026 |
| Los 8 avances | los redacta la IA de los commits | 🏁 cargados el 21-ago **por API** |
| El acta (7 temas) | **Bruno y Darío**, nadie más | ▶️ arranca en la 17 al 23 |
| Cerrar | una persona, el **lunes** | ⛔ nunca un cron |

🔑 **Los avances se pueden escribir por la API y no hace falta el navegador** (que en esta pantalla
se come el primer clic): `POST /api/datos?recurso=memo` con `accion:'guardar-campo'` y el header
`x-monitor-auth: base64({user,pass})` — `MONITOR_PASS` del `.env`, igual que `scripts/test-reingreso.mjs`.
Medido el 21-ago: **8 de 8 en 200, en 7 segundos**, y las 8 filas verificadas byte a byte contra el
original leyendo `memo_campo` aparte. ⛔ El `autor` sale de la **sesión**, nunca del body.

🏁 **El recordatorio ya no depende de que alguien se acuerde**: son dos pendientes rutinarios en la
**Agenda operativa**, con `destino {tipo:'seccion', key:'memo'}` (o sea admins) — viernes `dias:[5]`
"tomar la foto y escribir el acta" y lunes `dias:[1]` "cerrar la semana que terminó". Aparecen en
Hoy, en Inicio y en el badge, y **Cumplimiento mide si se hicieron**. El motor es
`lib/agenda/reglas.core.js` y el handler `api/_agenda.js` (la sección todavía no tiene ficha propia).
🔴 `dias` se indexa con `getDay()`, **0 = domingo**: el viernes es el 5. Verificarlo corriendo
`aplicaEn` sobre los siete días, no leyendo la fila.

### 🔴 Automatizar la FOTO sería una segunda implementación, no un cron

Es la tentación obvia y hay que decirle que no por ahora. Las señales las arma `useGerencial()` **en
el navegador**: baja el payload del ETL (**~14,7 MB por marca**), el cajón de sesiónfotos, el de
solicitudes internas, los ingresos del KV y el índice de precios de TN, y recién ahí corren los
detectores (`detectarDeMarca`, todo TS). Un cron tiene que rehacer eso del lado del servidor — que
es exactamente lo que la sección de arriba dice que no se hace.

Lo que sí quedó medido, por si algún día se paga:

- ✅ **Meta Ads no hace falta**: `resumirSenales` filtra `area !== 'ads'`.
- ✅ **El handler ya es a prueba de cron**: `accion:'senales'` mira `senales_tomadas_at` y si ya está
  contesta `yaEstaba:true` **sin tocar nada**, así que correrlo de más no puede pisar la foto.

### ✅ El barato es el cron de los AVANCES, y las piezas ya están todas

Sin código nuevo de infraestructura: **13 workflows de GitHub Actions** con cron, secretos y candados
de concurrencia · `@anthropic-ai/sdk` ya es dependencia y `ANTHROPIC_API_KEY` ya está en Vercel (la
usa Redacción, `api/_tn-desc-ia.js`) · los 10 repos están en GitHub · y el POST de `guardar-campo` ya
está ejercido. Forma: los viernes, juntar los commits de la semana por repo con la API de GitHub,
redactar los ocho con el modelo, y **dejarlos cargados para que los editen** — nunca cerrar.

📌 **La decisión de cuándo pagarlo ya estaba escrita**: "si el ritual aguanta 3-4 semanas, se
automatiza". Con el pendiente del viernes puesto, ahora **Cumplimiento tiene el dato** de cuántas
veces se olvidó — que es lo que hace que la decisión no sea una corazonada.

## Pendiente

- ▶️ **El acta de la semana 17 al 23**: es la primera que la lleva. La `w2026-08-10` se cerró **sin
  acta, por decisión de Bruno** ("va a ser complicado que lo armemos, lo armamos esta semana") ⇒ ⛔
  no se re-abre.
- ▶️ **El cron de los avances** (arriba): decidido el enfoque, sin escribir.
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
