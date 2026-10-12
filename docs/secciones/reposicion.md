# Reposición — ficha de sección

Sección `reposicion`, área `administracion`. Qué llevar del depósito al local y qué devolver. **Dos
mundos en la misma pantalla:** BDI sigue con el mínimo fijo por categoría/modelo (`core.ts`, fundas);
**Zattia repone según ventas** desde el 11-oct-2026 (`ReposicionZattia.tsx` + `porVentas.ts`), con
selector **Zattia / Stunned**. Las reglas de Zattia las decidieron Darío y su socio ese día, medidas
contra las ventas reales; la conversación entera está en la nota viva de Darío (Claude Docs).

## Dónde vive

- `components/reposicion/Reposicion.tsx` — BDI (y el modal viejo de mínimos/topes). Para Zattia
  monta `ReposicionZattia.tsx`: dos pestañas, la config por línea y la tabla con el porqué.
- `lib/reposicion/porVentas.ts` — el cálculo de Zattia (puro). `pdf.ts` — la hoja A4 (compartida con
  BDI). `rollo.ts` — el rollo de 80 mm de «Devolver al depósito». `cliente.ts` — inventario, ventas
  (`ventasLocal(marca, días)`), hora del sync, guardado.
- Config: KV de **bdi-catalogo** (`/api/reposicion` → `api/ingresos.js?kind=reposicion`), una clave
  por marca. Zattia guarda `ventas` y `ventasStunned` adentro del mismo objeto.
- **Armar con el lector** (Zattia, 12-oct-2026): `components/reposicion/ArmadoLector.tsx` (la
  pantalla de Lorena) · `lib/reposicion/armado.ts` (qué hacer con cada código + cliente) ·
  `lib/reposicion/armado.core.js` (sanear y qué se transfiere, compartido con el servidor) ·
  `api/_repo-armado.js` por `api/datos.js?recurso=repo-armado` · tabla `repo_armado` en la base de
  ZATTIA (`sql/migrate-repo-armado.sql`, se corre en el SQL Editor: no hay `DATABASE_URL` en `.env`).
- Tests: `reposicion-ventas` (Zattia) · `reposicion-core` (BDI) · `reposicion-sync-reloj` · `repo-armado`.

## ⛔ Lo que comparte con otras secciones

- **La config la leen también Conteo (`catsOff`) y Sesión de fotos / Solicitudes (`prioridadRetiro`)**
  vía `lib/reposicion/cfg.ts`. 🔴 La pantalla guarda la config **ENTERA** que leyó: un campo que
  `leerRepoConfig` no mapea **se borra en el próximo guardado**. Campo nuevo → sumarlo ahí (lo cubre
  un test).
- `pdf.ts` es de las dos marcas: `FilaA4` **sin `local`** = papel sin columnas de stock (Zattia).

## Las palabras de la pantalla (Darío, 12-oct-2026)

«Se usa mucho texto y pocas palabras formales.» Pestañas **Reposición** / **Devolución**; columnas
**Venta semanal · Stock ideal · Motivo**; botones **Iniciar armado · Finalizar · Transferir N
prendas · Actualizar stock · Imprimir A4 / ticket**. El **Motivo** dice sólo lo que las columnas
no dicen (vacío en el caso normal). **Una sola tabla** con el producto como separador: antes era una
tabla por producto con los encabezados repetidos. Antes de sumar un texto, ver si ya lo dice otra
columna.

## Reglas que el código no dice

- 🔑 **«Local» en GN = lo colgado + el depósito del local.** Con 1 en Local, ese 1 es la exhibida, y
  descolgarla cuesta (precio, alarma, lugar). Por eso nunca menos de 1 exhibida + 1 de reserva.
- 🔑 **El mínimo depende de lo que vende** (en 60 días): 2 si vende menos de 1 por semana, 3 si vende
  más. Medido: 2.055 u en el local contra 2.507 con 3 parejo, y 29 variantes en riesgo contra 91 con
  2 parejo. La última semana **sólo sube la reserva** de lo que se disparó; ⛔ no decide el piso
  (una venta suelta le subía el mínimo a todo).
- 🔑 **Se repone todos los días y de a una** (`loteMin` 1, «estructura chica»): reserva para 2 días.
- 🔑 **Los «topes por producto» de la pantalla vieja NO se aplican en Zattia** («anticuados»): se
  pusieron para el mínimo fijo y pisaban a las ventas. Siguen guardados porque BDI los usa. Los
  **apagados sí** se respetan.
- 🔑 **Devolver al depósito es la mitad que faltaba**: el local se llenó porque sólo existía el
  camino de ida. Tope diario (30) porque armar el carro es lo lento; la **limpieza grande** (todo de
  una, ~600 u el 11-oct) se hace con el escaneo de la parte 3, por eso existe «Ver la lista entera».
- 🔑 **Los papeles llevan sólo lo que se hace** (Darío): ⛔ ni stock ni ventas ni «para exhibir». El
  A4 de Lorena: producto · talle · cuánto · una casilla (tilde / cruz / número, **en palabras**:
  Helvetica no tiene ✓ ni ✗). El rollo de Camila: SKU · «PRODUCTO - variante» · Cant. · Listo.
- 🔑 **Orden:** Camila (local) **por SKU**, que es como está ordenado el depósito del local. Lorena
  **por ubicación** del depósito (la observación de GN, hoy vacía en Zattia) y sin ubicación por SKU.
- 🔑 **OUTLET («SIN CAMBIO») y ACCESORIO** son «todo exhibido» por el nombre: no tienen categoría en
  GN. Una marca por producto les gana. «Por categoría» se sacó de la pantalla (TN mezcla «BEST
  SELLERS» y «(sin categoría)»); el cálculo la entiende igual (`modosCat`).
- ⚠️ **Stunned tiene su config propia** (`ventasStunned`) pero hoy con los mismos valores: sus
  condiciones quedaron para más adelante.
- ⚠️ **Configurar lo editan Darío y Bruno sólo en la PANTALLA** (`puedeEliminarTn`, la regla de
  Caducados). El POST a bdi-catalogo lo acepta cualquiera del equipo.
- ⚠️ Un día sin stock en el local cuenta como día sin venta: el sistema no guarda el stock día por día.

## Armar con el lector (tanda 1 del escaneo, 12-oct-2026)

Lorena escanea en la **COMPU** del depósito, con lector, contra la lista de «Llevar al local»
**congelada al empezar**; al terminar, el Monitor hace la transferencia depósito → local en GN
(`POST /inventario/transferencia`, Zattia: depósito 18210 → local 11780).

- 🔑 **La transferencia sale al final y SÓLO con lo escaneado**, cortado en lo pedido (lo corta el
  servidor también). Lo no escaneado se contesta «no estaba» / «para después» y no se mueve.
- 🔴 **Nunca dos transferencias del mismo armado**: `en_curso → transfiriendo` con un update
  condicionado antes de llamar a GN, índice de «uno abierto por lista», y ⛔ **el POST a GN no se
  reintenta** salvo 429. Un 500 o un corte quedan en `revisar`: alguien mira GN y contesta.
- 🔴 **Recién transferido, la lista sigue igual hasta el próximo sync**: «Armar» queda bloqueado
  mientras el stock sea anterior a la transferencia (si no, se pide dos veces lo mismo).
- Lo que sobra o no estaba pedido **frena la pantalla** (cartel rojo, ⛔ no el `Modal`: el Enter del
  lector lo cerraba), igual que Conteo. La primera de una «para exhibir» se canta y se marca.
- **Historial** (pestaña, `HistorialArmados.tsx`, `?action=historial`): un renglón por armado (sin
  los descartados) con horario, duración, pedidas/escaneadas/no encontradas y el detalle; arriba,
  **«Más veces no encontradas»** = la señal de stock mal cargado. Sólo cuenta armados transferidos.
- Lo escaneado vive en `localStorage` (`monitor_repo_armado_<id>`) y se sube cada 1,5 s.
- GN es atómico: un 422 no movió nada; la pantalla muestra los renglones rechazados y ofrece
  sacarlos (quedan `rechazada`: diferencia de stock para la tanda 3).

## Devolución con el lector (tanda 2, 12-oct-2026)

Camila escanea en la **compu del local** la lista de «Devolución» y al **Finalizar** el Monitor
transfiere **local → depósito** (decisión de Darío: la opción A, sin re-escanear al recibir). Aviso
fijo: **«Retirar solo de la reserva, nunca la exhibida.»** Lo que sobra está en el depósito del local
(la trastienda, ordenada por SKU), no colgado.

- 🔑 **La limpieza grande** = la misma pantalla con «Ver todo» (sin tope diario) + **«Transferir y
  continuar»**: pasa lo escaneado hasta ahí y la lista sigue abierta, para hacerla en varios viajes del
  carro o en varios días. Una sola compu (Darío).
- 🔴 **Cada tanda manda SÓLO la diferencia**: lo ya transferido vive en `transfer.transferido` y cada
  tanda en `transfer.tandas`. El servidor no deja que lo escaneado baje de lo transferido (`conTransferido`),
  ni descartar un armado con tandas (esas prendas ya cambiaron de depósito). Un `revisar` a mitad de una
  tanda guarda lo que iba en `transfer.enCurso` y `resolver` lo suma.

## La foto guardada (12-oct-2026)

Al abrir, la pantalla pide la config y la **huella** (`huellaDatos`: la hora de cada sync de
`sync_state` + el día). Si coincide con la foto guardada en la compu (`reposicion_foto_<marca>`, en
el almacén del Monitor), muestra eso **sin bajar el stock ni las ventas** (1,3 MB, 16 pedidos →
2 pedidos chicos). Si cambió —sync de la mañana, «Actualizar stock», transferencia de un armado, o
cambió el día—, baja todo como antes, en paralelo. «Recargar» y «Reintentar» fuerzan la bajada.

## Lo que ya se rompió acá

- 4-sep-2026: «Actualizado» con el stock de ayer → la hora es la del **sync**, no la de la lectura
  (comentado en `Reposicion.tsx` y `cliente.ts:ultimaSincronizacion`).
- `venta_detalles` ordenado sólo por `sale_id` pisaba empates entre páginas: va con desempate único.

## Pendiente

- ▶️ **Parte 2:** la lista de Lorena por correo a administración a las 7:00 (falta la dirección) y el
  estado de la reposición a Darío a las 10:00 (abre el local). `scripts/lib/mail.mjs`.
- ▶️ **Parte 3, en tandas** (Darío, 12-oct): ✅ T1 Lorena escanea + transferencia · ✅ T2 Camila
  (devolver) + la limpieza grande · ▶️ T3 «no estaba» → Conteo + correo de las 10:00 · ▶️ T4
  etiquetas mal puestas + imprimir en la Zebra las de «para exhibir».
- ▶️ Condiciones de Stunned. ▶️ Ubicaciones del depósito de Zattia (la sección Ubicaciones es sólo BDI).

## Cómo se prueba

`npx vitest run tests/reposicion-ventas.test.ts`. Los papeles se miran **generando el PDF** (A4:
`reposicionPDFFilas` con `compartirODescargarPDF` mockeado; rollo: `armarDevolucion` +
`pintarDevolucion`) y abriéndolo: la geometría no la cubre ningún assert.
