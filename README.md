# Site Viewer Lite

API en Node.js y visor web con three.js para revisar edificios escaneados: cada persona elige un proyecto, ve sus espacios en 3D, carga la nube de puntos y reporta problemas. Un cliente solo ve sus proyectos y nunca recibe datos internos.

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

## Pruebas

```bash
npm test
```

63 pruebas con `node:test` y `fetch` nativo, sin dependencias extra. Las de la API levantan la app en un puerto libre sobre una copia temporal de los datos. Las del front importan los mismos módulos que usa el navegador, sin DOM.

| Archivo | Qué cubre |
|---|---|
| `test/api/auth.test.js` | Regla 1: sin token, token inválido o cabecera mal formada dan 401, también antes de leer el cuerpo |
| `test/api/privacy.test.js` | Reglas 2 y 3: ningún endpoint, para ningún usuario, devuelve `internal` ni sus valores; el cliente no recibe correo ni teléfono |
| `test/api/access.test.js` | Regla 4: un proyecto ajeno responde exactamente igual (estado, cuerpo y cabeceras) que uno inexistente, en todos los endpoints |
| `test/api/validation.test.js` | Regla 5: ids mal formados, JSON roto, cuerpos inválidos y límites del título dan 4xx, nunca 500 |
| `test/api/caching.test.js` | Regla 6: ETag, 304 con `If-None-Match`, `private` y `Vary: Authorization` |
| `test/api/cloud.test.js` | Regla 7: `Range: bytes=0-15` da 206 con los 16 bytes; proyecto sin nube da 404; rango imposible da 416 |
| `test/api/issues.test.js` | Los reportes válidos quedan en `data/issues.jsonl` con quién los creó; los rechazados no se guardan |
| `test/web/pts.test.js` | Lector PTS1: trozos de cualquier tamaño, archivo cortado, formato inválido, diezmado |
| `test/web/api-client.test.js` | Cliente de la API: token actual en cada llamada, errores tipados (`ApiError`, `NetworkError`, abort) aunque el servidor responda HTML |
| `test/web/format.test.js` | "Not recorded", fechas que no se corren un día en husos al oeste de UTC, m² y ft² |
| `test/web/messages.test.js` | Mensajes de error y de progreso que ve la persona, y validación previa del formulario |

### Pruebas end-to-end del visor

```bash
npm run test:e2e
```

13 pruebas que abren el visor en Chrome headless, con pantalla táctil y tamaño de iPad. Usan el Chrome instalado en el equipo, no descargan navegadores; con Edge se corren con `E2E_BROWSER_CHANNEL=msedge npm run test:e2e`. Si no encuentran el navegador, se marcan como omitidas.

Entre el navegador y la app ponen un proxy que entrega la nube lentamente y registra si la conexión se cortó. Así comprueban que Cancel y cambiar de proyecto a mitad de carga cortan la descarga de verdad en el servidor, no solo en la interfaz. También cubren:
- Selección por toque y alternar m² y ft².
- Filtro de nivel.
- Progreso real.
- Archivo cortado, 404 y red caída con "Try again".
- Formulario de reporte.
- Medidas de los controles a 1180×820 y 820×1180.
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

**Rendimiento.** La nube de 2 millones de puntos se dibuja completa, sin bajar puntos ni calidad. En local descarga e interpreta en menos de un segundo. Si un archivo trae más de 2 millones de puntos, el lector toma uno de cada N de forma uniforme y el visor lo indica en pantalla.

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
- El sistema de coordenadas con Z hacia arriba se resuelve rotando un grupo raíz, así cajas y puntos usan las coordenadas del archivo tal cual.

**Front y servidor**
- No hay paso de build: three.js se instala desde npm y se sirve localmente con un import map. Funciona sin CDN y se puede modificar en vivo.
- Express 5 y `node:test`. En producción solo se usan Express y three.js; `playwright-core` es dependencia de desarrollo, únicamente para las pruebas del visor.
- Los reportes se agregan a `data/issues.jsonl`, una línea JSON por reporte (el archivo está en `.gitignore`). Sobreviven a un reinicio sin necesidad de base de datos y, como solo se escribe al final, un fallo no corrompe los reportes anteriores.

## Qué falta y qué haría con un día más

- **Reportes:** un `GET` para listarlos por proyecto y mostrarlos en el visor, y una base de datos real cuando haya varios servidores.
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
    http-cache.js             ETag y 304
  routes/
    projects.js               rutas de la API
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
    ui/
      projects.js             lista de proyectos y ficha
      level-filter.js         chips de nivel
      inspector.js            panel del espacio seleccionado y unidad de área
      issue-form.js           formulario de reporte
      cloud-panel.js          botones, progreso y mensajes de la nube
      messages.js             textos de error que ve la persona
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

Usé Claude Code (Anthropic) como asistente de programación durante el proyecto: servidor, visor, pruebas y documentación.
