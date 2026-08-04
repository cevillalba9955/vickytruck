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

- [ ] T001 [P] Agregar `CHOFER_FRONTEND_URL` (host del frontend en Cloudflare Pages/Workers, ej. `http://localhost:5173` en desarrollo) a `backend/.env.example`, documentado con un comentario que referencie `enlaceRecorrido.js` y FR-002a de `spec.md`.
- [ ] T002 [P] Reescribir el párrafo de `backend/README.md` que hoy describe "las credenciales... se aprovisionan solas, la primera vez que su enlace único hace GET /api/recorridos/:token" para reflejar el nuevo flujo (se aprovisionan al generar el enlace desde Central); dejar nota de que el detalle fino se completa en Polish (T035).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pieza compartida por las tres historias — sin ella no existe ningún enlace que abrir (US1), publicar contra (US2) ni generar desde Central (US3).

**⚠️ CRITICAL**: Ninguna historia puede completarse (aunque sí empezar en paralelo parte de su trabajo de frontend) sin este servicio.

- [ ] T003 [P] Unit test en `backend/tests/unit/enlaceRecorrido.test.js`: dado un token con recorrido en el repositorio en memoria y un `emqxProvisioning` fake, `construirEnlace(token)` devuelve `{ payload, url }` con el mismo shape que documenta [contracts/enlace-recorrido.md](./contracts/enlace-recorrido.md) (`recorrido.mqtt`, `progreso`, `puntos`), `url` con prefijo `CHOFER_FRONTEND_URL + "/#/r/"`, y decodificar el fragmento (Base64URL → JSON.parse) reproduce exactamente `payload`. Incluir caso: mismo token pedido dos veces devuelve el mismo `url` (idempotencia, research.md §4).
- [ ] T004 Implementar `backend/src/services/enlaceRecorrido.js` (depende de T003): recibe `recorridoRepository`, `emqxProvisioning`, `frontendBaseUrl` por parámetro (mismo patrón de inyección que `createRecorridoRouter`/`createCentralRouter`); expone `construirEnlace(token)` que llama `repository.obtenerPorToken(token)` + `emqxProvisioning.provisionarCredencial(token)`, arma el JSON del contrato, lo codifica en Base64URL y devuelve `{ payload, url }`. Lanza un error claro si `frontendBaseUrl` no está configurado.

**Checkpoint**: `enlaceRecorrido.js` listo — US1, US2 y US3 pueden avanzar.

---

## Phase 3: User Story 1 - Abrir el recorrido desde un enlace sin depender de la red local (Priority: P1) 🎯 MVP

**Goal**: El chofer abre su enlace único y ve el recorrido completo sin que la app haga ninguna llamada de red hacia el backend local.

**Independent Test**: Construir un payload con `enlaceRecorrido.js` (directamente en un test o con un token de prueba), armar la URL, abrirla en una instancia del frontend desplegada por separado del backend (sin conectividad de red entre ambos), y verificar que el recorrido se ve completo sin ninguna petición al backend.

### Tests for User Story 1

- [ ] T005 [P] [US1] Unit test en `frontend/tests/services/enlacePayload.test.js`: dado un `window.location.hash` con `#/r/<payload-base64url>` válido, `leerPayloadDeUrl()` devuelve el objeto decodificado; casos de error (hash ausente, Base64 inválido, JSON inválido, `puntos` vacío o >10, faltan campos de `mqtt`) devuelven `null` sin lanzar excepción, según [contracts/enlace-recorrido.md](./contracts/enlace-recorrido.md).

### Implementation for User Story 1

- [ ] T006 [US1] Implementar `frontend/src/services/enlacePayload.js` (depende de T005): decodifica y valida el payload del fragmento de URL, según el contrato.
- [ ] T007 [US1] Modificar `frontend/src/main.jsx` (depende de T006): reemplazar `obtenerTokenDeUrl()` (query string) + `cargarRecorrido()` (fetch) por una lectura síncrona de `enlacePayload.js` al montar; derivar `token` de `payload.recorrido.mqtt.username`; el estado `cargando` deja de cubrir la obtención del recorrido (ya no hay red) y pasa a cubrir solo la conexión al bróker.
- [ ] T008 [US1] Actualizar `frontend/src/services/api.js` (depende de T007): eliminar `obtenerRecorrido`, `ApiError`, `safeJson`, `BASE_URL` (ya no se usan); conservar `marcarArribo`, `marcarDescarga`, `iniciarSincronizacionOffline`.
- [ ] T009 [US1] Actualizar `frontend/tests/services/api.test.js` (depende de T008): eliminar los tests de las funciones retiradas.
- [ ] T010 [P] [US1] Retirar `GET /api/recorridos/:token`: eliminar `backend/src/routes/recorrido.js` y su wiring (`app.use("/api/recorridos", ...)` y el import correspondiente) en `backend/src/server.js`.
- [ ] T011 [US1] Eliminar `backend/tests/contract/get-recorrido.test.js` (depende de T010) — el contrato que cubría ya no existe.
- [ ] T012 [US1] Adaptar `backend/tests/integration/ver-recorrido.test.js` (depende de T004, T010): reemplazar las aserciones sobre `fetch(${server.baseUrl}/tok-...)` por llamadas directas a `enlaceRecorrido.js`/`recorridoRepository.obtenerPorToken`, conservando la aserción de aislamiento entre tokens (un token no debe poder ver los puntos de otro).
- [ ] T013 [US1] Revisar `backend/tests/integration/marcar-arribo.test.js` y el resto de `backend/tests/integration/*.test.js` (depende de T010) en busca de cualquier dependencia residual del endpoint retirado; ajustar imports/setup donde corresponda (la mayoría ya marca eventos vía MQTT simulado y no debería depender del GET retirado — confirmarlo, no asumirlo).
- [ ] T014 [US1] Ejecutar manualmente el "Escenario 1" de [quickstart.md](./quickstart.md) (depende de T007) contra un build del frontend servido por separado del backend, confirmando en las herramientas de red del navegador que no hay ninguna petición al host del backend.

**Checkpoint**: El chofer puede abrir su enlace y ver el recorrido sin tocar el backend local. Historia 1 funcional y testeable de forma independiente.

---

## Phase 4: User Story 2 - Publicar ubicación y acciones sin conocer la red del backend (Priority: P1)

**Goal**: Toda acción del chofer (ubicación, "Llegué", "Descarga completa") se publica exclusivamente contra el bróker usando el token recibido, y ese token queda atado al primer dispositivo que lo usa (FR-005a).

**Independent Test**: Con el payload ya cargado (US1), marcar "Llegué" y confirmar que el evento llega al backend solo a través del bróker; abrir el mismo enlace desde un segundo dispositivo/clientId y confirmar que su sesión de publicación es expulsada poco después de conectar.

### Tests for User Story 2

- [ ] T015 [P] [US2] Unit test en `frontend/tests/services/deviceId.test.js`: `obtenerDeviceId()` genera un id la primera vez, lo persiste en `localStorage` y devuelve el mismo valor en llamadas subsiguientes; si `localStorage` no está disponible, no lanza excepción (genera uno nuevo en memoria).
- [ ] T019 [P] [US2] Unit test en `backend/tests/unit/vinculoDispositivo.test.js`: primer `registrarConexion(token, clientId)` vincula; mismo `clientId` en llamadas posteriores no dispara expulsión; `clientId` distinto sí la dispara; `liberar(token)` limpia el vínculo y un `registrarConexion` posterior vuelve a vincular como "primero".
- [ ] T023 [P] [US2] Integration test en `backend/tests/integration/vinculo-dispositivo.test.js`: usando un cliente MQTT fake (mismo patrón `EventEmitter` que `backend/tests/integration/mqtt-eventos.test.js`) que emite eventos de conexión simulados, verificar que `conexionWatcher.js` vincula el primer `clientId` por token, ignora reconexiones del mismo `clientId`, y llama a `expulsarCliente` ante un `clientId` distinto.

### Implementation for User Story 2

- [ ] T016 [US2] Implementar `frontend/src/services/deviceId.js` (depende de T015).
- [ ] T017 [US2] Modificar `frontend/src/services/mqttClient.js::conectar()` (depende de T016) para aceptar y reenviar `clientId` a `mqtt.connect(url, { username, password, clientId, ... })`.
- [ ] T018 [US2] Modificar `frontend/src/main.jsx` (depende de T017 y de T007 de US1) para pasar `obtenerDeviceId()` al llamar `conectarMqtt(mqttConfig)`.
- [ ] T020 [US2] Implementar `backend/src/state/vinculoDispositivo.js` (depende de T019): store efímero en memoria (mismo patrón que `backend/src/state/ubicacionEnMemoria.js`), expone `registrarConexion(token, clientId)` y `liberar(token)`.
- [ ] T021 [P] [US2] Extender `backend/tests/helpers/fakeEmqxProvisioning.js` con un stub de `expulsarCliente(clientId)` (para T023) y agregar el caso de `expulsarCliente` real (éxito y 404 idempotente) a `backend/tests/unit/emqxProvisioning.test.js`.
- [ ] T022 [US2] Agregar `expulsarCliente(clientId)` a `backend/src/mqtt/emqxProvisioning.js` (depende de T021): llamada REST de kick contra `EMQX_CLOUD_API_URL` (mismas credenciales de administración ya usadas por `provisionarCredencial`/`revocarCredencial`), idempotente ante 404.
- [ ] T024 [US2] Implementar `backend/src/mqtt/conexionWatcher.js` (depende de T020, T022, T023): suscribe el cliente MQTT de servicio ya existente a los tópicos de eventos de conexión (`$SYS`, ver research.md §3), extrae `{ username, clientId }` y delega en `vinculoDispositivo.registrarConexion` + `emqxProvisioning.expulsarCliente` cuando corresponda; ignora eventos de `username` que no sea un token de recorrido activo conocido (FR-013, mismo criterio que `subscriber.js`).
- [ ] T025 [US2] Conectar `conexionWatcher.js` en el arranque de `backend/src/server.js` (depende de T024), junto a `createSubscriber(...).iniciar()`.
- [ ] T026 [US2] Liberar el vínculo (`vinculoDispositivo.liberar(token)`) en los mismos puntos donde ya se revoca la credencial EMQX (depende de T020): `backend/src/mqtt/subscriber.js` (recorrido completado al 100%) y `backend/src/routes/central.js` (`/reasignar`).
- [ ] T027 [US2] Ejecutar manualmente el "Escenario 2" y la "Verificación del vínculo a primer dispositivo" de [quickstart.md](./quickstart.md) (depende de T018, T025, T026).

**Checkpoint**: Publicar ubicación/acciones funciona solo contra el bróker, y un segundo dispositivo con el mismo token queda expulsado. US1 + US2 funcionan de forma independiente y conjunta.

---

## Phase 5: User Story 3 - Generar y distribuir el enlace desde Central (Priority: P2)

**Goal**: Un operador de Central obtiene, al asignar o reasignar un recorrido, un único enlace completo listo para copiar y enviar por un canal externo (ej. WhatsApp), de forma idempotente.

**Independent Test**: Asignar un recorrido a un flete desde Central y confirmar que la respuesta incluye un `enlace` completo (no solo un `token`); volver a pedirlo antes de que el recorrido finalice y confirmar que es exactamente el mismo.

### Tests for User Story 3

- [ ] T028 [P] [US3] Extender `backend/tests/contract/post-asignar.test.js`: la respuesta `200` incluye `enlace`, con el prefijo `CHOFER_FRONTEND_URL + "/#/r/"` y un fragmento decodificable al mismo `payload` que devuelve `enlaceRecorrido.js` para ese token.
- [ ] T029 [P] [US3] Extender `backend/tests/contract/post-reasignar.test.js`: la respuesta `200` incluye un `enlace` nuevo (correspondiente al `token` nuevo), distinto del enlace que hubiera correspondido al `token` anterior ya invalidado.

### Implementation for User Story 3

- [ ] T030 [US3] Modificar `backend/src/routes/central.js` (depende de T004, T028, T029): `createCentralRouter` recibe además `recorridoRepository` y la función `construirEnlace` de `enlaceRecorrido.js`; extender `serializeAsignacion` para incluir `enlace` en las respuestas de `/asignar` y `/reasignar`, según [contracts/central-asignacion.md](./contracts/central-asignacion.md).
- [ ] T031 [US3] Modificar `backend/src/server.js` (depende de T030): construir e inyectar `enlaceRecorrido` (con `CHOFER_FRONTEND_URL`, el `recorridoRepository` ya existente y `emqxProvisioning`) al llamar `createCentralRouter(...)`.
- [ ] T032 [US3] Modificar `central/src/components/AsignacionForm.jsx` (depende de T031): mostrar `resultado.enlace` (URL completa) en vez de `resultado.token`, con una acción de copiar al portapapeles.
- [ ] T033 [P] [US3] Agregar `central/tests/components/AsignacionForm.test.jsx` (depende de T032): cubre que, tras una asignación exitosa, se muestra el `enlace` recibido y la acción de copiar funciona.
- [ ] T034 [US3] Ejecutar manualmente el "Escenario 3" de [quickstart.md](./quickstart.md) (depende de T031) para confirmar la idempotencia del enlace.

**Checkpoint**: Las tres historias funcionan de forma independiente y en conjunto — flujo completo Central → enlace → chofer → bróker validado.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cierre de documentación y limpieza tras completar las tres historias.

- [ ] T035 [P] Completar la sección "Puesta en marcha del bróker MQTT" de `backend/README.md` (continúa T002) con el flujo final implementado: cuándo se aprovisiona la credencial (al generar el enlace), y mención de `CHOFER_FRONTEND_URL`.
- [ ] T036 [P] Barrido de comentarios obsoletos que referencien `GET /api/recorridos/:token` en `backend/src/mqtt/emqxProvisioning.js` y cualquier otro archivo restante (ver referencias detectadas en `frontend/src/services/mqttClient.js` si no fueron ya actualizadas en T017); actualizarlos para reflejar el nuevo flujo.
- [ ] T037 Ejecutar el [quickstart.md](./quickstart.md) completo de punta a punta (los 3 escenarios + verificación de dispositivo + edge cases) como validación final antes de mergear.

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
