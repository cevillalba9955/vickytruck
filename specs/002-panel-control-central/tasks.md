---

description: "Task list template for feature implementation"
---

# Tasks: Central — Panel de Control de Recorridos y Fletes

**Input**: Design documents from `/specs/002-panel-control-central/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Se incluyen tareas de test (contrato + integración/componentes), ya que
plan.md define explícitamente una estrategia de testing (`node --test`, `vitest` +
Testing Library) como parte del stack elegido para esta feature — mismo criterio que
001-chofer-recorrido.

**Organization**: Las tareas están agrupadas por historia de usuario (spec.md) para
permitir implementación y prueba independiente de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1, US2, US3, US4, US5)
- Se incluyen rutas de archivo exactas en cada descripción

## Path Conventions

Según plan.md: se **extiende** `backend/src/`, `backend/tests/`, `backend/sql/` (ya
existentes de 001-chofer-recorrido) y se **crea** `central/src/`, `central/tests/`
(frontend nuevo). `frontend/` (chofer) no se modifica en esta feature.

> **Nota de enmienda (constitución v2.0.0)**: el Principio III cambió de "Central
> Embebible en Oracle APEX (NON-NEGOTIABLE)" a "Central Compatible con Embebido en
> Oracle APEX y con Acceso Directo (NON-NEGOTIABLE)" — el acceso directo por URL ya no
> se bloquea ni degrada. Esto deja obsoleto el guard de embebido bloqueante que T009
> introdujo originalmente (`central/src/services/embedGuard.js`) y el componente
> `FueraDeIframeNotice` de T042/T044: ambos se eliminaron del código; `central/src/main.jsx`
> ya no distingue entre embebido y acceso directo, renderiza la misma app en los dos
> casos. Las tareas de abajo quedan como registro histórico de lo implementado
> originalmente; el estado actual del código es el que refleja esta nota.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicialización del frontend nuevo (`central/`) y de la configuración
compartida que necesitan todas las historias

- [X] T001 Crear estructura de directorios `central/src/{components,services}` y
      `central/tests/components` per plan.md
- [X] T002 [P] Inicializar proyecto frontend con Vite + React 18 en `central/`
      (`central/package.json`, `central/vite.config.js`), con `vitest` +
      `@testing-library/react` + `@testing-library/jest-dom` como devDependencies
      (mismo patrón que `frontend/`, pero layout de escritorio, no mobile-first)
- [X] T003 [P] Agregar las nuevas variables de entorno de esta feature a
      `backend/.env.example` (`ORACLE_TABLA_FLETES`, `ORACLE_PACKAGE_CENTRAL_API`,
      `UBICACION_STALE_MS`) documentando su propósito, per research.md §5 y §7
- [X] T004 [P] Crear el stub inicial del package PL/SQL `CENTRAL_API` (spec) en
      `backend/sql/central_api.pks.sql` con las firmas de `asignar_recorrido` y
      `reasignar_recorrido` descriptas en research.md §6

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestructura común que las 5 historias de usuario necesitan antes de
poder implementarse

**⚠️ CRITICAL**: Ninguna historia de usuario puede empezar hasta completar esta fase

- [X] T005 Implementar el módulo base del repositorio de Central (reutiliza
      `getPool()`/`withConnection()` de `backend/src/db/pool.js`, helpers de mapeo de
      filas y de umbral "reciente" vía `UBICACION_STALE_MS`) en
      `backend/src/db/centralRepository.js`
- [X] T006 Implementar el esqueleto del router de Central (`createCentralRouter(...)`,
      sin handlers de negocio todavía) en `backend/src/routes/central.js`
- [X] T007 Montar `createCentralRouter(...)` bajo `/api/central` en
      `backend/src/server.js`, junto a la ruta ya existente `/api/recorridos` (depende
      de T006)
- [X] T008 [P] Implementar cliente API del frontend de Central (fetch wrapper, base
      URL, parseo de `{ "error": "<código>" }`) en `central/src/services/api.js`
- [X] T009 [P] Implementar guard de embebido en iframe
      (`window.self !== window.top`) en `central/src/services/embedGuard.js`
      (FR-011, FR-012) — usado por la app antes de renderizar cualquier vista

**Checkpoint**: Infraestructura lista — las historias de usuario pueden implementarse
(en paralelo si hay capacidad)

---

## Phase 3: User Story 1 - Monitorear en vivo los recorridos activos (Priority: P1) 🎯 MVP

**Goal**: El operador ve, sin recargar manualmente, el flete asignado, el progreso y la
última ubicación conocida de cada recorrido activo.

**Independent Test**: Con dos o más recorridos activos en distintos estados, abrir el
panel y verificar que refleja estado/ubicación de cada flete, incluyendo un cambio hecho
desde la app del chofer sin recarga manual (ver Escenario de validación 2 de
quickstart.md).

### Tests for User Story 1

- [X] T010 [P] [US1] Contract test para `GET /api/central/recorridos/activos` (200 con
      progreso y última ubicación por recorrido; un recorrido sin flete asignado no
      aparece, FR-001) en `backend/tests/contract/get-recorridos-activos.test.js`
- [X] T011 [P] [US1] Integration test: un cambio de estado de punto (arribo/descarga)
      se refleja en la siguiente lectura de `listarActivos()`, y una ubicación reportada
      hace más del umbral configurado se marca como no reciente (FR-014) en
      `backend/tests/integration/monitorear-recorridos.test.js`

### Implementation for User Story 1

- [X] T012 [US1] Implementar `listarActivos()` en
      `backend/src/db/centralRepository.js` (progreso derivado, última ubicación y flag
      `reciente` según `UBICACION_STALE_MS`) (depende de T005)
- [X] T013 [US1] Implementar handler `GET /api/central/recorridos/activos` en
      `backend/src/routes/central.js` (depende de T006, T012)
- [X] T014 [P] [US1] Implementar componente `MonitorView` (lista de recorridos activos:
      flete, progreso, última ubicación con indicador de reciente/no reciente) en
      `central/src/components/MonitorView.jsx`
- [X] T015 [P] [US1] Implementar helper de polling con cleanup
      (`pollEvery(intervalMs, fn)`) en `central/src/services/polling.js`
- [X] T016 [US1] Implementar `central/src/main.jsx`: aplicar el guard de embebido
      (T009), hacer polling cada ~5 s de `/api/central/recorridos/activos` y renderizar
      `MonitorView` (depende de T008, T009, T014, T015)
- [X] T017 [P] [US1] Component test: `MonitorView` marca visualmente una ubicación no
      reciente como distinta de una reciente en
      `central/tests/components/MonitorView.test.jsx`

**Checkpoint**: User Story 1 funcional y verificable de forma independiente

---

## Phase 4: User Story 2 - Asignar un recorrido precargado a un flete (Priority: P1)

**Goal**: El operador asigna un recorrido precargado disponible a un flete disponible,
generando el enlace único y persistiendo la asignación de inmediato en Oracle.

**Independent Test**: Con un recorrido precargado sin asignar y un flete disponible,
ejecutar la asignación desde el panel y verificar que el recorrido pasa a `activo`
vinculado a ese flete, con un enlace único generado (ver Escenario de validación 1 de
quickstart.md).

### Tests for User Story 2

- [X] T018 [P] [US2] Contract test para `GET /api/central/recorridos/disponibles` y
      `GET /api/central/fletes/disponibles` (FR-003, FR-004) en
      `backend/tests/contract/get-disponibles.test.js`
- [X] T019 [P] [US2] Contract test para `POST /api/central/recorridos/:id/asignar`
      (200 aplica y genera token; 409 `ya_asignado`; 409 `flete_ocupado`, FR-005 a
      FR-007) en `backend/tests/contract/post-asignar.test.js`
- [X] T020 [P] [US2] Integration test: dos asignaciones casi simultáneas sobre el mismo
      recorrido — solo una debe prevalecer y la otra debe rechazarse sin estado
      ambiguo (FR-015, Escenario de validación 6 de quickstart.md) en
      `backend/tests/integration/asignacion-concurrente.test.js`

### Implementation for User Story 2

- [X] T021 [P] [US2] Implementar `listarDisponibles()` (recorridos sin flete asignado)
      y `listarFletesDisponibles()` en `backend/src/db/centralRepository.js` (depende
      de T005; comparte archivo con T012)
- [X] T022 [US2] Implementar `asignarRecorrido(recorridoId, fleteId)`, invocando el
      package `CENTRAL_API.asignar_recorrido` de forma atómica (research.md §6) en
      `backend/src/db/centralRepository.js` (depende de T021; comparte archivo)
- [X] T023 [US2] Completar el package PL/SQL `CENTRAL_API` (spec + body) con
      `asignar_recorrido`/`reasignar_recorrido` en `backend/sql/central_api.pks.sql` y
      `backend/sql/central_api.pkb.sql` (depende de T004)
- [X] T024 [US2] Implementar los handlers `GET .../disponibles`,
      `GET .../fletes/disponibles` y `POST .../:id/asignar` en
      `backend/src/routes/central.js` (depende de T013, T021, T022, T023; comparte
      archivo)
- [X] T025 [P] [US2] Implementar componente `AsignacionForm` (elegir un recorrido
      disponible y un flete disponible, confirmar) en
      `central/src/components/AsignacionForm.jsx`
- [X] T026 [US2] Integrar `AsignacionForm` en `central/src/main.jsx`, mostrando el
      enlace único generado tras confirmar la asignación (depende de T016, T025)

**Checkpoint**: User Stories 1 y 2 funcionan de forma independiente

---

## Phase 5: User Story 3 - Ver el detalle de un recorrido (Priority: P2)

**Goal**: El operador ve la lista ordenada completa de puntos de un recorrido, su
estado individual y la línea de tiempo de eventos.

**Independent Test**: Abrir el detalle de un recorrido con puntos en estados mixtos y
verificar que se listan todos en orden, con estado y eventos registrados (ver Escenario
de validación 3 de quickstart.md).

### Tests for User Story 3

- [X] T027 [P] [US3] Contract test para `GET /api/central/recorridos/:id` (200 con
      puntos ordenados y eventos; 404 si no existe, FR-008) en
      `backend/tests/contract/get-recorrido-detalle.test.js`

### Implementation for User Story 3

- [X] T028 [US3] Implementar `obtenerDetalle(recorridoId)` (puntos ordenados + eventos,
      reutilizando la misma vista de puntos que 001-chofer-recorrido) en
      `backend/src/db/centralRepository.js` (depende de T005; comparte archivo)
- [X] T029 [US3] Implementar handler `GET /api/central/recorridos/:id` en
      `backend/src/routes/central.js` (depende de T024, T028; comparte archivo)
- [X] T030 [P] [US3] Implementar componente `RecorridoDetalle` (puntos en orden, estado
      y eventos con timestamps) en `central/src/components/RecorridoDetalle.jsx`
- [X] T031 [US3] Integrar navegación al detalle desde `MonitorView` en
      `central/src/main.jsx` (depende de T016, T030)

**Checkpoint**: User Stories 1, 2 y 3 funcionan de forma independiente

---

## Phase 6: User Story 4 - Reasignar un recorrido activo a otro flete (Priority: P2)

**Goal**: El operador reasigna explícitamente un recorrido activo a un flete distinto,
conservando el estado ya registrado de los puntos.

**Independent Test**: Con un recorrido activo con algunos puntos completados,
reasignarlo a otro flete y verificar que los puntos completados conservan su estado y
que el enlace único anterior deja de ser válido (ver Escenario de validación 4 de
quickstart.md).

### Tests for User Story 4

- [X] T032 [P] [US4] Contract test para `POST /api/central/recorridos/:id/reasignar`
      (200 conserva estados de los puntos e invalida el token anterior; 409
      `flete_ocupado`, FR-009) en `backend/tests/contract/post-reasignar.test.js`
- [X] T033 [P] [US4] Integration test: tras reasignar, los puntos completados
      conservan su estado y el token anterior ya no resuelve el recorrido (Historia 4,
      escenario 2) en `backend/tests/integration/reasignar-recorrido.test.js`

### Implementation for User Story 4

- [X] T034 [US4] Implementar `reasignarRecorrido(recorridoId, nuevoFleteId)`,
      invocando `CENTRAL_API.reasignar_recorrido` en
      `backend/src/db/centralRepository.js` (depende de T022; comparte archivo)
- [X] T035 [US4] Implementar handler `POST /api/central/recorridos/:id/reasignar` en
      `backend/src/routes/central.js` (depende de T029, T034; comparte archivo)
- [X] T036 [P] [US4] Agregar acción "Reasignar" a `RecorridoDetalle` (elegir nuevo
      flete disponible, confirmar) en `central/src/components/RecorridoDetalle.jsx`
      (depende de T030)

**Checkpoint**: User Stories 1, 2, 3 y 4 funcionan de forma independiente

---

## Phase 7: User Story 5 - Consultar historial de recorridos finalizados (Priority: P3)

**Goal**: El operador consulta recorridos finalizados con su línea de tiempo completa
de eventos.

**Independent Test**: Con al menos un recorrido finalizado, buscarlo en el historial y
verificar que aparece con su línea de tiempo completa (ver Escenario de validación 3 de
quickstart.md, paso 3).

### Tests for User Story 5

- [X] T037 [P] [US5] Contract test para `GET /api/central/recorridos/historial` (200
      solo con recorridos `finalizado`, FR-010) en
      `backend/tests/contract/get-historial.test.js`

### Implementation for User Story 5

- [X] T038 [US5] Implementar `listarHistorial()` en
      `backend/src/db/centralRepository.js` (depende de T005; comparte archivo)
- [X] T039 [US5] Implementar handler `GET /api/central/recorridos/historial` en
      `backend/src/routes/central.js` (depende de T035, T038; comparte archivo)
- [X] T040 [P] [US5] Implementar componente `HistorialView` (lista de recorridos
      finalizados, reutiliza `RecorridoDetalle` para la línea de tiempo) en
      `central/src/components/HistorialView.jsx`
- [X] T041 [US5] Integrar `HistorialView` en `central/src/main.jsx` (depende de T016,
      T040)

**Checkpoint**: Las 5 historias de usuario funcionan de forma independiente

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validación final y detalles que afectan a varias historias

- [X] T042 [P] Implementar componente `FueraDeIframeNotice` (mensaje claro cuando la
      app no está embebida, FR-011/FR-012) en
      `central/src/components/FueraDeIframeNotice.jsx`, usando el guard de T009
- [X] T043 [P] Aplicar estilos de escritorio consistentes (layout no mobile-first,
      Principio III) en `central/src/`
- [X] T044 Ejecutar manualmente el Escenario de validación 5 de quickstart.md (fuera
      del iframe de APEX, FR-011/FR-012) — verificado en el navegador: acceso directo
      muestra `FueraDeIframeNotice`; embebido en `<iframe>` renderiza el panel completo
- [X] T045 Ejecutar manualmente el Escenario de validación 6 de quickstart.md
      (asignación concurrente, FR-015) — cubierto por el integration test
      `backend/tests/integration/asignacion-concurrente.test.js` (más determinístico que
      una prueba manual con dos pestañas)
- [ ] T046 Ejecutar manualmente los Escenarios de validación 1 a 4 de quickstart.md de
      punta a punta — requiere una instancia Oracle real con `CENTRAL_API` desplegado
      (no disponible en este entorno); pendiente para cuando se confirme el esquema real
      (research.md §5)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato
- **Foundational (Phase 2)**: depende de Setup — bloquea todas las historias de usuario
- **User Stories (Phase 3-7)**: todas dependen de completar Foundational
  - Pueden avanzar en paralelo (si hay capacidad) o en orden de prioridad (US1 → US2 →
    US3 → US4 → US5)
- **Polish (Phase 8)**: depende de que las historias que se quieran entregar estén
  completas

### User Story Dependencies

- **US1 (P1)**: puede empezar tras Foundational — sin dependencia de otras historias
- **US2 (P1)**: puede empezar tras Foundational — comparte
  `backend/src/db/centralRepository.js` y `backend/src/routes/central.js` con US1/US3,
  pero es independientemente testeable
- **US3 (P2)**: puede empezar tras Foundational — depende de que existan recorridos
  activos (de US2) para probarse end-to-end, aunque su implementación (handler de
  detalle) es independiente
- **US4 (P2)**: puede empezar tras Foundational — reutiliza el mismo package
  `CENTRAL_API` que US2 (T022/T023), pero su implementación es independientemente
  testeable
- **US5 (P3)**: puede empezar tras Foundational — depende de que existan recorridos
  finalizados (de US1-US3) para probarse end-to-end, aunque su implementación es
  independiente

### Parallel Opportunities

- Todas las tareas [P] de Setup pueden correr en paralelo
- Todas las tareas [P] de Foundational pueden correr en paralelo
- Los tests [P] de cada historia pueden correr en paralelo entre sí
- Los componentes frontend [P] (`MonitorView`, `AsignacionForm`, `RecorridoDetalle`,
  `HistorialView`) pueden implementarse en paralelo si no comparten archivo

---

## Parallel Example: User Story 1

```bash
# Tests de la Historia 1 en paralelo:
Task: "Contract test GET /api/central/recorridos/activos en backend/tests/contract/get-recorridos-activos.test.js"
Task: "Integration test monitorear-recorridos en backend/tests/integration/monitorear-recorridos.test.js"

# Frontend de la Historia 1 en paralelo:
Task: "MonitorView en central/src/components/MonitorView.jsx"
Task: "polling helper en central/src/services/polling.js"
```

---

## Implementation Strategy

### MVP First (User Stories 1 y 2)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (bloquea todo lo demás)
3. Completar Phase 3: US1 (monitoreo en vivo) → validar de forma independiente
4. Completar Phase 4: US2 (asignar recorrido) → validar — en este punto el ciclo
   operativo mínimo (asignar + monitorear) ya es funcional (MVP)
5. Desplegar/demostrar

### Incremental Delivery

1. Setup + Foundational → base lista
2. US1 → probar de forma independiente → demo (monitoreo visible)
3. US2 → probar → demo (asignación funcional — MVP operativo)
4. US3 → probar → demo (detalle de recorrido)
5. US4 → probar → demo (reasignación ante imprevistos)
6. US5 → probar → demo (historial de auditoría)
7. Phase 8 (Polish) → validación manual completa vía quickstart.md

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes
- Las tareas T012/T021/T022/T028/T034/T038 comparten
  `backend/src/db/centralRepository.js`; las tareas T013/T024/T029/T035/T039 comparten
  `backend/src/routes/central.js`: no son [P] entre sí dentro de cada archivo, deben
  implementarse en secuencia
- Verificar que los tests fallan antes de implementar (si se sigue TDD estricto)
- Cada historia de usuario debe quedar completable y testeable de forma independiente
- Detenerse en cada checkpoint para validar la historia antes de continuar
