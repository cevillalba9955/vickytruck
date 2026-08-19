# Implementation Plan: Rediseño visual de Central

**Branch**: `009-central-mejora-visual` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-central-mejora-visual/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Central (`central/`) hoy usa markup plano sin librería de componentes: navegación
por botones sueltos, tablas con CSS mínimo, y la vista de Detalle como texto
suelto. El objetivo es rediseñar visualmente las cuatro vistas existentes
(Monitoreo, Mapa, Historial, Detalle) para que adopten la identidad visual de
`rs956/frontend` (header/navegación oscura, sidebar de secciones, tablas de
líneas grises, paneles tipo card) **sin tocar ningún dato, endpoint, cadencia
de polling/MQTT ni comportamiento existente** (FR-006). El enfoque técnico es
adoptar Ant Design (`antd` + `@ant-design/icons`) con un `themeConfig`
propio de Central inspirado en `rs956/frontend/src/theme/tokens.js`,
reemplazando el `<nav>`/`<table>` artesanales por `Layout`/`Menu`/`Table`/`Card`
de antd, igual que ya hace la referencia.

## Technical Context

**Language/Version**: JavaScript (ES modules), React 18.3 — sin cambios de versión de Node (`>=20.12`, ya declarado en `central/package.json`)

**Primary Dependencies**: React 18.3 + Vite 5 (existentes); `react-leaflet` 4.2 / `leaflet` 1.9 y `mqtt` 5.10 (existentes, sin cambios de comportamiento); **nuevas**: `antd` (misma major que `rs956/frontend`, v6) y `@ant-design/icons`, para `Layout`/`Menu`/`Table`/`Card` y como base del theming visual

**Storage**: N/A — la feature no agrega ni modifica persistencia; sigue usando los mismos endpoints/estado en memoria que hoy

**Testing**: Vitest 2 + `@testing-library/react` 16 + jsdom (ya configurados en `central/tests`); se reutilizan los tests existentes como guardia de no-regresión funcional (FR-006), agregando únicamente los necesarios para cubrir la navegación con sección activa (US2)

**Target Platform**: Navegador de escritorio; embebido como iframe en una página Oracle APEX o accedido directamente por su propia URL (Constitución, Principio III) — no mobile-first

**Project Type**: Web frontend — SPA existente en `central/` dentro del monorepo `vickytruck`; no requiere cambios en `central/backend` ni en `backend/`

**Performance Goals**: Sin regresión sobre la cadencia de actualización actual (`INTERVALO_POLLING_RESPALDO_MS` = 5000ms, `INTERVALO_POLLING_MQTT_CONECTADO_MS` = 30000ms en `central/src/main.jsx`) ni sobre la reconexión MQTT; no hay SLA de carga inicial definido por el spec más allá de "uso interno de escritorio aceptable"

**Constraints**: No romper el embebido en iframe (sin cambios de CSP/`X-Frame-Options`, sin asumir ventana de nivel superior — Principio III); layout de escritorio, no mobile-first; cero cambios de comportamiento funcional, forma de datos o llamadas a la API existente (FR-006)

**Scale/Scope**: 4 vistas existentes restyladas (Monitoreo, Mapa, Historial, Detalle) + navegación nueva (`AppShell`) + theme config nuevo; ~7 archivos de `central/src` tocados, sin nuevos endpoints ni entidades de datos

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Aplica | Evaluación |
|---|---|---|
| I. Chofer: página única, móvil-primero | No | Esta feature solo toca `central/`; la app del Chofer (`frontend/`) no se modifica (ver Assumptions del spec). |
| II. Ruta acotada y ordenada (máx. 10 puntos) | No | No se modifica el modelo de puntos/recorridos ni su lógica de orden; solo su presentación en `RecorridoDetalle`. |
| III. Central compatible con iframe APEX y acceso directo (NON-NEGOTIABLE) | **Sí** | Gate: el nuevo layout (`Layout`/`Sider` de antd) no debe asumir ventana de nivel superior, no debe introducir popups bloqueables ni cookies de terceros, y debe seguir funcionando dentro de un `<iframe>` angosto (con scroll interno, no rotura). Se valida manualmente en ambos modos antes de cerrar el plan (FR-007, SC-003) — ver quickstart.md. |
| IV. Fuentes de verdad por dominio y sincronización explícita | No | No se tocan clientes de Oracle ni el store operacional cloud; `central/src/services/api.js` y `mqttClient.js` no cambian de contrato. |
| V. Trazabilidad de estado y ubicación en tiempo (casi) real | **Sí** (preservar) | El polling y la suscripción MQTT de `main.jsx` no cambian de lógica ni cadencia; solo cambia cómo se presentan sus resultados (FR-005, FR-006). Los tests existentes de `MonitorView`/`RecorridoDetalle` actúan como guardia. |
| VI. Mensajería interna confiable | No | Central no implementa mensajería chofer↔central; fuera de alcance. |
| VII. Simplicidad y datos mínimos necesarios | **Sí** (con nota) | Se evalúa agregar `antd` como nueva dependencia de UI. Ver "Complexity Tracking" abajo: se considera la alternativa más simple (CSS artesanal) y se justifica por qué se descarta. |

**Resultado**: PASA con una entrada en Complexity Tracking (adopción de `antd`), sin violar ningún principio de forma directa — no hay cambios de datos, de fuente de verdad, ni de compatibilidad con embebido que no estén explícitamente cubiertos y verificados.

## Project Structure

### Documentation (this feature)

```text
specs/009-central-mejora-visual/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command) — sin entidades nuevas
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No se genera `contracts/`: la feature no expone ni consume ninguna interfaz
nueva (no hay endpoints, mensajes MQTT ni CLI nuevos) — es exclusivamente
presentación sobre datos ya existentes.

### Source Code (repository root)

Proyecto existente de tipo "web application" ya presente en el repo
(`central/` = frontend de escritorio, `central/backend` = su API propia,
sin relación con este cambio). Esta feature solo toca `central/src` (y sus
tests en `central/tests`) — no requiere cambios en `central/backend`,
`backend/` (API del Chofer) ni `frontend/` (app del Chofer).

```text
central/
├── package.json                    # + antd, @ant-design/icons
├── src/
│   ├── main.jsx                    # nav actual (<nav className="app__nav">) → <AppShell>
│   ├── styles.css                  # se reduce a lo que antd no cubre (igual que app.css en rs956)
│   ├── theme/
│   │   └── tokens.js                # NUEVO — themeConfig de antd para Central, inspirado en
│   │                                 # rs956/frontend/src/theme/tokens.js
│   ├── components/
│   │   ├── AppShell.jsx             # NUEVO — Layout/Sider/Menu de antd (Monitoreo/Mapa/Historial)
│   │   ├── MonitorView.jsx          # restyle: <table> artesanal → <Table> de antd (misma data/props)
│   │   ├── HistorialView.jsx        # restyle: ídem MonitorView
│   │   ├── RecorridoDetalle.jsx     # restyle: texto suelto → <Card>/<Descriptions> de antd
│   │   └── MapaSeguimiento.jsx      # sin cambios de lógica; solo el contenedor que lo envuelve
│   └── services/                    # sin cambios (api.js, marcadores.js, mqttClient.js, polling.js, tiempo.js)
└── tests/
    └── components/                  # tests existentes como guardia de no-regresión (FR-006);
                                      # se agregan los necesarios para US2 (sección activa en el menú)
```

**Structure Decision**: se reutiliza la estructura ya existente de `central/`
(no se crean paquetes ni proyectos nuevos). El cambio es interno a
`central/src`: un `theme/` nuevo (paridad con el patrón ya usado en
`rs956/frontend/src/theme/`), un `AppShell` nuevo que centraliza la
navegación, y el restyle de los componentes de vista existentes manteniendo
sus mismas props/datos de entrada.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Nueva dependencia de UI: `antd` + `@ant-design/icons` (Principio VII, Simplicidad) | El spec pide adoptar la identidad visual de `rs956/frontend` (navegación lateral, tablas de líneas grises, paneles tipo card, paleta/tipografía consistente — FR-001 a FR-004). `rs956/frontend` ya resolvió ese mismo problema con `antd` + un `themeConfig` propio; reutilizar esa misma librería y el mismo patrón de theming (en vez de un sistema de diseño nuevo) es la opción que agrega **menos** código propio a mantener, y no introduce nuevo almacenamiento de datos ni infraestructura de backend — el principio apunta a evitar infraestructura/datos innecesarios, no a evitar cualquier dependencia de presentación. | Reconstruir a mano en CSS puro un `Layout`/`Sider`/`Menu`/`Table` con el mismo aspecto (bordes, estados hover/selected, accesibilidad de teclado del menú, `Table` con orden/estados) implica escribir y mantener una versión propia y menos probada de lo que `antd` ya da resuelto — más código y más superficie de bugs que la dependencia en sí, con el riesgo adicional de que diverja visualmente de `rs956/frontend` con el tiempo. |

## Constitution Check — Re-check post-diseño (Fase 1)

Tras generar `research.md`, `data-model.md` y `quickstart.md`, no aparecen
violaciones nuevas: `data-model.md` confirma que no hay entidades, endpoints
ni contratos nuevos (Principios II/IV/VI siguen sin aplicar), y
`quickstart.md` incluye validación explícita del embebido en iframe angosto
y del acceso directo (Principio III) y de que los tests existentes —guardia
de la Trazabilidad de estado del Principio V— siguen pasando sin
modificarse. La única entrada de Complexity Tracking (adopción de `antd`)
se mantiene igual que en el check inicial. **Resultado: PASA.**
