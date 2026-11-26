# Respuestas

## 1. Un cliente reporta que en su iPad la pestaña se recarga sola mientras abre un escaneo de 300 MB; en el computador funciona. ¿Cómo lo diagnosticas y qué cambiarías?

Lo primero que sospecho es la memoria. El iPad le da a cada pestaña mucha menos memoria que un computador, y cuando la página se pasa, Safari la cierra y la vuelve a abrir sin mostrar ningún error. Para confirmarlo conecto un iPad igual al del cliente a un Mac y, con el inspector de Safari, miro cuánta memoria usa la página mientras carga el escaneo. Casi siempre el problema es que el archivo queda guardado varias veces al mismo tiempo. Lo cambiaría para que se lea por partes mientras se descarga, sin guardarlo entero, que es como ya funciona este visor. Y para escaneos tan grandes, en el iPad mostraría una versión con menos puntos.

## 2. Después de publicar una versión nueva, algunos usuarios siguen viendo la anterior durante días aunque el servidor ya tiene el código nuevo. Los archivos se sirven con caché larga. ¿Qué pasa y cómo lo evitas de forma definitiva?

Pasa que el navegador guardó los archivos con la instrucción de no volver a preguntar en mucho tiempo. Como el archivo nuevo se llama igual que el viejo, por ejemplo `main.js`, el navegador sigue usando su copia y ni se entera de que hay una versión nueva. La solución definitiva es que cada versión tenga un nombre distinto: al nombre se le agrega una huella de su contenido, como `main.3f9a1c.js`. Esos archivos sí se pueden guardar por mucho tiempo, porque si cambian, cambia el nombre. La página principal, que es la que dice qué archivos cargar, se configura para que el navegador siempre pregunte si hay una versión nueva.

## 3. Agregamos un asistente con un modelo de lenguaje que opera la interfaz por medio de herramientas ("abre el inspector", "aísla el nivel 2"). A veces responde "listo, lo abrí" y no pasó nada. ¿Cómo diseñas las herramientas para que eso no pueda pasar?

El asistente puede decir "listo" sin haber comprobado nada. Lo diseñaría para que la respuesta no dependa de lo que el modelo escribe, sino de lo que pasó en la pantalla. Cada herramienta hace exactamente lo mismo que el botón de la interfaz y, al terminar, revisa el estado real: por ejemplo, si el inspector quedó abierto y con qué espacio. Devuelve ese resultado, o un error claro como "no hay ningún espacio seleccionado". Si no logra confirmarlo, cuenta como error, nunca como éxito. La pantalla muestra lo que devolvió la herramienta, no lo que dice el modelo, así que un "listo" falso no engaña a nadie. Y cada herramienta tiene pruebas automáticas que lo verifican.

## 4. Un cliente ve en la pestaña de red del navegador el nombre de un proyecto de otro cliente. ¿Dónde buscas la causa y qué regla de diseño lo evita?

Busco en el servidor, no en la pantalla: si el nombre aparece en la pestaña de red, el servidor lo envió, aunque la interfaz no lo muestre. Reviso qué respuesta lo trae. Puede ser una lista que devuelve todos los proyectos y la pantalla oculta los ajenos, un buscador, un mensaje de error, o una caché que guardó la respuesta de un cliente y se la entregó al siguiente. La regla que lo evita: el servidor decide qué ve cada usuario y nunca manda datos para que el navegador los esconda. Cada consulta se filtra por la cuenta de quien pregunta y solo se envían los campos permitidos. Así funciona esta API, con pruebas que comparan respuestas entre clientes.

## 5. Con 2 millones de puntos el visor baja a 15 cuadros por segundo al orbitar. Nombra tres técnicas en orden de lo que probarías primero, y por qué.

En este visor apliqué tres técnicas:

- **Dibujar solo cuando algo cambia:** con la cámara quieta no se redibuja nada, y al tocar solo se revisan las cajas, no los puntos. No cuesta nada.
- **Limitar la resolución:** la densidad de píxeles llega como máximo a 2× y los puntos miden 2 cm, para que una pantalla retina no multiplique el trabajo. Es una línea.
- **Un cuarto de los puntos al moverse:** al orbitar, desplazar o hacer zoom se dibuja uno de cada cuatro, y al detenerse vuelve la nube completa. Los puntos se guardan intercalados para que ese cuarto cubra todo el edificio. Así logré tres veces más cuadros.
