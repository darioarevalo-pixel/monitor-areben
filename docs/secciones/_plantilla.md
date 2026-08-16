# <Sección> — ficha de sección

<!--
CÓMO SE USA ESTA PLANTILLA

Copiala a `docs/secciones/<key>.md`, llenala, y agregá la línea del puntero en `AGENTS.md`
(sección `## Fichas de sección`) — sin el puntero la ficha no la lee nadie, y el test lo exige.

🔑 LA REGLA DE ORO: acá va lo que NO está en ningún archivo. Si el código ya lo comenta en el
lugar donde muerde, no se repite: se nombra en una línea y se manda ahí (`→ api/x.js:34`). La
ficha se lee ANTES de abrir los archivos, así que su trabajo es decir qué mirar con cuidado.

Lo que va: lo que dijo la persona que usa la pantalla · lo que se midió en prod · por qué algo
está hecho al revés de lo que parece · lo que ya se rompió · lo que falta.
Lo que NO va: qué hace cada función (eso es el código) · el paso a paso de la UI.

TECHO: ~80 líneas. No son ~30 — se midió: la sección más chica que probamos dio 72. Y está bien,
porque la ficha se paga UNA vez al entrar a la sección, no en cada mensaje como `AGENTS.md`
(~3.300 tokens × cada turno). Si una ficha se pasa de 80, es porque la sección es grande de
verdad (Envíos son 122): que se pase, pero que sea a propósito.

Borrá este comentario y los bloques que no apliquen.
-->

Sección `<key>`, área `<area>`. Una o dos líneas: qué problema resuelve y a quién.
Si reemplazó algo (una planilla, una pantalla vieja), decirlo.

## Dónde vive

`components/<key>/` · `lib/<key>/` · el handler y por qué puerta entra · las tablas · los tests.
Si un archivo es caro de leer entero, poner el tamaño acá.

## ⛔ Lo que comparte con otras secciones

<!-- Bloque opcional, pero el que más caro sale si falta: es el que evita arreglar una copia y
     dejar rotas a las hermanas. Va sólo si algo de esta sección lo importa otra. -->

## Reglas que el código no dice

<!-- El bloque principal. Cada regla, un bullet, con el POR QUÉ — sin el por qué, la próxima
     persona la "simplifica". Marcar con 🔴 las que cuestan plata o rompen prod, 🔑 las que son
     una decisión de diseño que parece un error, ⚠️ las que hay que tener en cuenta y nada más. -->

## Lo que ya se rompió acá

<!-- Los modos de falla reales, con el archivo:línea donde ya está comentado. Sirve para no
     volver a caer y para saber qué mirar primero cuando algo raro pasa. -->

## Pendiente

<!-- Lo que falta, con ▶️. Y lo que se sabe que está mal y no se arregló todavía, con ⚠️ o 🔴 —
     un agujero conocido y escrito vale más que uno que hay que redescubrir. -->

## Cómo se prueba

<!-- El comando del test de la sección, y sobre todo lo que NO es obvio: qué hay que ejercer a
     mano, qué credencial hace falta y de dónde sale, qué mutante hay que ver caer. -->
