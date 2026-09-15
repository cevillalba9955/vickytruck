# Quickstart: validar reporte de ubicación directo al backend (broker opcional)

## Prerrequisitos

- Backend corriendo localmente (`cd backend && npm run start`, o vía
  `preview_start`). No hace falta `.env` con `EMQX_WSS_URL`/`MQTT_BROKER_URL`
  para validar el modo por defecto (directo) — solo para el Escenario 2
  (modo broker).
- Frontend del chofer corriendo localmente (`cd frontend && npm run dev`) —
  sin cambios de código, se usa tal cual.
- Un recorrido de prueba cargado en el store con `choferId` seteado (`POST
  /api/integracion/recorridos`, o `npm run dev:seed` si el seed ya lo
  incluye).
- Tests automatizados: `cd backend && npm test`.

## Escenario 1 — Historia de Usuario 1 (directo por defecto, Central lo ve)

1. Arrancar el backend **sin** setear `UBICACION_CANAL_PREFERIDO` (o con
   cualquier valor distinto de `broker`) y sin `EMQX_WSS_URL`.
2. `GET /api/recorridos/:token` del chofer de prueba → confirmar
   `recorrido.mqtt === null`.
3. Abrir la app del chofer (`http://localhost:5173/?token=<token>`) y dejar
   que dispare un reporte de ubicación (inmediato al abrir, o esperar el
   intervalo). En Network, confirmar que **no** hay ningún intento de
   conexión MQTT y que sí hay un `POST /api/recorridos/:token/ubicacion`
   exitoso (`200 { ok: true }`).
4. `GET /api/central/recorridos/activos` → confirmar que el recorrido del
   chofer trae `ultimaUbicacion` con las coordenadas recién reportadas y
   `reciente: true`.

**Resultado esperado**: coincide con spec.md SC-001 y User Story 1 —
Central ve la posición sin que el broker haya intervenido en ningún punto,
dentro del mismo intervalo periódico ya configurado.

## Escenario 2 — Historia de Usuario 2 (volver a broker sin tocar la app)

1. Con el mismo backend, setear `UBICACION_CANAL_PREFERIDO=broker` y las
   variables de broker (`EMQX_WSS_URL`, `MQTT_BROKER_URL`, credenciales) —
   reiniciar el proceso (sin tocar `frontend/`).
2. `GET /api/recorridos/:token` del mismo chofer → confirmar que
   `recorrido.mqtt` ahora trae una credencial (no `null`).
3. Repetir el paso 3 del Escenario 1 (abrir/recargar la app del chofer, sin
   ningún cambio de código ni redeploy del frontend) → confirmar que esta
   vez sí hay un publish MQTT exitoso, y que Central sigue viendo
   `ultimaUbicacion` actualizada.

**Resultado esperado**: coincide con spec.md SC-002/SC-003 y User Story
2 — el cambio de modo fue puramente de configuración.

## Escenario 3 — Historia de Usuario 3 (diagnóstico sin ambigüedad)

1. En modo directo (Escenario 1), `GET /api/integracion/mqtt/estado` (con
   el header de auth de integración vigente) → confirmar
   `canalPreferido: "directo"`, y que `recibidos: 0`/`habilitado` reflejan
   el estado real del bridge sin que eso se lea como una falla (ver
   `contracts/mqtt-estado-api.md`).
2. En modo broker (Escenario 2), repetir la consulta → confirmar
   `canalPreferido: "broker"` junto con contadores que suben tras publicar.
3. Para la evidencia de actividad del canal directo (sin contador
   dedicado): repetir el paso 4 del Escenario 1 un par de veces con
   distintas coordenadas y confirmar que el timestamp de `ultimaUbicacion`
   en `GET /api/central/recorridos/activos` avanza en cada ciclo.

**Resultado esperado**: coincide con spec.md User Story 3 y la sesión de
clarificación (canal directo sin contadores nuevos; broker distingue
"inactivo por preferencia" de "debería estar activo").

## Escenario 4 — cobertura automatizada

- `cd backend && npm test` — debe incluir (tras la implementación):
  - `backend/tests/unit/ubicacion-canal.test.js` (nuevo, helper de config).
  - `backend/tests/contract/post-ubicacion.test.js` actualizado — aserciones
    contra `integracionStore.ultimaUbicacionPorChofer`/`recorrido.ultimaUbicacion`
    en vez de `ubicacionEnMemoria`.
  - `backend/tests/contract/integracion-endpoints.test.js` con un caso para
    el campo `canalPreferido`.
  - Confirmar que `backend/tests/unit/ubicacion-en-memoria.test.js` fue
    eliminado junto con el módulo que testeaba.

## Rollback

Este feature es reversible por configuración en producción (setear
`UBICACION_CANAL_PREFERIDO=broker` restaura el comportamiento previo sin
redeploy del frontend). Revertir el branch `013-mqtt-a-backend-directo`
además restaura el store `ubicacionEnMemoria.js` — sin impacto en datos de
Oracle ni en credenciales del broker, que no se tocan en ningún escenario.
