# Mapa del local — ficha de sección

Sección `mapa-local`, área `local`, sólo Zattia. Los percheros del salón dibujados como están:
qué tipos de prenda van en cada barra, a qué altura y cuántas perchas entran cómodas. La pidió
Bruno el 30-sep-2026 para *«ver nuestro mapa con nuestros percheros y decidir a distancia»*.
Antes de esta sección ningún lugar decía qué debería estar colgado en cada mueble.

## Dónde vive

- **Pantalla:** `components/mapa-local/`.
  - `MapaLocal.tsx` arma la pantalla.
  - `Plano.tsx` es el plano visto desde arriba.
  - `Pared.tsx` es la pared de frente, a escala en cm.
  - `Detalle.tsx` es un módulo y sus barras, que se pueden editar.
  - `TablaTipos.tsx` y `Prendas.tsx` completan la pantalla.
- **Lógica:** `lib/mapa-local/`.
  - `core.ts` es puro.
  - `inicial.ts` es el armado propuesto y la tabla de tipos.
  - `validar.core.js` hace el saneo y lo importa el handler.
  - `cliente.ts` habla con el servidor.
- **Servidor:** `api/_mapa-local.js`, por `api/datos.js?recurso=mapa-local`.
- **Base:** la tabla `mapa_local`, una fila jsonb por marca (`sql/migrate-mapa-local.sql`), sólo
  en el Supabase de Zattia.
- **Tests:** `tests/mapa-local.test.ts` y `tests/mapa-local-handler.test.ts`.

## ⛔ Lo que comparte con otras secciones

- **La bajada y el cruce son los del Chequeo de exhibición:** `bajarExhib`, `armarProdMap` y
  `construirItems`, de `lib/exhib/`. También son de ahí el tipo de prenda (`tipoDePrenda`, que se
  saca del nombre) y la línea (`precioDeGondola` → `ofertaVigente`, el mismo precio que imprime
  Etiquetas). Tocar esas funciones cambia también qué cae en cada barra.

## Reglas que el código no dice

- 🔑 **Se guarda el ARMADO, ⛔ no dónde cae cada prenda.** Cada prenda cae en una barra por su tipo
  y su línea, y se recalcula con el stock del espejo cada vez que se abre la pantalla. Guardar el
  resultado lo dejaría viejo con la primera venta. La ganancia es que lo que entra nuevo ya tiene
  lugar, y lo que pasa a sale se muda solo a una barra de sale.
- 🔴 **El cupo es un techo y ⛔ nunca se pasa.** Lo que no entra se lista aparte como «No entran»,
  y son las prendas que van al depósito. Medido el 30-sep-2026 con el armado inicial:

  | | prendas |
  |---|---|
  | en el Local (producto×color con stock, sin Stunned) | 642 |
  | que se cuelgan | 607 |
  | perchas cómodas | 298 |
  | **no entran** | **301** |

  La saturación de las fotos del local es esa diferencia. Colgar de más esconde la decisión, en
  vez de tomarla.
- 🔴 **Una percha es un producto×color, ⛔ no un producto.** En Gestión Nube el color va a veces en
  la variante («Bordó - S») y a veces en el nombre («CAMPERA ROCK - VIOLETA»). Contando por
  producto daban 444; por producto×color, 679. → `colorDeVariante`.
- 🔑 **Cuando no entran todas, se quedan colgadas las que tienen más unidades en el Local**
  (`prioridad`): con más talles atrás, venden más estando colgadas. Es una regla elegida, ⛔ no
  medida. Si Bruno pide otra (por ejemplo «lo nuevo primero»), se cambia ahí.
- 🔑 **El cupo lo pone el tipo MÁS GRUESO de la barra**, ⛔ no el promedio. Una barra que acepta
  tops y sweaters puede terminar llena de sweaters.
- ⚠️ **Las alertas de altura salen de una regla, ⛔ no de una medición.** Cada clase de largo mide
  colgada: corta 60 cm, media 90, larga 130, más 5 de aire. El caso de las fotos es una camisa
  arriba que tapa la barra de abajo.
- ⚠️ **El armado inicial es un borrador.** El ancho de los módulos lo dio Bruno; el resto lo propuse
  yo sobre el plano y las fotos. Hasta que alguien lo guarde, la pantalla lo dice.
- ⚠️ **Con la Feria Online viva (27-sep → 4-oct), «sale» incluye las promos de la feria.**

## Pendiente

- ▶️ **Correr `sql/migrate-mapa-local.sql` en Zattia.** Hasta entonces la pantalla se puede mirar
  y probar, pero ⛔ no guardar: el handler contesta 503, y está cubierto en el test.
- ▶️ **F3 — la orden al local:** que cada cambio arme la lista «Mover» y la hoja por módulo.
- ▶️ **F4 — el control con el lector:** que el recorrido del Chequeo de exhibición elija el
  módulo del mapa como lugar, y comparar lo que debería estar contra lo escaneado. ⚠️ Da vuelta una
  regla de `exhib.md`: hoy el lugar es texto libre a propósito.

## Cómo se prueba

- `npx vitest run tests/mapa-local.test.ts tests/mapa-local-handler.test.ts`.
- **El oráculo de los números:** las 642 prendas, con 355 de colección, 275 de sale y 12 sin
  precio, salieron iguales por la lógica de la sección y por un conteo directo del inventario
  hecho aparte (30-sep-2026).
