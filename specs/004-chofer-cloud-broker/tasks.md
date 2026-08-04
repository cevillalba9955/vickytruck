# Tasks: Entrega de Recorrido y Token de Bróker para Frontend Desplegado en la Nube

**Input**: Design documents from `/specs/004-chofer-cloud-broker/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Incluidas — el proyecto ya sigue esta convención en todas las features previas (`backend/tests/{unit,contract,integration}`, `frontend/tests`, `central/tests`).

**Organization**: Tareas agrupadas por historia de usuario de `spec.md`, en orden de prioridad (US1 y US2 son P1; US3 es P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1, US2, US3)
- Rutas de archivo exactas en cada descripción

## Path Conventions

Proyecto web existente de 3 apps (ver `plan.md` → Project Structure): `backend/src/`,
`backend/tests/`, `frontend/src/`, `frontend/tests/`, `central/src/`, `central/tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuración compartida que las demás fases necesitan.

- [X] T001 [P] Agregar `CHOFER_FRONTEND_URL` (host del frontend en Cloudflare Pages/Workers, ej. `http://localhost:5173` en desarrollo) a `backend/.env.example`, documentado con un comentario que referencie `enlaceRecorrido.js` y FR-002a de `spec.md`.
- [X] T002 [P] Reescribir el párrafo de `backend/README.md` que hoy describe "las credenciales... se aprovisionan solas, la primera vez que su enlace único hace GET /api/recorridos/:token" para reflejar el nuevo flujo (se aprovisionan al generar el enlace desde Central); dejar nota de que el detalle fino se completa en Polish (T035).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pieza compartida por las tres historias — sin ella no existe ningún enlace que abrir (US1), publicar contra (US2) ni generar desde Central (US3).

**⚠️ CRITICAL**: Ninguna historia puede completarse (aunque sí empezar en paralelo parte de su trabajo de frontend) sin este servicio.

- [X] T003 [P] Unit test en `backend/tests/unit/enlaceRecorrido.test.js`: dado un token con recorrido en el repositorio en memoria y un `emqxProvisioning` fake, `construirEnlace(token)` devuelve `{ payload, url }` con el mismo shape que documenta [contracts/enlace-recorrido.md](./contracts/enlace-recorrido.md) (`recorrido.mqtt`, `progreso`, `puntos`), `url` con prefijo `CHOFER_FRONTEND_URL + "/#/r/"`, y decodificar el fragmento (Base64URL → JSON.parse) reproduce exactamente `payload`. Incluir caso: mismo token pedido dos veces devuelve el mismo `url` (idempotencia, research.md §4).
- [X] T004 Implementar `backend/src/services/enlaceRecorrido.js` (depende de T003): recibe `recorridoRepository`, `emqxProvisioning`, `frontendBaseUrl` por parámetro (mismo patrón de inyección que `createRecorridoRouter`/`createCentralRouter`); expone `construirEnlace(token)` que llama `repository.obtenerPorToken(token)` + `emqxProvisioning.provisionarCredencial(token)`, arma el JSON del contrato, lo codifica en Base64URL y devuelve `{ payload, url }`. Lanza un error claro si `frontendBaseUrl` no está configurado.

**Checkpoint**: `enlaceRecorrido.js` listo — US1, US2 y US3 pueden avanzar.

---

## Phase 3: User Story 1 - Abrir el recorrido desde un enlace sin depender de la red local (Priority: P1) 🎯 MVP

**Goal**: El chofer abre su enlace único y ve el recorrido completo sin que la app haga ninguna llamada de red hacia el backend local.

**Independent Test**: Construir un payload con `enlaceRecorrido.js` (directamente en un test o con un token de prueba), armar la URL, abrirla en una instancia del frontend desplegada por separado del backend (sin conectividad de red entre ambos), y verificar que el recorrido se ve completo sin ninguna petición al backend.

### Tests for User Story 1

- [X] T005 [P] [US1] Unit test en `frontend/tests/services/enlacePayload.test.js`: dado un `window.location.hash` con `#/r/<payload-base64url>` válido, `leerPayloadDeUrl()` devuelve el objeto decodificado; casos de error (hash ausente, Base64 inválido, JSON inválido, `puntos` vacío o >10, faltan campos de `mqtt`) devuelven `null` sin lanzar excepción, según [contracts/enlace-recorrido.md](./contracts/enlace-recorrido.md).

### Implementation for User Story 1

- [X] T006 [US1] Implementar `frontend/src/services/enlacePayload.js` (depende de T005): decodifica y valida el payload del fragmento de URL, según el contrato.
- [X] T007 [US1] Modificar `frontend/src/main.jsx` (depende de T006): reemplazar `obtenerTokenDeUrl()` (query string) + `cargarRecorrido()` (fetch) por una lectura síncrona de `enlacePayload.js` al montar; derivar `token` de `payload.recorrido.mqtt.username`; el estado `cargando` deja de cubrir la obtención del recorrido (ya no hay red) y pasa a cubrir solo la conexión al bróker.
- [X] T008 [US1] Actualizar `frontend/src/services/api.js` (depende de T007): eliminar `obtenerRecorrido`, `ApiError`, `safeJson`, `BASE_URL` (ya no se usan); conservar `marcarArribo`, `marcarDescarga`, `iniciarSincronizacionOffline`.
- [X] T009 [US1] Actualizar `frontend/tests/services/api.test.js` (depende de T008): eliminar los tests de las funciones retiradas. Verificado: el archivo ya no tenía tests de `obtenerRecorrido`/`ApiError` (solo cubría `marcarArribo`/`marcarDescarga`/`iniciarSincronizacionOffline`) — no-op, suite sigue en verde (3/3).
- [X] T010 [P] [US1] Retirar `GET /api/recorridos/:token`: eliminar `backend/src/routes/recorrido.js` y su wiring (`app.use("/api/recorridos", ...)` y el import correspondiente) en `backend/src/server.js`.
- [X] T011 [US1] Eliminar `backend/tests/contract/get-recorrido.test.js` (depende de T010) — el contrato que cubría ya no existe.
- [X] T012 [US1] Adaptar `backend/tests/integration/ver-recorrido.test.js` (depende de T004, T010): reemplazar las aserciones sobre `fetch(${server.baseUrl}/tok-...)` por llamadas directas a `enlaceRecorrido.js`/`recorridoRepository.obtenerPorToken`, conservando la aserción de aislamiento entre tokens (un token no debe poder ver los puntos de otro).
- [X] T013 [US1] Revisar `backend/tests/integration/marcar-arribo.test.js` y el resto de `backend/tests/integration/*.test.js` (depende de T010) en busca de cualquier dependencia residual del endpoint retirado; ajustar imports/setup donde corresponda. Encontradas y corregidas 2 dependencias residuales (`marcar-arribo.test.js`, `completar-recorrido.test.js` usaban `server.baseUrl` para verificar el estado final) — reemplazadas por lectura directa de `repository.obtenerPorToken`; se eliminó el campo `baseUrl`, ya muerto, de `tests/helpers/testServer.js`. Suite completa: 70/70 tests verdes.
- [X] T014 [US1] Ejecutar manualmente el "Escenario 1" de [quickstart.md](./quickstart.md) (depende de T007) contra un build del frontend servido por separado del backend, confirmando en las herramientas de red del navegador que no hay ninguna petición al host del backend. Verificado en `npm run dev` (Vite, puerto 5173, sin backend corriendo) con un enlace de prueba armado a mano (`#/r/<payload>`): el recorrido se renderiza completo (progreso + 2 puntos) y el listado de red solo muestra peticiones a `localhost:5173` — cero peticiones a un host de backend.

**Checkpoint**: El chofer puede abrir su enlace y ver el recorrido sin tocar el backend local. Historia 1 funcional y testeable de forma independiente.

---

## Phase 4: User Story 2 - Publicar ubicación y acciones sin conocer la red del backend (Priority: P1)

**Goal**: Toda acción del chofer (ubicación, "Llegué", "Descarga completa") se publica exclusivamente contra el bróker usando el token recibido, y ese token queda atado al primer dispositivo que lo usa (FR-005a).

**Independent Test**: Con el payload ya cargado (US1), marcar "Llegué" y confirmar que el evento llega al backend solo a través del bróker; abrir el mismo enlace desde un segundo dispositivo/clientId y confirmar que su sesión de publicación es expulsada poco después de conectar.

### Tests for User Story 2

- [X] T015 [P] [US2] Unit test en `frontend/tests/services/deviceId.test.js`: `obtenerDeviceId()` genera un id la primera vez, lo persiste en `localStorage` y devuelve el mismo valor en llamadas subsiguientes; si `localStorage` no está disponible, no lanza excepción (genera uno nuevo en memoria).
- [X] T019 [P] [US2] Unit test en `backend/tests/unit/vinculoDispositivo.test.js`: primer `registrarConexion(token, clientId)` vincula; mismo `clientId` en llamadas posteriores no dispara expulsión; `clientId` distinto sí la dispara; `liberar(token)` limpia el vínculo y un `registrarConexion` posterior vuelve a vincular como "primero".
- [X] T023 [P] [US2] Integration test en `backend/tests/integration/vinculo-dispositivo.test.js`: usando un cliente MQTT fake (mismo patrón `EventEmitter` que `backend/tests/integration/mqtt-eventos.test.js`) que emite eventos de conexión simulados, verificar que `conexionWatcher.js` vincula el primer `clientId` por token, ignora reconexiones del mismo `clientId`, y llama a `expulsarCliente` ante un `clientId` distinto.

### Implementation for User Story 2

- [X] T016 [US2] Implementar `frontend/src/services/deviceId.js` (depende de T015).
- [X] T017 [US2] Modificar `frontend/src/services/mqttClient.js::conectar()` (depende de T016) para aceptar y reenviar `clientId` a `mqtt.connect(url, { username, password, clientId, ... })`.
- [X] T018 [US2] Modificar `frontend/src/main.jsx` (depende de T017 y de T007 de US1) para pasar `obtenerDeviceId()` al llamar `conectarMqtt(mqttConfig)`.
- [X] T020 [US2] Implementar `backend/src/state/vinculoDispositivo.js` (depende de T019): store efímero en memoria (mismo patrón que `backend/src/state/ubicacionEnMemoria.js`), expone `registrarConexion(token, clientId)` y `liberar(token)`.
- [X] T021 [P] [US2] Extender `backend/tests/helpers/fakeEmqxProvisioning.js` con un stub de `expulsarCliente(clientId)` (para T023) y agregar el caso de `expulsarCliente` real (éxito y 404 idempotente) a `backend/tests/unit/emqxProvisioning.test.js`.
- [X] T022 [US2] Agregar `expulsarCliente(clientId)` a `backend/src/mqtt/emqxProvisioning.js` (depende de T021): llamada REST de kick contra `EMQX_CLOUD_API_URL` (mismas credenciales de administración ya usadas por `provisionarCredencial`/`revocarCredencial`), idempotente ante 404.
- [X] T024 [US2] Implementar `backend/src/mqtt/conexionWatcher.js` (depende de T020, T022, T023): suscribe el cliente MQTT de servicio ya existente a los tópicos de eventos de conexión (`$SYS`, ver research.md §3), extrae `{ username, clientId }` y delega en `vinculoDispositivo.registrarConexion` + `emqxProvisioning.expulsarCliente` cuando corresponda; ignora eventos de `username` que no sea un token de recorrido activo conocido (mismo criterio de descarte silencioso que FR-013 de `003-mqtt-broker-fletes`, ver `subscriber.js`).
- [X] T025 [US2] Conectar `conexionWatcher.js` en el arranque de `backend/src/server.js` (depende de T024), junto a `createSubscriber(...).iniciar()`.
- [X] T026 [US2] Liberar el vínculo (`vinculoDispositivo.liberar(token)`) en los mismos puntos donde ya se revoca la credencial EMQX (depende de T020): `backend/src/mqtt/subscriber.js` (recorrido completado al 100%) y `backend/src/routes/central.js` (`/reasignar`).
- [X] T038 [US2] Modificar `frontend/src/services/mqttClient.js` (depende de T017): exponer el estado de conexión (`conectando`/`conectado`/`desconectado`/`error`) vía un callback suscribible (`onEstadoCambio(cb)`), incluyendo — cuando el cliente MQTT lo entregue (evento `disconnect` de MQTT5 con `reasonCode`, ver mqtt.js) — si la desconexión fue iniciada por el bróker (posible expulsión por vínculo a otro dispositivo, FR-005a) en vez de una simple pérdida de red.
- [X] T039 [US2] Modificar `frontend/src/main.jsx` (depende de T038, T018): mostrar un aviso visible cuando el estado de conexión no sea `conectado` — "Sin conexión al bróker, reintentando…" en el caso general (FR-008), y un mensaje distinto ("Este dispositivo ya no puede publicar en este recorrido; pedí un enlace nuevo a Central") cuando la desconexión reportada por T038 sea una expulsión administrativa (FR-005a). Si el cliente MQTT no expone el motivo de forma confiable, usar el mensaje general como fallback — no bloquea el requisito, ver research.md §3 (limitación aceptada).
- [X] T027 [US2] Ejecutar manualmente el "Escenario 2" y la "Verificación del vínculo a primer dispositivo" de [quickstart.md](./quickstart.md) (depende de T018, T025, T026, T039). **Alcance real de esta verificación** (no hay credenciales de un EMQX Cloud/Oracle reales en este entorno de desarrollo): (1) verificado en el navegador que el banner "Sin conexión al bróker, reintentando…" aparece cuando la conexión MQTT falla (T039, ya probado en T014/T038 contra un host de bróker inexistente); (2) verificada la lógica completa de vínculo/expulsión (`vinculoDispositivo.js` + `conexionWatcher.js` + `emqxProvisioning.expulsarCliente`) mediante los tests de integración de T023 (6/6 verdes) con un cliente MQTT de servicio simulado. **Pendiente de un entorno con EMQX Cloud/Oracle reales** (fuera de alcance de este sandbox): confirmar contra el deployment real el nombre exacto del tópico `$SYS`/evento de conexión y el endpoint REST de "kick" (ya señalado como riesgo a verificar en research.md §3 y en los comentarios de `conexionWatcher.js`/`emqxProvisioning.js`), y el mensaje "expulsado" del banner ante un DISCONNECT MQTT5 real del bróker.

**Checkpoint**: Publicar ubicación/acciones funciona solo contra el bróker, y un segundo dispositivo con el mismo token queda expulsado. US1 + US2 funcionan de forma independiente y conjunta.

---

## Phase 5: User Story 3 - Generar y distribuir el enlace desde Central (Priority: P2)

**Goal**: Un operador de Central obtiene, al asignar o reasignar un recorrido, un único enlace completo listo para copiar y enviar por un canal externo (ej. WhatsApp), de forma idempotente.

**Independent Test**: Asignar un recorrido a un flete desde Central y confirmar que la respuesta incluye un `enlace` completo (no solo un `token`); volver a pedirlo antes de que el recorrido finalice y confirmar que es exactamente el mismo.

### Tests for User Story 3

- [X] T028 [P] [US3] Extender `backend/tests/contract/post-asignar.test.js`: la respuesta `200` incluye `enlace`, con el prefijo `CHOFER_FRONTEND_URL + "/#/r/"` y un fragmento decodificable al mismo `payload` que devuelve `enlaceRecorrido.js` para ese token.
- [X] T029 [P] [US3] Extender `backend/tests/contract/post-reasignar.test.js`: la respuesta `200` incluye un `enlace` nuevo (correspondiente al `token` nuevo), distinto del enlace que hubiera correspondido al `token` anterior ya invalidado.

### Implementation for User Story 3

- [X] T030 [US3] Modificar `backend/src/routes/central.js` (depende de T004, T028, T029): `createCentralRouter` recibe además `recorridoRepository` y la función `construirEnlace` de `enlaceRecorrido.js`; extender `serializeAsignacion` para incluir `enlace` en las respuestas de `/asignar` y `/reasignar`, según [contracts/central-asignacion.md](./contracts/central-asignacion.md).
- [X] T031 [US3] Modificar `backend/src/server.js` — ya hecho como parte de T010 (retiro de `recorrido.js`), que dejó `createApp` construyendo e inyectando `enlaceRecorrido` en `createCentralRouter(...)`. (depende de T030): construir e inyectar `enlaceRecorrido` (con `CHOFER_FRONTEND_URL`, el `recorridoRepository` ya existente y `emqxProvisioning`) al llamar `createCentralRouter(...)`.
- [X] T032 [US3] Modificar `central/src/components/AsignacionForm.jsx` (depende de T031): mostrar `resultado.enlace` (URL completa) en vez de `resultado.token`, con una acción de copiar al portapapeles.
- [X] T033 [P] [US3] Agregar `central/tests/components/AsignacionForm.test.jsx` (depende de T032): cubre que, tras una asignación exitosa, se muestra el `enlace` recibido y la acción de copiar funciona.
- [X] T040 [US3] **Hallazgo durante T034**: `RecorridoDetalle.jsx` (donde Central ve un recorrido ya activo) no exponía el enlace — solo `AsignacionForm.jsx` lo mostraba justo tras asignar. FR-006 y el acceptance scenario 2 de US3 piden poder re-obtenerlo para *cualquier* recorrido activo, no solo el recién asignado. Corregido: `backend/src/db/centralRepository.js::leerDetalle` ahora selecciona `token`; `backend/src/routes/central.js::GET /recorridos/:id` construye `enlace` con `enlaceRecorrido` cuando hay token; `backend/tests/helpers/inMemoryCentralRepository.js::obtenerDetalle` actualizado a juego; nuevo contract test en `backend/tests/contract/get-recorrido-detalle.test.js`.
- [X] T041 [US3] Extender `central/src/components/RecorridoDetalle.jsx` con el mismo patrón de "Copiar enlace" que `AsignacionForm.jsx` (T032), visible cuando `detalle.recorrido.enlace` está presente; nuevo test en `central/tests/components/RecorridoDetalle.test.jsx` (3/3 verdes).
- [X] T034 [US3] Ejecutar manualmente el "Escenario 3" de [quickstart.md](./quickstart.md) (depende de T031, T040, T041) para confirmar la idempotencia del enlace. Verificado a nivel de test automatizado: `enlaceRecorrido.construirEnlace` es determinístico (T003), `POST /asignar` y `GET /recorridos/:id` decodifican al mismo `payload` para el mismo token (T028, nuevo test de T040). **No verificado en un navegador real contra Central+backend+Oracle end-to-end** (sin credenciales Oracle/EMQX reales en este sandbox, igual que T027) — sí verificado en DOM real (jsdom, vía los tests de componente de T033/T041) que `AsignacionForm` y `RecorridoDetalle` muestran el mismo `enlace` y permiten copiarlo, consistente con lo que Central mostraría en un navegador real.

**Checkpoint**: Las tres historias funcionan de forma independiente y en conjunto — flujo completo Central → enlace → chofer → bróker validado.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cierre de documentación y limpieza tras completar las tres historias.

- [X] T035 [P] Completar la sección "Puesta en marcha del bróker MQTT" de `backend/README.md` (continúa T002) con el flujo final implementado: cuándo se aprovisiona la credencial (al generar el enlace), y mención de `CHOFER_FRONTEND_URL`.
- [X] T036 [P] Barrido de comentarios obsoletos que referencien `GET /api/recorridos/:token` en `backend/src/mqtt/emqxProvisioning.js` y cualquier otro archivo restante (ver referencias detectadas en `frontend/src/services/mqttClient.js` si no fueron ya actualizadas en T017); actualizarlos para reflejar el nuevo flujo. Aprovechar el mismo barrido para confirmar (FR-009, research.md §2) que ningún `console.log`/logger/analytics del frontend registra `window.location.href` o `window.location.hash` completos en ningún punto (`enlacePayload.js`, `main.jsx`, `mqttClient.js`).
- [X] T037 Ejecutar el [quickstart.md](./quickstart.md) completo de punta a punta (los 3 escenarios + verificación de dispositivo + edge cases) como validación final antes de mergear. Validación final: suites completas de las 3 apps en verde (backend 89/89, frontend 35/35, central 12/12 — 136 tests); edge case "URL raíz sin fragmento" reverificado en navegador (muestra "Este enlace no es válido..." sin exponer datos). Alcance no cubierto en este sandbox (sin Oracle/EMQX Cloud reales): confirmar contra un deployment real el nombre del tópico `$SYS` y el endpoint de "kick" (ya señalado en T027 y en research.md §3).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede arrancar de inmediato.
- **Foundational (Phase 2)**: sin dependencia dura de Setup (son archivos distintos), pero T004 usa `CHOFER_FRONTEND_URL` de T001 en tiempo de ejecución real (no en el unit test T003, que puede inyectar el valor). BLOQUEA T012 (US1), T030 (US3).
- **US1 (Phase 3)**: T005–T009 (frontend) pueden arrancar apenas termina Foundational; T010–T013 (retiro del endpoint backend) dependen de T004 solo indirectamente (para no dejar el backend sin forma de construir enlaces) — en la práctica, hacer T004 antes de T010 evita una ventana sin ningún mecanismo de entrega.
- **US2 (Phase 4)**: T015–T018 (frontend) son independientes de US1 en código, pero comparten `main.jsx` (T018 depende de T007). T019–T026 (backend) dependen de Foundational (T004, para que exista un token/recorrido real que provisionar) pero no de US1.
- **US3 (Phase 5)**: depende de Foundational (T004). No depende de US1 ni de US2 en código, aunque probarla de punta a punta (T034) requiere que US1 funcione (para abrir el enlace generado).
- **Polish (Phase 6)**: depende de que las tres historias estén completas.

### Parallel Opportunities

- Setup: T001 y T002 en paralelo (archivos distintos).
- Foundational: T003 antes de T004 (test antes de implementación), sin paralelismo real entre ellas.
- US1: T005 (test) puede correr en paralelo con T010 (retiro del router backend) — archivos y capas distintas.
- US2: T015, T019, T021, T023 pueden escribirse en paralelo entre sí (archivos de test distintos); T016→T017→T018 es una cadena en frontend, T020/T022/T024/T025/T026 es una cadena en backend, ambas cadenas son independientes entre sí hasta que T018 y T025 convergen en la prueba manual T027.
- US3: T028 y T029 en paralelo (archivos de contract test distintos).
- Distintas historias (US1, US2, US3) pueden trabajarse en paralelo por personas distintas una vez completada la fase Foundational, salvo por el punto de integración compartido en `frontend/src/main.jsx` (T007 de US1, tocado también por T018 de US2).

---

## Parallel Example: Foundational + arranque de historias

```bash
# Fase Foundational
Task: "Unit test enlaceRecorrido.js en backend/tests/unit/enlaceRecorrido.test.js"
# (luego, secuencial) Task: "Implementar backend/src/services/enlaceRecorrido.js"

# Apenas termina Foundational, en paralelo:
Task: "Unit test enlacePayload.js en frontend/tests/services/enlacePayload.test.js"          # US1
Task: "Retirar GET /api/recorridos/:token en backend/src/routes/recorrido.js"                 # US1
Task: "Unit test deviceId.js en frontend/tests/services/deviceId.test.js"                     # US2
Task: "Unit test vinculoDispositivo.js en backend/tests/unit/vinculoDispositivo.test.js"      # US2
```

---

## Implementation Strategy

### MVP First (User Story 1 solamente)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (crítico — bloquea todo lo demás)
3. Completar Fase 3: User Story 1
4. **STOP y VALIDAR**: correr el Escenario 1 de quickstart.md de forma independiente
5. Desplegar/demostrar si está listo — ya demuestra el objetivo central (frontend en la nube sin conocer la red del backend), aunque sin el endurecimiento de seguridad de US2 ni la comodidad operativa de US3.

### Incremental Delivery

1. Setup + Foundational → base lista
2. + User Story 1 → probar independientemente → demo (MVP: el chofer ve su recorrido sin exponer el backend)
3. + User Story 2 → probar independientemente → demo (publicación segura, atada a dispositivo)
4. + User Story 3 → probar independientemente → demo (operación diaria simple desde Central)
5. Cada historia agrega valor sin romper las anteriores.

### Parallel Team Strategy

Con más de una persona disponible:

1. Completar Setup + Foundational en conjunto.
2. Con Foundational lista:
   - Persona A: User Story 1 (frontend: `enlacePayload.js`, `main.jsx`; backend: retiro de `recorrido.js`)
   - Persona B: User Story 2 (frontend: `deviceId.js`, `mqttClient.js`; backend: `vinculoDispositivo.js`, `conexionWatcher.js`, `emqxProvisioning.js`)
   - Persona C: User Story 3 (backend: `central.js`, `server.js`; central: `AsignacionForm.jsx`)
3. Punto de sincronización: `frontend/src/main.jsx` lo tocan tanto A (T007) como B (T018) — coordinar ese archivo puntualmente.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes entre sí.
- [Story] mapea cada tarea a su historia de usuario para trazabilidad.
- Cada historia debe quedar completable y testeable de forma independiente.
- Verificar que los tests fallan antes de implementar (T005/T006, T015/T016, T019/T020, T028-T029/T030, T003/T004).
- El mecanismo de vínculo a primer dispositivo (US2) es reactivo, no preventivo (ver research.md §3) — su prueba de integración (T023) debe reflejar eso: valida que la expulsión ocurre, no que la conexión indebida nunca llegó a establecerse.
- Evitar: tareas vagas, conflictos de archivo simultáneos (especialmente `frontend/src/main.jsx`, ver Parallel Team Strategy), dependencias cruzadas entre historias que rompan su independencia.
