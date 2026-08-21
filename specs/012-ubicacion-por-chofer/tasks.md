---

description: "Task list for 012-ubicacion-por-chofer"
---

# Tasks: Ubicación en vivo ligada al chofer, no al viaje

**Input**: Design documents from `/specs/012-ubicacion-por-chofer/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Incluidas — no son TDD estricto (este proyecto no lo practica), pero varios cambios rompen tests existentes por diseño (parámetros/nombres cambian), así que actualizarlos es parte de la definición de terminado de cada tarea de implementación, no un fase aparte opcional.

**Organization**: Tareas agrupadas por historia de usuario (spec.md) para permitir implementación y prueba independiente de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede correr en paralelo (archivos distintos, sin dependencias entre sí)
- **[Story]**: A qué historia de usuario pertenece (US1, US2, US3)
- Rutas de archivo exactas incluidas en cada descripción

## Path Conventions

Monorepo web app existente: `backend/src/`, `backend/tests/`, `frontend/src/`, `frontend/tests/` — sin directorios nuevos de alto nivel.

---

## Phase 1: Setup

**Purpose**: Confirmar una base limpia antes de tocar código compartido.

- [X] T001 Correr `cd backend && npm test` y `cd frontend && npm test` para confirmar que ambas suites pasan en verde antes de empezar (sin esto, no hay forma de distinguir una regresión propia de un problema preexistente). — Baseline: backend 165/165, frontend 42/42.

---

## Phase 2: Foundational — ruteo de ubicación por choferId (bloqueante para US1 y US2)

**Purpose**: Reemplaza `fleteId` por `choferId` como clave de ruteo del reporte de ubicación en todo el pipeline (FR-001). Ninguna historia de usuario puede completarse sin esto: US1 necesita que el reporte no dependa de que `fleteId` haya resuelto, y US2 necesita que la identidad cacheable (`choferId`) sea la que realmente rutea la ubicación en el backend.

**⚠️ CRITICAL**: No empezar Phase 3/4 sin terminar esta fase.

- [X] T002 [P] Actualizar `mqttConfigPara` en backend/src/routes/recorrido.js: quitar el parámetro `fleteId`, requerir solo `choferId`, construir el topic vía `topicPara(choferId)` (reusa la función ya genérica de emqxProvisioning.js); agregar `choferId: recorrido.choferId ?? null` a la respuesta JSON del handler `GET /:token` — ver contrato en specs/012-ubicacion-por-chofer/contracts/chofer-recorrido-api.md
- [X] T003 [P] Reemplazar el mapa `recorridoPorFlete` por `recorridoPorChofer` en backend/src/state/integracionStore.js — indexar por `recorrido.choferId` (no `fleteId`) dentro de `indexarRecorrido`, solo cuando `estado === "activo"`
- [X] T004 Reemplazar `actualizarUbicacionPorFlete` por `actualizarUbicacionPorChofer(choferId, ubicacion)` en backend/src/state/integracionStore.js: agregar el mapa `ultimaUbicacionPorChofer` (nuevo), guardar siempre el snapshot ahí, y además actualizar `recorrido.ultimaUbicacion` si `recorridoPorChofer` resuelve un recorrido activo para ese choferId — depende de T003
- [X] T005 [P] Actualizar backend/src/services/mqttBridge.js: `parsearPayload` lee `choferId` en vez de `fleteId`; el handler `client.on("message", ...)` llama a `store.actualizarUbicacionPorChofer(evento.choferId, evento)` — ver specs/012-ubicacion-por-chofer/contracts/mqtt-topics.md para el payload actualizado
- [X] T006 [P] Actualizar frontend/src/services/ubicacionMqtt.js: renombrar el parámetro `fleteId` a `choferId` en `createPublisherUbicacionMqtt` (guard de no-op, cálculo de `topicPara`, y el campo `fleteId`→`choferId` del payload publicado)
- [X] T007 Actualizar frontend/src/services/ubicacionPeriodica.js: renombrar el segundo parámetro de `iniciarReportePeriodico` de `fleteId` a `choferId`, pasado tal cual a `createPublisherUbicacionMqtt` — depende de T006 (hecho junto con T010, misma función)
- [X] T008 [P] Actualizar backend/tests/unit/integracion-store-central.test.js: `seedActivo(store, { choferId: "CH-1" })` en el test de ubicación (líneas ~57-80) y cambiar las llamadas a `store.actualizarUbicacionPorChofer("CH-1", ...)` — depende de T003, T004. Se agregó además un test nuevo para la retención sin recorrido activo (FR-006).
- [X] T009 Revisar los tests de contrato de `GET /:token` (backend/tests/contract/) por si aseveran la forma exacta de la respuesta; agregar/ajustar la expectativa del nuevo campo `choferId` — depende de T002. Actualizados backend/tests/contract/get-recorrido.test.js (3 tests: topic por-choferId, mqtt no-null sin fleteId, mqtt null sin EMQX) y backend/tests/integration/mqtt-reconexion.test.js (no estaba en el plan original, lo reveló la corrida de tests).

**Checkpoint**: ✅ el pipeline de ubicación ya rutea por `choferId` de punta a punta (store, bridge, ruta HTTP, publisher del frontend); backend 167/167 tests en verde.

---

## Phase 3: User Story 1 - Ver al chofer moverse apenas abre la app (Priority: P1) 🎯 MVP

**Goal**: Al abrir la app, Central refleja la posición del chofer en segundos, sin depender del `setInterval` periódico (FR-002, FR-003).

**Independent Test**: Abrir la app del chofer con conectividad normal (recorrido con `choferId`/`mqtt` ya resolubles) y confirmar que Central recibe una posición actualizada sin esperar el intervalo completo.

### Implementation for User Story 1

- [X] T010 [US1] En frontend/src/services/ubicacionPeriodica.js, dentro de `iniciarReportePeriodico`, agregar una llamada inmediata (fire-and-forget, sin `await`) a `reportarUnaVez(token, publisher)` justo después de crear el `publisher` y antes de armar el `setInterval`
- [X] T011 [P] [US1] Actualizar frontend/tests/services/ubicacionPeriodica.test.js: en los tests "la función de limpieza detiene el temporizador" y "la función de limpieza deja de escuchar visibilitychange", agregar `await vi.advanceTimersByTimeAsync(0)` justo después de `iniciar(...)` y antes de llamar `detener()`, para dejar resolver el disparo inmediato antes de verificar que no hay más llamadas
- [X] T012 [P] [US1] Agregar un test nuevo en frontend/tests/services/ubicacionPeriodica.test.js: `iniciarReportePeriodico` dispara un reporte inmediato al arrancar, sin necesidad de avanzar el `setInterval` (usar `vi.advanceTimersByTimeAsync(0)` para resolver la promesa, no `advanceTimersByTimeAsync(intervaloMs)`)
- [X] T013 [US1] Correr `cd frontend && npm test` y validar manualmente el Escenario 1 de specs/012-ubicacion-por-chofer/quickstart.md (confirma SC-001) — frontend 43/43 en verde (era 42, +1 test nuevo). Validación manual: backend+frontend reales levantados localmente (puertos 3055/5183), recorrido seedeado con `choferId`, confirmado que `GET /:token` lo expone y la app carga sin errores; en ese chequeo se detectó y arregló una regresión real (ver nota de T016). El disparo del publish depende de GPS del navegador, no observable en este sandbox (sin sensor/permiso) — cubierto igual por los tests automatizados.

**Checkpoint**: ✅ US1 funciona de punta a punta para cualquier chofer con `choferId`/`mqtt` resolubles normalmente.

---

## Phase 4: User Story 2 - Seguir viendo al chofer aunque el backend haya perdido el viaje (Priority: P2)

**Goal**: El dispositivo sigue intentando reportar la posición del chofer usando una identidad/credencial cacheada localmente, aunque `GET /:token` devuelva 404 (FR-004, FR-005; FR-006 ya lo cubre el backend desde la Fase 2).

**Independent Test**: Cargar el recorrido con éxito una vez (puebla la caché), simular que el backend ya no reconoce el viaje (404), y confirmar que el dispositivo sigue intentando reportar la posición del chofer usando la identidad recordada.

### Implementation for User Story 2

- [X] T014 [P] [US2] Crear frontend/src/services/choferCache.js (`guardarCacheChofer({choferId, mqtt})` / `leerCacheChofer()`, clave `vickytruck.chofer.ultimoChofer.v1` en `localStorage`, sin scope por token) — mismo patrón que frontend/src/services/recorridoCache.js
- [X] T015 [US2] En frontend/src/main.jsx, dentro de `cargarRecorrido()`, tras un `setRecorrido(data)` exitoso: si `data.recorrido?.choferId && data.recorrido?.mqtt`, llamar `guardarCacheChofer({ choferId: data.recorrido.choferId, mqtt: data.recorrido.mqtt })` — depende de T014
- [X] T016 [US2] En frontend/src/main.jsx: derivar `choferId`/`mqttConfig` con fallback a `leerCacheChofer()` (`recorrido?.recorrido?.choferId ?? cacheChofer?.choferId ?? null`, ídem `mqttConfig`), y cambiar el `useEffect` que arranca `iniciarReportePeriodico` para depender de `choferId`/`mqttConfig` en vez de `token`/`fleteId` — depende de T007, T014, T015. Nota: se exportó `App` (antes solo montada en el `createRoot` final) y se guardó ese `createRoot` bajo un `if (elementoRaiz)` — necesario para poder testear la app completa (main.test.jsx) sin romper en jsdom por falta de `#root`; no cambia el comportamiento en producción (index.html siempre tiene `#root`).
  - **Regresión detectada y corregida durante la validación manual (T013)**: el gate quedó inicialmente en `if (!choferId || !mqttConfig) return undefined;` — eso rompía el comportamiento YA EXISTENTE antes de esta feature (el reporte debía arrancar aunque `mqttConfig` fuera `null`, cayendo al fallback REST; el gate original solo era `token`/`fleteId`). Corregido a `if (!token || !choferId) return undefined;`. Se agregó un test de regresión en main.test.jsx ("arranca el reporte de ubicación aunque mqtt sea null").
- [X] T017 [P] [US2] Test nuevo para frontend/src/services/choferCache.js: guardar y releer un valor, y comportamiento correcto si `localStorage` no está disponible (lanza) — no debe romper el flujo normal — frontend/tests/services/choferCache.test.js (5 tests)
- [X] T018 [US2] Test nuevo (frontend/tests/main.test.jsx, 3 tests): con la caché ya poblada por una carga previa exitosa, simular que `cargarRecorrido()` falla con un `ApiError` (404) y confirmar que el reporte de ubicación igual se arranca usando `choferId`/`mqttConfig` de la caché; más el caso "sin caché previa, no arranca nada" (edge case de spec.md) — depende de T016
- [X] T019 [US2] Validar manualmente el Escenario 2 de specs/012-ubicacion-por-chofer/quickstart.md — validado por cobertura automatizada equivalente (main.test.jsx, 4 tests) contra un backend Express real levantado localmente para confirmar `choferId` end-to-end (ver T009/T013 notas). El disparo real del publish (dependiente de GPS del navegador) no se pudo observar en vivo en este sandbox por no tener permiso/sensor de geolocalización disponible — limitación del entorno, no del código; la lógica está cubierta con mocks deterministas.

**Checkpoint**: ✅ US1 y US2 funcionan juntos — frontend 51/51 tests en verde, incluida cobertura automatizada end-to-end del escenario de resiliencia (antes solo validado manualmente en el plan).

---

## Phase 5: User Story 3 - Diagnosticar la salud del canal de ubicación sin salir del sistema (Priority: P3)

**Goal**: Exponer, vía un endpoint autenticado, contadores de mensajes MQTT recibidos/procesados/descartados y el estado de conexión (FR-007, FR-008).

**Independent Test**: Con tráfico MQTT normal, consultar el estado del canal y ver contadores que reflejan esa actividad; con el canal sin configurar, confirmar que la respuesta lo indica explícitamente.

### Implementation for User Story 3

- [X] T020 [P] [US3] En backend/src/services/mqttBridge.js: agregar un objeto `metricas` (`recibidos`, `procesados`, `duplicadosDescartados`, `invalidos`, `reconexiones`, `ultimoMensajeEn`, `conectado`) e incrementarlo en los puntos correspondientes de los handlers `message`/`connect`/`reconnect`; agregar listeners nuevos `close`/`offline` que pongan `conectado = false`; devolver `obtenerMetricas()` desde `startMqttBridgeWithConnector`/`startMqttBridge` (incluida la rama sin `MQTT_BROKER_URL`, devolviendo `{ habilitado: false }`) — ver specs/012-ubicacion-por-chofer/contracts/mqtt-estado-api.md
- [X] T021 [US3] En backend/src/server.js: capturar `const mqttBridge = startMqttBridge(integracionStore);`, agregar parámetro opcional `mqttBridge = null` a `createApp`, pasarlo a `createIntegracionRouter` — depende de T020
- [X] T022 [US3] En backend/src/routes/integracion.js: agregar parámetro `mqttBridge = null` a `createIntegracionRouter`; nueva ruta `GET /mqtt/estado` (detrás del `validarAuthIntegracion` ya aplicado a todo el router) devolviendo `mqttBridge?.obtenerMetricas?.() ?? { habilitado: false }` — depende de T021
- [X] T023 [P] [US3] Crear backend/tests/unit/mqttBridge.test.js (nuevo): usar `startMqttBridgeWithConnector(store, connectClient, logger)` con un `connectClient` fake; verificar que `recibidos`/`duplicadosDescartados`/`invalidos`/`procesados`/`conectado` se actualizan correctamente — depende de T020. 5 tests nuevos, todos en verde.
- [X] T024 [P] [US3] Agregar un test para `GET /api/integracion/mqtt/estado` en el archivo de tests de rutas de integración existente (mismo patrón de header de auth ya usado ahí) — depende de T022. Se agregaron 3 tests a backend/tests/contract/integracion-endpoints.test.js (401 sin credenciales, habilitado:false sin bridge, métricas reflejadas con un bridge fake); requirió extender backend/tests/helpers/testServer.js con un parámetro `mqttBridge` pass-through.
- [X] T025 [US3] Validar manualmente el Escenario 3 de specs/012-ubicacion-por-chofer/quickstart.md (confirma SC-003) — validado en vivo: backend real levantado localmente sin `MQTT_BROKER_URL` configurado, `curl -H "x-api-key: ..." http://localhost:3055/api/integracion/mqtt/estado` devolvió `{"habilitado":false}` como se esperaba.

**Checkpoint**: ✅ las tres historias de usuario funcionan de forma independiente — backend 175/175 tests en verde (era 167, +8 nuevos).

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T026 [P] Correr `cd backend && npm test` y `cd frontend && npm test` juntos una vez más para confirmar cero regresiones, en particular que el reporte de acciones del viaje (llegada/descarga) no cambió (SC-004) — backend 175/175, frontend 52/52.
- [X] T027 Correr el Escenario 4 completo de specs/012-ubicacion-por-chofer/quickstart.md y marcar specs/012-ubicacion-por-chofer/checklists/requirements.md como verificado post-implementación — hecho.
- [X] T028 [P] Revisar specs/012-ubicacion-por-chofer/contracts/*.md y data-model.md contra la implementación final; corregir cualquier detalle que haya divergido durante el desarrollo — revisado, sin divergencias: los 3 contratos y el data model coinciden exactamente con el código final (topic/payload por choferId, respuesta de GET /:token, forma de la respuesta de mqtt/estado).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — arranca de inmediato
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA a US1 y US2 (US3 es técnicamente independiente del ruteo por-choferId, pero comparte archivo con T005 en `mqttBridge.js`; se recomienda igual completar Foundational antes para evitar conflictos de merge)
- **User Story 1 (Phase 3)**: depende de Foundational (T007 en particular)
- **User Story 2 (Phase 4)**: depende de Foundational (T007) y de Phase 3 (T010, ya que envuelve la misma función `iniciarReportePeriodico`)
- **User Story 3 (Phase 5)**: depende solo de Setup; puede desarrollarse en paralelo a Phase 2-4 por un segundo desarrollador, aunque toca el mismo archivo que T005 (`mqttBridge.js`) — coordinar el merge
- **Polish (Phase 6)**: depende de que todas las historias deseadas estén completas

### User Story Dependencies

- **US1 (P1)**: depende de Foundational; no depende de US2 ni US3
- **US2 (P2)**: depende de Foundational y de la función modificada en US1 (T010); es la única dependencia entre historias, ya documentada en spec.md ("User Story 1 la establece primero")
- **US3 (P3)**: sin dependencia funcional de US1/US2 — comparte archivo (`mqttBridge.js`) pero no comparte lógica

### Parallel Opportunities

- T002, T003, T005, T006 (Foundational) tocan archivos distintos y pueden hacerse en paralelo; T004 depende de T003; T007 depende de T006
- T008 puede hacerse en paralelo con T005-T007 (test de un archivo distinto), pero conceptualmente valida T003/T004
- T011, T012 (US1, mismo archivo de test) — técnicamente el mismo archivo, coordinarlos como una sola pasada si un solo desarrollador los hace
- T014, T017 (US2) en paralelo con el resto de Foundational/US1 si hay dos desarrolladores, aunque T016 requiere que T007/T010 ya existan
- T020, T023 (US3) en paralelo entre sí; T024 depende de T022

---

## Parallel Example: Foundational

```bash
# Estas cuatro tocan archivos distintos y no dependen entre sí:
Task: "Actualizar mqttConfigPara en backend/src/routes/recorrido.js (T002)"
Task: "Reemplazar recorridoPorFlete por recorridoPorChofer en backend/src/state/integracionStore.js (T003)"
Task: "Actualizar parsearPayload y el handler message en backend/src/services/mqttBridge.js (T005)"
Task: "Renombrar fleteId a choferId en frontend/src/services/ubicacionMqtt.js (T006)"
```

---

## Implementation Strategy

### MVP First (User Story 1 sola)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (bloqueante)
3. Completar Phase 3: User Story 1
4. **Detenerse y validar**: correr el Escenario 1 de quickstart.md de forma independiente
5. Este es ya un MVP entregable: Central ve la posición actualizarse al abrir la app, para cualquier chofer con viaje normalmente resoluble

### Incremental Delivery

1. Setup + Foundational → base lista (ruteo por choferId funcionando)
2. + User Story 1 → validar → esto ya resuelve el síntoma original reportado por el usuario
3. + User Story 2 → validar → resiliencia ante el incidente operativo ya documentado (store vacío)
4. + User Story 3 → validar → observabilidad del canal sin depender de EMQX Cloud directamente
5. Cada historia suma valor sin romper las anteriores

### Parallel Team Strategy

Con dos desarrolladores:

1. Ambos completan Setup + Foundational juntos (bloqueante)
2. Una vez lista Foundational:
   - Desarrollador A: User Story 1 → luego User Story 2 (dependen entre sí)
   - Desarrollador B: User Story 3 (independiente, coordinar el merge de `mqttBridge.js`)
3. Integrar y correr Phase 6 (Polish) al final

---

## Notes

- [P] = archivos distintos, sin dependencias entre sí
- La etiqueta [Story] mapea cada tarea a su historia de usuario para trazabilidad
- Cada historia debe quedar completable y verificable de forma independiente
- Los tests actualizados no son un gate de TDD estricto, pero son parte de "terminado" — varios cambios rompen tests existentes por diseño (renombres de parámetros/funciones)
- Confirmar en cada checkpoint antes de avanzar a la siguiente fase
