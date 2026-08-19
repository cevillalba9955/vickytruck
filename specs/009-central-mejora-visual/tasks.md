---

description: "Task list for: Rediseño visual de Central"

---

# Tasks: Rediseño visual de Central

**Input**: Design documents from `specs/009-central-mejora-visual/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: no se agregan tests contract/integration nuevos (la feature no crea endpoints ni entidades — ver data-model.md). Los tests unitarios existentes de `central/tests/components/` actúan como guardia de no-regresión funcional (FR-006) y se complementan con un test nuevo para la navegación (US2, research.md Decisión 4).

**Organization**: las tareas están agrupadas por historia de usuario (spec.md) para permitir implementación y prueba independiente de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: A qué historia de usuario pertenece (US1, US2, US3)
- Todas las rutas de archivo son relativas a la raíz del repo (`C:\AI\vickytruck`)

## Path Conventions

Proyecto web existente: esta feature toca únicamente `central/src` y
`central/tests` (ver plan.md → Project Structure). No se tocan `central/backend`,
`backend/` (API del Chofer) ni `frontend/` (app del Chofer).

---

## Phase 1: Setup

**Purpose**: agregar la dependencia de UI y su configuración de tema, sin tocar aún ningún componente de vista.

- [ ] T001 Agregar `antd` y `@ant-design/icons` (mismas majors que `rs956/frontend/package.json`, v6.x) a `central/package.json` y correr `npm install` en `central/`
- [ ] T002 [P] Crear `central/src/theme/tokens.js` con un `themeConfig` de antd que reutiliza la paleta/tipografía/bordes de `rs956/frontend/src/theme/tokens.js` (`colorPrimary`, `headerBg`, `colorBgLayout`, `borderRadius`, `fontFamily`), sin `compactAlgorithm` (research.md Decisión 2)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: infraestructura de layout/tema compartida por las tres historias de usuario.

**⚠️ CRITICAL**: ninguna historia de usuario puede empezar hasta que esta fase esté completa.

- [ ] T003 Envolver el árbol de la app con `ConfigProvider` de antd usando `themeConfig` en `central/src/main.jsx` (depende de T002)
- [ ] T004 Crear `central/src/components/AppShell.jsx` con `Layout`/`Sider`/`Menu` de antd, ítems para Monitoreo/Mapa/Historial, prop `seccion` (sección activa) y callback `onCambiarSeccion` (research.md Decisión 3) (depende de T003)
- [ ] T005 Actualizar `central/src/main.jsx` para renderizar `<AppShell seccion={vista} onCambiarSeccion={setVista}>...</AppShell>` en lugar del `<nav className="app__nav">` manual, preservando la lógica de ruteo entre vistas ya existente (depende de T004)
- [ ] T006 [P] Reducir `central/src/styles.css` a solo el CSS residual no cubierto por antd (mismo patrón que `rs956/frontend/src/styles/app.css`), quitando las reglas de `.app__nav` ya reemplazadas por `AppShell`

**Checkpoint**: la navegación lateral funciona y todas las vistas siguen renderizando con su lógica actual (el contenido interno de cada vista todavía no tiene el nuevo estilo).

---

## Phase 3: User Story 1 - Panel con jerarquía visual clara (Priority: P1) 🎯 MVP

**Goal**: las tablas de Monitoreo/Historial y el panel de Detalle adoptan un estilo visual consistente (antd `Table`/`Card`/`Descriptions`), sin cambiar ningún dato mostrado.

**Independent Test**: abrir Monitoreo, Mapa, Historial y el Detalle de un recorrido, y verificar que presentan navegación, encabezados y tablas con estilo visual consistente entre sí, sin que cambie ningún dato (spec.md, US1, Acceptance Scenarios 1-3).

### Implementation for User Story 1

- [ ] T007 [US1] Migrar la tabla de `central/src/components/MonitorView.jsx` de `<table>` artesanal a `Table` de antd (columnas: Recorrido, Flete, Progreso, Estado de viaje, Última ubicación, Actualizado, acción), preservando exactamente los mismos textos/valores por fila y los atributos `data-ubicacion-reciente`/`data-viaje-estado` (research.md Decisión 4)
- [ ] T008 [US1] Migrar la tabla de `central/src/components/HistorialView.jsx` de `<table>` artesanal a `Table` de antd (columnas: Recorrido, Flete, Puntos, acción), preservando exactamente los mismos textos/valores por fila (research.md Decisión 4)
- [ ] T009 [US1] Restylar `central/src/components/RecorridoDetalle.jsx` usando `Card` + `Descriptions` de antd para el encabezado/metadatos (estado, flete asignado, cierre, tiempo de regreso a base), preservando exactamente los textos que verifican los tests (research.md Decisión 5)
- [ ] T010 [P] [US1] Envolver los mensajes de estado vacío ("No hay recorridos activos en este momento", "Todavía no hay recorridos finalizados") con `Empty`/`Typography.Text` de antd, preservando el atributo `role="status"` y el texto exacto (FR-009) en `central/src/components/MonitorView.jsx`, `central/src/components/HistorialView.jsx` y `central/src/components/MapaSeguimiento.jsx`
- [ ] T011 [P] [US1] Envolver el contenedor de `MapaSeguimiento` dentro de un `Card` de antd en las vistas de Monitoreo/Mapa/Detalle para un panel visualmente consistente (FR-002/FR-003), sin modificar la lógica interna de `central/src/components/MapaSeguimiento.jsx`
- [ ] T012 [US1] Correr `npm test` en `central/` y ajustar únicamente el markup (no las aserciones) de `MonitorView.jsx`/`RecorridoDetalle.jsx`/`HistorialView.jsx` hasta que toda la suite existente en `central/tests/components/` vuelva a pasar sin cambios de comportamiento (FR-006)

**Checkpoint**: User Story 1 completa y verificable de forma independiente — jerarquía visual clara en las 4 vistas, cero regresión de datos.

---

## Phase 4: User Story 2 - Navegación entre vistas sin perder contexto (Priority: P2)

**Goal**: la sección activa del menú lateral queda siempre visible, incluyendo dentro del Detalle de un recorrido, y la acción de volver es visualmente clara.

**Independent Test**: navegar entre las 4 vistas (incluyendo entrar y salir de un Detalle desde Monitoreo y desde Historial) y verificar que la sección activa se indica en todo momento y existe una acción de retorno visualmente clara (spec.md, US2, Acceptance Scenarios 1-2).

### Implementation for User Story 2

- [ ] T013 [US2] Asegurar que `selectedKeys` del `Menu` en `central/src/components/AppShell.jsx` refleje la sección de origen (Monitoreo/Historial) mientras se está en la vista de Detalle, coordinando el estado en `central/src/main.jsx` (US2, Acceptance Scenario 1)
- [ ] T014 [US2] Estilizar las acciones "← Volver al monitoreo" (en `central/src/main.jsx`) y "← Volver al historial" (en `central/src/components/HistorialView.jsx`) como `Button` de antd con ícono `ArrowLeftOutlined` de `@ant-design/icons` (US2, Acceptance Scenario 2)
- [ ] T015 [P] [US2] Agregar `central/tests/components/AppShell.test.jsx` que verifique que la sección activa pasada por prop queda resaltada en el menú (nuevo test, no modifica los existentes)

**Checkpoint**: User Stories 1 y 2 funcionan de forma independiente y en conjunto.

---

## Phase 5: User Story 3 - Estados e indicadores siguen siendo distinguibles (Priority: P3)

**Goal**: los indicadores de dominio ya existentes (ubicación reciente/no reciente, estado de viaje, "Regresando a base", estado del canal MQTT) siguen siendo distinguibles bajo el nuevo estilo.

**Independent Test**: comparar, antes y después del rediseño, que un recorrido con ubicación no reciente y uno en estado "Regresando a base" siguen siendo identificables visualmente en la tabla de Monitoreo, y que el estado del canal MQTT sigue visible (spec.md, US3, Acceptance Scenarios 1-2).

### Implementation for User Story 3

- [ ] T016 [US3] En `central/src/components/MonitorView.jsx`, aplicar `rowClassName` en el `Table` de antd según `ultimaUbicacion.reciente`, preservando (con nuevo estilo) la distinción visual que hoy da la regla CSS `tr[data-ubicacion-reciente="false"] td`
- [ ] T017 [US3] Estilizar el mensaje de estado del canal MQTT ("Canal tiempo real MQTT: {estado}") en `central/src/main.jsx` con `Alert`/`Tag` de antd según el estado (`connected`/`disabled`/otro), preservando `role="status"` y el texto exacto
- [ ] T018 [P] [US3] Estilizar la etiqueta de `viajeEstado` (incluyendo "Regresando a base") en `central/src/components/MonitorView.jsx` con `Tag` de antd color-codeado, preservando el texto exacto que verifican los tests existentes
- [ ] T019 [US3] Correr `npm test` en `central/` nuevamente y confirmar que las aserciones existentes sobre ubicación reciente/no reciente, "Regresando a base" y coexistencia con el estado MQTT (`central/tests/components/MonitorView.test.jsx`) siguen pasando sin modificarse

**Checkpoint**: las tres historias de usuario están completas y verificadas de forma independiente.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: validación final de los gates de la constitución y de consistencia visual con la referencia.

- [ ] T020 Validar manualmente el embebido en iframe angosto y el acceso directo de Central (Constitución, Principio III) siguiendo `specs/009-central-mejora-visual/quickstart.md`, paso 5
- [ ] T021 [P] Confirmar que `npm run build` en `central/` compila sin errores con las nuevas dependencias (`antd`, `@ant-design/icons`)
- [ ] T022 Hacer una revisión visual side-by-side de Central contra `rs956/frontend` para confirmar SC-004 (paleta, tipografía y estilo de navegación/tablas coherentes)

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
- No se agregan tests de contrato/integración porque la feature no crea endpoints ni entidades (data-model.md); los tests existentes de `central/tests/components/` son la guardia de no-regresión (FR-006)
- Correr `npm test` en `central/` al final de cada historia, no solo al final de todo el trabajo
- Detenerse en cada checkpoint para validar la historia de forma independiente antes de seguir
- Evitar: cambiar aserciones de tests existentes solo para que "pasen" — si un test existente falla, el markup debe ajustarse para preservar el comportamiento observable (texto, roles ARIA), no al revés
