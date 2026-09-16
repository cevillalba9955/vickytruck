---

description: "Task list for: Hora y alerta de distancia mínima en el mapa de Detalle"

---

# Tasks: Hora y alerta de distancia mínima en el mapa de Detalle

**Input**: Design documents from `specs/014-mapa-historial-hora-distancia/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Se incluyen tareas de testing — mismo criterio que las features previas de este repo (004, 009, 010): tests unitarios de las funciones puras en `services/marcadores.js`/`services/tiempo.js`, y tests de componente mockeando `react-leaflet` (mismo mock ya existente en `MapaSeguimiento.test.jsx`). No hay cambios de backend, así que no hay tareas de contract/integration test de API.

**Organization**: Tareas agrupadas por historia de usuario (spec.md) para permitir implementación y prueba independiente de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: a qué historia de usuario pertenece (US1, US2)
- Todas las rutas de archivo son relativas a la raíz del repo (`C:\AI\vickytruck`)

## Path Conventions

Proyecto web existente (ver plan.md → Project Structure): esta feature toca únicamente `central/src` y `central/tests`. No se agregan carpetas nuevas ni se toca `backend/` ni `frontend/`.

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: dejar en un único lugar (`central/src/services/marcadores.js`) el umbral de distancia mínima ya vigente y agregar el formato hh:mm que **ambas** historias de usuario necesitan.

**⚠️ CRITICAL**: ninguna historia de usuario puede completarse hasta que esta fase esté lista — US1 necesita el umbral movido para calcular la alerta por punto, US2 necesita `formatearHoraCorta` para las horas de sus marcadores, y ambas comparten `MapaSeguimiento.jsx` y `RecorridoDetalle.jsx`.

- [ ] T001 [P] En `central/src/services/marcadores.js`, definir y exportar `RADIO_PROXIMIDAD_M = 500` junto a `distanciaMetros` (research.md, Decisión 2)
- [ ] T002 En `central/src/components/RecorridoDetalle.jsx`, eliminar la constante local `RADIO_PROXIMIDAD_M` e importarla desde `../services/marcadores.js`, sin cambiar el comportamiento de `HoraConProximidad` en la tabla (depende de T001)
- [ ] T003 [P] En `central/src/services/tiempo.js`, agregar `formatearHoraCorta(iso)`: mismo criterio de reconversión a hora de Buenos Aires que `formatearHoraLocal`, pero con `Intl.DateTimeFormat` sin `second` (formato `HH:MM`) (research.md, Decisión 8)

### Tests para Foundational

- [ ] T004 [P] Test unitario en `central/tests/components/marcadores.test.js`: `RADIO_PROXIMIDAD_M` exportado con valor `500`
- [ ] T005 [P] Test unitario en `central/tests/services/tiempo.test.js`: `formatearHoraCorta` devuelve `HH:MM` (sin segundos) para distintos timestamps ISO, reconvirtiendo siempre a hora de Buenos Aires (mismo criterio que los tests existentes de `formatearHoraLocal`)

**Checkpoint**: umbral de distancia y formato hh:mm listos — arranca el trabajo de ambas historias de usuario.

---

## Phase 2: User Story 1 - Hora y alerta de distancia en cada punto de entrega (Priority: P1) 🎯 MVP

**Goal**: cada punto de entrega en el mapa de Detalle muestra su hora (hh:mm) de llegada/descarga y se distingue visualmente cuando alguna de esas posiciones quedó fuera de la distancia mínima esperada.

**Independent Test**: con un recorrido que tenga un punto de entrega dentro de la distancia mínima y otro fuera de ella (llegada y/o descarga), abrir su mapa de Detalle y verificar que ambos puntos muestran su hora al inspeccionarlos, y que el punto fuera de rango se distingue visualmente del que está dentro de rango.

### Tests for User Story 1

- [ ] T006 [P] [US1] Test unitario en `central/tests/components/marcadores.test.js`: nueva lógica de alerta por evento (llegada/descarga) — `true` fuera de radio, `false` dentro de radio, `null` sin GPS registrado para ese evento (FR-002/FR-003)
- [ ] T007 [P] [US1] Test unitario en `central/tests/components/marcadores.test.js`: `construirPuntosEnMapa` incluye `arriboEn`, `descargaEn` y `alerta: { llegada, descarga }` en cada punto de salida, preservando `id`/`orden`/`lat`/`lon`/`estado` ya existentes
- [ ] T008 [P] [US1] Test de componente en `central/tests/components/MapaSeguimiento.test.jsx` (modo "puntos"): un punto con `alerta.llegada` o `alerta.descarga` en `true` se distingue visualmente (color de borde) de uno con ambos en `false`; la hora (hh:mm) está visible en el `Tooltip` sin necesidad de click (FR-001, Escenario 1)
- [ ] T009 [US1] Test de integración en `central/tests/components/RecorridoDetalle.test.jsx`: al renderizar el Detalle con puntos que tienen `arriboEn`/`descargaEn`/coordenadas, el mapa recibe esos datos enriquecidos vía `construirPuntosEnMapa` (sin tocar la tabla existente)

### Implementation for User Story 1

- [ ] T010 [US1] En `central/src/services/marcadores.js`: agregar la evaluación de alerta por evento (usa `distanciaMetros` + `RADIO_PROXIMIDAD_M` de T001; `null` cuando el evento no tiene `lat`/`lon`) y extender `construirPuntosEnMapa(puntos)` para incluir `arriboEn`, `descargaEn` y `alerta` en cada punto de salida (depende de T001, T006, T007)
- [ ] T011 [US1] En `central/src/components/MapaSeguimiento.jsx`, modo "puntos": reemplazar `Popup` por `Tooltip` (research.md, Decisión 7), mostrar hora de llegada/descarga con `formatearHoraCorta` (T003), y aplicar un `pathOptions.color` (borde) distinto cuando `alerta.llegada || alerta.descarga` es `true`, manteniendo el `fillColor` por estado ya existente (research.md, Decisión 6) (depende de T010, T003, T008)

**Checkpoint**: Historia 1 funcional y demostrable de forma independiente — 🎯 MVP de esta feature.

---

## Phase 3: User Story 2 - Punto de inicio y punto de cierre del recorrido en el mapa (Priority: P2)

**Goal**: el mapa de Detalle dibuja un marcador para la ubicación de inicio del recorrido y otro para la de cierre, cada uno con su hora (hh:mm), cuando esos datos están registrados.

**Independent Test**: con un recorrido que tenga ubicación de inicio y de cierre registradas, abrir su mapa de Detalle y verificar que aparecen ambos marcadores, distinguibles entre sí y de los puntos de entrega, cada uno con su hora (hh:mm) visible.

### Tests for User Story 2

- [ ] T012 [P] [US2] Test unitario en `central/tests/components/marcadores.test.js`: `construirMarcadorExtremo({ iso, lat, lon }, tipo)` devuelve el marcador cuando hay coordenadas y `null` cuando `lat`/`lon` faltan (FR-007)
- [ ] T013 [P] [US2] Test de componente en `central/tests/components/MapaSeguimiento.test.jsx`: los marcadores de tipo `"inicio"`/`"cierre"` se dibujan con ícono propio, distinto entre sí y de los marcadores de punto de entrega/flete/salida ya existentes, mostrando su hora (hh:mm) en el `Tooltip`
- [ ] T014 [US2] Test de integración en `central/tests/components/RecorridoDetalle.test.jsx`: con `inicioEn`/`inicioLat`/`inicioLon` en algún punto y `cierreEn`/`cierreLat`/`cierreLon` en el recorrido, el mapa recibe ambos marcadores; si alguno de los dos falta, ese marcador simplemente no se pasa al mapa (Edge Case)

### Implementation for User Story 2

- [ ] T015 [US2] En `central/src/services/marcadores.js`: implementar `construirMarcadorExtremo({ iso, lat, lon }, tipo)` (research.md, Decisión 5) (depende de T012)
- [ ] T016 [US2] En `central/src/components/MapaSeguimiento.jsx`: agregar soporte para marcadores de tipo `"inicio"`/`"cierre"` (íconos propios vía `L.divIcon`, mismo patrón que `iconoSalida`) con `Tooltip` mostrando la hora vía `formatearHoraCorta` (T003) (depende de T015, T003, T013)
- [ ] T017 [US2] En `central/src/components/RecorridoDetalle.jsx`: construir el marcador de inicio a partir de `primerEventoConUbicacion(puntos)` (ya calculado) y el de cierre a partir de `recorrido.cierreEn/cierreLat/cierreLon` (ya disponible), usando `construirMarcadorExtremo`, y pasarlos a `MapaSeguimiento` (depende de T015, T016, T014)

**Checkpoint**: ambas historias de usuario funcionan juntas — el mapa de Detalle muestra hora + alerta por punto de entrega y los marcadores de inicio/cierre del recorrido.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [ ] T018 [P] Ejecutar la validación completa de `quickstart.md`: tests unitarios/componente (`npx vitest run` sobre los archivos tocados) y validación manual en el navegador abriendo un recorrido desde Historial y otro activo desde Monitoreo
- [ ] T019 Revisar que no haya quedado ningún duplicado de `RADIO_PROXIMIDAD_M` ni comentarios desactualizados en `RecorridoDetalle.jsx` tras moverlo a `marcadores.js` (T002)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: sin dependencias — arranca de inmediato. BLOQUEA a US1 y US2.
- **User Story 1 (Phase 2)**: depende de Foundational. Sin dependencia de US2.
- **User Story 2 (Phase 3)**: depende de Foundational. Sin dependencia de US1 (toca los mismos archivos que US1 — `MapaSeguimiento.jsx`/`RecorridoDetalle.jsx` — pero en secciones distintas: modo "puntos" existente vs. marcadores nuevos de extremo).
- **Polish (Phase 4)**: depende de que US1 y US2 (las que se quieran entregar) estén completas.

### Within Each User Story

- Tests antes que implementación (deben fallar primero).
- En `marcadores.js`: lógica pura antes que el componente que la consume.
- `MapaSeguimiento.jsx` antes que `RecorridoDetalle.jsx` cuando este último depende de una prop/forma nueva del mapa.

### Parallel Opportunities

- T001 y T003 (Foundational) — archivos distintos.
- T004 y T005 (tests Foundational) — archivos distintos.
- T006, T007, T008 (tests US1) — mismo archivo T006/T007 pero funciones/bloques `describe` distintos sin dependencia entre sí; T008 es otro archivo.
- T012 y T013 (tests US2) — archivos distintos.
- Si hay dos personas disponibles tras completar Foundational: una puede tomar US1 completa y otra US2 completa en paralelo (tocan el mismo archivo en secciones distintas — coordinar el merge de `MapaSeguimiento.jsx`/`RecorridoDetalle.jsx`).

---

## Parallel Example: Foundational

```bash
Task: "En central/src/services/marcadores.js, exportar RADIO_PROXIMIDAD_M"
Task: "En central/src/services/tiempo.js, agregar formatearHoraCorta(iso)"
```

## Parallel Example: User Story 1 (tests)

```bash
Task: "Test unitario de alerta por evento en central/tests/components/marcadores.test.js"
Task: "Test unitario de construirPuntosEnMapa extendido en central/tests/components/marcadores.test.js"
Task: "Test de componente MapaSeguimiento (modo puntos, alerta visual) en central/tests/components/MapaSeguimiento.test.jsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Foundational.
2. Completar Phase 2: User Story 1.
3. **Parar y validar**: abrir el mapa de Detalle de un recorrido con puntos dentro y fuera de rango, confirmar hora + alerta visual.
4. Esto ya es demostrable — es el pedido explícito de la feature.

### Incremental Delivery

1. Foundational → base lista.
2. User Story 1 → probar independientemente → demo (MVP).
3. User Story 2 → probar independientemente → demo (mapa completo con inicio/cierre).
4. Polish → validación final con `quickstart.md`.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- [Story] mapea cada tarea a su historia de usuario para trazabilidad.
- No hay tareas de backend/contrato: toda la data ya la expone `GET /api/central/recorridos/:id` y `GET /api/central/recorridos/historial` (research.md, Decisión 1).
- Verificar que los tests fallan antes de implementar.
- Commitear después de cada tarea o grupo lógico.
- Parar en cada checkpoint para validar la historia de forma independiente.
