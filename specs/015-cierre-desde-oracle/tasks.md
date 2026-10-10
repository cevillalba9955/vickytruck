# Tasks: Cierre de recorrido desde Oracle, ubicación por chofer y broker apagado

**Input**: [spec.md](./spec.md)

**Nota**: feature implementada directamente en la conversación en la que se
detectó el incidente (ver spec.md, Notas de proceso) — este archivo
documenta retroactivamente las tareas ya completadas.

## Fase 1: Ubicación por chofer (US1)

- [X] T001 [US1] Diagnóstico en producción vía `GET /api/central/recorridos/activos` e `/historial`: chofer 2 con recorridos 3834 (activo, sin FINALIZAR) y 3835 (finalizado); el índice `recorridoPorChofer` apuntaba a 3835
- [X] T002 [US1] Tests de regresión en `backend/tests/unit/integracion-store-central.test.js`: ubicación llega al activo tras finalizar el otro recorrido del chofer; con dos activos, se actualizan ambos (fallaban antes del cambio)
- [X] T003 [US1] En `backend/src/state/integracionStore.js`, quitar el índice `recorridoPorChofer`; `actualizarUbicacionPorChofer` recorre los recorridos `activo` del `choferId` y actualiza `ultimaUbicacion` en todos

## Fase 2: Cierre desde Oracle (US2)

- [X] T004 [US2] En `integracionStore.js`, nuevo `finalizarDesdeOracle(recorridoId)`: idempotente, `cierreOrigen: "oracle"`, sin GPS, `viajeEstado: "detenido"`, `puntoActivoId`/`ultimaOperacion` en null; `finalizarRecorrido` (chofer) registra `cierreOrigen: "chofer"`
- [X] T005 [US2] Guarda `recorridoCerrado()` en `iniciarViaje`, `moverPrimero` y `transicionarPunto` (arribo/descarga): 409 sobre recorrido finalizado
- [X] T006 [US2] `cierreOrigen` preservado en `upsertRecorridos` y expuesto en `listarHistorial`/`obtenerDetalle` (store), `GET /api/central/recorridos/historial` (`routes/central.js`) y `GET /api/integracion/estado` (`routes/integracion.js`)
- [X] T007 [US2] Ruta `POST /api/integracion/recorridos/:id/finalizar` en `backend/src/routes/integracion.js` (auth de integración ya aplicada al router; 404 `recorrido_no_encontrado`)
- [X] T008 [P] [US2] 5 tests de contrato en `backend/tests/contract/integracion-endpoints.test.js`: 401, 404, cierre con pendientes → historial + `/estado`, idempotencia, bloqueo del chofer y no-reactivación por re-push
- [X] T009 [US2] Procedure `finalizar_recorrido` en `backend/sql/integracion-cloud/integracion_cloud_api.pks.sql`/`.pkb.sql`: POST vía relay nginx, `NOT_FOUND` ante 404, encadena `leer_estado_puntos`
- [X] T010 [US2] Corrección del usuario contra Oracle real: `leer_estado_puntos` escribe el inicio/cierre del recorrido en `T_FLT_VIAJES` (no `T_RECORRIDOS`) y deja de escribir `INICIO_*` por punto en `T_PUNTOS_ENTREGA`; se quitó un `UPDATE` redundante dentro del loop que además rompía el conteo `puntos_actualizados`
- [X] T011 [US2] Probado contra el servidor Oracle de producción (2026-10-09)

## Fase 3: Broker apagado en modo directo (US3)

- [X] T012 [US3] `POST /api/integracion/recorridos` solo llama a `provisionarCredencialChofer` si `canalUbicacionPreferido() === "broker"`; test existente pasado a modo broker + test nuevo para modo directo
- [X] T013 [US3] `central/.env.production`: `VITE_MQTT_*` vacías (Central en estado `disabled`, polling 5 s); bundle verificado sin la credencial `vickytruck-central`
- [X] T014 [US3] Deploy de Central y de la app del chofer en Cloudflare Workers (2026-10-09)

## Fase 4: Documentación y verificación

- [X] T015 [P] Documentar el endpoint 10 en `docs/endpoints.md` y `finalizar_recorrido` en `backend/sql/integracion-cloud/README.md` (tablas reales `T_FLT_VIAJES`/`T_PUNTOS_ENTREGA`)
- [X] T016 [P] Actualizar los 5 diagramas `docs/*.puml` (cierre desde Oracle, canal directo, broker opcional) y regenerar los PNG versionados
- [X] T017 Suite del backend como guardia de no-regresión: 199/199

## Pendientes operativos (fuera del repositorio)

- [ ] T018 Borrar o rotar el usuario `vickytruck-central` en EMQX Cloud (su password sigue en el historial de git)
- [ ] T019 Desconfigurar el secret `MQTT_BROKER_URL` en Fly y confirmar `GET /api/integracion/mqtt/estado` → `habilitado: false`, `canalPreferido: "directo"`

## Notas

- No se generaron `plan.md`/`research.md`: las decisiones (Central de solo
  lectura, cierre desde Oracle sin exigir entregas completas, ubicación a
  todos los activos del chofer) se tomaron y aplicaron en la misma
  conversación; quedan registradas en spec.md, Notas de proceso.
- Fuera de alcance: ajustar el mensaje de la app del chofer cuando Oracle
  cierra con entregas pendientes (usar `cierreOrigen`).
