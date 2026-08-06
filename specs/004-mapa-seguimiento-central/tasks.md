# Tasks: Central — Mapa de Seguimiento de Fletes

**Input**: Design documents from `/specs/004-mapa-seguimiento-central/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Se incluyen tareas de testing porque `plan.md` define estrategia explícita de pruebas (función pura testeada sin Leaflet + mock de `react-leaflet`, contract test de backend).

**Organization**: Tareas agrupadas por historia de usuario para implementación incremental e independiente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede ejecutarse en paralelo (archivos distintos, sin dependencia pendiente)
- **[Story]**: etiqueta de historia (`[US1]`, `[US2]`) en fases de historias
- Todas las tareas incluyen rutas de archivo concretas

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Instalar y preparar la biblioteca de mapas

- [X] T001 Agregar dependencias `leaflet` y `react-leaflet` (compatible con React 18) en `central/package.json`
- [X] T002 [P] Importar `leaflet/dist/leaflet.css` en `central/src/main.jsx` — se usó `CircleMarker` en vez de `Marker`/`Icon` por defecto (más simple, sin assets de ícono que parchear; ver nota de implementación)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Base compartida por ambas historias

**⚠️ CRITICAL**: Ninguna historia debe cerrarse sin esta fase completa

- [X] T003 Crear el componente base `central/src/components/MapaSeguimiento.jsx`: contenedor Leaflet (`MapContainer`/`TileLayer` sobre tiles públicos de OpenStreetMap, ver research.md Decisión 1) sin marcadores todavía, reutilizable por ambas historias
- [X] T004 Agregar alternancia lista/mapa (toggle) en `central/src/main.jsx`, preservando qué recorrido está seleccionado al cambiar de vista (FR-004)

**Checkpoint**: Mapa base vacío renderiza y el toggle lista/mapa funciona; listo para US1/US2

---

## Phase 3: User Story 1 - Ver en un mapa la ubicación de todos los fletes activos (Priority: P1) 🎯 MVP

**Goal**: Un marcador por flete activo con ubicación conocida, distinguiendo visualmente reciente/no-reciente, actualizado en vivo sin recargar

**Independent Test**: Con dos o más recorridos activos con ubicaciones conocidas (una reciente, una antigua), abrir la vista de mapa y verificar que aparece un marcador por flete en su posición correcta, distinguiendo cuál es reciente y cuál no

### Tests for User Story 1

- [X] T005 [P] [US1] Test unitario de `construirMarcadoresFlete` (filtra fletes sin ubicación FR-007, distingue reciente/no-reciente FR-003) en `central/tests/components/marcadores.test.js`
- [X] T006 [P] [US1] Test de `MapaSeguimiento` (mockeando `react-leaflet`) verificando que recibe un marcador por flete con ubicación y ninguno para los que no tienen, en `central/tests/components/MapaSeguimiento.test.jsx`

### Implementation for User Story 1

- [X] T007 [US1] Implementar `construirMarcadoresFlete(recorridosActivos)` en `central/src/services/marcadores.js`
- [X] T008 [US1] Extender `MapaSeguimiento.jsx` para recibir y dibujar `marcadoresFlete` con estilo distinto para reciente/no-reciente (FR-003)
- [X] T009 [US1] Conectar `MapaSeguimiento` en `central/src/main.jsx` con el estado `activos` ya mantenido por polling/MQTT (FR-002, mismo estado que ya usa `MonitorView`)
- [X] T010 [US1] Al seleccionar un marcador de flete, abrir el detalle de su recorrido (FR-005), reutilizando `abrirDetalle` ya existente en `central/src/main.jsx`
- [X] T011 [US1] Manejar fletes con ubicaciones muy próximas o coincidentes para que ningún marcador oculte a otro sin poder distinguirlos/seleccionarlos (FR-009) en `central/src/components/MapaSeguimiento.jsx`
- [X] T012 [US1] Mostrar mensaje claro cuando no hay recorridos activos, consistente con el mensaje ya existente en `MonitorView` (Edge Case de spec.md) en `central/src/components/MapaSeguimiento.jsx`

**Checkpoint**: US1 funcional y demostrable de forma independiente

---

## Phase 4: User Story 2 - Ver la ruta de un recorrido junto con la posición del flete (Priority: P2)

**Goal**: En el detalle de un recorrido, mostrar sus puntos de entrega ordenados con su estado y, si existe, la posición del flete

**Independent Test**: Abrir el detalle de un recorrido con puntos en estados mixtos y verificar que el mapa muestra cada punto en su posición fija con un indicador visual de su estado, además del marcador de posición del flete si existe

### Tests for User Story 2

- [X] T013 [P] [US2] Contract test verificando que `GET /api/central/recorridos/:id` incluye `lat`/`lon` por punto en `backend/tests/integration/central-cloud-monitoreo.test.js` (ver `contracts/central-map-api.md`)
- [X] T014 [P] [US2] Test unitario de `construirPuntosEnMapa` (mapea cada punto a su indicador visual de estado) en `central/tests/components/marcadores.test.js`
- [X] T015 [P] [US2] Test de `MapaSeguimiento` en modo detalle (puntos + marcador de flete) en `central/tests/components/MapaSeguimiento.test.jsx`

### Implementation for User Story 2

- [X] T016 [US2] Extender `serializarPuntosCentral` en `backend/src/state/integracionStore.js` para incluir `lat`/`lon` por punto (ver `contracts/central-map-api.md`)
- [X] T017 [US2] Implementar `construirPuntosEnMapa(puntos)` en `central/src/services/marcadores.js`
- [X] T018 [US2] Extender `MapaSeguimiento.jsx` para aceptar y dibujar `puntos`, indicando visualmente el estado de cada uno (pendiente/arribado/completado, FR-006)
- [X] T019 [US2] Integrar `MapaSeguimiento` en `central/src/components/RecorridoDetalle.jsx`, pasando los puntos del detalle y el marcador del flete si tiene ubicación conocida (derivado de `activos` en `main.jsx`, sin pedido de red adicional)

**Checkpoint**: US2 funcional e independiente

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validación de compatibilidad y criterios de éxito

- [X] T020 [P] Verificar compatibilidad de la vista de mapa embebida en iframe de Oracle APEX (Principio III), siguiendo Escenario 3 de `quickstart.md` — verificado en vivo 2026-08-06: Central cargada dentro de un `<iframe>` muestra el nav, la tabla y el mapa (`.leaflet-container` + tiles) correctamente, sin errores de consola nuevos.
- [ ] T021 Ejecutar validación de Success Criteria (SC-001 a SC-005) siguiendo `quickstart.md` y registrar evidencia

**Pendiente de esta fase** (no bloqueante, mismo criterio que 003-arquitectura-cloud-mqtt): T021 requiere un entorno con broker MQTT real y telemetría (para medir p95 de SC-002 y el % de éxito de SC-001, que no aplica directamente a esta feature pero SC-002/SC-004 sí heredan el mismo mecanismo de tiempo real) — no ejecutado en esta pasada. Verificación funcional ya cubierta: SC-001 (distinción visual reciente/no-reciente, tests T005/T006), SC-003 (1 click de marcador a detalle, test T006), SC-004 (iframe + acceso directo, T020), SC-005 (sin marcadores inventados, tests T005/T006). Falta evidencia cuantitativa de latencia en vivo (SC-002).

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1: puede iniciar de inmediato
- Phase 2: depende de Phase 1
- Phase 3 (US1) / Phase 4 (US2): dependen de Phase 2
- Phase 5: depende de completar US1 y US2

### User Story Dependencies

- US1 (P1): inicia tras Foundational; sin dependencia de otras historias
- US2 (P2): inicia tras Foundational; extiende el mismo componente `MapaSeguimiento.jsx` que US1 (T008/T018 tocan el mismo archivo, por eso T016-T019 son secuenciales entre sí y respecto a T008), pero es independientemente demostrable con el detalle de un solo recorrido

### Within Each User Story

- Tests primero (deben fallar antes de implementar)
- Función pura (`marcadores.js`) antes que el componente que la consume
- Componente antes que su integración en `main.jsx`/`RecorridoDetalle.jsx`
- Validación independiente al cierre de cada historia

## Parallel Opportunities

- Phase 1: T001, T002 pueden ejecutarse en paralelo
- US1: T005 y T006 en paralelo (tests); T011 y T012 pueden hacerse en paralelo entre sí una vez completo T008
- US2: T013, T014 y T015 en paralelo (tests, distintos archivos/capas)
- Phase 5: T020 en paralelo con T021

## Parallel Example: User Story 1

```bash
# Tests en paralelo
T005 central/tests/components/marcadores.test.js
T006 central/tests/components/MapaSeguimiento.test.jsx
```

## Implementation Strategy

### MVP First (US1)

1. Completar Phase 1 (Setup)
2. Completar Phase 2 (Foundational)
3. Completar Phase 3 (US1) — mapa general de fletes activos
4. Validar US1 de forma independiente (quickstart.md, Escenario 1)

### Incremental Delivery

1. US1 (mapa general de fletes activos)
2. US2 (puntos del recorrido + posición del flete en el detalle)
3. Polish + validación de Success Criteria por quickstart

### Format Validation

Todas las tareas siguen formato checklist estricto: `- [ ] T### [P?] [US?] Descripción con ruta de archivo`.
