---

description: "Task list template for feature implementation"
---

# Tasks: App Chofer — Recepción y Ejecución de Recorrido de Entregas

**Input**: Design documents from `/specs/001-chofer-recorrido/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Se incluyen tareas de test (contrato + integración/componentes), ya que
plan.md define explícitamente una estrategia de testing (`node --test`, `vitest` +
Testing Library) como parte del stack elegido para esta feature.

**Organization**: Las tareas están agrupadas por historia de usuario (spec.md) para
permitir implementación y prueba independiente de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1, US2, US3, US4)
- Se incluyen rutas de archivo exactas en cada descripción

## Path Conventions

Según plan.md (Web application — Option 2): `backend/src/`, `backend/tests/`,
`frontend/src/`, `frontend/tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicialización de los dos proyectos (backend, frontend)

- [X] T001 Crear estructura de directorios `backend/src/{db,routes}` y
      `backend/tests/{contract,integration}` per plan.md
- [X] T002 [P] Inicializar proyecto Node.js del backend: `backend/package.json`
      (`"type": "module"`, engines Node ≥20.12) con dependencias `express` y `oracledb`
- [X] T003 [P] Crear estructura de directorios `frontend/src/{components,services}` y
      `frontend/tests/components` per plan.md
- [X] T004 [P] Inicializar proyecto frontend con Vite + React 18 en `frontend/`
      (`frontend/package.json`, `frontend/vite.config.js`), con `vitest` +
      `@testing-library/react` + `@testing-library/jest-dom` como devDependencies
- [X] T005 [P] Configurar carga de variables de entorno de Oracle
      (`ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING`) vía
      `--env-file-if-exists=.env` en el script `start` de `backend/package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestructura común que las 4 historias de usuario necesitan antes de
poder implementarse

**⚠️ CRITICAL**: Ninguna historia de usuario puede empezar hasta completar esta fase

- [X] T006 Implementar pool de conexión Oracle (`oracledb.createPool`) en
      `backend/src/db/pool.js`
- [X] T007 Implementar repositorio de recorrido (resolver por token, listar puntos,
      actualizar estado de un punto, calcular progreso derivado) en
      `backend/src/db/recorridoRepository.js` (depende de T006)
- [X] T008 Implementar esqueleto del servidor HTTP con **Express** (app, middlewares
      base de JSON y manejo de errores), sin lógica de negocio todavía, en
      `backend/src/server.js` (depende de T006)
- [X] T009 [P] Implementar cliente API del frontend (fetch wrapper, base URL, parseo de
      `{ "error": "<código>" }`) en `frontend/src/services/api.js`
- [X] T010 [P] Implementar cola de reintento offline basada en `localStorage`
      (encolar, reintentar automáticamente al reconectar, evitar duplicados) en
      `frontend/src/services/offlineQueue.js`
- [X] T011 [P] Implementar helper de geolocalización best-effort
      (`getCurrentPosition` con timeout corto, no bloqueante) en
      `frontend/src/services/geolocation.js`

**Checkpoint**: Infraestructura lista — las historias de usuario pueden implementarse
(en paralelo si hay capacidad)

---

## Phase 3: User Story 1 - Ver el recorrido asignado (Priority: P1) 🎯 MVP

**Goal**: El chofer abre su enlace único y ve la lista ordenada de hasta 10 puntos de
entrega con su ubicación, sin login.

**Independent Test**: Asignar un recorrido de prueba con N puntos (N ≤ 10) y un token;
abrir el enlace y verificar que se listan los N puntos en orden con su ubicación, sin
pedir credenciales (ver Escenario de validación 1 de quickstart.md).

### Tests for User Story 1

- [X] T012 [P] [US1] Contract test para `GET /api/recorridos/:token` (200 con puntos
      ordenados; 404/410 con token inválido) en
      `backend/tests/contract/get-recorrido.test.js`
- [X] T013 [P] [US1] Integration test: resolver token válido devuelve el recorrido
      completo; token inválido no expone datos de otros recorridos (FR-012) en
      `backend/tests/integration/ver-recorrido.test.js`

### Implementation for User Story 1

- [X] T014 [US1] Implementar handler `GET /api/recorridos/:token` (incluye `progreso`
      derivado) en `backend/src/routes/recorrido.js` (depende de T007, T008)
- [X] T015 [US1] Conectar la ruta al servidor en `backend/src/server.js` (depende de
      T014)
- [X] T016 [P] [US1] Implementar componente `RouteView` (lista ordenada de puntos,
      "X de N", ubicación) en `frontend/src/components/RouteView.jsx`
- [X] T017 [P] [US1] Implementar componente `DeliveryPointCard` (muestra un punto y su
      estado) en `frontend/src/components/DeliveryPointCard.jsx`
- [X] T018 [US1] Implementar `frontend/src/main.jsx`: leer token de la URL, llamar a la
      API, manejar enlace inválido/expirado (FR-012) (depende de T009, T016, T017)
- [X] T019 [P] [US1] Component test: `RouteView` renderiza los puntos en el orden
      correcto en `frontend/tests/components/RouteView.test.jsx`

**Checkpoint**: User Story 1 funcional y verificable de forma independiente

---

## Phase 4: User Story 2 - Marcar arribo a un destino (Priority: P1)

**Goal**: El chofer marca "arribo" sobre cualquier punto pendiente, en cualquier orden.

**Independent Test**: Sobre un recorrido cargado, tocar "Llegué" en cualquier punto
pendiente (no necesariamente el primero) y verificar que pasa a "arribado" con marca de
tiempo, sin afectar otros puntos (ver Escenario de validación 2 de quickstart.md).

### Tests for User Story 2

- [X] T020 [P] [US2] Contract test para `POST .../puntos/:puntoId/arribo` (200 aplica
      transición; 200 idempotente si ya estaba arribado; 409 si ya completado) en
      `backend/tests/contract/post-arribo.test.js`
- [X] T021 [P] [US2] Integration test: marcar arribo sobre un punto no inicial de la
      lista funciona igual (marcado libre, no secuencial) en
      `backend/tests/integration/marcar-arribo.test.js`

### Implementation for User Story 2

- [X] T022 [US2] Implementar handler `POST .../puntos/:puntoId/arribo` con transición de
      estado idempotente (research.md §6) en `backend/src/routes/recorrido.js` (depende
      de T007; comparte archivo con T014)
- [X] T023 [US2] Conectar la ruta al servidor en `backend/src/server.js` (depende de
      T022)
- [X] T024 [US2] Agregar acción "Llegué" a `DeliveryPointCard` con actualización
      optimista de UI en `frontend/src/components/DeliveryPointCard.jsx` (depende de
      T017)
- [X] T025 [US2] Integrar `offlineQueue` y `geolocation` en la acción de arribo dentro de
      `frontend/src/services/api.js` (depende de T009, T010, T011)

**Checkpoint**: User Story 1 y 2 funcionan de forma independiente

---

## Phase 5: User Story 3 - Marcar descarga completada (Priority: P1)

**Goal**: El chofer marca "descarga completa" sobre un punto ya arribado, cerrando la
entrega.

**Independent Test**: Sobre un punto en estado "arribado", tocar "Descarga completa" y
verificar que pasa a "completado"; verificar que un punto "pendiente" no permite marcar
descarga (ver Escenario de validación 2 de quickstart.md).

### Tests for User Story 3

- [X] T026 [P] [US3] Contract test para `POST .../puntos/:puntoId/descarga` (200 aplica
      transición; 409 si el punto sigue "pendiente"; 409 si ya "completado") en
      `backend/tests/contract/post-descarga.test.js`
- [X] T027 [P] [US3] Integration test: flujo completo arribo → descarga y confirmación
      de recorrido finalizado cuando todos los puntos quedan completados (FR-009) en
      `backend/tests/integration/completar-recorrido.test.js`

### Implementation for User Story 3

- [X] T028 [US3] Implementar handler `POST .../puntos/:puntoId/descarga` (requiere
      estado previo "arribado", FR-007) en `backend/src/routes/recorrido.js` (depende de
      T007, T022; comparte archivo)
- [X] T029 [US3] Conectar la ruta al servidor en `backend/src/server.js` (depende de
      T028)
- [X] T030 [US3] Agregar acción "Descarga completa" a `DeliveryPointCard`, deshabilitada
      si el punto sigue "pendiente" en `frontend/src/components/DeliveryPointCard.jsx`
      (depende de T024)
- [X] T031 [US3] Mostrar confirmación de "recorrido finalizado" en `RouteView` cuando
      todos los puntos están "completado" (FR-009) en
      `frontend/src/components/RouteView.jsx` (depende de T016)

**Checkpoint**: User Stories 1, 2 y 3 funcionan de forma independiente — ciclo completo
de ejecución del recorrido (MVP de entrega)

---

## Phase 6: User Story 4 - Ver progreso general del recorrido (Priority: P2)

**Goal**: El chofer ve de un vistazo cuántos puntos están pendientes, arribados y
completados.

**Independent Test**: Con un recorrido en estado mixto, verificar que el resumen
numérico coincide con los conteos reales (ver Escenario de validación 3 de
quickstart.md).

### Implementation for User Story 4

- [X] T032 [P] [US4] Implementar componente `ProgressSummary` (conteo de
      pendientes/arribados/completados) en
      `frontend/src/components/ProgressSummary.jsx`
- [X] T033 [US4] Integrar `ProgressSummary` en la vista principal usando el campo
      `progreso` ya devuelto por `GET /api/recorridos/:token` en `frontend/src/main.jsx`
      (depende de T018, T032)
- [X] T034 [P] [US4] Component test: `ProgressSummary` refleja un estado mixto de
      conteos correctamente en `frontend/tests/components/ProgressSummary.test.jsx`

**Checkpoint**: Las 4 historias de usuario funcionan de forma independiente

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validación final y detalles que afectan a varias historias

- [X] T035 [P] Aplicar estilos mobile-first (controles táctiles grandes) de forma
      consistente en `frontend/src/components/`
- [ ] T036 Ejecutar manualmente el Escenario de validación 4 de quickstart.md (offline
      y reintento automático, FR-010)
- [ ] T037 Ejecutar manualmente el Escenario de validación 5 de quickstart.md (sin GPS
      disponible, FR-006)
- [X] T038 Ejecutar manualmente los Escenarios 1-3 de quickstart.md de punta a punta

---

## Phase 8: Reporte periódico de ubicación instantánea (FR-014 a FR-017)

**Contexto**: agregado en una clarificación posterior a la implementación original
(sesión de Clarifications sobre la posición del flete durante el tránsito). El backend
compartido (endpoint `POST /api/recorridos/:token/ubicacion` y el módulo en memoria) ya
se implementó como parte de 002-panel-control-central (research.md §8 de esa feature).
Esta fase agrega la mitad que faltaba: que la SPA del chofer efectivamente llame a ese
endpoint de forma periódica mientras el recorrido está activo.

**Goal**: mientras el chofer tiene un recorrido abierto, la app reporta su posición GPS
instantánea al backend a un intervalo configurable por el operador del backend (FR-014),
sin bloquear la interfaz ni encolar el reporte si falla (FR-017 — es un dato efímero, no
crítico como los eventos de arribo/descarga).

**Independent Test**: con un recorrido de prueba abierto y GPS disponible, verificar
(inspeccionando la red del navegador) que se hace un `POST .../ubicacion` al intervalo
indicado por el backend; con el GPS denegado, verificar que no se intenta el POST y la
app sigue funcionando con normalidad.

- [X] T039 [P] Implementar `frontend/src/services/ubicacionPeriodica.js`
      (`iniciarReportePeriodico(token, intervaloMs)`: usa `obtenerUbicacionBestEffort()`
      y hace `POST /api/recorridos/:token/ubicacion`; si no hay GPS disponible o falla
      la red, descarta ese reporte puntual sin encolar — FR-014, FR-017 — y devuelve una
      función para detener el temporizador)
- [X] T040 Exponer `intervaloUbicacionMs` (configurable vía
      `UBICACION_REPORTE_INTERVALO_MS`, default 60000 ms) dentro de `recorrido` en la
      respuesta de `GET /api/recorridos/:token` en `backend/src/routes/recorrido.js`
      (FR-014)
- [X] T041 Integrar `iniciarReportePeriodico` en `frontend/src/main.jsx`: arranca cuando
      hay un token válido, usando el `intervaloUbicacionMs` devuelto por el backend (con
      un default local si todavía no cargó); se detiene al desmontar (depende de T039,
      T040)
- [X] T042 [P] Service test: `ubicacionPeriodica.js` reporta al intervalo indicado, no
      llama a la API si no hay ubicación disponible, y la función de limpieza detiene el
      temporizador en `frontend/tests/services/ubicacionPeriodica.test.js`
- [X] T043 [P] Agregar `UBICACION_REPORTE_INTERVALO_MS` a `backend/.env.example`
      documentando su propósito (FR-014)

**Checkpoint**: el ciclo completo de FR-014 a FR-017 queda operativo de punta a punta —
el chofer reporta posición periódicamente, Central la lee vía memoria compartida
(002-panel-control-central).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato
- **Foundational (Phase 2)**: depende de Setup — bloquea todas las historias de usuario
- **User Stories (Phase 3-6)**: todas dependen de completar Foundational
  - Pueden avanzar en paralelo (si hay capacidad) o en orden de prioridad (US1 → US2 →
    US3 → US4)
- **Polish (Phase 7)**: depende de que las historias que se quieran entregar estén
  completas

### User Story Dependencies

- **US1 (P1)**: puede empezar tras Foundational — sin dependencia de otras historias
- **US2 (P1)**: puede empezar tras Foundational — comparte archivo
  `backend/src/routes/recorrido.js` con US1/US3 pero es independientemente testeable
- **US3 (P1)**: puede empezar tras Foundational — depende de que exista el estado
  "arribado" (de US2) para poder probarse end-to-end, aunque su implementación (handler
  de descarga) es independiente
- **US4 (P2)**: puede empezar tras Foundational — consume el campo `progreso` que ya
  expone el endpoint de US1

### Parallel Opportunities

- Todas las tareas [P] de Setup pueden correr en paralelo
- Todas las tareas [P] de Foundational pueden correr en paralelo
- Los tests [P] de cada historia pueden correr en paralelo entre sí
- Los componentes frontend [P] (`RouteView`, `DeliveryPointCard`, `ProgressSummary`)
  pueden implementarse en paralelo si no comparten archivo

---

## Parallel Example: User Story 1

```bash
# Tests de la Historia 1 en paralelo:
Task: "Contract test GET /api/recorridos/:token en backend/tests/contract/get-recorrido.test.js"
Task: "Integration test ver-recorrido en backend/tests/integration/ver-recorrido.test.js"

# Componentes de la Historia 1 en paralelo:
Task: "RouteView en frontend/src/components/RouteView.jsx"
Task: "DeliveryPointCard en frontend/src/components/DeliveryPointCard.jsx"
```

---

## Implementation Strategy

### MVP First (User Stories 1, 2 y 3)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (bloquea todo lo demás)
3. Completar Phase 3: US1 (ver recorrido) → validar de forma independiente
4. Completar Phase 4: US2 (marcar arribo) → validar
5. Completar Phase 5: US3 (marcar descarga) → validar — en este punto el ciclo completo
   de entrega ya es funcional (MVP operativo)
6. Desplegar/demostrar

### Incremental Delivery

1. Setup + Foundational → base lista
2. US1 → probar de forma independiente → demo (recorrido visible)
3. US2 → probar → demo (arribo funcional)
4. US3 → probar → demo (ciclo de entrega completo — MVP)
5. US4 → probar → demo (progreso visible, mejora de UX)
6. Phase 7 (Polish) → validación manual completa vía quickstart.md

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes
- Las tareas T014/T022/T028 comparten `backend/src/routes/recorrido.js`: no son [P]
  entre sí, deben implementarse en secuencia dentro de ese archivo
- Verificar que los tests fallan antes de implementar (si se sigue TDD estricto)
- Cada historia de usuario debe quedar completable y testeable de forma independiente
- Detenerse en cada checkpoint para validar la historia antes de continuar
