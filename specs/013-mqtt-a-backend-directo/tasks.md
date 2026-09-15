---

description: "Task list template for feature implementation"
---

# Tasks: Reporte de ubicación directo al backend (broker opcional)

**Input**: Design documents from `/specs/013-mqtt-a-backend-directo/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Incluidos — este proyecto mantiene cobertura de contrato/unitaria/integración para cada feature (ver `backend/tests/{unit,contract,integration}`); esta feature sigue esa convención.

**Organization**: Tareas agrupadas por historia de usuario (spec.md) para poder implementar y probar cada una de forma independiente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1, US2, US3)
- Todas las rutas de archivo son relativas a la raíz del repo (`C:\AI\vickytruck`)

## Path Conventions

Monorepo existente, sin paquetes nuevos: todo el código de esta feature vive en `backend/` (ver plan.md, Project Structure). `frontend/` y `central/` no se tocan.

## Phase 1: Setup

**Purpose**: Confirmar el punto de partida antes de tocar código.

- [X] T001 Ejecutar `cd backend && npm test` y confirmar que la suite actual pasa en verde (baseline previo a los cambios de esta feature, `backend/package.json`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: El helper de configuración que leen tanto US1 (gating del canal MQTT) como US3 (campo de diagnóstico).

**⚠️ CRITICAL**: Ninguna historia de usuario puede empezar hasta que esta fase esté completa.

- [X] T002 Crear `backend/src/config/ubicacionCanal.js` exportando `canalUbicacionPreferido()`: lee `process.env.UBICACION_CANAL_PREFERIDO` (case-insensitive), devuelve `"broker"` solo si el valor matchea exactamente esa palabra, `"directo"` en cualquier otro caso (ausente, vacío, o cualquier otro valor) — ver contracts/ubicacion-canal-config.md y research.md Decisión 1
- [X] T003 Crear `backend/tests/unit/ubicacion-canal.test.js` cubriendo: sin la variable seteada → `"directo"`; `"broker"` → `"broker"`; `"BROKER"`/`"Broker"` (mayúsculas mixtas) → `"broker"`; valor inválido (`"otra-cosa"`, `""`) → `"directo"` (con guardado/restauración de `process.env.UBICACION_CANAL_PREFERIDO` en cada test, mismo patrón que `backend/tests/unit/mqttBridge.test.js`)

**Checkpoint**: Helper de configuración listo — US1 y US3 pueden empezar.

---

## Phase 3: User Story 1 - Central sigue viendo al chofer sin depender del broker externo (Priority: P1) 🎯 MVP

**Goal**: El reporte directo al backend pasa a ser el canal por defecto, y Central lo refleja con la misma confiabilidad que tenía con el broker (corrigiendo el fallback REST hoy huérfano).

**Independent Test**: Con el sistema en modo por defecto, un chofer reporta su posición y `GET /api/central/recorridos/activos` la refleja sin que el broker haya intervenido — ver quickstart.md Escenario 1.

### Implementation for User Story 1

- [X] T004 [US1] En `backend/src/routes/recorrido.js`, hacer que `mqttConfigPara(choferId)` devuelva `null` inmediatamente cuando `canalUbicacionPreferido() !== "broker"` (importar el helper de T002), antes de evaluar `EMQX_WSS_URL`/`choferId`
- [X] T005 [US1] En el handler `POST /:token/ubicacion` de `backend/src/routes/recorrido.js`, tras resolver `recorrido`, si `recorrido.choferId != null` llamar a `ubicacionStore.actualizarUbicacionPorChofer(recorrido.choferId, { lat, lon, en: ahoraLocalIso() })`; si `choferId` es `null` el reporte se descarta silenciosamente; en ambos casos la respuesta sigue siendo `200 { ok: true }`
- [X] T006 [US1] En `backend/src/routes/recorrido.js`, cambiar el parámetro por defecto `ubicacionStore` de `createRecorridoRouter(repository, ubicacionStore = ...)` de `ubicacionEnMemoriaCompartida` a `integracionStoreCompartido` (importado desde `../state/integracionStore.js`); quitar el import ahora no usado de `ubicacionEnMemoriaCompartida`
- [X] T007 [US1] En `backend/src/server.js`, en el bloque de arranque de producción, pasar `integracionStore` explícitamente como 3er argumento (`ubicacionStore`) a `createApp(...)`, reemplazando el `undefined` actual — misma instancia ya usada para `repository`/`centralRepository`/`integracionStore`
- [X] T008 [US1] Eliminar `backend/src/state/ubicacionEnMemoria.js` y `backend/tests/unit/ubicacion-en-memoria.test.js` (store huérfano, sin lectores en producción tras T006/T007 — ver research.md Decisión 2)
- [X] T009 [US1] Reescribir `backend/tests/contract/post-ubicacion.test.js`: sembrar `createInMemoryRecorridoRepository` con un recorrido que tenga `choferId`, pasar una instancia de `createIntegracionStore()` como `ubicacionStore` a `iniciarServidorDePrueba`, y verificar que tras `POST /:token/ubicacion` esa instancia refleja `lat`/`lon`/`en` para ese `choferId` (vía `listarEstado()`/`ultimaUbicacion` del recorrido asociado, o el mecanismo que exponga `createIntegracionStore`); conservar los casos existentes de 404 (token inválido) y 400 (sin lat/lon), que no dependen del store
- [X] T010 [US1] Actualizar `backend/tests/integration/ubicacion-tiempo-real.test.js`: quitar el import de `createUbicacionEnMemoria` (ya eliminado en T008) y reemplazar `ubicacionStore.registrar(...)`/`.obtener(...)` por objetos literales pasados directo como `enMemoria` a `resolverUbicacion(...)` — este test solo ejercita la lógica de prioridad de `resolverUbicacion`, no el store en sí
- [X] T011 [P] [US1] Agregar un caso nuevo a `backend/tests/contract/get-recorrido.test.js`: "recorrido.mqtt es null en modo directo (default) aunque haya choferId y EMQX configurado" — setea `EMQX_WSS_URL`/`EMQX_TOKEN_PASSWORD_SECRET` (con cleanup), deja `UBICACION_CANAL_PREFERIDO` sin setear, y verifica `body.recorrido.mqtt === null`
- [X] T012 [US1] Ejecutar `cd backend && npm test` (todo en verde) y correr manualmente quickstart.md Escenario 1 completo — 190/190 tests en verde; sin cambios de código en `frontend/`/`central/` no hay superficie de UI nueva que recorrer en browser, así que Escenario 1 queda validado por los tests de contrato que reproducen exactamente esos pasos HTTP (post-ubicacion.test.js + el nuevo caso de get-recorrido.test.js)

**Checkpoint**: User Story 1 completa y verificable de forma independiente — el modo directo es el default y Central lo ve.

---

## Phase 4: User Story 2 - Volver a usar el broker sigue siendo posible sin tocar la app del chofer (Priority: P2)

**Goal**: Cambiar `UBICACION_CANAL_PREFERIDO=broker` restaura el comportamiento previo end-to-end, sin cambios en la app del chofer.

**Independent Test**: Configurar el broker como preferido y confirmar que el reporte de posición vuelve a viajar por ahí, sin tocar `frontend/` — ver quickstart.md Escenario 2.

### Implementation for User Story 2

- [X] T013 [US2] En `backend/tests/contract/get-recorrido.test.js`, actualizar los 3 tests existentes que esperan `recorrido.mqtt` no nulo ("expone recorrido.mqtt derivado del choferId...", "NO es null aunque falte fleteId...", "es null con fleteId pero sin choferId todavía") para setear explícitamente `process.env.UBICACION_CANAL_PREFERIDO = "broker"` (con restauración en `finally`, mismo patrón que las variables `EMQX_*` ya usado en ese archivo) — de lo contrario T004 los rompe, porque el default pasó a ser `"directo"`
- [X] T014 [US2] Agregar un test nuevo a `backend/tests/contract/get-recorrido.test.js`: mismo token/choferId, primero con `UBICACION_CANAL_PREFERIDO` sin setear (`mqtt === null`), después seteado a `"broker"` (`mqtt` no nulo) en la misma prueba — demuestra que el cambio de modo es puramente de configuración
- [X] T015 [US2] Ejecutar `cd backend && npm test` (todo en verde) y correr manualmente quickstart.md Escenario 2 completo — validado por el nuevo test de toggle en `get-recorrido.test.js` (mismo token, `directo` → `broker` en la misma prueba, sin reiniciar nada del lado del chofer)

**Checkpoint**: User Story 1 y 2 funcionan de forma independiente — el broker sigue totalmente disponible por configuración.

---

## Phase 5: User Story 3 - Queda claro qué modo de reporte está activo y si tiene actividad reciente (Priority: P3)

**Goal**: `GET /api/integracion/mqtt/estado` distingue "inactivo por preferencia" de "debería estar activo pero no responde".

**Independent Test**: Consultar el endpoint en ambos modos y confirmar que `canalPreferido` refleja la configuración vigente — ver quickstart.md Escenario 3.

### Implementation for User Story 3

- [X] T016 [US3] En `backend/src/routes/integracion.js`, modificar el handler `GET /mqtt/estado` para incluir `canalPreferido: canalUbicacionPreferido()` (helper de T002) en la respuesta, siempre presente — tanto en la rama `mqttBridge.obtenerMetricas()` como en el fallback `{ habilitado: false }` — ver contracts/mqtt-estado-api.md
- [X] T017 [US3] En `backend/tests/contract/integracion-endpoints.test.js`, actualizar los 2 tests existentes de `/mqtt/estado` ("habilitado:false si no se inyectó ningún mqttBridge" y "refleja las métricas del mqttBridge inyectado") para verificar también `canalPreferido: "directo"` (default, ya que esos tests no setean `UBICACION_CANAL_PREFERIDO`)
- [X] T018 [US3] Agregar un test nuevo a `backend/tests/contract/integracion-endpoints.test.js`: con `UBICACION_CANAL_PREFERIDO="broker"` seteado (con cleanup en `finally`), `GET /mqtt/estado` devuelve `canalPreferido: "broker"`
- [X] T019 [US3] Ejecutar `cd backend && npm test` (todo en verde) y correr manualmente quickstart.md Escenario 3 completo — 191/191 tests en verde; validado por los 3 tests de `/mqtt/estado` (default, con bridge, y `canalPreferido:"broker"`)

**Checkpoint**: Las 3 historias de usuario funcionan de forma independiente.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Coherencia de documentación/comentarios ahora desactualizados por el cambio de preferencia, y validación final.

- [X] T020 [P] Actualizar los comentarios en `frontend/src/services/ubicacionMqtt.js` y `frontend/src/services/ubicacionPeriodica.js` que describen "MQTT es el canal primario" (desactualizado tras esta migración) para reflejar que el backend controla la preferencia de canal vía `UBICACION_CANAL_PREFERIDO`, y que el código del frontend (intentar MQTT, caer a REST) no cambia
- [X] T021 [P] Actualizar el comentario sobre `mqttConfigPara` en `backend/src/routes/recorrido.js` para mencionar el nuevo gate por `canalUbicacionPreferido()` (el comentario actual quedó desactualizado tras T004)
- [X] T022 [P] Documentar `UBICACION_CANAL_PREFERIDO` en `backend/.env.example` (valores `directo`/`broker`, default `directo`), siguiendo el mismo estilo de comentario que las variables vecinas (`UBICACION_REPORTE_INTERVALO_MS`, `UBICACION_STALE_MS`)
- [X] T023 Ejecutar `cd backend && npm test` una vez más y correr manualmente el quickstart.md completo (los 4 escenarios) como validación final end-to-end — 191/191 en backend, 52/52 en frontend (comentarios sin cambio de lógica); sin cambios de código en `central/` para esta feature (no requería re-test)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias — puede arrancar de inmediato
- **Foundational (Phase 2)**: Depende de Setup — BLOQUEA todas las historias de usuario
- **User Story 1 (Phase 3)**: Depende de Foundational. Es el MVP — las otras dos historias asumen que este fix ya está aplicado
- **User Story 2 (Phase 4)**: Depende de Foundational y de que T004 (el gate por canal) ya exista en `get-recorrido.test.js` para que sus ediciones tengan sentido — en la práctica, hacer Phase 3 antes de Phase 4
- **User Story 3 (Phase 5)**: Depende solo de Foundational (T002) — podría implementarse en paralelo con Phase 3/4 si hay más de una persona, ya que toca un archivo distinto (`integracion.js`)
- **Polish (Phase 6)**: Depende de que las 3 historias estén completas

### Dentro de cada historia

- US1: T004-T008 (implementación) antes de T009-T011 (tests que dependen del código nuevo); T012 al final
- US2: T013 (arreglar tests rotos por T004) antes de T014 (test nuevo); T015 al final
- US3: T016 (implementación) antes de T017-T018 (tests); T019 al final

### Parallel Opportunities

- T002 (helper) puede escribirse junto con T003 (su test) una vez decidida la interfaz, pero T003 solo puede *ejecutarse* en verde después de T002 — no marcados `[P]` entre sí para evitar ambigüedad
- T011 `[P]` respecto a T009/T010 (archivos de test distintos), aunque las tres pertenecen a US1
- T020, T021, T022 `[P]` entre sí en Polish (archivos completamente distintos: frontend, backend/routes, .env.example)
- US3 (Phase 5) es independiente de US2 (Phase 4) — con más de una persona, pueden avanzar en paralelo una vez completada US1

---

## Parallel Example: User Story 1

```bash
# T009 y T010 tocan archivos de test distintos entre sí, pero ambos dependen
# de T004-T008 ya aplicados. T011 sí puede ir en paralelo con cualquiera de
# los dos (archivo get-recorrido.test.js, no compartido):
Task: "Reescribir backend/tests/contract/post-ubicacion.test.js contra integracionStore"
Task: "Agregar caso 'modo directo → mqtt null' en backend/tests/contract/get-recorrido.test.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (bloquea todo)
3. Completar Phase 3: User Story 1
4. **PARAR y VALIDAR**: correr quickstart.md Escenario 1 de punta a punta
5. Con esto ya se cumple el objetivo central del pedido original: el reporte de ubicación va directo al backend por defecto, y Central lo ve

### Incremental Delivery

1. Setup + Foundational → base lista
2. User Story 1 → validar independientemente → es el MVP real de esta feature
3. User Story 2 → validar independientemente → confirma que "opcional" no es solo teórico
4. User Story 3 → validar independientemente → cierra el diagnóstico sin ambigüedad
5. Polish → comentarios/documentación al día, validación final completa

---

## Notes

- `[P]` = archivos distintos, sin dependencias pendientes entre sí
- `[Story]` mapea cada tarea a su historia de usuario para trazabilidad
- T004 (el gate por canal) es la tarea que más tareas de test existentes rompe a propósito — T013 es la corrección deliberada de esa rotura, no un bug nuevo
- Ningún cambio toca `frontend/` ni `central/` como código (T020 es solo comentarios) — ver research.md Decisión 1 y Decisión 3 sobre por qué no hace falta
- Commitear después de cada checkpoint de historia de usuario (no tarea por tarea), siguiendo el patrón ya usado en features anteriores de este repo (specs/012, specs/008)
