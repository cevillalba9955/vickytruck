# Tasks: Arquitectura Cloud + Integracion Oracle/APEX + MQTT

**Input**: Design documents from `/specs/003-arquitectura-cloud-mqtt/`

**Prerequisites**: plan.md, spec.md, research.md, contracts/, quickstart.md

**Tests**: Se incluyen tareas de testing porque `plan.md` define estrategia explícita de pruebas para backend/frontend e integración MQTT.

**Organization**: Tareas agrupadas por historia de usuario para implementación incremental e independiente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede ejecutarse en paralelo (archivos distintos, sin dependencia pendiente)
- **[Story]**: etiqueta de historia (`[US1]`, `[US2]`, `[US3]`) en fases de historias
- Todas las tareas incluyen rutas de archivo concretas

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicialización y configuración base para cloud + MQTT

- [X] T001 Actualizar dependencias MQTT en `backend/package.json`, `central/package.json` y `frontend/package.json`
- [X] T002 [P] Documentar variables de entorno de integración/MQTT en `backend/.env.example` y `central/.env.example`
- [X] T003 [P] Verificar patrones de exclusión para artefactos cloud en `.gitignore` y `.dockerignore`
- [X] T004 Crear documento de convenciones de despliegue cloud en `docs/deploy-cloud.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Bases técnicas comunes para todas las historias

**⚠️ CRITICAL**: Ninguna historia debe cerrarse sin esta fase completa

- [X] T005 Crear store operacional compartido de integración en `backend/src/state/integracionStore.js`
- [X] T006 Implementar middleware de autenticación técnica para integración en `backend/src/middleware/integracionAuth.js`
- [X] T007 [P] Montar router `/api/integracion` en `backend/src/server.js` y `backend/src/routes/integracion.js`
- [X] T008 [P] Implementar servicio backend MQTT bridge en `backend/src/services/mqttBridge.js`
- [X] T009 Definir estrategia de deduplicación/idempotencia de eventos MQTT en `backend/src/services/mqttBridge.js`
- [X] T010 Cubrir FR-001 con tareas de despliegue cloud para `frontend/`, `central/`, `backend/` en `docs/deploy-cloud.md`

**Checkpoint**: Base lista para historias US1/US2/US3

---

## Phase 3: User Story 1 - Sincronizar recorridos Oracle/APEX -> Cloud (Priority: P1) 🎯 MVP

**Goal**: Permitir upsert de recorridos desde Oracle/APEX local sin conexión cloud->Oracle

**Independent Test**: Desde cliente técnico, invocar `POST /api/integracion/recorridos` y verificar upsert correcto en store cloud

### Tests for User Story 1

- [X] T011 [P] [US1] Agregar contract test de auth/validación de payload para `POST /api/integracion/recorridos` en `backend/tests/contract/integracion-endpoints.test.js`
- [X] T012 [P] [US1] Agregar integration test de reintento idempotente para upsert en `backend/tests/integration/integracion-sync-retry.test.js`

### Implementation for User Story 1

- [X] T013 [US1] Implementar handler `POST /api/integracion/recorridos` en `backend/src/routes/integracion.js`
- [X] T014 [US1] Implementar reglas de upsert de recorridos/puntos en `backend/src/state/integracionStore.js`
- [X] T015 [US1] Documentar contrato operativo Oracle/APEX -> backend en `specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md`

**Checkpoint**: US1 funcional y demostrable de forma independiente

---

## Phase 4: User Story 2 - Consultar estado operativo desde Oracle/APEX (Priority: P1)

**Goal**: Exponer estado de arribos/descargas para consulta técnica desde Oracle/APEX

**Independent Test**: Invocar `GET /api/integracion/estado` y validar estado por recorrido existente/no existente

### Tests for User Story 2

- [X] T016 [P] [US2] Agregar contract test de `GET /api/integracion/estado` (200/404) en `backend/tests/contract/integracion-endpoints.test.js`
- [X] T017 [P] [US2] Agregar test para decisión de paginación o no paginación en `backend/tests/contract/integracion-estado-paginacion.test.js`

### Implementation for User Story 2

- [X] T018 [US2] Implementar handler `GET /api/integracion/estado` en `backend/src/routes/integracion.js`
- [X] T019 [US2] Alinear contrato de consulta (incluyendo paginación) en `specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md`

**Checkpoint**: US2 funcional e independiente

---

## Phase 5: User Story 3 - Monitoreo en tiempo real por MQTT (Priority: P1)

**Goal**: Publicación de ubicación desde chofer, consumo directo en Central y persistencia en backend bridge

**Independent Test**: Publicar en topic de ubicación y verificar actualización en Central + persistencia backend

### Tests for User Story 3

- [X] T020 [P] [US3] Agregar test unitario de deduplicación por `eventId` en `backend/tests/unit/mqtt-bridge-dedupe.test.js`
- [X] T021 [P] [US3] Agregar integration test de reconexión y consumo MQTT en `backend/tests/integration/mqtt-reconexion.test.js`
- [X] T022 [P] [US3] Agregar test de adaptación de estado MQTT en Central en `central/tests/components/MonitorView.test.jsx`

### Implementation for User Story 3

- [X] T023 [US3] Implementar publisher MQTT de chofer en `frontend/src/services/ubicacionMqtt.js`
- [X] T024 [US3] Integrar publisher MQTT con reporte periódico en `frontend/src/services/ubicacionPeriodica.js`
- [X] T025 [US3] Implementar cliente MQTT de Central en `central/src/services/mqttClient.js`
- [X] T026 [US3] Integrar consumo MQTT + fallback polling en `central/src/main.jsx`
- [X] T027 [US3] Implementar persistencia de ubicación en bridge backend en `backend/src/services/mqttBridge.js`
- [X] T028 [US3] Definir políticas QoS/retained/session-expiry y ACL en `specs/003-arquitectura-cloud-mqtt/contracts/mqtt-topics.md`

**Checkpoint**: US3 funcional e independiente

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Seguridad, operación, observabilidad y validación de criterios de éxito

- [X] T029 [P] Configurar baseline de edge policies (TLS/WAF/rate limiting) en `docs/edge-policies.md`
- [X] T030 [P] Consolidar runbook EMQX en `docs/runbook-emqx.md`
- [X] T031 [P] Consolidar runbook Cloudflare en `docs/runbook-cloudflare.md`
- [X] T032 Definir tablero y métricas de observabilidad en `docs/observabilidad-mqtt-integracion.md`
- [ ] T033 Ejecutar validación SC-001 (sincronización >=99.5%) y registrar evidencia en `docs/validacion-sc-staging.md`
- [ ] T034 Ejecutar validación SC-002 (latencia MQTT p95 <=2s) y registrar evidencia en `docs/validacion-sc-staging.md`
- [ ] T035 Ejecutar validación SC-003 (consulta estado p95 <=1s) y registrar evidencia en `docs/validacion-sc-staging.md`
- [ ] T036 Ejecutar validación SC-004 (reconexión <=15s) y registrar evidencia en `docs/validacion-sc-staging.md`
- [ ] T037 Ejecutar validación SC-005 (no pérdida confirmada) y registrar evidencia en `docs/validacion-sc-staging.md`
- [X] T038 Actualizar consistencia de Constitution Check en `specs/003-arquitectura-cloud-mqtt/plan.md` respecto a Principio IV vigente

---

## Phase 7: Fixes de producción y credenciales MQTT por-flete (2026-08-06)

**Purpose**: la primera pasada de US3 dejó la ubicación en vivo sin
funcionar de punta a punta en producción — esta fase cubre el diagnóstico y
arreglo completo, verificado en vivo contra Fly.io + EMQX Cloud + un
celular real.

- [X] T039 Corregir `iniciarReportePeriodico` para publicar MQTT con
  `fleteId` en vez de `token` en `frontend/src/services/ubicacionPeriodica.js`
  y `frontend/src/main.jsx` — el bug raíz original de por qué Central nunca
  recibía ubicación.
- [X] T040 Exponer `fleteId` en `GET /api/recorridos/:token`
  (`backend/src/routes/recorrido.js`, `backend/src/state/integracionStore.js`).
- [X] T041 Persistir GPS de arribo/descarga (`arriboLat/Lon`,
  `descargaLat/Lon`) en `backend/src/state/integracionStore.js` y exponerlo
  vía `GET /api/integracion/estado` (`backend/src/routes/integracion.js`).
- [X] T042 Agregar `INTEGRACION_CLOUD_API.leer_estado_puntos` (pull
  Cloud→Oracle) en `backend/sql/integracion-cloud/integracion_cloud_api.pkb.sql`
  — **sin ejecutar todavía contra Oracle real** (ver Assumptions de spec.md).
- [X] T043 Stack de error completo (`UTL_CALL_STACK`) en
  `sincronizar_recorrido`/`leer_estado_puntos`, reemplazando `SQLERRM`
  (solo primera línea) — `integracion_cloud_api.pkb.sql`.
- [X] T044 Puerto de `emqxProvisioning.js` desde la rama vieja
  `003-mqtt-broker-fletes` (aprovisionamiento por-token sobre
  `vickytruck/fletes/{token}/#`) adaptado a por-`fleteId` sobre
  `chofer/{fleteId}/ubicacion` — `backend/src/mqtt/emqxProvisioning.js`.
- [X] T045 Disparar aprovisionamiento en `POST /api/integracion/recorridos`
  (fire-and-forget) — `backend/src/routes/integracion.js`.
- [X] T046 Exponer credencial aprovisionada en `GET /api/recorridos/:token`
  → `recorrido.mqtt` — `backend/src/routes/recorrido.js`.
- [X] T047 `frontend/src/services/ubicacionMqtt.js` deja de leer
  `VITE_MQTT_*` de build; recibe `{url, username, password}` por parámetro.
- [X] T048 Script de setup administrativo `npm run emqx:setup`
  (`backend/scripts/emqx-setup.js`) — ACL de subscribe del backend sobre
  `chofer/+/ubicacion` (confirmado: ya existía, sin cambios necesarios).
- [X] T049 Fix iOS: reporte inmediato en `visibilitychange` además del
  timer — `frontend/src/services/ubicacionPeriodica.js` (Safari/WebKit
  pausa `setInterval` en pestañas de fondo, reproducido en vivo).
- [X] T050 Verificación end-to-end en producción: recorrido real (Fly.io +
  EMQX Cloud + celular), confirmado con `GET /clients?username=chofer-{id}`
  de la Admin API de EMQX Cloud (cliente conectado y publicando) y
  `GET /api/central/recorridos/activos` (`ultimaUbicacion` con `reciente: true`).
- [X] T051 Documentación: `spec.md`, `research.md`, `data-model.md` (nuevo),
  `plan.md`, `contracts/mqtt-topics.md` actualizados para reflejar lo
  implementado; `docs/arquitectura-cloud.puml` actualizado.

**Pendiente de esta fase** (no bloqueante, ver spec.md Assumptions):
- Ejecutar `leer_estado_puntos` contra Oracle real al menos una vez.
- Revisar el caveat de timezone (`SYSTIMESTAMP` local vs. UTC del cloud).
- Conectar `revocarCredencial(fleteId)` a algún trigger de "recorrido
  finalizado" — hoy no se llama desde ningún lado.
- Configurar `VITE_MQTT_*` en `central/.env.production` si se decide activar
  el consumo directo de Central (hoy dormant).

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1: puede iniciar de inmediato
- Phase 2: depende de Phase 1
- Phase 3/4/5: dependen de Phase 2
- Phase 6: depende de completar historias priorizadas

### User Story Dependencies

- US1 (P1): inicia tras Foundational, habilita carga operativa base
- US2 (P1): inicia tras Foundational, independiente de US1 en contrato HTTP
- US3 (P1): inicia tras Foundational, independiente en canal MQTT (usa store/bridge compartidos)

### Within Each User Story

- Tests primero
- Implementación después
- Validación independiente al cierre de cada historia

## Parallel Opportunities

- Phase 1: T002, T003 pueden ejecutarse en paralelo
- Phase 2: T007 y T008 en paralelo
- US1: T011 y T012 en paralelo
- US2: T016 y T017 en paralelo
- US3: T020, T021 y T022 en paralelo; luego T023/T025 en paralelo
- Phase 6: T029, T030, T031 en paralelo

## Parallel Example: User Story 3

```bash
# Tests en paralelo
T020 backend/tests/unit/mqtt-bridge-dedupe.test.js
T021 backend/tests/integration/mqtt-reconexion.test.js
T022 central/tests/components/MonitorView.test.jsx

# Implementación en paralelo
T023 frontend/src/services/ubicacionMqtt.js
T025 central/src/services/mqttClient.js
```

## Implementation Strategy

### MVP First (US1)

1. Completar Phase 1
2. Completar Phase 2
3. Completar Phase 3 (US1)
4. Validar US1 de forma independiente

### Incremental Delivery

1. US1 (sync Oracle/APEX -> cloud)
2. US2 (consulta de estado)
3. US3 (tiempo real MQTT)
4. Polish + validación SC por staging

### Format Validation

Todas las tareas siguen formato checklist estricto: `- [ ] T### [P?] [US?] Descripción con ruta de archivo`.