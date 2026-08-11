---

description: "Task list template for feature implementation"
---

# Tasks: Normalización del formato horario

**Input**: Design documents from `/specs/006-normalizar-formato-horario/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: incluidos — el proyecto ya tiene convención establecida de tests por capa (`node --test` en `backend/tests/{unit,contract,integration}`, `vitest` en `frontend/tests` y `central/tests`, ver plan.md § Testing); esta feature la sigue. Los cambios en `backend/sql/**/*.pkb.sql` no tienen infraestructura de test en este repo — se validan manualmente (ver Fase 6).

**Organization**: Tasks agrupadas por historia de usuario de spec.md (US1/US2 = P1, US3 = P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: A qué historia de usuario pertenece (US1, US2, US3)
- Rutas de archivo exactas en cada descripción

## Path Conventions

Web app existente de 3 componentes + paquetes PL/SQL de Oracle (ver plan.md § Project Structure):
`backend/src/`, `backend/tests/`, `backend/sql/`, `frontend/src/`, `frontend/tests/`, `central/src/`, `central/tests/`.

---

## Phase 1: Setup

**Purpose**: Sin proyecto/dependencias nuevas que inicializar (research.md: cero dependencias nuevas). Solo confirmar línea base antes de tocar código compartido.

- [ ] T001 Correr `cd backend && npm test`, `cd frontend && npm test`, `cd central && npm test` y confirmar que los tres suites pasan en verde antes de empezar (línea base pre-feature)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: el cambio de formato de intercambio (UTC `Z` → ISO 8601 local `-03:00`, research.md Decisión 1) es un cambio de contrato atómico entre backend, frontend, central y Oracle (contracts/formato-horario.md): si se despliega parcialmente, `leer_estado_puntos` en Oracle rompe al parsear un timestamp con offset que su máscara vieja no entiende. Todas las historias de usuario dependen de que exista `tiempo.js` (generación + formateo) en cada proyecto.

**⚠️ CRITICAL**: ningún trabajo de historia de usuario empieza hasta completar esta fase

### Módulo de tiempo (research.md Decisión 1, 2, 6)

- [ ] T002 [P] Crear `backend/src/util/tiempo.js` con `ahoraLocalIso(fecha = new Date())` (offset fijo `-180` min, sufijo `-03:00`, research.md Decisión 1) y `formatearHoraLocal(iso)` (`Intl.DateTimeFormat` con `timeZone: 'America/Argentina/Buenos_Aires'`, `hour12: false`, devuelve `HH:MM:SS`, research.md Decisión 2)
- [ ] T003 [P] Crear `frontend/src/services/tiempo.js` con las mismas dos funciones que T002 (duplicación deliberada, research.md Decisión 6 — no importar desde `backend/`)
- [ ] T004 [P] Crear `central/src/services/tiempo.js` con las mismas dos funciones que T002
- [ ] T005 [P] Crear `backend/tests/unit/tiempo.test.js`: `ahoraLocalIso` siempre termina en `-03:00` y nunca en `Z`; `formatearHoraLocal` devuelve `HH:MM:SS` de dos dígitos para un timestamp `-03:00` y para uno `Z` (caso histórico) representando el mismo instante real, con el resultado esperado igual en ambos casos
- [ ] T006 [P] Crear `frontend/tests/services/tiempo.test.js` con los mismos casos que T005
- [ ] T007 [P] Crear `central/tests/services/tiempo.test.js` con los mismos casos que T005

### Puntos de generación del wire format (JS)

- [ ] T008 En `backend/src/state/integracionStore.js`, reemplazar `new Date().toISOString()` por `ahoraLocalIso()` (importado de `util/tiempo.js`) en: `updatedAt` (líneas 128, 164), eventos de ubicación `en` (líneas 241, 263, 284, 371), y el timestamp de arribo/descarga en `transicionarPunto` (línea 492)
- [ ] T009 [P] En `backend/src/services/mqttBridge.js`, reemplazar el fallback `new Date().toISOString()` (línea 43) por `ahoraLocalIso()`
- [ ] T010 [P] En `backend/src/routes/recorrido.js`, reemplazar `new Date().toISOString()` (línea 129) por `ahoraLocalIso()`
- [ ] T011 [P] En `backend/src/db/ubicacionResolver.js`, en `resolverUbicacion` (línea 47), dejar de recalcular `en: new Date(fuente.en).toISOString()` (que hoy re-serializa a UTC `Z`, descartando el offset local del origen) — pasar `fuente.en` tal cual, sin re-formatear
- [ ] T012 [P] En `frontend/src/services/ubicacionMqtt.js`, reemplazar `new Date().toISOString()` (línea 51, origen real del timestamp de ubicación del chofer) por `ahoraLocalIso()` (importado de `services/tiempo.js`)
- [ ] T013 [P] En `central/src/services/mqttClient.js`, reemplazar el fallback `new Date().toISOString()` (línea 38) por `ahoraLocalIso()` (importado de `services/tiempo.js`)

### Aserciones de formato en tests de contrato existentes

- [ ] T014 [P] En `backend/tests/contract/post-arribo.test.js`, agregar caso: `arriboEn` en la respuesta matchea `/-03:00$/`, nunca `/Z$/`
- [ ] T015 [P] En `backend/tests/contract/post-descarga.test.js`, agregar caso: `descargaEn` matchea `/-03:00$/`
- [ ] T016 [P] En `backend/tests/contract/post-ubicacion.test.js`, agregar caso: `en` matchea `/-03:00$/`

### Corrección del bug de zona horaria en Oracle (research.md Decisión 3, 4)

- [ ] T017 [P] En `backend/sql/recorrido_api.pkb.sql` (línea 52), reemplazar la asignación cruda `SYSTIMESTAMP` de `ARRIBO_EN`/`DESCARGA_EN` por `CAST(SYSTIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires' AS TIMESTAMP)`
- [ ] T018 [P] En `backend/sql/central_api.pkb.sql` (líneas 38, 105), aplicar el mismo cambio que T017 para `ASIGNADO_EN`
- [ ] T019 En `backend/sql/integracion-cloud/integracion_cloud_api.pkb.sql` (línea 200), cambiar la generación de `updatedAt` de `TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')` a `TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM')`
- [ ] T020 En `backend/sql/integracion-cloud/integracion_cloud_api.pkb.sql`, actualizar `c_mascara_iso_utc` (línea 74) a una máscara con offset (`'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM'`) y cambiar `TO_TIMESTAMP(rec.arribo_en/descarga_en, c_mascara_iso_utc)` (líneas 328, 332) por `TO_TIMESTAMP_TZ(...)` seguido de `CAST(... AS TIMESTAMP)` en `leer_estado_puntos` (depende de T019 — mismo archivo, debe ir en el mismo cambio coordinado, contracts/formato-horario.md)

**Checkpoint**: el contrato de intercambio de horarios ya emite/parsea `-03:00` de forma consistente en los tres componentes JS y en Oracle; las historias de usuario pueden empezar

---

## Phase 3: User Story 1 - El chofer ve la hora real de cada evento de su recorrido (Priority: P1) 🎯 MVP

**Goal**: la app del chofer muestra `arriboEn`/`descargaEn` de cada punto en formato `HH24:MM:SS` local — hoy el dato ya llega en el payload pero no se renderiza en ningún lado.

**Independent Test**: abrir la app del chofer con un punto que tenga `arriboEn`/`descargaEn`, verificar que se muestra en formato de 24 horas con segundos y coincide con la hora real; verificar que `rangoHorario` se sigue mostrando igual que antes (texto libre, sin tocar).

### Tests for User Story 1

- [ ] T021 [US1] En `frontend/tests/components/DeliveryPointCard.test.jsx`, agregar casos: (a) cuando `punto.arriboEn`/`punto.descargaEn` están presentes, se renderizan formateados como `HH:MM:SS` (usando un fixture con timestamp `-03:00`); (b) `punto.rangoHorario` se sigue renderizando exactamente como el string recibido, sin reformatear (regresión, spec Clarifications pregunta 3)

### Implementation for User Story 1

- [ ] T022 [US1] En `frontend/src/components/DeliveryPointCard.jsx`, agregar la visualización de `punto.arriboEn`/`punto.descargaEn` (cuando estén presentes) usando `formatearHoraLocal` de `services/tiempo.js` (T003), sin tocar el bloque existente de `rangoHorario` (líneas 70-73)

**Checkpoint**: US1 es demostrable de forma independiente — el chofer ve arribo/descarga en `HH24:MM:SS` local

---

## Phase 4: User Story 2 - El operador de Central audita horarios consistentes entre viajes (Priority: P1) 🎯 MVP

**Goal**: Central muestra `arriboEn`/`descargaEn` formateados (hoy se muestra el string ISO crudo) y agrega la hora de `updatedAt` y de la última ubicación conocida — ninguno de los dos llega hoy a la UI de Central.

**Independent Test**: abrir el detalle de un recorrido en Central con puntos arribados/descargados y verificar que la hora coincide, carácter por carácter, con la mostrada en la app del chofer para el mismo evento (SC-003); verificar que el monitor en vivo muestra la hora de la última ubicación, no solo "reciente"/"no reciente".

### Tests for User Story 2

- [ ] T023 [P] [US2] En `backend/tests/contract/get-recorridos-activos.test.js`, agregar caso: cada recorrido de la respuesta incluye `updatedAt`
- [ ] T024 [P] [US2] En `backend/tests/contract/get-recorrido-detalle.test.js`, agregar caso: `recorrido.updatedAt` presente en la respuesta
- [ ] T025 [P] [US2] Crear `central/tests/components/RecorridoDetalle.test.jsx` (no existe hoy ningún test de este componente): `arriboEn`/`descargaEn` se muestran formateados `HH:MM:SS`, no el string ISO crudo
- [ ] T026 [P] [US2] En `central/tests/components/MonitorView.test.jsx`, agregar casos: `formatearUbicacion` incluye la hora `HH:MM:SS` del último reporte junto con "reciente"/"no reciente"; la fila muestra `updatedAt` del recorrido formateado

### Implementation for User Story 2

- [ ] T027 [US2] En `backend/src/state/integracionStore.js`, extender `listarActivos()` (líneas 397-416) para incluir `updatedAt: r.updatedAt` en cada resultado
- [ ] T028 [US2] En `backend/src/state/integracionStore.js`, extender `obtenerDetalle()` (líneas 430-437) para incluir `updatedAt` en el objeto `recorrido` (depende de T027, mismo archivo)
- [ ] T029 [US2] En `central/src/components/RecorridoDetalle.jsx` (líneas 41-42), reemplazar `{p.arriboEn}`/`{p.descargaEn}` crudos por `formatearHoraLocal(p.arriboEn)`/`formatearHoraLocal(p.descargaEn)` (importado de `services/tiempo.js`, T004)
- [ ] T030 [US2] En `central/src/components/MonitorView.jsx`, extender `formatearUbicacion()` para incluir `formatearHoraLocal(ultimaUbicacion.en)` junto al texto de "reciente"/"no reciente"; mostrar `r.updatedAt` formateado en la tabla (nueva celda o junto a una columna existente)

**Checkpoint**: US1 + US2 juntas — chofer y Central muestran exactamente la misma hora para el mismo evento (MVP de la feature)

---

## Phase 5: User Story 3 - Los horarios históricos ya registrados se muestran correctamente tras la normalización (Priority: P2)

**Goal**: confirmar que el formateo de visualización funciona igual para timestamps históricos (`...Z`, sin migrar, FR-006) que para los nuevos (`...-03:00`), sin código condicional adicional.

**Independent Test**: consultar en Central un recorrido finalizado con `arriboEn`/`descargaEn` en formato `Z` (anterior a esta feature) y verificar que se muestra en `HH24:MM:SS` sin error de parseo, igual que un dato nuevo.

**Depends on**: Foundational (T002-T007, formateo ya cubre ambos formatos por diseño) y US2 (T029, es donde se renderiza en Central).

### Tests for User Story 3

- [ ] T031 [US3] En `central/tests/components/RecorridoDetalle.test.jsx` (creado en T025), agregar caso: un punto con `arriboEn` en formato histórico UTC (`...Z`) se muestra en `HH24:MM:SS` igual de correcto que uno con formato nuevo (`...-03:00`), sin mostrar el string crudo ni fallar

### Validación manual for User Story 3

- [ ] T032 [US3] Ejecutar manualmente `quickstart.md` Escenario 3 contra un recorrido finalizado real, generado antes de esta feature — documentar el resultado (no automatizable dentro de este repo: requiere datos históricos reales)

**Checkpoint**: las tres historias de usuario funcionan de forma independiente y verificada

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: validación end-to-end y verificación manual de la parte del contrato (Oracle) que este repo no puede probar automáticamente.

- [ ] T033 [P] Ejecutar `quickstart.md` Escenario 1 y 2 en navegador real (dev server de `frontend/` y `central/`) y confirmar visualmente el formato y la consistencia entre chofer y Central
- [ ] T034 [P] Ejecutar `quickstart.md` sección "Verificación técnica del contrato (Oracle)" contra un entorno Oracle/APEX de prueba — validación manual obligatoria de `leer_estado_puntos` (marcada previamente como no probada contra el backend real, ver research.md Decisión 4)
- [ ] T035 Correr `node --test` (backend), `vitest` (frontend), `vitest` (central) completos y confirmar 100% en verde
- [ ] T036 [P] Revisar `central/src` y `frontend/src` (grep final) confirmando que ningún componente muestra AM/PM o un string ISO crudo sin formatear

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede arrancar de inmediato
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA todas las historias de usuario (cambio de contrato atómico, contracts/formato-horario.md)
- **User Stories (Phase 3-5)**: todas dependen de Foundational
  - US1 (P1) y US2 (P1) son independientes entre sí — pueden hacerse en paralelo
  - US3 (P2) depende de que exista el renderizado de Central (US2, T029) para poder agregar su caso de test histórico
- **Polish (Phase 6)**: depende de que todas las historias deseadas estén completas

### User Story Dependencies

- **User Story 1 (P1)**: puede empezar después de Foundational — sin dependencia de otras historias
- **User Story 2 (P1)**: puede empezar después de Foundational — sin dependencia de US1
- **User Story 3 (P2)**: depende de US2 (T029, `RecorridoDetalle.jsx` ya formatea con `formatearHoraLocal`) para agregar su caso de test específico sobre datos históricos

### Within Each User Story

- Tests antes que implementación
- Historia completa antes de pasar a la de menor prioridad

### Parallel Opportunities

- Todos los `[P]` de Setup y Foundational pueden correr en paralelo entre sí (archivos distintos)
- T017-T018 (Oracle, archivos distintos) en paralelo; T019-T020 son secuenciales entre sí (mismo archivo)
- Una vez completado Foundational, US1 y US2 pueden trabajarse en paralelo (equipos/sesiones distintas)
- Dentro de US2, T023-T026 (tests, archivos distintos) en paralelo entre sí

---

## Parallel Example: Foundational

```bash
# Crear los tres módulos de tiempo en paralelo (archivos distintos, misma forma):
Task: "Crear backend/src/util/tiempo.js"
Task: "Crear frontend/src/services/tiempo.js"
Task: "Crear central/src/services/tiempo.js"

# Sus tests, en paralelo:
Task: "Crear backend/tests/unit/tiempo.test.js"
Task: "Crear frontend/tests/services/tiempo.test.js"
Task: "Crear central/tests/services/tiempo.test.js"
```

## Parallel Example: User Story 2

```bash
Task: "Contract test updatedAt en backend/tests/contract/get-recorridos-activos.test.js"
Task: "Contract test updatedAt en backend/tests/contract/get-recorrido-detalle.test.js"
Task: "Component test en central/tests/components/RecorridoDetalle.test.jsx"
Task: "Component test en central/tests/components/MonitorView.test.jsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 + User Story 2, ambas P1)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea todas las historias, incluye el cambio de contrato Oracle↔cloud)
3. Completar Phase 3: User Story 1
4. Completar Phase 4: User Story 2
5. **STOP and VALIDATE**: correr `quickstart.md` Escenarios 1 y 2
6. Deploy/demo — este es el MVP de la feature (spec.md marca US1 y US2 como P1 ambas)

### Incremental Delivery

1. Setup + Foundational → contrato de horarios ya consistente en los tres componentes + Oracle
2. Agregar US1 → probar independientemente → el chofer ve arribo/descarga correctos
3. Agregar US2 → probar independientemente → Central consistente con el chofer (MVP completo)
4. Agregar US3 → probar independientemente → datos históricos confirmados sin regresión
5. Polish → validación manual del contrato Oracle (paso obligatorio antes de desplegar a producción)

---

## Notes

- `[P]` tasks = archivos distintos, sin dependencias pendientes
- `[Story]` mapea la tarea a su historia de usuario para trazabilidad
- El cambio de formato en Oracle (T017-T020) y en JS (T008-T013) DEBE desplegarse junto — no hay forma segura de desplegar uno sin el otro en producción sin romper `leer_estado_puntos` (contracts/formato-horario.md)
- `rangoHorario` no se toca en ninguna tarea — confirmado explícitamente en T021 como caso de regresión
- Ningún timestamp histórico se migra (FR-006) — T031/T032 validan que el formateo de visualización los maneja correctamente sin migración
