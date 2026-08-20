---

description: "Task list for: Mapa Central Unificado"

---

# Tasks: Mapa Central Unificado

**Input**: Design documents from `specs/010-mapa-central-unificado/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/mapa-central-api.md](./contracts/mapa-central-api.md), [quickstart.md](./quickstart.md)

**Tests**: Se incluyen tareas de testing — mismo criterio que las features previas de este repo (004, 009): tests unitarios de las funciones puras de mapeo/color, tests de componente mockeando `react-leaflet`, y tests contract/integration de backend para los campos nuevos del contrato HTTP.

**Organization**: Tareas agrupadas por historia de usuario (spec.md) para permitir implementación y prueba independiente de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: a qué historia de usuario pertenece (US1-US4)
- Todas las rutas de archivo son relativas a la raíz del repo (`C:\AI\vickytruck`)

## Path Conventions

Proyecto web existente (ver plan.md → Project Structure): `backend/src`, `backend/tests`, `central/src`, `central/tests`. No se agregan proyectos ni carpetas de nivel superior nuevas.

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: extender el contrato de `GET /api/central/recorridos/activos` (y el upsert de Oracle que lo alimenta) con los campos que **todas** las historias de usuario necesitan leer: `puntos`, `puntoSalida`, `color` por recorrido, y `puntoSalidaDefault` a nivel de respuesta (data-model.md, contracts/mapa-central-api.md).

**⚠️ CRITICAL**: ninguna historia de usuario del frontend puede completarse (ni ser demostrable con datos reales) hasta que esta fase esté completa — todas leen del mismo endpoint extendido acá.

- [X] T001 [P] En `backend/src/state/integracionStore.js`, definir la constante `PUNTO_SALIDA_DEFAULT = { lat: -34.8097527, lon: -58.4574414 }` (research.md, Decisión 2)
- [X] T002 En `backend/src/state/integracionStore.js`, función `upsertRecorridos`: agregar el merge de los campos opcionales `puntoSalida` y `color` (mismo criterio que `fleteNombre` — `raw.puntoSalida ?? previo?.puntoSalida ?? null` y `raw.color ?? previo?.color ?? null`, topología fija que se re-sincroniza en cada push) (depende de T001 solo por ubicación en archivo, no por orden de ejecución)
- [X] T003 En `backend/src/state/integracionStore.js`, función `listarActivos()`: agregar `puntos: serializarPuntosCentral(r.puntos)`, `puntoSalida: r.puntoSalida ?? null` y `color: r.color ?? null` a cada recorrido devuelto (depende de T002)
- [X] T004 En `backend/src/state/integracionStore.js`, agregar el método `async obtenerPuntoSalidaDefault()` al objeto devuelto por `createIntegracionStore`, que retorna `PUNTO_SALIDA_DEFAULT` (depende de T001)
- [X] T005 En `backend/src/routes/central.js`, `GET /recorridos/activos`: pedir `repository.listarActivos()` y `repository.obtenerPuntoSalidaDefault()` en paralelo (`Promise.all`) y responder `{ recorridos, puntoSalidaDefault }` (depende de T003, T004)
- [X] T006 [P] En `backend/tests/helpers/inMemoryCentralRepository.js`, extender el seed/`listarActivos()` para aceptar y devolver `puntos` (vía la ya existente `serializarPuntos`), `puntoSalida`, `color` por recorrido, y agregar `async obtenerPuntoSalidaDefault()` (mismo valor fijo que T001, para que los contract tests puedan usarlo) — mantiene el mismo contrato que el store real (T003-T004)

### Tests para Foundational

- [X] T007 [P] Test unitario en `backend/tests/unit/integracion-store-central.test.js`: `listarActivos()` incluye `puntos`/`puntoSalida`/`color` por recorrido y `obtenerPuntoSalidaDefault()` devuelve la constante fija; un re-push sin `puntoSalida`/`color` preserva el valor previo (mismo criterio que `fleteNombre`)
- [X] T008 [P] Contract test en `backend/tests/contract/get-recorridos-activos.test.js`: la respuesta incluye `puntoSalidaDefault` siempre (incluso con `recorridos: []`), cada recorrido incluye `puntos` (con `lat`/`lon`/`cliente`), y `puntoSalida`/`color` son `null` salvo que el seed los incluya
- [X] T009 Integration test en `backend/tests/integration/central-cloud-monitoreo.test.js`: push de un recorrido vía `POST /api/integracion/recorridos` con `puntoSalida` y `color`, y verificar que `GET /api/central/recorridos/activos` los refleja tal cual (contracts/mapa-central-api.md, Cambio 3)

**Checkpoint**: `GET /api/central/recorridos/activos` expone todo lo que el frontend necesita — arranca el trabajo de las 4 historias de usuario.

---

## Phase 2: User Story 1 - Vista consolidada de todos los recorridos activos, por color (Priority: P1) 🎯 MVP

**Goal**: la vista de Mapa general muestra, sin seleccionar ningún recorrido, los puntos de entrega y la posición de flete de **todos** los recorridos activos a la vez, cada flete con un color propio y consistente entre sus marcadores.

**Independent Test**: con 3 recorridos activos de fletes distintos (con puntos de entrega, y al menos uno sin `ultimaUbicacion` todavía), abrir la vista de Mapa y verificar que aparecen todos los puntos y posiciones sin seleccionar nada primero, que cada flete tiene un color propio no repetido, y que hacer click en una posición de flete sigue abriendo su Detalle.

### Tests for User Story 1

- [X] T010 [P] [US1] Test unitario de `asignarColorPorFlete` (paleta fija por posición del flete en la lista; usa `recorrido.color` explícito con prioridad absoluta cuando está presente; recicla la paleta si hay más fletes que colores) en `central/tests/components/marcadores.test.js`
- [X] T011 [P] [US1] Test unitario de `construirMarcadoresMapaUnificado` (un marcador `tipo: "flete"` por recorrido con `ultimaUbicacion`, uno `tipo: "punto"` por cada punto con `lat`/`lon` válidas, todos con el color resuelto; un recorrido sin `ultimaUbicacion` no genera marcador de flete pero sí sus puntos — FR-007/004) en `central/tests/components/marcadores.test.js`
- [X] T012 [P] [US1] Test de `MapaSeguimiento` (mockeando `react-leaflet`, mismo patrón que `MapaSeguimiento.test.jsx` existente) verificando que recibe y dibuja los marcadores de varios recorridos simultáneamente, con colores distintos entre sí, en `central/tests/components/MapaSeguimiento.test.jsx`

### Implementation for User Story 1

- [X] T013 [US1] Implementar `asignarColorPorFlete(recorridos)` en `central/src/services/marcadores.js`: paleta fija de 10 colores, asignación determinística por posición del flete en la lista recibida, sin persistir estado entre llamadas (research.md, Decisión 3); usa `recorrido.color` tal cual si está presente (Decisión 3b) (depende de T010 para poder validar contra el test)
- [X] T014 [US1] Implementar `construirMarcadoresMapaUnificado(recorridosActivos)` en `central/src/services/marcadores.js`: combina, para cada recorrido, un marcador `tipo: "flete"` (si tiene `ultimaUbicacion`) y un marcador `tipo: "punto"` por cada punto con coordenadas válidas, todos con el color de `asignarColorPorFlete` (depende de T013)
- [X] T015 [US1] Extender `central/src/components/MapaSeguimiento.jsx` para aceptar la lista de marcadores unificados de T014 (nueva prop, sin romper las props `marcadoresFlete`/`puntos` ya usadas por el mapa embebido en Detalle) y dibujar todos los recorridos activos a la vez con su color (depende de T014)
- [X] T016 [US1] En `central/src/main.jsx`, sección `vista === "mapa"`: pasar `activos` (ya con `puntos` desde Foundational) a `MapaSeguimiento` vía la nueva prop de T015, en vez de solo `construirMarcadoresFlete(activos)` (depende de T015, T003)
- [X] T017 [US1] Confirmar que el click sobre un marcador de posición de flete sigue abriendo el Detalle de su recorrido (`onSeleccionarFlete`/`abrirDetalle`, ya existentes) tras el cambio de props de T015-T016 (FR-007)

**Checkpoint**: US1 funcional y demostrable de forma independiente — 🎯 MVP de esta feature.

---

## Phase 3: User Story 2 - Ícono distinto para el flete/chofer (Priority: P2)

**Goal**: el marcador de posición de flete usa una forma distinta a la de los marcadores de punto de entrega, sin depender del color.

**Independent Test**: con un recorrido activo con posición de flete y puntos visibles, verificar que el marcador de flete tiene una forma distinta a la de los puntos, aun compartiendo color; y que todas las posiciones de flete entre sí (y todos los puntos entre sí) comparten la misma familia de ícono.

### Tests for User Story 2

- [X] T018 [P] [US2] Test de `MapaSeguimiento` verificando que el marcador `tipo: "flete"` renderiza con un elemento/clase distinto al de `tipo: "punto"` (independiente del color) en `central/tests/components/MapaSeguimiento.test.jsx`

### Implementation for User Story 2

- [X] T019 [US2] En `central/src/components/MapaSeguimiento.jsx`, dar al marcador `tipo: "flete"` una forma/ícono propio (p. ej. `L.divIcon` con forma de vehículo) distinto del `CircleMarker` ya usado para `tipo: "punto"` (depende de T015 — mismo componente que US1; secuencial, no paralelo, por tocar el mismo archivo)

**Checkpoint**: US1 + US2 funcionan juntas — flete y puntos se distinguen por color (identidad) y por forma (rol) a la vez.

---

## Phase 4: User Story 3 - Nombre del cliente al pasar el mouse (Priority: P2)

**Goal**: pasar el mouse sobre un punto de entrega muestra el nombre del cliente (o "Punto {orden}" si falta); pasar el mouse sobre una posición de flete identifica el flete/recorrido y si su ubicación es reciente o no (FR-005, research.md Decisión 5) — todo sin click.

**Independent Test**: con puntos con y sin cliente informado, y con fletes con ubicación reciente y no reciente, pasar el mouse sobre cada marcador y verificar el texto mostrado en cada caso, sin haber hecho ningún click.

### Tests for User Story 3

- [X] T020 [P] [US3] Test de `MapaSeguimiento` verificando el texto de hover de un punto con cliente informado, de uno sin cliente ("Punto {orden}"), y de una posición de flete (identifica el flete y si es reciente/no reciente) en `central/tests/components/MapaSeguimiento.test.jsx`

### Implementation for User Story 3

- [X] T021 [US3] En `central/src/components/MapaSeguimiento.jsx`, reemplazar el `Popup` (click) por `Tooltip` (hover, `permanent={false}`) en los marcadores de punto y de flete, manteniendo el `eventHandlers.click` de la posición de flete para abrir el Detalle (research.md, Decisión 4) (depende de T019 — mismo archivo, secuencial)
- [X] T022 [US3] Construir el texto de hover en `construirMarcadoresMapaUnificado` (`central/src/services/marcadores.js`): nombre de cliente o `"Punto {orden}"` para `tipo: "punto"`; nombre de flete/recorrido + "ubicación reciente"/"ubicación no reciente" para `tipo: "flete"` (depende de T014) — el texto se compone en `MapaSeguimiento.jsx` (T021) a partir de los campos (`cliente`/`orden`/`fleteNombre`/`reciente`) que `construirMarcadoresMapaUnificado` ya incluía desde T014; no hizo falta agregar un campo nuevo

**Checkpoint**: US1-US3 funcionan juntas — vista consolidada, con forma y texto de hover distinguiendo cada tipo de marcador.

---

## Phase 5: User Story 4 - Punto de salida siempre visible (Priority: P3)

**Goal**: el mapa muestra siempre el punto de salida por defecto (incluso sin recorridos activos); un recorrido con punto de salida propio distinto al predeterminado agrega, además, su propio marcador coloreado con el color de su flete.

**Independent Test**: sin recorridos activos, verificar que el punto de salida por defecto igual aparece; con recorridos activos que comparten ese punto, verificar que hay un único marcador compartido (no uno por recorrido); con un recorrido que trae `puntoSalida` propio, verificar que aparece un marcador adicional para ese origen.

### Tests for User Story 4

- [X] T023 [P] [US4] Test unitario de `construirMarcadorSalidaDefault`/extensión de `construirMarcadoresMapaUnificado` (un único marcador `tipo: "salidaDefault"` sin color, independientemente de cuántos recorridos activos compartan ese origen; un marcador `tipo: "salidaRecorrido"` por cada recorrido con `puntoSalida` propio, con el color de ese flete) en `central/tests/components/marcadores.test.js`
- [X] T024 [P] [US4] Test de `MapaSeguimiento` verificando que el punto de salida por defecto se muestra incluso con `marcadoresFlete`/`puntos` vacíos (sin caer en el estado vacío existente) en `central/tests/components/MapaSeguimiento.test.jsx`

### Implementation for User Story 4

- [X] T025 [US4] En `central/src/services/marcadores.js`, agregar la construcción de marcadores de punto de salida a `construirMarcadoresMapaUnificado` (o una función dedicada): un marcador `tipo: "salidaDefault"` por respuesta (nunca uno por recorrido) a partir de `puntoSalidaDefault`, y un marcador `tipo: "salidaRecorrido"` por cada recorrido con `puntoSalida` propio, coloreado con `asignarColorPorFlete` (depende de T013, T014)
- [X] T026 [US4] En `central/src/components/MapaSeguimiento.jsx`, dar al marcador `tipo: "salidaDefault"`/`"salidaRecorrido"` un ícono propio (p. ej. bandera/base), sin relación con la paleta de color de recorrido para `salidaDefault` (Clarifications de spec.md), y sin `eventHandlers.click` (Assumptions de spec.md — no abre ningún Detalle) (depende de T021 — mismo archivo, secuencial)
- [X] T027 [US4] En `central/src/components/MapaSeguimiento.jsx`, mostrar el punto de salida por defecto aun cuando no haya marcadores de flete/punto (ajustar la condición de estado vacío `hayDatos` para que no oculte el mapa completo cuando solo falta `puntoSalidaDefault` por dibujar) (FR-006/FR-007, depende de T026)
- [X] T028 [US4] En `central/src/main.jsx`, sección `vista === "mapa"`: pasar `puntoSalidaDefault` (de la respuesta de `listarActivos`/`GET /recorridos/activos`, Foundational) a `MapaSeguimiento` (depende de T005, T027) — `services/api.js` `listarActivos()` ahora devuelve `{ recorridos, puntoSalidaDefault }` en vez de solo el array (único call site, sin otros consumidores afectados)

**Checkpoint**: las 4 historias de usuario funcionan juntas — vista de Mapa consolidada, completa y demostrable de punta a punta.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: validación de compatibilidad y no regresión sobre el resto de la app.

- [X] T029 [P] Verificar que el mapa embebido en `RecorridoDetalle` (un solo recorrido, sin color por flete ni punto de salida) sigue funcionando sin cambios de comportamiento tras extender `MapaSeguimiento.jsx` (Assumptions de spec.md) — correr `central/tests/components/RecorridoDetalle.test.jsx` sin modificaciones — 11/11 verdes, sin cambios
- [X] T030 [P] Verificar compatibilidad de la vista de Mapa embebida en iframe de Oracle APEX (Principio III), siguiendo quickstart.md — verificado en vivo: Central embebida en un `<iframe>` de 480×700 muestra Monitoreo y Mapa (con los nuevos marcadores unificados) correctamente, sin errores de consola
- [X] T031 Ejecutar `quickstart.md` completo (US1-US4 + verificación de "sin pedidos de red adicionales") y registrar evidencia — verificado en vivo con backend real: colores distintos por flete (US1, capturas + inspección DOM), ícono de vehículo distinto del punto (US2), tooltip de hover con cliente/flete+recencia (US3, "Almacen Centro" confirmado), punto de salida por defecto visible incluso con 0 recorridos activos + marcador propio coloreado para un recorrido con `puntoSalida` (US4)
- [X] T032 Correr la suite completa (`backend: npm test`, `central: npm test`) como guardia de no-regresión (FR-007) — 165/165 backend + 77/77 central, todo verde

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 (Foundational): sin dependencias — puede iniciar de inmediato
- Phase 2 (US1): depende de Phase 1 completa
- Phase 3 (US2) / Phase 4 (US3) / Phase 5 (US4): dependen de Phase 1 y de Phase 2 (extienden el mismo `MapaSeguimiento.jsx`/`marcadores.js` que crea US1)
- Phase 6 (Polish): depende de completar US1-US4

### User Story Dependencies

- US1 (P1): inicia tras Foundational; sin dependencia de otras historias de usuario — es el MVP
- US2 (P2): inicia tras US1; extiende el mismo componente (`MapaSeguimiento.jsx`), por eso T019 es secuencial respecto a T015, no paralelo — pero es independientemente demostrable (icono distinto ya visible sin US3/US4)
- US3 (P2): inicia tras US1; también extiende `MapaSeguimiento.jsx`/`marcadores.js` (T021-T022 secuenciales respecto a T015/T014) — independientemente demostrable (hover ya funciona sin US2/US4)
- US4 (P3): inicia tras US1 y Foundational (necesita `puntoSalidaDefault`/`puntoSalida` del backend); extiende los mismos archivos — independientemente demostrable

### Within Each User Story

- Tests primero (deben fallar antes de implementar)
- Funciones puras (`marcadores.js`) antes que el componente que las consume (`MapaSeguimiento.jsx`)
- Componente antes que su integración en `main.jsx`
- Validación independiente al cierre de cada historia (Independent Test de spec.md)

## Parallel Opportunities

- Phase 1: T001 y T006 en paralelo (archivos distintos); T007-T009 en paralelo entre sí (tests de capas distintas)
- US1: T010, T011, T012 en paralelo (tests, antes de implementar)
- US2/US3/US4: los tests marcados [P] dentro de cada historia pueden correr en paralelo entre sí; la implementación es secuencial entre historias por tocar `MapaSeguimiento.jsx`/`marcadores.js` en común
- Phase 6: T029 y T030 en paralelo

## Parallel Example: User Story 1

```bash
# Tests en paralelo (antes de implementar)
T010 central/tests/components/marcadores.test.js (asignarColorPorFlete)
T011 central/tests/components/marcadores.test.js (construirMarcadoresMapaUnificado)
T012 central/tests/components/MapaSeguimiento.test.jsx
```

## Implementation Strategy

### MVP First (US1)

1. Completar Phase 1 (Foundational) — contrato de backend extendido
2. Completar Phase 2 (US1) — vista consolidada por color
3. Validar US1 de forma independiente (quickstart.md, sección 2)
4. Deploy/demo si está listo

### Incremental Delivery

1. Foundational → backend listo
2. US1 → vista consolidada por color (MVP)
3. US2 → ícono distinto de flete/chofer
4. US3 → nombre de cliente y estado de recencia al pasar el mouse
5. US4 → punto de salida siempre visible
6. Polish → no regresión (Detalle, iframe APEX) + validación completa de quickstart.md

### Format Validation

Todas las tareas siguen formato checklist estricto: `- [ ] T### [P?] [US?] Descripción con ruta de archivo`.
