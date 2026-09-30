# Parte de la mañana — ficha

**No es una pantalla: es un mail.** Sale todas las mañanas a la casilla de Bruno
(`vars.MAIL_HALLAZGOS_A`) y junta en un solo lugar lo que ordena el día. Lo pidió Bruno el
30-sep-2026: *«un mail de todo lo importante… un panorama real de todo, cosas que están
incompletas, cosas sin terminar, como un estado del día… para empezar a ordenar la mañana»*.

## Qué trae, en orden (lo decidió Bruno)

1. **Ventas de ayer.** Van por marca, con Stunned aparte. El **minorista** se compara contra el mismo día de la semana pasada, y el **mayorista va en su propio renglón**.
2. **Lo que no puede faltar.** Son las familias de `CRITICOS`: los templados de BDI y los productos Zattia (proveedor `ZATTIA`). Se reparten en tres grupos: sin stock, pedir al proveedor (menos de 14 días) y reponer al local (menos de 7 días en el local, con stock en el depósito).
3. **Curva rota a precio lleno.** Se miran los 30 productos más vendidos **sin descuento** de 28 días y se muestran los que tienen algún talle o modelo en 0.
4. **Subir hoy del depósito.** Lo que se vendió en el local esta semana, tiene 0 en el local y tiene stock en el depósito.
5. **Recompra por proveedor.** Lo más vendido de 14 días, con el stock de hoy y los días que le quedan.
6. **Pauta.** Los hallazgos abiertos de Meta, con el mismo `armarMail` que usaba el mail de las 07:50, que este parte **reemplaza**.
7. **Sin terminar.** Se leen los títulos `▶️` de los `PENDIENTES.md` y las casillas `- [ ]` de areben-produccion.

## Dónde vive

- `lib/parte/ventas.core.js`, `stock.core.js`, `pendientes.core.js` y `mail.core.js` son **puros** y en JS plano, porque los importa el script. Su banco de pruebas es `tests/parte-manana.test.ts`.
- `scripts/parte-manana.mjs` hace las lecturas y el envío. Acepta `--simulacro`.
- `.github/workflows/parte-manana.yml` junto con `scripts/lib/disparar-y-esperar.sh`.

## Reglas que el código no dice

- 🔴 **El workflow ⛔ tiene `schedule`.** Lo medimos el 30-sep-2026: los crons de GitHub de este repo llegan **horas tarde**. `meta-reglas` estaba agendado a las 07:50 y corrió entre las 11:44 y las 15:15. Por eso el reloj puntual tiene que venir de afuera y disparar `workflow_dispatch`. Después el workflow pone en fila los syncs de GN, la foto de Meta y las reglas, en vez de esperar a que lleguen los crons.
- 🔴 **Los dos syncs de GN van uno detrás del otro.** Comparten el candado `gestion-nube`, y una corrida en espera **la cancela la que llega después**. Por eso `disparar-y-esperar.sh` reintenta cuando una sale `cancelled`.
- 🔑 **La plata es `serieDiaria`, la misma de «Día a día».** ⛔ Hay una cuenta propia. El oráculo del 30-sep, contra la suma de `total_price` en la base, cerró **al peso** en las dos marcas (BDI $1.063.783 minorista, Zattia $809.178).
- 🔴 **Se compara minorista contra minorista.** El total del 29-sep de BDI daba **−66%**, y la causa era **un pedido mayorista de $3,3 M del 22**. El minorista había crecido un 45%.
- 🔑 **«A precio lleno» se mide por RENGLÓN**: `unit_price ≥ 98% de retailer_price`. El `discount` de la orden (el cupón del raspa, la transferencia) ⛔ es sale. Con la Feria de Zattia casi todo sale rebajado, y el bloque dice cuántas unidades quedaron afuera.
- 🔑 **Una variante que ⛔ se vendió en 28 días ⛔ entra en ninguna lista.** Sin venta no hay forma de separar «se agotó» de «se discontinuó».
- 🔴 **El stock es local + depósito minorista.** El `Deposito Mayorista` de BDI ⛔ cuenta, y el `'Deposito '` de Zattia, con un espacio al final, se lee con `trim()`.
- 🔴 **BDI ⛔ tiene proveedor en Gestión Nube.** El que se conoce sale de las OC (`recepcion_oc` y `recepcion_linea`), y el resto se muestra como «sin proveedor».
- 🔑 **Un bloque vacío o caído va en una línea, ⛔ desaparece.** Una base que ⛔ se pudo leer sale con su motivo y tiñe el workflow de rojo, pero el mail sale igual.
- ⚠️ **areben-marketing es privado**: su bloque pide el secret `PENDIENTES_TOKEN`. `~/Documents/quien-hace-que` ⛔ está en git y queda afuera.

## Cómo se prueba

- `npx vitest run tests/parte-manana.test.ts`. Hay 17 mutantes de las reglas y los 17 mueren.
- Desde la Mac: `node --env-file=.env scripts/parte-manana.mjs --simulacro`. ⚠️ Zattia da *permission denied* porque en el `.env` está sólo la clave anon. **El simulacro de verdad se corre desde el workflow** (`gh workflow run parte-manana.yml -f simulacro=true -f solo_mail=true`).
