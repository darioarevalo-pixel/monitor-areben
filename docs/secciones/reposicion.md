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
- Tests: `reposicion-ventas` (Zattia) · `reposicion-core` (BDI) · `reposicion-sync-reloj`.

## ⛔ Lo que comparte con otras secciones

- **La config la leen también Conteo (`catsOff`) y Sesión de fotos / Solicitudes (`prioridadRetiro`)**
  vía `lib/reposicion/cfg.ts`. 🔴 La pantalla guarda la config **ENTERA** que leyó: un campo que
  `leerRepoConfig` no mapea **se borra en el próximo guardado**. Campo nuevo → sumarlo ahí (lo cubre
  un test).
- `pdf.ts` es de las dos marcas: `FilaA4` **sin `local`** = papel sin columnas de stock (Zattia).

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

## Lo que ya se rompió acá

- 4-sep-2026: «Actualizado» con el stock de ayer → la hora es la del **sync**, no la de la lectura
  (comentado en `Reposicion.tsx` y `cliente.ts:ultimaSincronizacion`).
- `venta_detalles` ordenado sólo por `sale_id` pisaba empates entre páginas: va con desempate único.

## Pendiente

- ▶️ **Parte 2:** la lista de Lorena por correo a administración a las 7:00 (falta la dirección) y el
  estado de la reposición a Darío a las 10:00 (abre el local). `scripts/lib/mail.mjs`.
- ▶️ **Parte 3:** escaneo contra el pedido + transferencia en GN (`POST /inventario/transferencia`,
  probada el 11-oct con la clave nueva de Zattia; atómica, con `validate_only`), «no se encontró» →
  diferencia de stock a contar, etiquetas mal puestas, **«para exhibir» al escanear** (alarma +
  etiquetas de precio y formas de pago en la Zebra, que está con Lorena en el depósito).
- ▶️ Condiciones de Stunned. ▶️ Ubicaciones del depósito de Zattia (la sección Ubicaciones es sólo BDI).

## Cómo se prueba

`npx vitest run tests/reposicion-ventas.test.ts`. Los papeles se miran **generando el PDF** (A4:
`reposicionPDFFilas` con `compartirODescargarPDF` mockeado; rollo: `armarDevolucion` +
`pintarDevolucion`) y abriéndolo: la geometría no la cubre ningún assert.
