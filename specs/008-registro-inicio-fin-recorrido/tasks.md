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

- [ ] T001 Correr `cd backend && npm test`, `cd frontend && npm test`, `cd central && npm test` y confirmar que los tres suites pasan en verde antes de empezar (línea base pre-feature)

---

## Phase 2: Foundational

**Purpose**: N/A para esta feature — US1 (campos `inicioEn`/`inicioLat`/`inicioLon` por punto) y US2 (campos `cierreEn`/`cierreLat`/`cierreLon` por recorrido + eliminación de la derivación automática de `estado`) tocan datos y funciones distintas de `integracionStore.js` (`mergearPunto` vs. `upsertRecorridos`/`transicionarPunto`/método nuevo `finalizarRecorrido`), sin superposición real. No hay tareas bloqueantes compartidas: ambas historias pueden implementarse y probarse de forma independiente y en paralelo.

**Checkpoint**: no aplica — se pasa directo a las historias de usuario.

---

## Phase 3: User Story 1 - Registrar hora y ubicación al iniciar cada punto (Priority: P1) 🎯 MVP

**Goal**: al tocar INICIAR sobre un punto, queda registrada la fecha/hora de servidor y (si está disponible) la ubicación GPS del chofer como evento de inicio de ese punto, consultable por Central igual que arribo/descarga.

**Independent Test**: con un recorrido con puntos pendientes en `detenido`, tocar INICIAR sobre el primer punto y verificar (vía `GET /api/recorridos/:token`) que ese punto tiene `inicioEn` seteado; repetir denegando el permiso de ubicación y confirmar que `inicioEn` igual se registra sin bloquear el cambio a `manejando`.

### Tests for User Story 1

- [ ] T002 [P] [US1] Unit tests en `backend/tests/unit/integracion-store.test.js`: `iniciarViaje(token, ubicacion, clienteEn)` setea `inicioEn`/`inicioLat`/`inicioLon` en el punto que pasa a ser `puntoActivoId`; sin `ubicacion` (`{}`/`undefined`), `inicioEn` se registra igual y `inicioLat`/`inicioLon` quedan `null`; un segundo INICIAR sobre otro punto (tras completar el primero) registra su propio `inicioEn` sin tocar el del punto anterior
- [ ] T003 [P] [US1] Contract test en `backend/tests/contract/post-viaje.test.js`: `POST /viaje/iniciar` acepta body opcional `{ lat, lon, clienteEn }`; sin body sigue devolviendo `200` igual que hoy (no rompe el contrato existente de 005)
- [ ] T004 [P] [US1] Integration test en `backend/tests/integration/viaje-estados-guiados.test.js`: tras INICIAR con `{ lat, lon }`, `GET /:token` devuelve el punto activo con `inicioEn` seteado (formato de hora local, ver `specs/006-normalizar-formato-horario`); `inicioLat`/`inicioLon` NO aparecen en esa respuesta (data-model.md § Serialización)
- [ ] T005 [P] [US1] Contract test en `backend/tests/contract/get-recorrido-detalle.test.js`: `GET /api/central/recorridos/:id` incluye `inicioEn` por punto (vía `inMemoryCentralRepository` extendido en T010); `inicioLat`/`inicioLon` NO aparecen (research.md, Decisión 4)

### Implementation for User Story 1

- [ ] T006 [US1] En `backend/src/state/integracionStore.js`, extender `mergearPunto()` para inicializar/preservar `inicioEn: null`, `inicioLat: null`, `inicioLon: null` en el mismo bloque donde ya viven `arriboEn`/`descargaEn` (líneas ~58-71), preservándolos en cada re-push como ya hace con esos campos (rama del punto ya `arribado`/`completado`, líneas ~48-56, debe conservarlos también vía `...previo`)
- [ ] T007 [US1] En `backend/src/state/integracionStore.js`, extender `iniciarViaje(token, ubicacion, clienteEn)` para aceptar esos dos parámetros nuevos y, sobre `primerPendiente`, setear `inicioEn = ahoraLocalIso(parsearClienteEn(clienteEn) ?? undefined)` y `inicioLat`/`inicioLon` si `ubicacion?.lat != null && ubicacion?.lon != null` (mismo patrón que `transicionarPunto`, líneas ~494-502); extender `snapshotPrevio` de `ultimaOperacion` (tipo `iniciar`) para incluir `puntoEstado: 'pendiente', inicioEn: null, inicioLat: null, inicioLon: null` (data-model.md § Extensión de `ultimaOperacion`)
- [ ] T008 [US1] En `backend/src/state/integracionStore.js`, extender `cancelarUltimaOperacion()` para que, cuando `op.tipo === 'iniciar'`, restaure también `inicioEn`/`inicioLat`/`inicioLon` del punto desde `snap` (mismo patrón ya usado ahí para `arriboEn`/`descargaEn` con los `if ("arriboEn" in snap)`/`if ("descargaEn" in snap)`)
- [ ] T009 [US1] En `backend/src/routes/viaje.js`, extender `POST /:token/viaje/iniciar` para leer `const { lat, lon, clienteEn } = req.body || {}` y pasarlos a `repository.iniciarViaje(req.params.token, { lat, lon }, clienteEn)` (mismo patrón ya usado por `/viaje/llegue`)
- [ ] T010 [US1] En `backend/src/state/integracionStore.js`, extender `obtenerPorToken()` para incluir `inicioEn` por punto (sin `inicioLat`/`inicioLon`, mismo criterio que `arriboEn`/`descargaEn` ya expuestos ahí) y `serializarPuntosCentral()` para incluir `inicioEn` (sin lat/lon); extender `backend/tests/helpers/inMemoryCentralRepository.js` (`serializarPuntos()`) para exponer `inicioEn` igual, de modo que T005 pase
- [ ] T011 [US1] En `frontend/src/services/api.js`, cambiar `iniciarViaje(token)` para llamar `enviarAccion("viaje-iniciar", token, { conUbicacion: true })` (hoy no captura GPS — línea 111-113)

**Checkpoint**: US1 es demostrable de forma independiente — INICIAR ya registra hora y ubicación, visibles para Central.

---

## Phase 4: User Story 2 - Finalizar el recorrido de forma explícita, registrando el regreso a base (Priority: P1) 🎯 MVP

**Goal**: el recorrido deja de finalizarse automáticamente al completar el último punto; permanece `activo` hasta que el chofer toca FINALIZAR, que registra fecha/hora + ubicación GPS opcional como cierre y recién ahí pasa a `finalizado`.

**Independent Test**: completar todos los puntos de un recorrido de prueba, verificar que `GET /:token` sigue devolviendo `recorrido.estado === "activo"`; tocar FINALIZAR y verificar que pasa a `"finalizado"` con `cierreEn` seteado, posterior al `descargaEn` del último punto.

### Tests for User Story 2

- [ ] T012 [P] [US2] Reescribir en `backend/tests/unit/integracion-store.test.js` los 3 tests existentes de cierre automático (líneas ~161, ~178, ~193): `marcarDescarga` sobre el último punto pendiente ya NO deja `recorrido.estado === "finalizado"` (debe seguir `"activo"`); los tests de `listarActivos`/`listarHistorial`/"un re-push no revierte finalizado" ahora deben primero llamar a `store.finalizarRecorrido("tok-1")` antes de verificar esas conductas
- [ ] T013 [P] [US2] Unit tests nuevos en `backend/tests/unit/integracion-store.test.js`: `finalizarRecorrido(token, ubicacion, clienteEn)` — `409`/`conflict` si quedan puntos no `completado` o `viajeEstado !== 'detenido'`; `ok` seteando `estado: 'finalizado'`, `cierreEn`, `cierreLat`/`cierreLon` cuando corresponde; llamarlo una segunda vez sobre el mismo recorrido ya finalizado devuelve `ok` con el `cierreEn` **original** sin sobrescribir (research.md, Decisión 3)
- [ ] T014 [P] [US2] Contract test en `backend/tests/contract/post-viaje.test.js`: `POST /viaje/finalizar` — `200` con `{ estado: "finalizado", cierreEn }` cuando todos los puntos están completados y `viajeEstado === "detenido"`; `409 { error: "recorrido_no_completado" }` si no; `404 { error: "enlace_invalido" }` con token inválido; reintento sobre un recorrido ya finalizado devuelve `200` idempotente
- [ ] T015 [P] [US2] Integration test en `backend/tests/integration/viaje-estados-guiados.test.js`: completar el ciclo INICIAR→LLEGUE→DESCARGA COMPLETA de todos los puntos → `GET /:token` sigue en `estado: "activo"` → `POST /viaje/finalizar` → `GET /:token` pasa a `"finalizado"` con `recorrido.cierreEn` posterior al `descargaEn` del último punto
- [ ] T016 [P] [US2] Contract test en `backend/tests/contract/get-recorridos-activos.test.js`: `GET /api/central/recorridos/activos` incluye `esperandoFinalizar: true` cuando todos los puntos de un recorrido activo están `completado` y `viajeEstado: "detenido"` (extender `inMemoryCentralRepository.listarActivos()` en T021 para calcularlo); `false`/ausente en cualquier otro caso
- [ ] T017 [P] [US2] Contract test en `backend/tests/contract/get-historial.test.js` y `get-recorrido-detalle.test.js`: `recorrido.cierreEn` presente en `GET /api/central/recorridos/historial` y `GET /api/central/recorridos/:id` para un recorrido finalizado (extender `inMemoryCentralRepository` en T021)
- [ ] T018 [P] [US2] Component test en `frontend/tests/components/RouteView.test.jsx`: con todos los puntos `completado` pero `recorrido.estado !== "finalizado"` (prop nueva), sigue mostrando el botón FINALIZAR (no la confirmación); al hacer click llama a la prop `onFinalizar`; cuando `recorrido.estado === "finalizado"` (prop), muestra el mensaje de confirmación sin depender de derivarlo de `puntos` localmente

### Implementation for User Story 2

- [ ] T019 [US2] En `backend/src/state/integracionStore.js`, eliminar el bloque de derivación automática de `r.estado = "finalizado"` dentro de `transicionarPunto()` (líneas ~507-516) — sin reemplazo condicional (research.md, Decisión 2)
- [ ] T020 [US2] En `backend/src/state/integracionStore.js`, agregar el mutador `finalizarRecorrido(token, ubicacion, clienteEn)`: si el recorrido ya está `estado === "finalizado"`, devuelve `{ outcome: "ok", estado: r.estado, cierreEn: r.cierreEn }` sin tocar nada (idempotente); si `viajeEstado !== "detenido"` o algún punto no está `completado`, devuelve `{ outcome: "conflict" }`; si no, setea `r.estado = "finalizado"`, `r.cierreEn = ahoraLocalIso(parsearClienteEn(clienteEn) ?? undefined)`, `r.cierreLat`/`r.cierreLon` si `ubicacion?.lat != null && ubicacion?.lon != null`, y devuelve `{ outcome: "ok", estado: r.estado, cierreEn: r.cierreEn }`
- [ ] T021 [US2] En `backend/src/state/integracionStore.js`, extender `upsertRecorridos()` para inicializar/preservar `cierreEn: previo?.cierreEn ?? null`, `cierreLat: previo?.cierreLat ?? null`, `cierreLon: previo?.cierreLon ?? null` (mismo criterio que `viajeEstado`); extender `obtenerPorToken()` para incluir `recorrido.cierreEn` (sin lat/lon); extender `listarActivos()` para incluir `esperandoFinalizar` derivado (`viajeEstado === "detenido" && puntos.length > 0 && puntos.every(p => p.estado === "completado")`, research.md Decisión 5); extender `listarHistorial()`/`obtenerDetalle()` para incluir `cierreEn` dentro de `recorrido` (sin lat/lon); espejar estos mismos campos (`cierreEn`, `esperandoFinalizar`) en `backend/tests/helpers/inMemoryCentralRepository.js` para que T016/T017 pasen
- [ ] T022 [US2] Agregar `POST /:token/viaje/finalizar` en `backend/src/routes/viaje.js`: lee `{ lat, lon, clienteEn }` del body, llama a `repository.finalizarRecorrido(...)`, responde `404 enlace_invalido` / `409 { error: "recorrido_no_completado" }` / `200 { estado: "finalizado", cierreEn }` (contracts/chofer-viaje-cierre.md)
- [ ] T023 [US2] En `backend/src/routes/central.js`, extender el mapeo de `GET /recorridos/historial` (líneas ~27-32) para incluir `cierreEn: d.recorrido.cierreEn` junto a `id`/`fleteId`/`puntos` (hoy descarta el resto de `recorrido`)
- [ ] T024 [US2] En `frontend/src/services/api.js`, agregar `finalizarViaje(token)` (`enviarAccion("viaje-finalizar", token, { conUbicacion: true })`) y el `case "viaje-finalizar": return `${base}/viaje/finalizar`;` en `rutaAccion()` (`bodyPara()` ya funciona genéricamente, sin cambios)
- [ ] T025 [US2] En `frontend/src/main.jsx`, agregar `handleFinalizar` que llama a `finalizarViaje(token)` y refresca el recorrido (recarga completa vía el mismo patrón ya usado por `handleCancelar` en 005 — más simple que optimismo local para una transición terminal sin necesidad de revertir); pasar `recorrido.recorrido?.estado` y `onFinalizar={handleFinalizar}` a `RouteView`
- [ ] T026 [US2] Reescribir `frontend/src/components/RouteView.jsx`: quitar el `useState` local `finalizarConfirmado` y la derivación `recorridoFinalizado` a partir de `puntos`; recibir `estadoRecorrido`/`onFinalizar` por props; mostrar el botón FINALIZAR cuando no hay pendientes y `estadoRecorrido !== "finalizado"` (llama a `onFinalizar` al tocarlo), y el mensaje de confirmación cuando `estadoRecorrido === "finalizado"`
- [ ] T027 [P] [US2] En `central/src/components/MonitorView.jsx`, agregar un badge "Regresando a base" cuando `recorrido.esperandoFinalizar === true`
- [ ] T028 [P] [US2] En `central/src/components/RecorridoDetalle.jsx`, mostrar `Cierre: {formatearHoraLocal(recorrido.cierreEn)}` cuando exista, y el tiempo transcurrido entre el `descargaEn` del último punto y `cierreEn` (regreso a base); mostrar `inicioEn` junto a `arriboEn`/`descargaEn` por punto (T010 ya expone el dato)
- [ ] T029 [P] [US2] En `central/src/components/HistorialView.jsx`, mostrar `cierreEn` por recorrido (hoy ese componente arma el objeto `recorrido` a mano en línea ~50 con `estado` hardcodeado — agregar `cierreEn: h.cierreEn` a ese mapeo, dato ya disponible por T023)

**Checkpoint**: US1 + US2 juntas cierran el ciclo completo — feature demostrable de punta a punta (MVP de esta spec).

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: mejoras transversales tras completar ambas historias

- [ ] T030 Actualizar `specs/005-chofer-estados-viaje/data-model.md` y `specs/005-chofer-estados-viaje/contracts/chofer-viaje-api.md` con una nota de "cierre automático superseded por 008-registro-inicio-fin-recorrido" en la sección de FINALIZAR/derivación de `estado`, sin borrar el histórico
- [ ] T031 Corrí `quickstart.md` completo de punta a punta contra un backend local (Escenarios 1-4)
- [ ] T032 [P] Revisar `frontend/src/styles.css`/`central/src/` por si el badge "Regresando a base" (T027) o el mensaje de cierre (T028) necesitan una clase visual nueva

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
