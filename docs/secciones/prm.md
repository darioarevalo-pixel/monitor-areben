# PRM — ficha de sección

Sección `prm`, área `proveedores`. La relación con cada proveedor: quién es, qué se le anotó, qué
quedó prometido, si entrega lo que le pedimos y cómo vendió su mercadería. **Reemplazó la memoria**:
la decisión de volver o no a un local de Flores se tomaba de cabeza.

⛔ **No es donde se carga.** Lo de la calle —la visita, el interés, el compromiso— se anota en
`recorridas`, área Compras. Las dos secciones miran **las mismas seis tablas** y comparten
`lib/prm/`. Leer también `docs/secciones/recorridas.md`.

## Dónde vive

- Pantalla: `components/prm/` (`PRM.tsx` la lista + la pestaña «Lo prometido», `FichaProveedor.tsx`
  la ficha de a uno, `usePRM.ts` la carga).
- Dominio: `lib/prm/` — `core.ts` (puro, y **re-exporta tipado** lo de `geo.core.js`), `tipos.ts`,
  `cliente.ts`, `geo.core.js`.
- Servidor: `api/_prm.js`, por la puerta `api/datos?recurso=prm`. **Un handler para las dos
  secciones**, con el permiso partido acción por acción.
- Datos: Supabase **de BDI**, seis tablas — `proveedor_local`, `proveedor_visita`,
  `proveedor_interes`, `proveedor_compromiso`, `recorrida`, `recorrida_parada`
  (`sql/migrate-prm.sql`, que es la fuente de verdad del modelo y explica cada campo).
- Tests: `tests/prm-core.test.ts` (33) y `tests/prm-handler.test.ts` (14).

## ⛔ Lo que comparte con otras secciones

- **`lib/prm/`** es de las DOS secciones. El corte no está en el dato sino en la pregunta, y por eso
  la regla vive una sola vez. Es el mismo arreglo que `lib/crm/`, que alimenta la sección Clientes y
  el panel de WhatsApp.
- **`lib/prm/geo.core.js`** es JS plano porque lo importa `api/_prm.js`, que corre en Node sin pasar
  por el compilador de Next. `core.ts` lo re-exporta tipado (el molde es `permisos.core.js` /
  `permisos.ts`). ⛔ Copiar el orden del recorrido adentro del handler es el bug que ya costó caro
  en Canjes.
- **`api/_georef.js`**: el geocoder del Estado, que ya usaba Envíos. 🔴 **Le sacamos la provincia
  clavada** — ver abajo.
- **`api/blob-upload.js`**: las fotos van al prefijo `prm`. ⚠️ Un prefijo nuevo son DOS líneas
  (`PREFIJOS` del handler y `PrefijoBlob` de `lib/imagenes.ts`); con una sola, la foto **se guarda
  igual pero en `fundas/`**.
- **`lib/recepciones/core.ts`** (`porProveedor`): lo llama la ficha, ⛔ no el handler.
- 🆕 🔴 **`api/_oc-webhook.js` ESCRIBE en `proveedor_local`** (2-sep-2026). El receptor del webhook de
  Ingresos —que ⛔ no pide sesión— le abre la ficha al proveedor que todavía no la tiene, con la
  misma fila que el script de siembra: **`lib/prm/sembrado.core.js`**, JS plano por lo mismo que
  `geo.core.js`. ⇒ el que toque el alta de un local tiene **dos llamadores**, y uno de ellos no
  pasa por `api/_prm.js` ni por su permiso.

## Reglas que el código no dice

- 🔴 🔑 **Son DOS secciones porque son dos preguntas, y el corte lo puso Bruno** (30-ago-2026):
  *«no es lo mismo comprar o querer comprar que analizar al partner o proveedor»*. Una se contesta
  parado en una galería con el celular; la otra sentado, antes de decidir si vuelvo. Juntarlas en
  una pantalla las arruina a las dos: la de la calle se llena de números y la de decidir se llena
  de botones.
- 🔑 **El nombre «PRM» es del vocabulario interno de Bruno y Darío** (CRM/PRM), y va contra la regla
  de escribir en criollo. Fue decisión suya, sostenida después de plantearle la objeción.
  ⚠️ Queda una asimetría a la vista: la hermana figura en el menú como **«Clientes»**, no como
  «CRM». Por eso el `info` de la sección dice en criollo qué es.
- 🔴 **`recepciones` distingue `null` de `[]`, y la pantalla dibuja tres cosas distintas**: sin
  enganche · enganchado y sin ninguna OC · con datos. Devolver `[]` para los dos primeros haría que
  la ficha afirmara «este proveedor nunca nos entregó nada» cuando lo que pasa es que nadie lo
  enganchó. **El cero afirma.** Atado por test.
- 🔴 **`proveedor_gn` existe SÓLO del lado de Zattia**: la columna `productos.proveedor` no está en
  la base de BDI (dicho también en `api/_espejo.js:72`). Un proveedor de BDI **nunca** va a tener el
  bloque «Lo que vendió», y eso ⛔ no es un dato faltante — la pantalla lo dice con esas palabras.
  Por eso el GET de opciones devuelve `gnDisponible`: un desplegable vacío por no haber podido
  preguntar se lee igual que uno vacío porque no hay.
- 🆕 🔴 🔑 **El padrón ENVEJECE SOLO, y por eso el alta no puede ser un script.** Los 30 primeros
  locales salieron de `scripts/sembrar-prm.mjs` el 30-ago-2026 leyendo las OCs de ese día: es una
  **foto**. El 1-sep entraron 13 órdenes con **cuatro proveedores nuevos** —`YASANA`, `ELIANA IND`,
  `AIME`, `AUDAZ`— y sus órdenes ⛔ no se veían desde ninguna ficha, porque la ficha no existía.
  El modo de falla es mudo por partida doble: el webhook contesta 200, la OC entra, Ingresos la
  muestra, y lo único que falta es **la mitad del PRM que se supone medida**. Desde el 2-sep lo
  siembra el webhook (`abrirFichaDeProveedor`), y el script quedó para backfill y reparación.
  ⚠️ **La ficha nace sin zona igual que las sembradas**, así que sigue sin entrar a una recorrida.
- 🔴 **Los dos enganches se tildan A MANO y ⛔ no se adivinan por nombre.** Está medido: de los 30
  proveedores de las 79 OCs, `CHINA` se lee sola y `RHOVE`/`ASKDENIM` no. **Un enganche mal puesto
  es peor que ninguno**: una ficha que ya muestra cumplimiento y margen no la vuelve a revisar
  nadie. El índice único de `proveedor_id_ingresos` existe por lo mismo: dos locales colgados del
  mismo proveedor contarían el cumplimiento dos veces (el handler contesta 409).
- 🔴 **El enganche pide el permiso `prm` y ⛔ no `recorridas`**, aunque las dos secciones entren por
  el mismo handler. Atar un local a un proveedor de Ingresos hace aparecer en la ficha las OCs de
  otro: es una decisión de escritorio, no un gesto de la calle. **Este handler es el único lugar
  donde eso se decide** ⇒ está atado por test en las dos direcciones.
- 🔑 **El agregado de entrega lo hace la PANTALLA con `porProveedor`, no el handler.** `api/*.js` no
  puede importar TypeScript, así que el handler devuelve las OCs crudas. Copiar la fórmula acá sería
  una segunda regla sobre la misma plata.
- 🔑 **La pestaña «Lo prometido» es lo que justifica la sección**: los compromisos abiertos de todos
  los proveedores juntos, ordenados por urgencia. Es lo único que no se puede ver desde la ficha de
  a uno, y es lo que se mira antes de salir.

## Lo que ya se rompió acá

- ⚠️ Nada todavía: la sección salió el 30-ago-2026. Lo que sí se rompió **al construirla**:
  - **El geocoder mandaba `provincia: 'Santa Fe'` clavada** (`api/_georef.js`). Era verdad mientras
    el único que lo llamaba era Envíos. Con eso, `"Av. Avellaneda 3252"` resuelve **en Santa Fe** y
    Georef contesta **un punto plausible, no un error** — el geocoder que inventa lejos por el que
    se descartó Nominatim. Ahora `provincia` es **obligatoria por pedido** y sin ella tira.
    🔴 **No lo cubría ningún test**: los de Envíos no importan `_georef.js`. Por eso existe
    `tests/georef-provincia.test.ts`, que mira **el cuerpo del POST** y no el resultado (un mock que
    devuelva coordenadas lindas pasa igual con la provincia mal).
  - **El CSV de Google Maps perdía el punto callado.** La URL lleva comas adentro
    (`@-34.6295,-58.4635,17z`): un CSV sin comillas —abierto y vuelto a guardar en una planilla— la
    parte en tres columnas. Y en ese archivo el punto es **el único dato de ubicación que hay**, no
    viene la dirección. Ahora se busca en la fila entera si la columna no lo tiene.

## Pendiente

- ▶️ **Que un compromiso siembre un pendiente en la Agenda** (`lib/agenda/reglas.core.js`). Es el
  paso natural y no se hizo: la Agenda **la ve todo el equipo** y esto todavía es de una persona.
  Se decide después de un viaje real.
- ▶️ **Enganche con los otros dos padrones de proveedores del grupo** — `areben-produccion` (Prisma,
  facturas de tela) y `areben-dashboard` (Supabase, financiero). Están en otras bases, modelan
  facturas y **ninguno tiene dirección**. El puente, si hace falta, es `proveedor_id_ingresos`.
- 🔴 ▶️ **Nadie lo usó todavía.** Medido contra la base el 2-sep-2026: **30 locales · 0 con zona ·
  0 con dirección · 0 visitas · 0 intereses · 0 compromisos · 0 recorridas**. Es un módulo que se
  alimenta 100% a mano; por eso `scripts/sembrar-prm.mjs` lo arrancó con los proveedores de las OCs
  y por eso el webhook los sigue sembrando, para que la ficha diga algo desde el día uno.
- 🔴 ▶️ **La mano que lo destraba es una sola: la ZONA.** Los 30 están en `null` a propósito y sin
  zona ⛔ no entran a ninguna recorrida, así que «Armar recorrida» no sirve hasta que se clasifiquen.
  ⛔ **Y ⛔ no se puede hacer de este lado**: no hay dirección en ninguno de los tres padrones del
  grupo (verificado en `areben-produccion`, cuyo modelo `Proveedor` tiene cuit/contacto/notas y
  **ninguna dirección**), y adivinar por el nombre está medido y descartado.
- ⚠️ **Sin novedad, a propósito**: es para admin.

## Cómo se prueba

```bash
npx vitest run tests/prm-core.test.ts tests/prm-handler.test.ts tests/georef-provincia.test.ts --reporter=dot
```

Lo que **no** es obvio:

- 🔴 **La migración la corre Bruno**: `node scripts/apply-prm.mjs` lo bloquea el clasificador de esta
  máquina. El script ejerce los candados y **trae su propia punta positiva** (que una fila sana
  entre, y que **dos locales sin enganche convivan** — la punta del índice PARCIAL, que es la que se
  olvida: un `unique` sin el `where` no dejaría cargar dos locales).
- ⚠️ **El `porProveedor` de la ficha se ejerce con OCs de verdad**, no con la fixture: el enganche
  cuelga de `proveedor_id`, que lo escribe el webhook.
- 🔴 **Recorridas se camina en el CELULAR**, no en el navegador de la Mac: la foto viene de la cámara
  y el borrador de `localStorage` sólo se prueba **cortando la red**.
