---

description: "Task list template for feature implementation"
---

# Tasks: App Chofer — Información de Recorrido y Estados de Viaje Guiados

**Input**: Design documents from `/specs/005-chofer-estados-viaje/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: incluidos — el proyecto ya tiene convención establecida de tests por capa (`node --test` en `backend/tests/{unit,contract,integration}`, `vitest` en `frontend/tests` y `central/tests`, ver plan.md § Testing); esta feature la sigue.

**Organization**: Tasks agrupadas por historia de usuario de spec.md (US1–US5, en orden de prioridad P1/P1/P2/P2/P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: A qué historia de usuario pertenece (US1–US5)
- Rutas de archivo exactas en cada descripción

## Path Conventions

Web app existente de 3 componentes (ver plan.md § Project Structure):
`backend/src/`, `backend/tests/`, `frontend/src/`, `frontend/tests/`, `central/src/`, `central/tests/`.

---

## Phase 1: Setup

**Purpose**: Sin proyecto/dependencias nuevas que inicializar (research.md: cero dependencias nuevas). Solo confirmar línea base antes de tocar código compartido.

- [ ] T001 Correr `cd backend && npm test`, `cd frontend && npm test`, `cd central && npm test` y confirmar que los tres suites pasan en verde antes de empezar (línea base pre-feature)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: cambios al modelo de datos compartido en `backend/src/state/integracionStore.js` que tocan tanto US1 (campos informativos + remito) como US2 (estado de viaje) en la misma función — deben aterrizar juntos para no generar dos ediciones concurrentes de `mergearPunto`/`upsertRecorridos`.

**⚠️ CRITICAL**: ningún trabajo de historia de usuario empieza hasta completar esta fase

- [ ] T002 En `backend/src/state/integracionStore.js`, extender `mergearPunto()` para aceptar y conservar `cliente`, `direccion`, `rangoHorario`, `notasEntrega` (string\|null) y `remitoIds` (string[], default `[]`) por punto, tal como llegan del payload de `sincronizar_recorrido` (ver data-model.md § PuntoEntrega)
- [ ] T003 En `backend/src/state/integracionStore.js`, extender `upsertRecorridos()`/`indexarRecorrido()` para inicializar en cada recorrido nuevo `viajeEstado: 'detenido'`, `puntoActivoId: null`, `ultimaOperacion: null` (preservar los valores existentes en upserts posteriores del mismo recorrido, igual que ya hace con `estado`/`token`, ver data-model.md § Recorrido)
- [ ] T004 [P] Actualizar `backend/tests/unit/integracion-store.test.js` con casos para T002/T003: upsert con campos informativos completos, con `remitoIds: []`/ausente, y con valores por defecto de `viajeEstado`/`puntoActivoId`/`ultimaOperacion` en un recorrido recién creado

**Checkpoint**: el store soporta el modelo de datos completo; las historias de usuario pueden empezar

---

## Phase 3: User Story 1 - Ver información completa del cliente en cada punto de entrega (Priority: P1) 🎯 MVP

**Goal**: el chofer ve cliente/dirección/rango horario/notas de entrega por punto; el/los remito_id nunca viajan al frontend del chofer, pero sí llegan a Central.

**Independent Test**: sincronizar un recorrido con esos 4 campos + `remitoIds` variados (incluyendo `[]`), abrir el enlace del chofer y verificar los 4 campos visibles y la ausencia total de `remitoIds` en la respuesta de red; verificar que Central sí recibe `remitoIds` en el detalle del recorrido.

### Tests for User Story 1

- [ ] T005 [P] [US1] Contract test en `backend/tests/contract/get-recorrido.test.js`: `GET /api/recorridos/:token` incluye `cliente`/`direccion`/`rangoHorario`/`notasEntrega` por punto y el JSON de respuesta NO contiene la clave `remitoIds` en ningún nivel
- [ ] T006 [P] [US1] Contract test en `backend/tests/contract/get-recorrido-detalle.test.js`: `GET /api/central/recorridos/:id` incluye `remitoIds` por punto (array, puede ser `[]`)
- [ ] T007 [P] [US1] Component test en `frontend/tests/components/DeliveryPointCard.test.jsx`: renderiza cliente/dirección/rango horario/notas cuando están presentes, omite con normalidad los campos ausentes, y no renderiza ningún remito aunque el objeto `punto` lo trajera

### Implementation for User Story 1

- [ ] T008 [US1] En `backend/src/routes/recorrido.js`, extender `serializePunto()` para incluir `cliente`, `direccion`, `rangoHorario`, `notasEntrega` — **sin** incluir `remitoIds` (FR-003)
- [ ] T009 [P] [US1] En `backend/src/state/integracionStore.js`, extender `serializarPuntosCentral()` para incluir `remitoIds` por punto (consumido por `obtenerDetalle`/`listarHistorial`, ver contracts/sincronizacion-oracle-central.md § 3)
- [ ] T010 [US1] En `frontend/src/components/DeliveryPointCard.jsx`, renderizar cliente/dirección/rango horario/notas de entrega en la tarjeta del punto, omitiendo con normalidad cualquier campo `null`/ausente
- [ ] T011 [P] [US1] Actualizar el comentario/doc de `DeliveryPointCard.jsx` (líneas 11-16 actuales) que describe el modelo de "marcado libre" — ya no aplica desde esta feature (se reemplaza en US2, pero el comentario de datos informativos se puede dejar preparado acá)

**Checkpoint**: US1 es demostrable de forma independiente (aunque el chofer todavía use el marcado libre existente de 001 hasta que aterrice US2)

---

## Phase 4: User Story 2 - Operar el recorrido mediante estados de viaje guiados (Priority: P1) 🎯 MVP

**Goal**: reemplazar el marcado libre por el ciclo guiado Detenido → (INICIAR) → Manejando → (LLEGUE) → Descargando → (DESCARGA COMPLETA) → Detenido, con gating server-side, y exponer `viajeEstado`/`puntoActivoId` a Central.

**Independent Test**: con un recorrido de varios puntos pendientes, ejecutar el ciclo completo sobre el primer punto y verificar en cada paso qué botón está disponible; confirmar que Central ve el `viajeEstado`/punto activo actualizado sin recargar (polling de 5s).

### Tests for User Story 2

- [ ] T012 [P] [US2] Contract test nuevo en `backend/tests/contract/post-viaje.test.js`: `POST /viaje/iniciar` (200 sobre `detenido`→`manejando`, 409 si no es `detenido` o no hay pendientes), `POST /viaje/llegue` (200 sobre `manejando`→`descargando` + marca arribo, 409 si no es `manejando`), `POST /viaje/descarga-completa` (200 sobre `descargando`→`detenido` + marca descarga, 409 si no es `descargando`)
- [ ] T013 [P] [US2] Integration test nuevo en `backend/tests/integration/viaje-estados-guiados.test.js`: ciclo completo INICIAR→LLEGUE→DESCARGA COMPLETA sobre 2 puntos consecutivos de un mismo recorrido, verificando que el segundo ciclo arranca con el punto correcto
- [ ] T014 [P] [US2] Actualizar `backend/tests/integration/central-cloud-monitoreo.test.js` para cubrir `viajeEstado`/`puntoActivoId` en `GET /api/central/recorridos/activos`
- [ ] T015 [P] [US2] Component test en `frontend/tests/components/RouteView.test.jsx`: en `detenido` muestra la lista completa; en `manejando`/`descargando` muestra solo el punto activo destacado y el resto desactivado/reducido
- [ ] T016 [P] [US2] Actualizar `frontend/tests/components/DeliveryPointCard.test.jsx`: botón INICIAR solo en el primer punto pendiente en `detenido`; botón LLEGUE solo si el punto es el activo en `manejando`; botón DESCARGA COMPLETA solo si es el activo en `descargando`; resto de puntos sin botón de acción y con clase/atributo de "reducido"

### Implementation for User Story 2

- [ ] T017 [US2] En `backend/src/state/integracionStore.js`, agregar mutador `iniciarViaje(token)`: valida `viajeEstado === 'detenido'` y existencia de pendientes, fija `puntoActivoId` al primer punto `pendiente` por `orden`, cambia `viajeEstado` a `'manejando'`; devuelve `{outcome: 'ok'|'conflict', ...}` (mismo patrón que `transicionarPunto`)
- [ ] T018 [US2] En `backend/src/state/integracionStore.js`, agregar mutador `registrarLlegue(token, ubicacion)`: valida `viajeEstado === 'manejando'`, reusa la lógica de `transicionarPunto`/`PUNTO_ESTADO_TRANSICION.arribo` sobre `puntoActivoId`, cambia `viajeEstado` a `'descargando'`
- [ ] T019 [US2] En `backend/src/state/integracionStore.js`, agregar mutador `registrarDescargaCompleta(token, ubicacion)`: valida `viajeEstado === 'descargando'`, reusa `transicionarPunto`/`PUNTO_ESTADO_TRANSICION.descarga` sobre `puntoActivoId`, cambia `viajeEstado` a `'detenido'` y limpia `puntoActivoId`
- [ ] T020 [US2] Crear `backend/src/routes/viaje.js` (`createViajeRouter(repository)`) con `POST /:token/viaje/iniciar`, `POST /:token/viaje/llegue`, `POST /:token/viaje/descarga-completa`, siguiendo el mismo formato de error `{error: '<código>'}` que `recorrido.js` (ver contracts/chofer-viaje-api.md)
- [ ] T021 [US2] Montar `createViajeRouter` en `backend/src/server.js` junto a `createRecorridoRouter` (`app.use("/api/recorridos", createViajeRouter(repository))`)
- [ ] T022 [US2] Extender `GET /api/recorridos/:token` en `backend/src/routes/recorrido.js` para incluir `recorrido.viajeEstado` y `recorrido.puntoActivoId` en la respuesta
- [ ] T023 [US2] En `backend/src/state/integracionStore.js`, extender `listarActivos()` para incluir `viajeEstado`/`puntoActivoId` (FR-021)
- [ ] T024 [US2] En `frontend/src/services/api.js`, agregar `iniciarViaje(token)`, `marcarLlegue(token)`, `marcarDescargaCompleta(token)` (mismo patrón fetch + manejo de `ApiError`/cola offline que `marcarArribo`/`marcarDescarga`)
- [ ] T025 [US2] En `frontend/src/main.jsx`, agregar estado `viajeEstado`/`puntoActivoId` (leídos de `recorrido.recorrido` al cargar) y handlers `handleIniciar`/`handleLlegue`/`handleDescargaCompleta` reusando el patrón optimista + resync-en-409 de `ejecutarAccion`
- [ ] T026 [US2] Reescribir `frontend/src/components/RouteView.jsx`: en `detenido` renderiza la lista completa de pendientes; en `manejando`/`descargando` renderiza el punto activo destacado y el resto de pendientes en una lista secundaria reducida/deshabilitada
- [ ] T027 [US2] Reescribir `frontend/src/components/DeliveryPointCard.jsx`: reemplazar los botones de marcado libre (líneas 37-47 actuales) por botones condicionados a `viajeEstado`/si el punto es el activo (INICIAR/LLEGUE/DESCARGA COMPLETA), agregando una variante visual "reducida" para puntos no activos en `manejando`/`descargando`
- [ ] T028 [P] [US2] En `central/src/components/MonitorView.jsx`, agregar columna/badge con `viajeEstado` y el `id`/posición del punto activo por recorrido

**Checkpoint**: US1 + US2 juntas ya son el flujo guiado completo y demostrable (MVP de la feature)

---

## Phase 5: User Story 3 - Priorizar el próximo punto de entrega con "IR PRIMERO" (Priority: P2)

**Goal**: en `detenido`, el chofer puede mover cualquier punto pendiente (salvo el primero) al frente; el reordenamiento persiste como orden autoritativo y sobrevive a un re-push de Oracle con el orden viejo.

**Independent Test**: con 3+ puntos pendientes en `detenido`, tocar IR PRIMERO sobre el tercero, verificar que pasa a mostrarse primero con INICIAR, y que un `POST /api/integracion/recorridos` posterior con el orden original no lo revierte hasta que `GET /api/integracion/estado` haya sido leído.

**Depends on**: US2 (necesita `viajeEstado === 'detenido'` y la lista de pendientes ya renderizada).

### Tests for User Story 3

- [ ] T029 [P] [US3] Contract test en `backend/tests/contract/post-viaje.test.js`: `POST /viaje/ir-primero` (200 reordena, 404 si `puntoId` no existe, 409 si no está `detenido`, si `puntoId` ya es el primero, si `puntoId` no está `pendiente`, o si solo queda un punto pendiente)
- [ ] T030 [P] [US3] Integration test en `backend/tests/integration/viaje-estados-guiados.test.js` (o archivo nuevo `viaje-ir-primero.test.js`): IR PRIMERO seguido de un `POST /api/integracion/recorridos` con el orden viejo → el orden fijado por el chofer se conserva; tras un `GET /api/integracion/estado` para ese recorrido, un push posterior con orden viejo si puede volver a pisarlo
- [ ] T031 [P] [US3] Contract test en `backend/tests/contract/integracion-endpoints.test.js` (o `integracion-estado-paginacion.test.js`): `GET /api/integracion/estado` incluye `orden` por punto
- [ ] T032 [P] [US3] Component test en `frontend/tests/components/DeliveryPointCard.test.jsx`: botón IR PRIMERO visible solo en `detenido`, solo sobre puntos pendientes distintos del primero, ausente cuando solo queda un punto pendiente

### Implementation for User Story 3

- [ ] T033 [US3] En `backend/src/state/integracionStore.js`, agregar el campo `ultimaOperacion` (ver data-model.md) como registro genérico set por cualquier mutador de viaje, y una función `marcarSincronizadaSiCorresponde(recorrido)` invocada desde el punto donde se sirve `GET /api/integracion/estado`
- [ ] T034 [US3] En `backend/src/state/integracionStore.js`, agregar mutador `moverPrimero(token, puntoId)`: valida `viajeEstado === 'detenido'`, `puntoId` pendiente y distinto del primero, reasigna `orden` entre los puntos `pendiente` (el elegido pasa a ser el menor `orden` pendiente), guarda `ultimaOperacion = {tipo: 'ir-primero', ordenPrevio, sincronizada: false, en}`
- [ ] T035 [US3] En `backend/src/state/integracionStore.js`, extender `mergearPunto()`/`upsertRecorridos()` para NO sobrescribir `orden` de puntos `pendiente` cuando `recorrido.ultimaOperacion?.tipo === 'ir-primero' && !recorrido.ultimaOperacion.sincronizada` (research.md, Decisión 4)
- [ ] T036 [US3] Agregar `POST /:token/viaje/ir-primero` en `backend/src/routes/viaje.js` (T020)
- [ ] T037 [US3] En `backend/src/routes/integracion.js`, extender `serializarEstado()` para incluir `orden` por punto, y llamar a `marcarSincronizadaSiCorresponde()` (T033) para cada recorrido servido en la respuesta de `GET /estado` (research.md, Decisión 3 y 5)
- [ ] T038 [US3] En `frontend/src/services/api.js`, agregar `irPrimero(token, puntoId)`
- [ ] T039 [US3] En `frontend/src/main.jsx`, agregar handler `handleIrPrimero(puntoId)` (mismo patrón optimista + resync-en-409)
- [ ] T040 [US3] En `frontend/src/components/DeliveryPointCard.jsx`, agregar el botón IR PRIMERO condicionado a `viajeEstado === 'detenido'` y a no ser el primer punto pendiente

**Checkpoint**: US1 + US2 + US3 funcionales; el chofer puede reordenar su próximo destino

---

## Phase 6: User Story 4 - Cancelar/deshacer la última operación (Priority: P2)

**Goal**: botón CANCELAR disponible en cada estado de viaje, que revierte la última operación (INICIAR/LLEGUE/DESCARGA COMPLETA/IR PRIMERO) mientras Oracle todavía no la haya leído vía `GET /estado`; para acciones aún en la cola offline, el descarte es 100% client-side.

**Independent Test**: tocar INICIAR y luego CANCELAR sin haber llamado a `GET /estado` → vuelve a `detenido` sin rastro del INICIAR; repetir tocando `GET /estado` de por medio → CANCELAR responde 409.

**Depends on**: US2 (opera sobre las transiciones que introduce) y US3 (reusa el mecanismo `ultimaOperacion`/`sincronizada` que esa historia introduce en T033).

### Tests for User Story 4

- [ ] T041 [P] [US4] Contract test en `backend/tests/contract/post-viaje.test.js`: `POST /viaje/cancelar` revierte INICIAR/LLEGUE/DESCARGA COMPLETA/IR PRIMERO cuando `ultimaOperacion.sincronizada === false`; devuelve `409 nada_para_cancelar` si no hay operación o ya está sincronizada
- [ ] T042 [P] [US4] Integration test en `backend/tests/integration/viaje-estados-guiados.test.js`: INICIAR → CANCELAR (vuelve a `detenido`); INICIAR → LLEGUE → `GET /estado` → CANCELAR devuelve 409; una segunda operación después de la primera hace que la primera ya no sea cancelable (FR-018)
- [ ] T043 [P] [US4] Test en `frontend/tests/services/offlineQueue.test.js` (si no existe, crear): cancelar una acción todavía en la cola offline la descarta sin enviarla a red

### Implementation for User Story 4

- [ ] T044 [US4] En `backend/src/state/integracionStore.js`, agregar `snapshotPrevio` a `ultimaOperacion` en cada mutador de viaje (`iniciarViaje`/`registrarLlegue`/`registrarDescargaCompleta` de T017-T019, y `moverPrimero` de T034 ya lo hace), reemplazando cualquier `ultimaOperacion` previa (FR-018)
- [ ] T045 [US4] En `backend/src/state/integracionStore.js`, agregar mutador `cancelarUltimaOperacion(token)`: valida `ultimaOperacion existe && !sincronizada`, restaura `viajeEstado`/`puntoActivoId`/campos del punto (o `orden`) desde `snapshotPrevio` según `ultimaOperacion.tipo`, limpia `ultimaOperacion`
- [ ] T046 [US4] Agregar `POST /:token/viaje/cancelar` en `backend/src/routes/viaje.js` (T020)
- [ ] T047 [US4] En `frontend/src/services/offlineQueue.js`, agregar función para descartar (sin enviar) el ítem encolado más reciente de un tipo/token dado, dado su `id` de cola
- [ ] T048 [US4] En `frontend/src/services/api.js`, agregar `cancelarUltimaOperacion(token)`, y exponer desde cada llamada de viaje (`iniciarViaje`/`marcarLlegue`/`marcarDescargaCompleta`/`irPrimero`) el `id` de cola cuando la acción quedó encolada offline (para que CANCELAR pueda descartarla, T047)
- [ ] T049 [US4] En `frontend/src/main.jsx`, agregar estado "última operación pendiente" (tipo + si está encolada offline o en tránsito) y handler `handleCancelar`: si está encolada offline, descarta vía T047 y revierte estado local; si no, llama a `cancelarUltimaOperacion` y aplica la respuesta (o ignora un 409, dejando el estado actual)
- [ ] T050 [US4] En `frontend/src/components/RouteView.jsx` (o un componente nuevo `EstadoViajeBanner.jsx`), agregar el botón CANCELAR visible en los tres estados de viaje cuando hay una última operación disponible para revertir, oculto/deshabilitado en caso contrario (FR-019)

**Checkpoint**: US1–US4 funcionales; el chofer puede corregir toques accidentales

---

## Phase 7: User Story 5 - Finalizar el recorrido (Priority: P3)

**Goal**: cuando no quedan puntos pendientes, mostrar FINALIZAR en vez de la lista, con confirmación visible al tocarlo.

**Independent Test**: completar todos los puntos de un recorrido de prueba y verificar que en `detenido` aparece FINALIZAR en lugar de la lista; al tocarlo, se muestra la confirmación.

**Depends on**: US2 (usa `viajeEstado === 'detenido'` y el conteo de pendientes ya expuesto por 001-chofer-recorrido).

### Tests for User Story 5

- [ ] T051 [P] [US5] Component test en `frontend/tests/components/RouteView.test.jsx`: con `progreso.pendientes === 0` y `viajeEstado === 'detenido'`, muestra el botón FINALIZAR en lugar de la lista; al hacer click, muestra la confirmación

### Implementation for User Story 5

- [ ] T052 [US5] En `frontend/src/components/RouteView.jsx`, agregar el botón FINALIZAR (visible cuando `progreso.pendientes === 0 && viajeEstado === 'detenido'`) y el mensaje de confirmación al tocarlo — puramente client-side, sin llamada nueva al backend (research.md, Decisión 2; el recorrido ya queda `finalizado` por la regla derivada existente de 001-chofer-recorrido)

**Checkpoint**: las 5 historias de usuario funcionales — feature completa

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: mejoras transversales tras completar las historias que se quieran entregar

- [ ] T053 [P] Actualizar `specs/001-chofer-recorrido/data-model.md` y `specs/001-chofer-recorrido/contracts/chofer-api.md` con una nota de "superseded por 005-chofer-estados-viaje" en las secciones de marcado libre, sin borrar el histórico
- [ ] T054 [P] Revisar `frontend/src/styles.css` para el tamaño reducido de puntos no activos (FR-008) y la variante visual del botón CANCELAR
- [ ] T055 Correr `quickstart.md` completo de punta a punta (los 6 escenarios) contra un backend local con datos de prueba
- [ ] T056 [P] Documentar en `backend/sql/integracion-cloud/README.md` la dependencia externa señalada en research.md (Decisión 4): el proceso Oracle/APEX debe leer `orden` de `GET /api/integracion/estado` y persistirlo en `V_PUNTOS_ENTREGA.ORDEN` antes de su próximo `sincronizar_recorrido`, y los 5 campos nuevos que `sincronizar_recorrido` debe empezar a enviar (`cliente`/`direccion`/`rangoHorario`/`notasEntrega`/`remitoIds`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias
- **Foundational (Phase 2)**: depende de Setup — bloquea las 5 historias
- **US1 (Phase 3)**: depende solo de Foundational — 100% independiente del resto
- **US2 (Phase 4)**: depende solo de Foundational — independiente de US1 a nivel de código (comparten `serializePunto`/`GET /:token`, pero son ediciones no conflictivas del mismo archivo)
- **US3 (Phase 5)**: depende de US2 (usa `viajeEstado === 'detenido'` y `POST /viaje/*` ya existente)
- **US4 (Phase 6)**: depende de US2 (revierte sus transiciones) **y de US3** (reutiliza el mecanismo `ultimaOperacion.sincronizada` introducido en T033)
- **US5 (Phase 7)**: depende de US2 (`viajeEstado`/progreso)
- **Polish (Phase 8)**: depende de las historias que se quieran entregar

### Parallel Opportunities

- T004 puede correr en paralelo con el resto de Foundational una vez que T002/T003 aterrizan (mismo archivo, secuencial entre sí)
- US1 (Phase 3) completa puede desarrollarse en paralelo con US2 (Phase 4) por dos personas distintas — tocan `serializePunto`/`DeliveryPointCard.jsx` en zonas no solapadas (campos informativos vs. botones de acción), coordinar el merge
- Dentro de cada fase, todas las tareas marcadas [P] (tests, y algunos módulos de implementación en archivos distintos) son paralelizables entre sí

---

## Parallel Example: User Story 2

```bash
# Tests de US2 en paralelo (archivos distintos):
Task: "Contract test en backend/tests/contract/post-viaje.test.js"
Task: "Integration test en backend/tests/integration/viaje-estados-guiados.test.js"
Task: "Component test en frontend/tests/components/RouteView.test.jsx"
Task: "Component test en frontend/tests/components/DeliveryPointCard.test.jsx"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Completar Phase 1 (Setup) y Phase 2 (Foundational)
2. Completar Phase 3 (US1) y Phase 4 (US2) — juntas son el MVP: información visible + flujo guiado completo
3. **Validar**: correr el Escenario 1 y 2 de quickstart.md
4. Deploy/demo si está listo

### Incremental Delivery

1. Setup + Foundational → base lista
2. US1 + US2 → MVP (información + flujo guiado) → validar → deploy
3. US3 (IR PRIMERO) → validar Escenario 3 de quickstart.md → deploy
4. US4 (CANCELAR) → validar Escenario 4 → deploy
5. US5 (FINALIZAR) → validar Escenario 5 → deploy
6. Polish → validar Escenario 6 (Central) + limpieza

---

## Notes

- `[P]` = archivos distintos, sin dependencias pendientes entre sí
- Cada historia de usuario debe quedar completable y testeable de forma independiente, salvo las dependencias explícitas anotadas arriba (US3→US2, US4→US2+US3, US5→US2), que son reales (comparten el mismo `viajeEstado`/mecanismo de sincronización, no artificiales)
- Verificar que los tests fallan antes de implementar
- Commitear después de cada tarea o grupo lógico
- Parar en cada checkpoint para validar la historia de forma independiente
