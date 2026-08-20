---

description: "Task list for: Rediseño visual de Central"

---

# Tasks: Rediseño visual de Central

**Input**: Design documents from `specs/009-central-mejora-visual/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: MVP original (Fases 1-6): no se agregaron tests contract/integration nuevos (la feature no creaba endpoints ni entidades). Los tests unitarios existentes de `central/tests/components/` actúan como guardia de no-regresión funcional (FR-006) y se complementan con un test nuevo para la navegación (US2, research.md Decisión 4). **Fases 7-9** (Historias 4-6) sí agregan tests unitarios y de integración en `backend/tests/` para los campos aditivos nuevos (ver data-model.md → Contratos).

**Organization**: las tareas están agrupadas por historia de usuario (spec.md) para permitir implementación y prueba independiente de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: A qué historia de usuario pertenece (US1, US2, US3)
- Todas las rutas de archivo son relativas a la raíz del repo (`C:\AI\vickytruck`)

## Path Conventions

Proyecto web existente (ver plan.md → Project Structure). MVP original
(Fases 1-6): toca únicamente `central/src` y `central/tests`. **Fases 7-9**
(Historias 4-6) también tocan `backend/src` y `backend/tests`. En ningún
caso se tocan `central/backend` ni `frontend/` (app del Chofer).

---

## Phase 1: Setup

**Purpose**: agregar la dependencia de UI y su configuración de tema, sin tocar aún ningún componente de vista.

- [X] T001 Agregar `antd` y `@ant-design/icons` (mismas majors que `rs956/frontend/package.json`, v6.x) a `central/package.json` y correr `npm install` en `central/`
- [X] T002 [P] Crear `central/src/theme/tokens.js` con un `themeConfig` de antd que reutiliza la paleta/tipografía/bordes de `rs956/frontend/src/theme/tokens.js` (`colorPrimary`, `headerBg`, `colorBgLayout`, `borderRadius`, `fontFamily`), sin `compactAlgorithm` (research.md Decisión 2)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: infraestructura de layout/tema compartida por las tres historias de usuario.

**⚠️ CRITICAL**: ninguna historia de usuario puede empezar hasta que esta fase esté completa.

- [X] T003 Envolver el árbol de la app con `ConfigProvider` de antd usando `themeConfig` en `central/src/main.jsx` (depende de T002)
- [X] T004 Crear `central/src/components/AppShell.jsx` con `Layout`/`Sider`/`Menu` de antd, ítems para Monitoreo/Mapa/Historial, prop `seccion` (sección activa) y callback `onCambiarSeccion` (research.md Decisión 3) (depende de T003)
- [X] T005 Actualizar `central/src/main.jsx` para renderizar `<AppShell seccion={vista} onCambiarSeccion={setVista}>...</AppShell>` en lugar del `<nav className="app__nav">` manual, preservando la lógica de ruteo entre vistas ya existente (depende de T004)
- [X] T006 [P] Reducir `central/src/styles.css` a solo el CSS residual no cubierto por antd (mismo patrón que `rs956/frontend/src/styles/app.css`), quitando las reglas de `.app__nav` ya reemplazadas por `AppShell`

**Checkpoint**: la navegación lateral funciona y todas las vistas siguen renderizando con su lógica actual (el contenido interno de cada vista todavía no tiene el nuevo estilo).

---

## Phase 3: User Story 1 - Panel con jerarquía visual clara (Priority: P1) 🎯 MVP

**Goal**: las tablas de Monitoreo/Historial y el panel de Detalle adoptan un estilo visual consistente (antd `Table`/`Card`/`Descriptions`), sin cambiar ningún dato mostrado.

**Independent Test**: abrir Monitoreo, Mapa, Historial y el Detalle de un recorrido, y verificar que presentan navegación, encabezados y tablas con estilo visual consistente entre sí, sin que cambie ningún dato (spec.md, US1, Acceptance Scenarios 1-3).

### Implementation for User Story 1

- [X] T007 [US1] Migrar la tabla de `central/src/components/MonitorView.jsx` de `<table>` artesanal a `Table` de antd (columnas: Recorrido, Flete, Progreso, Estado de viaje, Última ubicación, Actualizado, acción), preservando exactamente los mismos textos/valores por fila y los atributos `data-ubicacion-reciente`/`data-viaje-estado` (research.md Decisión 4)
- [X] T008 [US1] Migrar la tabla de `central/src/components/HistorialView.jsx` de `<table>` artesanal a `Table` de antd (columnas: Recorrido, Flete, Puntos, acción), preservando exactamente los mismos textos/valores por fila (research.md Decisión 4)
- [X] T009 [US1] Restylar `central/src/components/RecorridoDetalle.jsx` usando `Card` + `Descriptions` de antd para el encabezado/metadatos (estado, flete asignado, cierre, tiempo de regreso a base), preservando exactamente los textos que verifican los tests (research.md Decisión 5)
- [X] T010 [P] [US1] Envolver los mensajes de estado vacío ("No hay recorridos activos en este momento", "Todavía no hay recorridos finalizados") con `Empty`/`Typography.Text` de antd, preservando el atributo `role="status"` y el texto exacto (FR-009) en `central/src/components/MonitorView.jsx`, `central/src/components/HistorialView.jsx` y `central/src/components/MapaSeguimiento.jsx`
- [X] T011 [P] [US1] Envolver el contenedor de `MapaSeguimiento` dentro de un `Card` de antd en las vistas de Monitoreo/Mapa/Detalle para un panel visualmente consistente (FR-002/FR-003), sin modificar la lógica interna de `central/src/components/MapaSeguimiento.jsx`
- [X] T012 [US1] Correr `npm test` en `central/` y ajustar únicamente el markup (no las aserciones) de `MonitorView.jsx`/`RecorridoDetalle.jsx`/`HistorialView.jsx` hasta que toda la suite existente en `central/tests/components/` vuelva a pasar sin cambios de comportamiento (FR-006)

**Checkpoint**: User Story 1 completa y verificable de forma independiente — jerarquía visual clara en las 4 vistas, cero regresión de datos.

---

## Phase 4: User Story 2 - Navegación entre vistas sin perder contexto (Priority: P2)

**Goal**: la sección activa del menú lateral queda siempre visible, incluyendo dentro del Detalle de un recorrido, y la acción de volver es visualmente clara.

**Independent Test**: navegar entre las 4 vistas (incluyendo entrar y salir de un Detalle desde Monitoreo y desde Historial) y verificar que la sección activa se indica en todo momento y existe una acción de retorno visualmente clara (spec.md, US2, Acceptance Scenarios 1-2).

### Implementation for User Story 2

- [X] T013 [US2] Asegurar que `selectedKeys` del `Menu` en `central/src/components/AppShell.jsx` refleje la sección de origen (Monitoreo/Historial) mientras se está en la vista de Detalle, coordinando el estado en `central/src/main.jsx` (US2, Acceptance Scenario 1)
- [X] T014 [US2] Estilizar las acciones "← Volver al monitoreo" (en `central/src/main.jsx`) y "← Volver al historial" (en `central/src/components/HistorialView.jsx`) como `Button` de antd con ícono `ArrowLeftOutlined` de `@ant-design/icons` (US2, Acceptance Scenario 2)
- [X] T015 [P] [US2] Agregar `central/tests/components/AppShell.test.jsx` que verifique que la sección activa pasada por prop queda resaltada en el menú (nuevo test, no modifica los existentes)

**Checkpoint**: User Stories 1 y 2 funcionan de forma independiente y en conjunto.

---

## Phase 5: User Story 3 - Estados e indicadores siguen siendo distinguibles (Priority: P3)

**Goal**: los indicadores de dominio ya existentes (ubicación reciente/no reciente, estado de viaje, "Regresando a base", estado del canal MQTT) siguen siendo distinguibles bajo el nuevo estilo.

**Independent Test**: comparar, antes y después del rediseño, que un recorrido con ubicación no reciente y uno en estado "Regresando a base" siguen siendo identificables visualmente en la tabla de Monitoreo, y que el estado del canal MQTT sigue visible (spec.md, US3, Acceptance Scenarios 1-2).

### Implementation for User Story 3

- [X] T016 [US3] En `central/src/components/MonitorView.jsx`, aplicar `rowClassName` en el `Table` de antd según `ultimaUbicacion.reciente`, preservando (con nuevo estilo) la distinción visual que hoy da la regla CSS `tr[data-ubicacion-reciente="false"] td`
- [X] T017 [US3] Estilizar el mensaje de estado del canal MQTT ("Canal tiempo real MQTT: {estado}") en `central/src/main.jsx` con `Alert`/`Tag` de antd según el estado (`connected`/`disabled`/otro), preservando `role="status"` y el texto exacto
- [X] T018 [P] [US3] Estilizar la etiqueta de `viajeEstado` (incluyendo "Regresando a base") en `central/src/components/MonitorView.jsx` con `Tag` de antd color-codeado, preservando el texto exacto que verifican los tests existentes
- [X] T019 [US3] Correr `npm test` en `central/` nuevamente y confirmar que las aserciones existentes sobre ubicación reciente/no reciente, "Regresando a base" y coexistencia con el estado MQTT (`central/tests/components/MonitorView.test.jsx`) siguen pasando sin modificarse

**Checkpoint**: las tres historias de usuario están completas y verificadas de forma independiente.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: validación final de los gates de la constitución y de consistencia visual con la referencia.

- [X] T020 Validar manualmente el embebido en iframe angosto y el acceso directo de Central (Constitución, Principio III) siguiendo `specs/009-central-mejora-visual/quickstart.md`, paso 5
- [X] T021 [P] Confirmar que `npm run build` en `central/` compila sin errores con las nuevas dependencias (`antd`, `@ant-design/icons`)
- [X] T022 Hacer una revisión visual side-by-side de Central contra `rs956/frontend` para confirmar SC-004 (paleta, tipografía y estilo de navegación/tablas coherentes)

---

---

## Phase 7: User Story 4 - Monitoreo con más contexto operativo (Priority: P2) [post-implementación]

**Goal**: Monitoreo muestra chofer, cliente del punto activo, progreso como barra y estado MQTT como ícono de header, pedidos directamente por el usuario después del MVP (commit `7d35471`, `a58d7a2`).

**Independent Test**: ver spec.md, US4, Acceptance Scenarios 1-4.

- [X] T023 [US4] Agregar `chofer: {id,nombre}|null` y `puntoActivo: {id,orden,cliente}|null` a `listarActivos()` en `backend/src/state/integracionStore.js` (research.md Decisión 8), con tests unitarios en `backend/tests/unit/integracion-store-central.test.js` y cobertura e2e en `backend/tests/integration/central-cloud-monitoreo.test.js`
- [X] T024 [US4] Mover el indicador de estado MQTT de un `Alert` en el contenido a un `Badge` de color en el header de `central/src/components/AppShell.jsx` (prop `mqttEstado`), con tooltip y texto `sr-only` para accesibilidad (research.md Decisión 6)
- [X] T025 [US4] Reemplazar el texto de la columna "Progreso" de `central/src/components/MonitorView.jsx` por `Progress` de antd (formato "Completados / Total", color verde al 100%/azul en curso), con el desglose completo en tooltip (research.md Decisión 7)
- [X] T026 [US4] Quitar el id del punto del texto de "Estado de viaje" y agregar columna "Punto" en `central/src/components/MonitorView.jsx` mostrando el cliente del punto activo (fallback "Punto {orden}" si no hay cliente)
- [X] T027 [US4] Agregar columna "Chofer" en 3er lugar (después de Flete) en `central/src/components/MonitorView.jsx`
- [X] T028 [US4] Corregir el desborde horizontal de la tabla en contenedores angostos (`scroll={{x:"max-content"}}` + `minWidth:0`/`overflowX:auto` en `AppShell.jsx`) — regresión encontrada al validar el edge case de iframe angosto con datos reales

**Checkpoint**: Monitoreo con chofer, punto/cliente, barra de progreso e indicador MQTT en header, sin regresión de tests existentes.

---

## Phase 8: User Story 5 - Historial con información completa de cada viaje (Priority: P2) [post-implementación]

**Goal**: Historial muestra fecha, flete, chofer, cantidad de clientes y tiempo total (commit `bc0c72f`).

**Independent Test**: ver spec.md, US5, Acceptance Scenarios 1-2.

- [X] T029 [US5] Agregar `flete: {id,nombre}` y `chofer: {id,nombre}|null` a `listarHistorial()` en `backend/src/state/integracionStore.js` y al mapeo de la ruta en `backend/src/routes/central.js` (research.md Decisión 9), con tests unitarios
- [X] T030 [P] [US5] Agregar `formatearFechaLocal` y `formatearDuracionMin` a `central/src/services/tiempo.js`, con tests en `central/tests/services/tiempo.test.js`
- [X] T031 [US5] Reemplazar las columnas Recorrido/Flete(id)/Puntos de `central/src/components/HistorialView.jsx` por Fecha, Flete, Chofer, Cantidad de clientes y Tiempo total (cálculo local desde `puntos[].inicioEn`/`cierreEn`)
- [X] T032 [P] [US5] Agregar `central/tests/components/HistorialView.test.jsx` (no existía) cubriendo las columnas nuevas y los casos sin chofer/sin tiempo calculable

**Checkpoint**: Historial con información completa por recorrido, cubierto por tests nuevos.

---

## Phase 9: User Story 6 - Detalle con proximidad GPS y actualización en vivo (Priority: P2) [post-implementación]

**Goal**: RecorridoDetalle con encabezado ampliado, grilla de puntos con verificación de proximidad GPS, refresco en vivo y botón "Volver" reubicado (commits `cb2de08`, `a1d362d`).

**Independent Test**: ver spec.md, US6, Acceptance Scenarios 1-4.

- [X] T033 [US6] Agregar `flete`/`chofer` a `obtenerDetalle()` y `cliente`/`arriboLat`/`arriboLon`/`descargaLat`/`descargaLon` a `serializarPuntosCentral` (compartida con historial) en `backend/src/state/integracionStore.js` (research.md Decisión 10), preservando que `inicioLat`/`cierreLat` sigan sin exponerse (contrato verificado en `backend/tests/contract/get-recorrido-detalle.test.js`)
- [X] T034 [P] [US6] Agregar `distanciaMetros` (Haversine) a `central/src/services/marcadores.js`, con tests en `central/tests/components/marcadores.test.js`
- [X] T035 [P] [US6] Agregar `primerEventoIso` y `calcularTiempoTotalMin` (con parámetro `ahora` para recorridos activos) a `central/src/services/tiempo.js`, compartido con `HistorialView.jsx`
- [X] T036 [US6] Reescribir `central/src/components/RecorridoDetalle.jsx`: encabezado con `Descriptions` (Fecha/Flete/Chofer/Estado/Hora inicio/Final/Tiempo total) y grilla de puntos con `Table` (Cliente/Estado/Hora de llegada/Hora de descarga), marcando cada hora con `Badge` de color según el radio de proximidad de 500 m (research.md Decisión 10)
- [X] T037 [US6] Extender el `useEffect` de polling en `central/src/main.jsx` para refrescar también `detalle` mientras la vista está abierta (mismo intervalo que `activos`, dependiente de `detalle?.recorrido?.id`) (research.md Decisión 11)
- [X] T038 [US6] Agregar prop `accionVolver` a `RecorridoDetalle` (pasado al `extra` del `Card`) y actualizar `main.jsx`/`HistorialView.jsx` para armar ahí su botón de retorno en vez de una fila separada (research.md Decisión 12)
- [X] T039 [US6] Reescribir `central/tests/components/RecorridoDetalle.test.jsx` para el nuevo encabezado/grilla (encabezado, proximidad GPS dentro/fuera de radio, sin GPS, horarios en hora local, recorrido activo con `vi.useFakeTimers`)
- [X] T040 [US6] Correr `npm test` en `backend/` y `central/` y confirmar 0 regresiones (157/157 y 55/55 al cierre de esta fase)

**Checkpoint**: las tres historias post-implementación (4-6) completas y verificadas; PR #17 actualizado con los 5 commits de esta sección.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA las tres historias de usuario
- **User Stories (Phase 3-5)**: todas dependen de que Foundational esté completa
  - Pueden avanzar en paralelo (si hay más de una persona) o en orden de prioridad (US1 → US2 → US3)
- **Polish (Phase 6)**: depende de que las historias que se quieran entregar estén completas

### User Story Dependencies

- **US1 (P1)**: puede empezar después de Foundational — sin dependencia de otras historias
- **US2 (P2)**: puede empezar después de Foundational — toca los mismos archivos que US1 (`AppShell.jsx`, `main.jsx`) pero es funcionalmente independiente y verificable por separado
- **US3 (P3)**: puede empezar después de Foundational — se apoya en la migración a `Table` de antd hecha en US1 (T007), por lo que en la práctica conviene secuenciarla después de US1 aunque no dependa de sus acceptance criteria

### Within Each User Story

- Migración de tablas/paneles antes de estilizar estados/indicadores sobre ellos
- Correr `npm test` al final de cada historia como guardia de no-regresión (FR-006)
- Historia completa antes de pasar a la siguiente prioridad

### Parallel Opportunities

- T001 y T002 (Setup) pueden ejecutarse en paralelo
- T006 (Foundational, `styles.css`) puede ejecutarse en paralelo al resto de Foundational una vez creado `AppShell`
- Dentro de US1: T010 y T011 son paralelizables entre sí (archivos distintos)
- Dentro de US2: T015 es paralelizable al resto (archivo de test nuevo)
- Dentro de US3: T018 es paralelizable a T016/T017 (mismo archivo `MonitorView.jsx` que T016, pero secciones de código distintas — coordinar si se paraleliza en la práctica)
- T021 (Polish) es paralelizable a T020/T022

---

## Parallel Example: User Story 1

```bash
# Una vez completas T007-T009, en paralelo:
Task: "Envolver mensajes de estado vacío con role=status preservado (T010)"
Task: "Envolver MapaSeguimiento en Card de antd (T011)"
```

---

## Implementation Strategy

### MVP First (User Story 1 solamente)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (crítico — bloquea las 3 historias)
3. Completar Phase 3: User Story 1
4. **Detenerse y validar**: correr `npm test` en `central/` y repasar quickstart.md pasos 1-2
5. Este punto ya es un MVP demostrable: Central con jerarquía visual clara igual a `rs956/frontend`, sin regresión de datos

### Incremental Delivery

1. Setup + Foundational → navegación lateral y tema listos
2. + US1 → probar independientemente → demo (MVP)
3. + US2 → probar independientemente → demo
4. + US3 → probar independientemente → demo
5. Polish → validar iframe/acceso directo y consistencia visual final con la referencia

---

## Notes

- `[P]` = archivos distintos, sin dependencias pendientes entre sí
- La etiqueta `[Story]` mapea cada tarea a su historia de usuario para trazabilidad
- MVP original (Fases 1-6): no se agregaron tests de contrato/integración porque no se creaban endpoints ni entidades; los tests existentes de `central/tests/components/` son la guardia de no-regresión (FR-006). Fases 7-9 sí agregan tests unitarios/integration en `backend/tests/` (data-model.md → Contratos)
- Correr `npm test` en `central/` (y en `backend/` desde Fase 7) al final de cada historia, no solo al final de todo el trabajo
- Detenerse en cada checkpoint para validar la historia de forma independiente antes de seguir
- Evitar: cambiar aserciones de tests existentes solo para que "pasen" — si un test existente falla, el markup debe ajustarse para preservar el comportamiento observable (texto, roles ARIA), no al revés
