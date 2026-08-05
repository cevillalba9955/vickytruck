# Tasks: Arquitectura Cloud + Integracion Oracle/APEX + MQTT

**Input**: `specs/003-arquitectura-cloud-mqtt/`

## Phase 1: Setup

- [ ] T001 Crear router de integración en backend en `backend/src/routes/integracion.js`.
- [ ] T002 Crear servicio de bridge MQTT en `backend/src/services/mqttBridge.js`.
- [ ] T003 Crear cliente MQTT para central en `central/src/services/mqttClient.js`.
- [ ] T004 Documentar variables de entorno MQTT/Integración en `backend/.env.example` y `central/.env.example`.

## Phase 2: Integración Oracle/APEX -> Cloud

- [ ] T005 [US1] Implementar `POST /api/integracion/recorridos` en `backend/src/routes/integracion.js`.
- [ ] T006 [US2] Implementar `GET /api/integracion/estado` en `backend/src/routes/integracion.js`.
- [ ] T007 [US1] Agregar autenticación técnica (API key/JWT service account) en middleware backend.
- [ ] T008 [US1] Crear tests de contrato para integración en `backend/tests/contract/`.

## Phase 3: MQTT Tiempo Real

- [ ] T009 [US3] Publicar ubicación de chofer por MQTT desde frontend chofer (`frontend/src/services/ubicacionMqtt.js`).
- [ ] T010 [US3] Suscripción directa de Central a MQTT y adaptación de estado de UI.
- [ ] T011 [US3] Suscripción backend bridge para persistencia de ubicación.
- [ ] T012 [US3] Definir QoS/retained/session-expiry por tipo de tópico.

## Phase 4: Resiliencia y reconciliación

- [ ] T013 Implementar fallback de reconciliación por polling en Central al perder MQTT.
- [ ] T014 Implementar deduplicación/idempotencia en backend para eventos MQTT.
- [ ] T015 Agregar tests de reconexión y duplicados (integración).

## Phase 5: Seguridad, operación y proveedores

- [ ] T016 Configurar edge policies (TLS, WAF, rate limiting) para endpoints de integración.
- [ ] T017 Generar runbook operativo para EMQX (topics, ACL, rotación de credenciales).
- [ ] T018 Generar runbook operativo para Cloudflare (WAF rules, access, alerts).
- [ ] T019 Definir tablero de observabilidad (latencia E2E MQTT, tasa de error integración).

## Checkpoint

- [ ] T020 Validar criterios SC-001 a SC-005 de `spec.md` en ambiente de staging.