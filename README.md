# Site Viewer Lite

API en Node.js y visor web con three.js para revisar edificios escaneados: cada persona elige un proyecto, ve sus espacios en 3D, carga la nube de puntos y reporta problemas. Un cliente solo ve sus proyectos y nunca recibe datos internos.

**Demo en línea:** <https://site-viewer-lite.onrender.com>. Está en el plan gratuito de Render: si nadie la ha visitado en un rato, la primera carga tarda cerca de un minuto.

## Instalar y arrancar

Requiere Node.js 18 o superior.

```bash
npm install && npm start
```

Abre <http://localhost:3000>. `npm start` genera las nubes de puntos de ejemplo si todavía no existen (unos segundos la primera vez) y levanta el servidor. El puerto se cambia con `PORT=4000 npm start`.

Para probar en un iPad en la misma red: `http://<ip-del-computador>:3000`.

| Usuario | Token | Rol |
|---|---|---|
| Dana Ortiz | `staff-token` | staff, ve todo |
| Sam Lee | `acme-token` | cliente `acme` |
| Rita Gomez | `brick-token` | cliente `brick` |

## Desplegar en Render

El repositorio incluye un [`render.yaml`](render.yaml) para el plan gratuito de Render. Se despliega como un solo servicio web, porque Express sirve la página y la API juntas y no hay base de datos.

1. En [render.com](https://render.com): **New → Blueprint** y elegir este repositorio.
2. Render instala sin dependencias de desarrollo (`npm ci --omit=dev`) y ejecuta `npm start`, que genera las nubes y levanta el servidor en el puerto que Render asigna.
3. Cada push a `main` vuelve a desplegar.

Hay que tener en cuenta tres cosas del plan gratuito:
- **Se duerme:** el servicio se detiene tras unos 15 minutos sin visitas, y la siguiente visita tarda cerca de un minuto en responder.
- **Disco efímero:** los reportes guardados en `data/issues.jsonl` se pierden cuando el servicio se reinicia o se vuelve a desplegar. Para conservarlos haría falta un disco persistente (de pago) o una base de datos.
- **Tokens públicos:** los tokens del kit son públicos, así que en la demo cualquiera puede entrar como cualquier usuario y crear reportes. Sirve para mostrar la app; en producción haría falta un inicio de sesión real y un límite de peticiones.

## Pruebas

```bash
npm test
```

78 pruebas con `node:test` y `fetch` nativo, sin dependencias extra. Las de la API levantan la app en un puerto libre sobre una copia temporal de los datos. Las del front importan los mismos módulos que usa el navegador, sin DOM.

| Archivo | Qué cubre |
|---|---|
| `test/api/auth.test.js` | Regla 1: sin token, token inválido o cabecera mal formada dan 401, también antes de leer el cuerpo |
| `test/api/privacy.test.js` | Reglas 2 y 3: ningún endpoint, para ningún usuario, devuelve `internal` ni sus valores; el cliente no recibe correo ni teléfono |
| `test/api/access.test.js` | Regla 4: un proyecto ajeno responde exactamente igual (estado, cuerpo y cabeceras) que uno inexistente, en todos los endpoints |
| `test/api/validation.test.js` | Regla 5: ids mal formados, JSON roto, cuerpos inválidos y límites del título dan 4xx, nunca 500 |
| `test/api/caching.test.js` | Regla 6: ETag, 304 con `If-None-Match`, `private` y `Vary: Authorization` |
| `test/api/cloud.test.js` | Regla 7: `Range: bytes=0-15` da 206 con los 16 bytes; proyecto sin nube da 404; rango imposible da 416 |
| `test/api/issues.test.js` | Los reportes válidos quedan en `data/issues.jsonl` con quién los creó; los rechazados no se guardan |
| `test/api/admin.test.js` | Panel de reportes: un cliente recibe 403; el staff ve todos con proyecto y espacio, revalida con ETag y cambia el estado; el cambio sobrevive a un reinicio; las entradas malas dan 4xx |
| `test/web/pts.test.js` | Lector PTS1: trozos de cualquier tamaño, archivo cortado, formato inválido, diezmado |
| `test/web/api-client.test.js` | Cliente de la API: token actual en cada llamada, errores tipados (`ApiError`, `NetworkError`, abort) aunque el servidor responda HTML |
| `test/web/format.test.js` | "Not recorded", fechas que no se corren un día en husos al oeste de UTC, m² y ft² |
| `test/web/messages.test.js` | Mensajes de error y de progreso que ve la persona, y validación previa del formulario |
| `test/web/i18n.test.js` | Inglés por defecto; los diccionarios en inglés y español tienen las mismas claves y los mismos marcadores; fechas, números y errores en español |

### Pruebas end-to-end del visor

```bash
npm run test:e2e
```

18 pruebas que abren el visor en Chrome headless, con pantalla táctil y tamaño de iPad. Usan el Chrome instalado en el equipo, no descargan navegadores; con Edge se corren con `E2E_BROWSER_CHANNEL=msedge npm run test:e2e`. Si no encuentran el navegador, se marcan como omitidas.

Entre el navegador y la app ponen un proxy que entrega la nube lentamente y registra si la conexión se cortó. Así comprueban que Cancel y cambiar de proyecto a mitad de carga cortan la descarga de verdad en el servidor, no solo en la interfaz. También cubren:
- Selección por toque y alternar m² y ft².
- Filtro de nivel.
- Progreso real.
- Archivo cortado, 404 y red caída con "Try again".
- Formulario de reporte.
- Panel de reportes: un cliente no ve la pestaña; el staff ve llegar un reporte nuevo sin recargar, cambia su estado, filtra y lo abre en 3D.
- Cambio a español sin perder lo que hay en pantalla, y que se recuerde al recargar.
- Medidas de los controles a 1180×820 y 820×1180, en inglés y en español.
- Que no haya excepciones en consola.

## Probar los casos de error del visor

- **Archivo cortado:** `npm run clouds:truncate` reemplaza la nube de *410 Harbor Ave* por una versión cortada al 60 %. Al cargarla aparece un mensaje claro y "Try again". `npm run clouds` restaura la nube completa.
- **404:** *Brickyard Lofts* (usuario `brick` o `staff`) no tiene nube.
- **Red caída:** detener el servidor o activar el modo sin conexión de DevTools durante la carga.
- **Cambiar de proyecto a mitad de carga:** pulsar "Load point cloud" en *410 Harbor Ave* y abrir otro proyecto mientras avanza la barra.

## API

Todas las rutas exigen `Authorization: Bearer <token>`.

| Método y ruta | Respuesta |
|---|---|
| `GET /api/projects` | Proyectos visibles: `id`, `name`, `address`, `status`, `client.name` |
| `GET /api/projects/:id` | Lo anterior más `dates`, `levels` y `client.contacts` (correo y teléfono solo para staff) |
| `GET /api/projects/:id/spaces` | Espacios como cajas |
| `GET /api/projects/:id/cloud` | Binario PTS1 con soporte de `Range` |
| `POST /api/projects/:id/issues` | Crea `{ title, level, spaceId? }` y responde 201 con su `id` |
| `GET /api/me` | Nombre y rol de quien usa el token |
| `GET /api/issues` | Solo staff: todos los reportes, del más reciente al más antiguo, con nombre de proyecto y espacio. Con ETag |
| `PATCH /api/issues/:id` | Solo staff: cambia `{ status }` a `open`, `in_progress` o `resolved` |

Los errores siempre son JSON: `{ "error": { "code", "message", "details?" } }`.

| Caso | Estado |
|---|---|
| Sin token o token inválido | 401 |
| Id con formato inválido (no es `NNNN-NNNNN`) | 400 `invalid_id` |
| Proyecto inexistente o de otra cuenta | 404 `not_found`, idéntico en ambos casos |
| JSON roto | 400 `invalid_json` |
| Cuerpo inválido | 400 `validation_failed` con `details` por campo |
| Cuerpo que no es `application/json` | 415 |
| Cuerpo mayor a 16 KB | 413 |
| Proyecto sin nube o archivo no generado | 404 `cloud_not_found` |
| Rango imposible | 416 |
| Un cliente pide el panel de reportes | 403 `forbidden` |
| Reporte inexistente | 404 `issue_not_found` |

## Qué quedó hecho

**Parte A.** Las cinco rutas y las siete reglas, con pruebas automáticas de todas (no solo de la 2, la 4 y la 5).

**Parte B.**

1. Selector de usuario, lista de proyectos y ficha con nombre, cliente, estado, fechas ("Not recorded" si faltan) y contactos.
2. Espacios en 3D con un color por nivel. Se puede orbitar, acercar y desplazar con mouse y con dedos. Al tocar una caja, un panel muestra nombre, uso, nivel y área, con botón para alternar m² y ft². Los chips de nivel filtran las cajas y también recortan la nube a la altura de ese nivel.
3. "Load point cloud" descarga e interpreta la nube en un Web Worker, con barra de progreso real basada en bytes y botón Cancel. Se dibuja con `THREE.Points`, alineada con las cajas.
4. Abrir otro proyecto, o cambiar de usuario, cancela la descarga en curso; ningún punto del proyecto anterior llega al nuevo.
5. Archivo cortado, 404, red caída y fallo del worker muestran un mensaje claro con "Try again". No hay excepciones en consola; si WebGL no está disponible, la ficha y el formulario siguen funcionando.
6. Formulario de reporte con título, nivel y espacio seleccionado. Muestra los errores por campo que devuelve el servidor y el id creado. No usa `alert()` ni `prompt()`.
7. iPad: verificado por las pruebas end-to-end con emulación táctil a 1180×820 y 820×1180. Todos los controles miden al menos 44 px, no hay scroll horizontal y los campos usan 16 px para que Safari no haga zoom al tocarlos.

**Panel de reportes (extra, no lo pide el enunciado).** Con el usuario staff aparece en la barra superior la pestaña **Issues**, con el número de reportes abiertos.
- Muestra todos los reportes, de todas las cuentas, en una tabla con estado, problema, proyecto y espacio, nivel, quién lo envió y cuándo, con filtro por estado.
- Se actualiza sola cada 10 segundos mientras está abierta y cada 30 en segundo plano; se detiene con la pestaña del navegador oculta. Como la lista usa ETag, si no hay cambios el servidor responde 304 sin cuerpo. Los reportes que llegan mientras miras se resaltan como nuevos.
- El estado (abierto, en curso, resuelto) se cambia desde la misma fila, y queda guardado quién lo cambió y cuándo.
- "Open in 3D" abre el proyecto, selecciona el espacio del reporte y acerca la cámara.
- El acceso se decide en el servidor: un cliente recibe 403 en `/api/issues` aunque llame a la API directamente, y la interfaz solo muestra la pestaña si `/api/me` dice que el rol es staff. En iPad vertical la tabla se apila en bloques con etiquetas.

**Idiomas.** La página está en inglés, como pide el enunciado, y se puede cambiar a español con el selector EN / ES de la barra superior.
- La elección se guarda en el navegador. No se detecta el idioma del sistema, para que un navegador en español siga viendo la página en inglés por defecto.
- Al cambiar de idioma se redibuja todo lo que está en pantalla (ficha, filtro, panel del espacio, avisos y errores) sin perder el proyecto abierto ni la nube cargada.
- Fechas y números usan el formato regional: "4 de ago de 2026", "322,9 ft²", "2.000.000 puntos".
- Los niveles, los usos de los espacios y los estados del proyecto que vienen en el kit se traducen solo en pantalla: "Level 2" se ve como "Nivel 2", "Roof" como "Azotea" y "Office" como "Oficina". Al servidor se sigue enviando el valor original ("Roof"), porque la API valida que el nivel exista tal como está en el proyecto. Los nombres de espacios, proyectos y direcciones se muestran tal cual, y un valor sin traducción conocida también.

**Rendimiento y reducción de puntos.** En local, la nube de 2 millones de puntos descarga e interpreta en menos de un segundo.

- **Con la cámara quieta** se dibujan los 2 millones de puntos, sin bajar calidad.
- **Mientras se orbita, desplaza o hace zoom** se dibuja una muestra uniforme de 1 de cada 4 puntos (500 000). Al detenerse la cámara, incluido el frenado suave, vuelve la nube completa. Solo aplica a nubes de 600 000 puntos o más; la de 400 000 siempre se dibuja entera. Medido con Chrome renderizando por software, orbitar fue unas 3 veces más rápido.
- **Si un archivo trae más de 2 millones de puntos**, el lector toma uno de cada N de forma uniforme y el visor lo indica en pantalla.

## Decisiones

**Datos por cliente**
- La visibilidad se decide en un solo lugar (`canViewProject` en `src/domain/access.js`). Se niega por defecto: un rol desconocido o un cliente sin `account` no ve nada.
- Las respuestas se construyen con serializadores de lista blanca (`src/domain/serializers.js`), no borrando campos. Un campo nuevo en `projects.json` no sale del servidor hasta que alguien lo agrega a propósito.
- Orden de chequeo: token, formato del id, visibilidad del proyecto y, al final, el cuerpo. Un cliente no puede distinguir un proyecto ajeno de uno inexistente, ni siquiera mandando JSON roto.
- Los tokens se buscan por su hash SHA-256 y no por el texto. Así el tiempo de búsqueda no revela cuántos caracteres de un token adivinado coinciden con uno real.

**Caché**
- El ETag es un hash del cuerpo ya serializado. Como staff y cliente reciben cuerpos distintos, también reciben ETags distintos.
- `Cache-Control: private, no-cache` permite revalidar en el navegador pero no guardar en cachés compartidas. `Vary: Authorization` separa por token. Los errores van con `no-store`.

**Nube**
- Se sirve con `res.sendFile`, que maneja `Range`, 206 y 416, con `Cache-Control: private` en lugar del `public` que trae por defecto.

**Carga 3D**
- El worker hace la descarga y la interpretación juntas. Lee el stream por trozos y escribe directo en arreglos tipados reservados de antemano. Nunca guarda el archivo completo en memoria, cosa que importa en iPad. Al terminar transfiere los arreglos al hilo principal sin copiarlos.
- Cancelar es `worker.terminate()`, que corta también la descarga. El hilo principal ignora cualquier mensaje de una carga ya reemplazada, porque cada carga tiene su propio `AbortController`.
- Un archivo cortado se detecta en cuanto llega el encabezado, comparando `Content-Length` con lo que anuncia el archivo, sin descargar todo para luego fallar. Si no hay `Content-Length`, se detecta al final al contar los puntos.

**Visor**
- La escena solo se dibuja cuando algo cambia (órbita, selección, filtro o tamaño), no 60 veces por segundo. Ahorra batería en iPad.
- La densidad de píxeles se limita a 2.
- Para que la muestra al orbitar sea pareja en todo el edificio, el lector guarda los puntos intercalados: primero uno de cada cuatro y después el resto. Así basta con dibujar el primer cuarto del arreglo (`setDrawRange`), sin copiar ni recalcular nada en cada movimiento. Funciona igual si el archivo viene ordenado por barrido del escáner, porque uno de cada cuatro en orden de lectura sigue cubriendo todo el espacio.
- El sistema de coordenadas con Z hacia arriba se resuelve rotando un grupo raíz, así cajas y puntos usan las coordenadas del archivo tal cual.

**Estilo visual**
- Toma el lenguaje visual de mantislab.co, con valores medidos en su sitio y no de memoria:
  - Azul eléctrico `#1800FF` en la acción principal y la selección actual.
  - Superficies casi negras en la barra superior y el escenario 3D, como el hero de su sitio, donde la nube de puntos es la protagonista.
  - Títulos en azul marino `#001749`.
  - Botones con radio de 7 px y borde de 2 px.
  - Inter Tight en toda la interfaz.
- El nombre de la app usa Michroma, una fuente ancha y libre, en lugar de Armstrong, la fuente comercial de su marca. No se usa su logo ni su nombre.
- Todos los colores, fuentes, tamaños y espacios son variables CSS en `:root`. La paleta de niveles y el fondo del escenario también salen de ahí: el visor 3D los lee del CSS, así que un cambio de color se hace en un solo lugar.
- Se evitan los patrones típicos de interfaces genéricas:
  - Sin etiquetas en mayúsculas espaciadas encima de los títulos.
  - Sin textos unidos con "·".
  - Sin tarjetas dentro de tarjetas: la barra lateral es una sola superficie con divisiones finas.
  - El azul se reserva para lo que se puede hacer o lo que está seleccionado.
- Las listas desplegables tienen flecha, bordes y estados propios en todos los navegadores. En los que soportan `appearance: base-select` (Chrome y Edge recientes), la lista abierta también sigue el estilo de la app: opciones de 44 px y marca en la elegida. Safari en iPad muestra su selector nativo, que ahí es la mejor opción táctil.
- Animación de inicio inspirada en el preloader de mantislab.co: el nombre entra desde tres veces su tamaño sobre fondo casi negro y la capa se desvanece. Dura 1,4 s, es solo CSS (`transform` y `opacity`), deja pasar los toques para no bloquear el trabajo y no se muestra si el sistema pide reducir movimiento. Si el JavaScript falla, la animación termina igual y la página queda visible.
- Accesibilidad: anillo de foco visible en todo lo interactivo, contraste mínimo de 4,5:1 en texto y `overflow-x: clip`. Si el sistema pide reducir movimiento, se quitan las transiciones y la inercia de la cámara. Mientras carga la lista de proyectos se muestra un esqueleto con su forma.

**Front y servidor**
- No hay paso de build: three.js se instala desde npm y se sirve localmente con un import map. Las fuentes (`@fontsource/inter-tight` y `@fontsource/michroma`, licencia OFL) también se sirven desde el propio servidor. Funciona sin CDN y se puede modificar en vivo.
- Express 5 y `node:test`. En producción solo se usan Express, three.js y las dos fuentes; `playwright-core` es dependencia de desarrollo, únicamente para las pruebas del visor.
- Los reportes se agregan a `data/issues.jsonl`, una línea JSON por reporte (el archivo está en `.gitignore`). Un cambio de estado agrega una versión nueva del reporte en vez de reescribir el archivo, y al arrancar gana la última versión de cada uno. Sobreviven a un reinicio sin base de datos y, como solo se escribe al final, un fallo no corrompe lo anterior. Una línea dañada se salta con un aviso en el log en lugar de impedir el arranque.
- Los textos viven en dos diccionarios (`public/js/i18n/en.js` y `es.js`), y una prueba falla si a uno le falta una clave o un marcador del otro. Los errores se traducen por su código y no por el texto que manda el servidor. El worker de la nube envía datos (motivo, MB recibidos y esperados, puntos que llegaron) en vez de frases armadas, para que la interfaz escriba el mensaje en el idioma activo. Así la API no cambia y sigue respondiendo en inglés.

## Qué falta y qué haría con un día más

- **Reportes:** avisos por correo o webhook cuando llega uno, fotos desde el iPad, que el cliente vea el estado de sus propios reportes, una clave anti-duplicados al reintentar tras una caída de red, y una base de datos real cuando haya varios servidores.
- **Probar en un iPad real con Safari** y medir FPS con GPU real. Aquí se probó con Chrome y emulación táctil, con renderizado por software.
- **Nubes grandes** (cientos de MB): formato por bloques tipo octree con nivel de detalle según la cámara, y límite de puntos según el dispositivo.
- **Content-Security-Policy:** el import map es un script inline y la política necesita su hash. No la activé porque no pude verificar en Safari de iPad que acepte ese hash, y si no lo acepta la página queda en blanco. Es lo primero que haría con un iPad a mano.
- **Operación:** límite de peticiones por token y logs estructurados.
- **Despliegue:** archivos estáticos con hash en el nombre y caché larga `immutable`, con `index.html` siempre revalidado.

## Estructura

El servidor y el visor se organizan por capas, y cada carpeta tiene una sola responsabilidad. Las rutas usan el middleware y el dominio. El dominio y el almacenamiento no dependen de Express, así que se pueden probar o reutilizar solos.

```
src/                          servidor (API)
  server.js                   arranque
  app.js                      composición de Express y archivos estáticos
  middleware/
    auth.js                   token Bearer → req.user
    errors.js                 errores HTTP en JSON, nunca 500 por entrada inválida
    json-body.js              exige JSON y limita el tamaño del cuerpo
    http-cache.js             ETag y 304
  routes/
    projects.js               rutas de proyectos, espacios, nube y reportes
    issues.js                 panel de reportes (solo staff)
  domain/
    access.js                 quién puede ver qué proyecto
    serializers.js            qué campos salen, según el rol
    validation.js             id de proyecto y cuerpo del reporte
  storage/
    data.js                   carga de los JSON al iniciar
    issues.js                 reportes en data/issues.jsonl

public/                       visor web, sin paso de build
  index.html
  css/styles.css
  js/
    main.js                   estado de la página y flujo: usuario, proyecto, nube
    api/client.js             llamadas a la API con errores tipados
    scene/viewer.js           escena three.js: cajas, selección, filtro, nube
    cloud/
      loader.js               control del worker desde el hilo principal
      worker.js               descarga y lectura en segundo plano
      pts.js                  lector PTS1 incremental
    i18n/
      index.js                idioma activo, traducción y formato regional
      en.js, es.js            diccionarios
    ui/
      projects.js             lista de proyectos y ficha
      level-filter.js         chips de nivel
      inspector.js            panel del espacio seleccionado y unidad de área
      issue-form.js           formulario de reporte
      admin.js                panel de reportes: tabla, filtro, estados y actualización periódica
      cloud-panel.js          botones, progreso y mensajes de la nube
      messages.js             textos de error que ve la persona, a partir de códigos
      dom.js, format.js       helpers del DOM y formato de fechas y áreas
    package.json              marca los módulos como ES modules para probarlos en Node

test/
  helpers.js                  servidor de prueba sobre una copia temporal de los datos
  api/                        una suite por regla de la API
  web/                        módulos del visor (lector, cliente, formato, mensajes)
e2e/                          pruebas del visor en navegador

scripts/clouds.js             genera, regenera o corta las nubes
data/, tools/                 kit inicial, sin cambios
```

## Formato PTS1 (little-endian)

| Bytes | Tipo | Significado |
|---|---|---|
| 0–3 | ASCII | firma `PTS1` |
| 4–7 | uint32 | cantidad de puntos N |
| 8–11 | float32 | separación entre puntos en metros |
| 12–15 | uint32 | reservado |
| luego N × 16 | float32 x, y, z · uint8 r, g, b, intensidad | un punto |

Los espacios son cajas: `x, y, z` es la esquina mínima en metros (Z hacia arriba) y `w, d, h` el tamaño.

## Uso de asistentes de IA

Usé Claude Code (Anthropic) como asistente de programación durante el proyecto: servidor, visor, pruebas y documentación. Para el estilo visual seguí las reglas de la guía de diseño [hallmark](https://github.com/nutlope/hallmark), que lista los patrones que hacen ver una interfaz como generada.
