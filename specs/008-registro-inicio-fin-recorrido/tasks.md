---

description: "Task list template for feature implementation"
---

# Tasks: Registro de inicio y fin de recorrido con regreso a base

**Input**: Design documents from `/specs/008-registro-inicio-fin-recorrido/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: incluidos — mismo convenio ya establecido en el proyecto (`node --test` en `backend/tests/{unit,contract,integration}`, `vitest` en `frontend/tests`/`central/tests`, ver plan.md § Testing).

**Organization**: Tasks agrupadas por historia de usuario de spec.md (US1, US2 — ambas P1, independientes entre sí).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: A qué historia de usuario pertenece (US1, US2)
- Rutas de archivo exactas en cada descripción

## Path Conventions

Web app existente de 3 componentes (ver plan.md § Project Structure):
`backend/src/`, `backend/tests/`, `frontend/src/`, `frontend/tests/`, `central/src/`, `central/tests/`.

---

## Phase 1: Setup

**Purpose**: Sin proyecto/dependencias nuevas que inicializar (research.md: cero dependencias nuevas). Solo confirmar línea base antes de tocar código compartido.

- [X] T001 Correr `cd backend && npm test`, `cd frontend && npm test`, `cd central && npm test` y confirmar que los tres suites pasan en verde antes de empezar (línea base pre-feature) — 130/130, 41/41, 24/24

---

## Phase 2: Foundational

**Purpose**: N/A para esta feature — US1 (campos `inicioEn`/`inicioLat`/`inicioLon` por punto) y US2 (campos `cierreEn`/`cierreLat`/`cierreLon` por recorrido + eliminación de la derivación automática de `estado`) tocan datos y funciones distintas de `integracionStore.js` (`mergearPunto` vs. `upsertRecorridos`/`transicionarPunto`/método nuevo `finalizarRecorrido`), sin superposición real. No hay tareas bloqueantes compartidas: ambas historias pueden implementarse y probarse de forma independiente y en paralelo.

**Checkpoint**: no aplica — se pasa directo a las historias de usuario.

---

## Phase 3: User Story 1 - Registrar hora y ubicación al iniciar cada punto (Priority: P1) 🎯 MVP

**Goal**: al tocar INICIAR sobre un punto, queda registrada la fecha/hora de servidor y (si está disponible) la ubicación GPS del chofer como evento de inicio de ese punto, consultable por Central igual que arribo/descarga.

**Independent Test**: con un recorrido con puntos pendientes en `detenido`, tocar INICIAR sobre el primer punto y verificar (vía `GET /api/recorridos/:token`) que ese punto tiene `inicioEn` seteado; repetir denegando el permiso de ubicación y confirmar que `inicioEn` igual se registra sin bloquear el cambio a `manejando`.

### Tests for User Story 1

- [X] T002 [P] [US1] Unit tests en `backend/tests/unit/integracion-store.test.js`: `iniciarViaje(token, ubicacion, clienteEn)` setea `inicioEn`/`inicioLat`/`inicioLon` en el punto que pasa a ser `puntoActivoId`; sin `ubicacion` (`{}`/`undefined`), `inicioEn` se registra igual y `inicioLat`/`inicioLon` quedan `null`; un segundo INICIAR sobre otro punto (tras completar el primero) registra su propio `inicioEn` sin tocar el del punto anterior — también se agregó test de CANCELAR revirtiendo los campos de inicio
- [X] T003 [P] [US1] Contract test en `backend/tests/contract/post-viaje.test.js`: `POST /viaje/iniciar` acepta body opcional `{ lat, lon, clienteEn }`; sin body sigue devolviendo `200` igual que hoy (no rompe el contrato existente de 005)
- [X] T004 [P] [US1] Integration test en `backend/tests/integration/viaje-estados-guiados.test.js`: tras INICIAR con `{ lat, lon }`, `GET /:token` devuelve el punto activo con `inicioEn` seteado (formato de hora local, ver `specs/006-normalizar-formato-horario`); `inicioLat`/`inicioLon` NO aparecen en esa respuesta (data-model.md § Serialización)
- [X] T005 [P] [US1] Contract test en `backend/tests/contract/get-recorrido-detalle.test.js`: `GET /api/central/recorridos/:id` incluye `inicioEn` por punto (vía `inMemoryCentralRepository` extendido en T010); `inicioLat`/`inicioLon` NO aparecen (research.md, Decisión 4)

### Implementation for User Story 1

- [X] T006 [US1] En `backend/src/state/integracionStore.js`, extender `mergearPunto()` para inicializar/preservar `inicioEn: null`, `inicioLat: null`, `inicioLon: null` en el mismo bloque donde ya viven `arriboEn`/`descargaEn` (líneas ~58-71), preservándolos en cada re-push como ya hace con esos campos (rama del punto ya `arribado`/`completado`, líneas ~48-56, debe conservarlos también vía `...previo`)
- [X] T007 [US1] En `backend/src/state/integracionStore.js`, extender `iniciarViaje(token, ubicacion, clienteEn)` para aceptar esos dos parámetros nuevos y, sobre `primerPendiente`, setear `inicioEn = ahoraLocalIso(parsearClienteEn(clienteEn) ?? undefined)` y `inicioLat`/`inicioLon` si `ubicacion?.lat != null && ubicacion?.lon != null` (mismo patrón que `transicionarPunto`, líneas ~494-502); extender `snapshotPrevio` de `ultimaOperacion` (tipo `iniciar`) para incluir `puntoEstado: 'pendiente', inicioEn: null, inicioLat: null, inicioLon: null` (data-model.md § Extensión de `ultimaOperacion`)
- [X] T008 [US1] En `backend/src/state/integracionStore.js`, extender `cancelarUltimaOperacion()` para que, cuando `op.tipo === 'iniciar'`, restaure también `inicioEn`/`inicioLat`/`inicioLon` del punto desde `snap` (mismo patrón ya usado ahí para `arriboEn`/`descargaEn` con los `if ("arriboEn" in snap)`/`if ("descargaEn" in snap)`)
- [X] T009 [US1] En `backend/src/routes/viaje.js`, extender `POST /:token/viaje/iniciar` para leer `const { lat, lon, clienteEn } = req.body || {}` y pasarlos a `repository.iniciarViaje(req.params.token, { lat, lon }, clienteEn)` (mismo patrón ya usado por `/viaje/llegue`)
- [X] T010 [US1] En `backend/src/state/integracionStore.js`, extender `obtenerPorToken()` y `serializarPuntosCentral()` para incluir `inicioEn` (sin lat/lon); extender `inMemoryCentralRepository.js`. **Corrección durante implementación**: además hubo que tocar `backend/src/routes/recorrido.js` (`serializePunto()` + el objeto `recorrido` armado a mano en el handler `GET /:token`) — ese archivo NO consume `obtenerPorToken()` con un spread, tiene su propio allow-list explícito por diseño (FR-003 de 005: garantía real de que `remitoIds` nunca llegue al chofer), así que agregar el campo al store solo no alcanzaba para que llegara al chofer
- [X] T011 [US1] En `frontend/src/services/api.js`, `iniciarViaje(token)` ahora llama `enviarAccion("viaje-iniciar", token, { conUbicacion: true })`

**Checkpoint**: US1 es demostrable de forma independiente — INICIAR ya registra hora y ubicación, visibles para Central.

---

## Phase 4: User Story 2 - Finalizar el recorrido de forma explícita, registrando el regreso a base (Priority: P1) 🎯 MVP

**Goal**: el recorrido deja de finalizarse automáticamente al completar el último punto; permanece `activo` hasta que el chofer toca FINALIZAR, que registra fecha/hora + ubicación GPS opcional como cierre y recién ahí pasa a `finalizado`.

**Independent Test**: completar todos los puntos de un recorrido de prueba, verificar que `GET /:token` sigue devolviendo `recorrido.estado === "activo"`; tocar FINALIZAR y verificar que pasa a `"finalizado"` con `cierreEn` seteado, posterior al `descargaEn` del último punto.

### Tests for User Story 2

- [X] T012 [P] [US2] Reescribir en `backend/tests/unit/integracion-store.test.js` los 3 tests existentes de cierre automático (líneas ~161, ~178, ~193): `marcarDescarga` sobre el último punto pendiente ya NO deja `recorrido.estado === "finalizado"` (debe seguir `"activo"`); los tests de `listarActivos`/`listarHistorial`/"un re-push no revierte finalizado" ahora deben primero llamar a `store.finalizarRecorrido("tok-1")` antes de verificar esas conductas
- [X] T013 [P] [US2] Unit tests nuevos en `backend/tests/unit/integracion-store.test.js`: `finalizarRecorrido(token, ubicacion, clienteEn)` — `409`/`conflict` si quedan puntos no `completado` o `viajeEstado !== 'detenido'`; `ok` seteando `estado: 'finalizado'`, `cierreEn`, `cierreLat`/`cierreLon` cuando corresponde; llamarlo una segunda vez sobre el mismo recorrido ya finalizado devuelve `ok` con el `cierreEn` **original** sin sobrescribir (research.md, Decisión 3)
- [X] T014 [P] [US2] Contract test en `backend/tests/contract/post-viaje.test.js`: `POST /viaje/finalizar` — `200` con `{ estado: "finalizado", cierreEn }` cuando todos los puntos están completados y `viajeEstado === "detenido"`; `409 { error: "recorrido_no_completado" }` si no; `404 { error: "enlace_invalido" }` con token inválido; reintento sobre un recorrido ya finalizado devuelve `200` idempotente
- [X] T015 [P] [US2] Integration test en `backend/tests/integration/viaje-estados-guiados.test.js`: completar el ciclo INICIAR→LLEGUE→DESCARGA COMPLETA de todos los puntos → `GET /:token` sigue en `estado: "activo"` → `POST /viaje/finalizar` → `GET /:token` pasa a `"finalizado"` con `recorrido.cierreEn` posterior al `descargaEn` del último punto
- [X] T016 [P] [US2] Contract test en `backend/tests/contract/get-recorridos-activos.test.js`: `GET /api/central/recorridos/activos` incluye `esperandoFinalizar: true` cuando todos los puntos de un recorrido activo están `completado`; `false` si todavía hay puntos pendientes/arribados (extendido `inMemoryCentralRepository.listarActivos()`)
- [X] T017 [P] [US2] Contract test en `backend/tests/contract/get-historial.test.js` y `get-recorrido-detalle.test.js`: `recorrido.cierreEn` presente en `GET /api/central/recorridos/historial` y `GET /api/central/recorridos/:id` para un recorrido finalizado, e `inicioEn` por punto en el detalle (extendido `inMemoryCentralRepository`)
- [X] T018 [P] [US2] Component test en `frontend/tests/components/RouteView.test.jsx`: con todos los puntos `completado` pero `estadoRecorrido="activo"` (prop nueva), sigue mostrando el botón FINALIZAR (no la confirmación); al hacer click llama a `onFinalizar`; con `estadoRecorrido="finalizado"`, muestra el mensaje de confirmación sin depender de derivarlo de `puntos` localmente

### Implementation for User Story 2

- [X] T019 [US2] En `backend/src/state/integracionStore.js`, eliminar el bloque de derivación automática de `r.estado = "finalizado"` dentro de `transicionarPunto()` (líneas ~507-516) — sin reemplazo condicional (research.md, Decisión 2)
- [X] T020 [US2] En `backend/src/state/integracionStore.js`, agregar el mutador `finalizarRecorrido(token, ubicacion, clienteEn)`: si el recorrido ya está `estado === "finalizado"`, devuelve `{ outcome: "ok", estado: r.estado, cierreEn: r.cierreEn }` sin tocar nada (idempotente); si `viajeEstado !== "detenido"` o algún punto no está `completado`, devuelve `{ outcome: "conflict" }`; si no, setea `r.estado = "finalizado"`, `r.cierreEn = ahoraLocalIso(parsearClienteEn(clienteEn) ?? undefined)`, `r.cierreLat`/`r.cierreLon` si `ubicacion?.lat != null && ubicacion?.lon != null`, y devuelve `{ outcome: "ok", estado: r.estado, cierreEn: r.cierreEn }`
- [X] T021 [US2] En `backend/src/state/integracionStore.js`, extender `upsertRecorridos()` para inicializar/preservar `cierreEn`/`cierreLat`/`cierreLon`; extender `obtenerPorToken()` para incluir `recorrido.cierreEn` (sin lat/lon); extender `listarActivos()` para incluir `esperandoFinalizar` derivado; extender `listarHistorial()`/`obtenerDetalle()` para incluir `cierreEn` dentro de `recorrido` (sin lat/lon) — espejado en `backend/tests/helpers/inMemoryCentralRepository.js`. **Corrección durante implementación**: `GET /api/recorridos/:token` (chofer) NO consume `obtenerPorToken()` directamente — `backend/src/routes/recorrido.js` tiene su propio allow-list explícito (`serializePunto()` + objeto `recorrido` armado a mano, comentado como "no un spread de punto" a propósito, FR-003 de 005); hubo que agregar `inicioEn`/`cierreEn` ahí también (ver T009/T010 abajo), si no el dato quedaba calculado en el store pero nunca llegaba al chofer
- [X] T022 [US2] Agregar `POST /:token/viaje/finalizar` en `backend/src/routes/viaje.js`: lee `{ lat, lon, clienteEn }` del body, llama a `repository.finalizarRecorrido(...)`, responde `404 enlace_invalido` / `409 { error: "recorrido_no_completado" }` / `200 { estado: "finalizado", cierreEn }` (contracts/chofer-viaje-cierre.md)
- [X] T023 [US2] En `backend/src/routes/central.js`, extender el mapeo de `GET /recorridos/historial` (líneas ~27-32) para incluir `cierreEn: d.recorrido.cierreEn` junto a `id`/`fleteId`/`puntos` (hoy descarta el resto de `recorrido`)
- [X] T024 [US2] En `frontend/src/services/api.js`, agregado `finalizarViaje(token)` (`enviarAccion("viaje-finalizar", token, { conUbicacion: true })`) y el `case "viaje-finalizar"` en `rutaAccion()`
- [X] T025 [US2] En `frontend/src/main.jsx`, agregado `handleFinalizar`: optimista (`actualizarViajeLocal({ estado: "finalizado" })`) + resync-en-409, mismo patrón que `ejecutarAccionViaje`/`handleCancelar` (más simple que un reload completo, y reusa el helper ya existente); pasa `estadoRecorrido={recorrido.recorrido?.estado}` y `onFinalizar={handleFinalizar}` a `RouteView`
- [X] T026 [US2] Reescrito `frontend/src/components/RouteView.jsx`: quitado el `useState` local `finalizarConfirmado`; recibe `estadoRecorrido`/`onFinalizar` por props; el botón FINALIZAR se muestra cuando no hay pendientes y `estadoRecorrido !== "finalizado"` (llama a `onFinalizar`, deshabilitado mientras `procesando`), y el mensaje de confirmación cuando `estadoRecorrido === "finalizado"`
- [X] T027 [P] [US2] En `central/src/components/MonitorView.jsx`, `formatearViajeEstado()` devuelve "Regresando a base" cuando `r.esperandoFinalizar === true` (reemplaza "Detenido" en la misma columna — sin agregar una columna/badge nueva, cambio mínimo); test agregado en `MonitorView.test.jsx`
- [X] T028 [P] [US2] En `central/src/components/RecorridoDetalle.jsx`, agregado `calcularTiempoRegresoMin()` + línea "Cierre: … — regreso a base: N min" cuando `recorrido.cierreEn` existe, y "Inicio: …" por punto junto a Arribo/Descarga; tests agregados en `RecorridoDetalle.test.jsx`
- [X] T029 [P] [US2] En `central/src/components/HistorialView.jsx`, el objeto `recorrido` armado a mano (línea ~50) ahora incluye `cierreEn: h.cierreEn` (dato ya disponible por T023)

**Checkpoint**: US1 + US2 juntas cierran el ciclo completo — feature demostrable de punta a punta (MVP de esta spec).

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: mejoras transversales tras completar ambas historias

- [X] T030 Actualizado `specs/005-chofer-estados-viaje/data-model.md` y `specs/005-chofer-estados-viaje/contracts/chofer-viaje-api.md` con una nota de "superseded por 008-registro-inicio-fin-recorrido" en la sección de derivación automática de `estado`, sin borrar el histórico
- [X] T031 Corrí `quickstart.md` completo de punta a punta contra un backend local, vía navegador real: Escenario 1 (INICIAR registra `inicioEn`, sin GPS en el entorno de test — comportamiento esperado y correcto), Escenario 2 (tras completar el último punto, `estado` sigue `"activo"` y aparece FINALIZAR), Escenario 3 (FINALIZAR → `estado: "finalizado"`, `cierreEn` posterior al `descargaEn` del último punto, UI muestra el mensaje de cierre), Escenario 4 (Central: Historial → línea de tiempo muestra "Cierre: 09:48:06 — regreso a base: 0 min" e "Inicio" por punto) — todos coinciden con lo documentado
- [X] T032 [P] Revisado `frontend/src/styles.css`/`central/src/`: MonitorView/RecorridoDetalle reusan clases ya existentes (sin badge ni clase nueva, cambio mínimo); se agregó `.route-view__finalizar:disabled { opacity: 0.5; }` en `frontend/src/styles.css`, siguiendo el mismo patrón ya usado por `.app__cancelar:disabled` (faltaba porque T026 agregó el atributo `disabled` al botón)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias
- **Foundational (Phase 2)**: N/A — sin tareas
- **US1 (Phase 3)**: depende solo de Setup — 100% independiente de US2
- **US2 (Phase 4)**: depende solo de Setup — 100% independiente de US1 a nivel de código (T010 de US1 toca `serializarPuntosCentral`/`inMemoryCentralRepository` para agregar `inicioEn`; T021 de US2 toca las mismas funciones para agregar `cierreEn`/`esperandoFinalizar` — mismo archivo, cambios no solapados; coordinar el merge si se hacen en paralelo)
- **Polish (Phase 5)**: depende de que ambas historias estén completas

### Parallel Opportunities

- US1 (Phase 3) completa puede desarrollarse en paralelo con US2 (Phase 4) por dos personas distintas
- Dentro de cada fase, todas las tareas marcadas [P] (tests, y los componentes de Central en US2) son paralelizables entre sí

---

## Parallel Example: User Story 2

```bash
# Tests de US2 en paralelo (archivos distintos):
Task: "Reescribir tests de cierre automático en backend/tests/unit/integracion-store.test.js"
Task: "Unit tests de finalizarRecorrido en backend/tests/unit/integracion-store.test.js"
Task: "Contract test en backend/tests/contract/post-viaje.test.js"
Task: "Integration test en backend/tests/integration/viaje-estados-guiados.test.js"
Task: "Contract test en backend/tests/contract/get-recorridos-activos.test.js"
Task: "Component test en frontend/tests/components/RouteView.test.jsx"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Completar Phase 1 (Setup)
2. Completar Phase 3 (US1) y Phase 4 (US2) — ambas P1, juntas son el MVP completo de esta spec
3. **Validar**: correr los 4 escenarios de quickstart.md
4. Deploy/demo si está listo

### Incremental Delivery

1. Setup → base lista
2. US1 (INICIAR registra hora/ubicación) → validar Escenario 1 de quickstart.md → deploy
3. US2 (FINALIZAR explícito + cierre) → validar Escenarios 2-4 → deploy
4. Polish → limpieza y notas cruzadas con 005

---

## Notes

- `[P]` = archivos distintos, sin dependencias pendientes entre sí
- US1 y US2 son independientes entre sí (a diferencia de 005, donde US3-US5 dependían de US2) — pueden implementarse, testearse y entregarse en cualquier orden
- Verificar que los tests fallan antes de implementar
- Commitear después de cada tarea o grupo lógico
- Parar en cada checkpoint para validar la historia de forma independiente
