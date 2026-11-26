# Respuestas

## 1. La pestaña del iPad se recarga al abrir un escaneo de 300 MB

Casi siempre es iOS matando la pestaña por memoria: Safari en iPad tiene un límite mucho menor que un computador y, al pasarlo, recarga la página sin dar error. Para confirmarlo conecto un iPad del mismo modelo a un Mac y miro la memoria en el Web Inspector (Timelines). El culpable típico es tener el mismo dato tres veces: el `ArrayBuffer` descargado, la copia interpretada y la copia que sube a la GPU. Cambiaría a lectura por streaming hacia arreglos reservados de antemano, transferencia sin copia desde el worker, límite de puntos según el dispositivo y, de fondo, un formato por bloques con nivel de detalle para no cargar nunca los 300 MB completos.

## 2. Usuarios que siguen viendo la versión anterior durante días

Los archivos tienen nombres fijos (`main.js`, `index.html`) y caché larga, así que el navegador o la CDN siguen usando su copia sin preguntar al servidor; renombrar o desplegar no sirve. La solución definitiva es separar dos tipos de archivo. Los estáticos llevan un hash del contenido en el nombre (`main.3f9a1c.js`) y se sirven con `Cache-Control: max-age=31536000, immutable`: si cambian, cambia el nombre. El `index.html`, que es el que apunta a esos nombres, se sirve con `no-cache` para revalidarlo siempre. En el despliegue se suben primero los estáticos nuevos y después el HTML, y los anteriores se conservan unos días para las pestañas que siguen abiertas. Si hay service worker, también debe tener un flujo de actualización explícito.

## 3. El asistente dice "listo, lo abrí" y no pasó nada

El modelo no debe poder afirmar un efecto, solo informar lo que la herramienta comprobó. Cada herramienta ejecuta la misma acción que el botón de la interfaz y, después, lee el estado real y lo devuelve: `{ ok: true, inspectorOpen: true, spaceId: "s2" }`, o un error tipado como `{ ok: false, reason: "no_space_selected" }`. Si no hay confirmación del estado en un tiempo límite, la respuesta es error, nunca éxito. La interfaz muestra el resultado de la herramienta, no el texto del modelo, así que un "listo" sin `ok: true` se ve como lo que es. Y lo pruebo con tests que llaman cada herramienta y verifican el estado resultante, sin confiar en el prompt.

## 4. Un cliente ve en la red el nombre de un proyecto de otro cliente

Busco dónde se filtra por cliente: si es en el navegador, ese es el error. Reviso endpoints que devuelven de más y la interfaz esconde (listas, búsqueda, autocompletado, notificaciones, mensajes de error con nombres) y las cachés. Una respuesta por usuario guardada en una CDN sin `private` ni `Vary: Authorization` le llega al siguiente cliente. La regla que lo evita es que la autorización vive en el servidor y se niega por defecto. Cada consulta se acota por la cuenta del token, las respuestas se arman con listas blancas de campos por rol y nunca se envía un dato al cliente para ocultarlo allí. Lo respaldan pruebas que comparan respuestas entre cuentas.

## 5. 2 millones de puntos a 15 cuadros por segundo al orbitar

Primero mido si el cuello está en la GPU o en la CPU. Luego pruebo en este orden:

1. **Menos píxeles:** bajar la densidad de píxeles (a 1,5) y el tamaño de los puntos mientras se orbita. Las nubes suelen estar limitadas por relleno; es una línea y suele duplicar los cuadros.
2. **Nada de CPU por cuadro:** dibujar solo cuando algo cambia y no hacer raycasting contra los 2 millones de puntos al mover el puntero.
3. **Menos puntos:** bloques tipo octree con descarte por cámara y nivel de detalle, o una muestra mientras se mueve y la nube completa al soltar. Es la mayor ganancia, pero la más costosa; por eso va al final.
