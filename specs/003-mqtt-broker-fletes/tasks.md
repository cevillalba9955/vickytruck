---

description: "Task list template for feature implementation"
---

# Tasks: Transporte de Ubicación y Acciones vía Bróker MQTT en la Nube

**Input**: Design documents from `/specs/003-mqtt-broker-fletes/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Se incluyen tareas de test (unit + contrato + integración/servicios), siguiendo
el mismo criterio que 001/002: plan.md define explícitamente una estrategia de testing
(`node --test`, `vitest` + Testing Library) como parte del stack de esta feature.

**Organization**: Las tareas están agrupadas por historia de usuario (spec.md) para
permitir implementación y prueba independiente de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1, US2, US3)
- Se incluyen rutas de archivo exactas en cada descripción

## Path Conventions

Según plan.md (reutiliza `backend/`, `frontend/`, `central/` ya existentes de 001/002):
`backend/src/`, `backend/tests/`, `frontend/src/`, `frontend/tests/`, `central/src/`,
`central/tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Agregar la dependencia MQTT a los tres paquetes y documentar la
configuración nueva de EMQX Cloud

- [X] T001 [P] Agregar dependencia `mqtt` (mqtt.js) a `backend/package.json`
- [X] T002 [P] Agregar dependencia `mqtt` (mqtt.js) a `frontend/package.json`
- [X] T003 [P] Agregar dependencia `mqtt` (mqtt.js) a `central/package.json`
- [X] T004 [P] Crear estructura de directorios `backend/src/mqtt/` (para `client.js`,
      `subscriber.js`, `emqxProvisioning.js`) y `backend/scripts/` (ya existe, se
      reutiliza) per plan.md
- [X] T005 [P] Documentar en `backend/.env.example` las variables nuevas: host/puerto
      `mqtts://` del bróker (`EMQX_MQTTS_HOST`, `EMQX_MQTTS_PORT`), host `wss://` público
      (`EMQX_WSS_URL`, usado al construir la respuesta para frontend/central), credencial
      de servicio del backend (`EMQX_BACKEND_USERNAME`, `EMQX_BACKEND_PASSWORD`),
      credencial de servicio de Central (`EMQX_CENTRAL_USERNAME`,
      `EMQX_CENTRAL_PASSWORD`), y credenciales de administración de la API de EMQX Cloud
      (`EMQX_CLOUD_API_KEY`, `EMQX_CLOUD_API_SECRET`, `EMQX_CLOUD_DEPLOYMENT_ID`) usadas
      por `emqxProvisioning.js`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestructura MQTT común que las 3 historias de usuario necesitan antes de
poder implementarse

**⚠️ CRITICAL**: Ninguna historia de usuario puede empezar hasta completar esta fase

- [X] T006 Implementar `backend/src/mqtt/client.js`: conexión saliente `mqtts://` hacia
      EMQX Cloud con la credencial de servicio del backend, reconexión automática y
      sesión persistente (`clean: false`) para no perder mensajes QoS1 (FR-011) (depende
      de T001, T005)
- [X] T007 [P] Implementar `backend/src/mqtt/emqxProvisioning.js`:
      `provisionarCredencial(token)` (crea usuario MQTT `username=token` con contraseña
      generada vía la API de administración de EMQX Cloud) y `revocarCredencial(token)`
      (la elimina); usa `fetch` nativo, sin dependencia HTTP nueva (depende de T005)
- [X] T008 Conectar el arranque (y cierre ordenado) de `mqtt/client.js` a
      `backend/src/server.js` (depende de T006)
- [X] T009 [P] Implementar `frontend/src/services/mqttClient.js`: `connect(config)` (wss,
      credenciales por token) y `publish(topic, payload, opciones)` sobre `mqtt.js`
      (depende de T002)
- [X] T010 [P] Implementar `central/src/services/mqttClient.js`: `connect(config)` (wss,
      credencial de servicio) y `subscribe(topicFilter, onMessage)` sobre `mqtt.js`
      (depende de T003)
- [X] T011 [P] Unit test de `emqxProvisioning.js` contra un fake de la API de
      administración de EMQX Cloud (crea/revoca credencial, no lanza si ya no existe) en
      `backend/tests/unit/emqxProvisioning.test.js` (depende de T007)

**Checkpoint**: Infraestructura MQTT lista (conexión del backend, helpers de cliente en
frontend/central, aprovisionamiento testeado) — las historias de usuario pueden
implementarse

---

## Phase 3: User Story 1 - Ubicación en tránsito sin exponer direcciones de red (Priority: P1) 🎯 MVP

**Goal**: La ubicación instantánea de un flete con recorrido activo llega a Central por el
bróker MQTT, sin que backend, Central o el dispositivo del chofer necesiten exponer IP
pública ni puertos entrantes para este flujo.

**Independent Test**: Ver Escenario de validación 1 de quickstart.md — simular movimiento
del dispositivo de un flete de prueba y verificar que Central refleja la ubicación
actualizada, mientras se confirma que no hay puertos entrantes abiertos en el backend para
este flujo.

### Tests for User Story 1

- [X] T012 [P] [US1] Contract test: `GET /api/recorridos/:token` incluye el bloque
      `recorrido.mqtt` (`url`, `username`, `password`, `ubicacionTopic`, `eventosTopic`,
      `intervaloUbicacionMs`) en `backend/tests/contract/get-recorrido.test.js` (extiende
      el test ya existente de 001)
- [X] T013 [P] [US1] Integration test: un mensaje recibido en
      `vickytruck/fletes/{token}/ubicacion` (cliente MQTT fake) resuelve el token y
      actualiza `ubicacionEnMemoria.js` con `{lat, lon, en}`; un mensaje sin `lat`/`lon` o
      con token inválido se descarta sin interrumpir la suscripción (FR-013) en
      `backend/tests/integration/mqtt-ubicacion.test.js`

### Implementation for User Story 1

- [X] T014 [US1] **Reescrito durante implementación**: en vez de provisionar en
      `asignar`/`reasignar`, `emqxProvisioning.provisionarCredencial(token)` se llama de
      forma perezosa (upsert idempotente) dentro de `GET /:token` (T015) — evita mantener
      un caché local de contraseñas que podría desincronizarse de EMQX Cloud tras un
      reinicio del backend (ver comentario en `backend/src/mqtt/emqxProvisioning.js`).
      `centralRepository.js` sí quedó con la contraparte de revocación (ver T034).
- [X] T015 [US1] Extender `GET /api/recorridos/:token` para incluir `recorrido.mqtt`
      (`url`, `username=token`, `password` provisionada, `ubicacionTopic`,
      `eventosTopic`, `intervaloUbicacionMs`) en `backend/src/routes/recorrido.js`;
      retirar el campo plano `intervaloUbicacionMs` que queda reemplazado (depende de
      T014)
- [X] T016 [US1] Retirar el handler `POST /:token/ubicacion` de
      `backend/src/routes/recorrido.js` (FR-001) (depende de T015; comparte archivo) —
      incluyó retirar `backend/tests/contract/post-ubicacion.test.js` (adelantado desde
      Phase 6/T036 para no dejar el suite roto)
- [X] T017 [US1] Implementar `backend/src/mqtt/subscriber.js`: suscripción a
      `vickytruck/fletes/+/ubicacion` (QoS 0), resolver token → recorrido
      (`repository.obtenerPorToken`, ya existe) y llamar `ubicacionStore.registrar`
      (depende de T006, T008)
- [X] T018 [US1] Conectar `mqtt/subscriber.js` al arranque del servidor en
      `backend/src/server.js` (depende de T017; comparte archivo con T008)
- [X] T019 [US1] Adaptar `frontend/src/services/ubicacionPeriodica.js` para publicar vía
      `mqttClient.publish(ubicacionTopic, {lat, lon, en}, {qos: 0, retain: true})` en vez
      de `POST /:token/ubicacion` (depende de T009)
- [X] T020 [US1] Inicializar `mqttClient` en `frontend/src/main.jsx` con la configuración
      `recorrido.mqtt` recibida de `GET /:token`, antes de arrancar
      `iniciarReportePeriodico` (depende de T009, T019)
- [X] T021 [US1] Implementar `GET /api/central/mqtt-config` en
      `backend/src/routes/central.js`, exponiendo la credencial de servicio de Central
      desde variables de entorno (contracts/mqtt-canal.md) (depende de T005)
- [X] T022 [US1] Inicializar `central/src/services/mqttClient.js` al cargar `central/`
      usando `GET /api/central/mqtt-config`, suscribiendo a
      `vickytruck/fletes/+/ubicacion` y actualizando el estado de ubicación en vivo del
      panel (depende de T010, T021). También se agregó `token` a la respuesta de
      `GET /api/central/recorridos/activos` (`centralRepository.listarActivos`), necesario
      para que Central correlacione cada mensaje MQTT con su recorrido.
- [X] T023 [P] [US1] Service test: `frontend/src/services/mqttClient.js` conecta, publica
      con `retain` y reintenta reconexión, con `mqtt.js` mockeado, en
      `frontend/tests/services/mqttClient.test.js`
- [X] T024 [P] [US1] Service test: `central/src/services/mqttClient.js` se suscribe y
      despacha mensajes de ubicación entrantes, con `mqtt.js` mockeado, en
      `central/tests/services/mqttClient.test.js`

**Checkpoint**: User Story 1 funcional y verificable de forma independiente

---

## Phase 4: User Story 2 - Registro confiable de arribo y descarga completa (Priority: P2)

**Goal**: Los eventos "Llegué" y "Descarga completa" llegan al backend por el bróker MQTT
de forma confiable, incluso con conectividad intermitente del dispositivo del chofer.

**Independent Test**: Ver Escenario de validación 2 de quickstart.md — marcar "Llegué" y
"Descarga completa" con conectividad inestable simulada y verificar que ambos eventos
terminan siendo recibidos por el backend sin intervención manual.

### Tests for User Story 2

- [X] T025 [P] [US2] Integration test: un mensaje en
      `vickytruck/fletes/{token}/eventos` con `tipo: "arribo"`/`"descarga"` dispara
      `repository.marcarArribo`/`marcarDescarga` (repositorio fake) y un `puntoId`
      inexistente o una transición inválida se descartan sin interrumpir la suscripción
      (FR-013) en `backend/tests/integration/mqtt-eventos.test.js`. También se migraron a
      MQTT (en vez de POST directo) las integration tests de 001
      `marcar-arribo.test.js`/`completar-recorrido.test.js`, que ejercitaban las rutas
      retiradas en T028.
- [X] T026 [P] [US2] Service test: la cola de reintento offline del frontend encola una
      acción de arribo/descarga sin conectividad y la publica automáticamente al
      reconectar, sin duplicar (FR-010). No existía un test dedicado en 001 para extender;
      se creó `frontend/tests/services/offlineQueue.test.js` (mecánica de la cola en sí,
      agnóstica de transporte) + `frontend/tests/services/api.test.js` (integración
      específica con `mqttClient.publicar`).

### Implementation for User Story 2

- [X] T027 [US2] Extender `backend/src/mqtt/subscriber.js`: suscripción a
      `vickytruck/fletes/+/eventos` (QoS 1, sesión persistente), resolver token →
      recorrido y llamar `repository.marcarArribo`/`marcarDescarga` según `tipo` (depende
      de T017; comparte archivo)
- [X] T028 [US2] Retirar los handlers `POST /:token/puntos/:puntoId/arribo` y
      `.../descarga` de `backend/src/routes/recorrido.js` (FR-002) (depende de T016;
      comparte archivo) — incluyó retirar `post-arribo.test.js`/`post-descarga.test.js`
      (adelantado desde Phase 6 para no dejar el suite roto)
- [X] T029 [US2] Adaptar `frontend/src/services/api.js` para publicar la acción vía
      `mqttClient.publicar(eventosTopic, {tipo, puntoId, lat, lon}, {qos: 1})` en vez de
      `POST` (depende de T009, T020). `DeliveryPointCard.jsx` no necesitó cambios: es
      puramente presentacional, solo dispara los callbacks que ya venían de `main.jsx`.
- [X] T030 [US2] Adaptar `frontend/src/services/api.js` (`iniciarSincronizacionOffline`)
      para reintentar publicaciones MQTT (en vez de `POST` HTTP) al recuperar
      conectividad, sin duplicar ni perder acciones (FR-010); `offlineQueue.js` en sí no
      cambió (ya era agnóstico de transporte) (depende de T029)

**Checkpoint**: User Story 1 y 2 funcionan de forma independiente

---

## Phase 5: User Story 3 - Aislamiento entre fletes y lectura exclusiva de backend y Central (Priority: P3)

**Goal**: Ningún flete puede leer el canal de otro; ningún componente distinto de backend
y Central puede suscribirse; el acceso de un flete se revoca cuando su recorrido finaliza
o se reasigna.

**Independent Test**: Ver Escenarios de validación 3 y 4 de quickstart.md — intentar leer
el canal de un flete con las credenciales de otro (rechazado), y confirmar que las
credenciales se revocan al finalizar/reasignar un recorrido.

### Tests for User Story 3

- [X] T031 [P] [US3] Extender el unit test de `emqxProvisioning.js`:
      `revocarCredencial` no lanza si la credencial ya no existe (idempotente) en
      `backend/tests/unit/emqxProvisioning.test.js` — ya cubierto desde la Fase 2
      (T007/T011); se agregó además `backend/tests/unit/emqx-setup.test.js` para el
      script de T033.
- [X] T032 [P] [US3] Integration test: al reasignar un recorrido, la credencial MQTT del
      token anterior se revoca, en `backend/tests/integration/reasignar-credencial-mqtt.test.js`.
      **Ajuste sobre el enunciado original**: no se verifica "se provisiona una nueva para
      el nuevo token" porque, tras el rediseño de T014 (provisioning perezoso e idempotente
      en `GET /:token`), no hace falta provisionar nada en el momento de reasignar — el
      nuevo flete la obtiene la primera vez que carga su enlace. Se agregó un segundo test:
      la primera asignación (sin token previo) no intenta revocar nada.

### Implementation for User Story 3

- [X] T033 [P] [US3] Script idempotente que crea la regla de ACL global (`PUBLISH` en
      `vickytruck/fletes/${username}/#` vía placeholder; `SUBSCRIBE` en
      `vickytruck/fletes/+/#` para las credenciales de servicio de backend/Central)
      contra la API de administración de EMQX Cloud, en `backend/scripts/emqx-setup.js`
      (setup de infraestructura, ejecución manual — mismo patrón que
      `backend/scripts/smoke-oracle-connection.js`; agregado como script `npm run
      emqx:setup`)
- [X] T034 [US3] Integrar `emqxProvisioning.revocarCredencial(tokenAnterior)` en el flujo
      de reasignación (`centralRepository.reasignar`) en
      `backend/src/db/centralRepository.js` (depende de T007). Se agregó `leerTokenActual`
      para conocer el token vigente antes de reasignar (necesario porque el PL/SQL de 002
      solo informa el token *nuevo*, no el anterior).
- [X] T035 [US3] Detectar en `backend/src/mqtt/subscriber.js` cuando un evento de
      descarga deja el recorrido completamente completado (`progreso.pendientes === 0 &&
      progreso.arribados === 0`) y llamar `emqxProvisioning.revocarCredencial(token)` en
      ese caso (FR-008) (depende de T027)

**Checkpoint**: Las 3 historias de usuario funcionan de forma independiente — ciclo
completo de la feature operativo

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Retirar cobertura de test obsoleta y validar de punta a punta

- [X] T036 [P] Actualizar/retirar los contract tests de 001 para los endpoints
      `POST .../ubicacion`, `.../arribo` y `.../descarga` (ya no existen) en
      `backend/tests/contract/post-*.test.js` — hecho de forma incremental en T016/T028
      (adelantado para no dejar el suite roto en checkpoints intermedios), incluyendo la
      migración de las integration tests de 001 que ejercitaban esas rutas.
- [X] T037 [P] Documentar en `backend/README.md` (nuevo) el flujo operativo de alta de
      EMQX Cloud (tier Serverless, ejecutar `npm run emqx:setup` una vez, variables de
      entorno nuevas de `.env.example`)
- [X] T038 Validación de punta a punta. **Alcance real vs. lo planeado**: los Escenarios 1
      y 2 de quickstart.md (ubicación y eventos vía MQTT) se verificaron con un bróker MQTT
      real (`aedes`, local, protocolo MQTT genuino — no el fake `EventEmitter` de los tests
      automatizados) publicando desde un cliente `mqtt.js` real hacia
      `backend/src/mqtt/subscriber.js` real: ambos flujos funcionaron correctamente de
      punta a punta. Los Escenarios 3 y 4 (aislamiento por ACL entre fletes, revocación
      verificada contra el dashboard de EMQX Cloud) **no se pudieron ejecutar** en este
      entorno: dependen de una instancia real de EMQX Cloud con `npm run emqx:setup` ya
      aplicado, que no está disponible acá — la lógica de revocación en sí (qué token se
      revoca y cuándo) sí quedó cubierta por tests automatizados (T032, T035); lo que falta
      validar manualmente es que EMQX Cloud efectivamente *aplica* esa revocación/ACL como
      se espera. Queda pendiente para cuando exista un deployment real.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato
- **Foundational (Phase 2)**: depende de Setup — bloquea todas las historias de usuario
- **User Stories (Phase 3-5)**: todas dependen de completar Foundational
  - Se recomienda orden de prioridad (US1 → US2 → US3) porque US2 y US3 extienden
    `mqtt/subscriber.js` y `centralRepository.js` que US1 ya empieza a modificar
- **Polish (Phase 6)**: depende de que las historias que se quieran entregar estén
  completas

### User Story Dependencies

- **US1 (P1)**: puede empezar tras Foundational — sin dependencia de otras historias
- **US2 (P2)**: puede empezar tras Foundational — comparte archivos
  (`mqtt/subscriber.js`, `recorrido.js`) con US1 pero es independientemente testeable
  (agrega su propio tópico/handler)
- **US3 (P3)**: puede empezar tras Foundational — depende de que exista el flujo de
  aprovisionamiento por token (T014, de US1) para poder ejercer su revocación; es
  independientemente testeable (aislamiento y revocación son verificables sin que US2
  esté completa, salvo T035 que depende del handler de eventos de US2)

### Parallel Opportunities

- Todas las tareas [P] de Setup pueden correr en paralelo
- Todas las tareas [P] de Foundational pueden correr en paralelo
- Los tests [P] de cada historia pueden correr en paralelo entre sí
- `frontend/src/services/mqttClient.js` (T009) y `central/src/services/mqttClient.js`
  (T010) pueden implementarse en paralelo, son paquetes distintos

---

## Parallel Example: User Story 1

```bash
# Tests de la Historia 1 en paralelo:
Task: "Contract test GET /api/recorridos/:token con bloque mqtt en backend/tests/contract/get-recorrido.test.js"
Task: "Integration test mqtt-ubicacion en backend/tests/integration/mqtt-ubicacion.test.js"

# Servicios de cliente MQTT en paralelo (paquetes distintos):
Task: "mqttClient.js en frontend/src/services/mqttClient.js"
Task: "mqttClient.js en central/src/services/mqttClient.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 únicamente)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (bloquea todo lo demás)
3. Completar Phase 3: US1 (ubicación sin exponer IP) → validar de forma independiente
   (Escenario 1 de quickstart.md)
4. Desplegar/demostrar — ya cumple el objetivo principal declarado en spec.md

### Incremental Delivery

1. Setup + Foundational → base MQTT lista
2. US1 → probar de forma independiente → demo (ubicación en vivo sin exponer IP, MVP)
3. US2 → probar → demo (arribo/descarga confiables vía el mismo canal)
4. US3 → probar → demo (aislamiento y revocación verificados)
5. Phase 6 (Polish) → validación manual completa vía quickstart.md

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes
- T015/T016 (US1) y T027/T028 (US2) comparten `backend/src/routes/recorrido.js`: no son
  [P] entre sí, deben implementarse en secuencia dentro de ese archivo
- T017 (US1) y T027 (US2) comparten `backend/src/mqtt/subscriber.js`: no son [P] entre sí
- T014 (US1) y T034 (US3) comparten `backend/src/db/centralRepository.js`: no son [P]
  entre sí
- Verificar que los tests fallan antes de implementar (si se sigue TDD estricto)
- Cada historia de usuario debe quedar completable y testeable de forma independiente
- Detenerse en cada checkpoint para validar la historia antes de continuar
