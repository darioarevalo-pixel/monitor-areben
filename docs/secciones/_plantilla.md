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

TECHO: no es un número, y eso está MEDIDO. Se probó ~30 y se corrigió a ~80, y con cuatro fichas
escritas NINGUNA lo cumple. Lo que hay es una escala, y **no es lineal**: la ficha crece mucho más
despacio que el código —de 1 línea cada 20 en la sección más chica a 1 cada 123 en la más grande—,
con piso en ~70 y, por ahora, techo en ~270.

  conteo-deposito   1.453 líneas de código →  72     canjes    17.849 → 164
  envíos            6.736                  → 122     meta-ads  32.786 → 266

Y está bien: la ficha se paga UNA vez al entrar a la sección, no en cada mensaje como `AGENTS.md`
(~3.300 tokens × cada turno). Apretar la de conteo-deposito a 30 ahorraba 600 tokens una vez a
cambio de tirar reglas que ajustan stock.

⇒ El límite real es la REGLA DE ORO de arriba, no el largo: si una ficha se está yendo, casi siempre
es porque repite algo que el código ya comenta. Buscá eso antes de recortar contenido.

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
