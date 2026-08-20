# Tasks: Unificar Monitoreo y Mapa

**Input**: [spec.md](./spec.md)

**Nota**: feature implementada directamente en la conversación en la que se
pidió (ver spec.md, Notas de proceso) — este archivo documenta
retroactivamente las tareas ya completadas, sin fases de Setup/Foundational
separadas (no hubo dependencias nuevas ni infraestructura compartida más
allá de los componentes ya existentes).

## Tareas

- [X] T001 [US1] En `central/src/main.jsx`, fusionar las vistas `"monitor"` y `"mapa"` en una sola (`"monitor"`): `MonitorView` seguido de `MapaSeguimiento` (dentro de un `Card`, `marginTop: 16`) debajo de la grilla
- [X] T002 [US1] Confirmar que abrir el Detalle desde una fila de la grilla o desde un marcador del mapa, y volver ("Volver al monitoreo"), siguen funcionando sin cambios sobre la vista unificada
- [X] T003 [US2] En `central/src/components/AppShell.jsx`, quitar `Sider`/`Menu` y agregar un botón en el `Header` que alterna entre `"monitor"` y `"historial"`, con el ícono/label de la sección de destino (`SECCION_ALTERNA`)
- [X] T004 [US2] Verificar que el click en el botón de alternar funciona correctamente incluso estando en el Detalle (navega directo a la otra sección, igual que el menú lateral anterior)
- [X] T005 [P] Reescribir `central/tests/components/AppShell.test.jsx` para el botón de alternar (los tests anteriores verificaban el menú lateral que ya no existe)
- [X] T006 Correr la suite completa (`backend: npm test`, `central: npm test`) como guardia de no-regresión (FR-005) — 165/165 backend + 79/79 central
- [X] T007 Verificar en vivo con backend real: grilla+mapa en una sola pantalla, botón de header alternando en ambos sentidos, apertura/cierre de Detalle sin errores de consola

## Notas

- No se generaron `plan.md`/`research.md` separados — el diseño (un botón
  único que alterna, en vez de un `Segmented`/menú horizontal de 2 ítems)
  se decidió y aplicó en el mismo paso, siguiendo la instrucción explícita
  del usuario ("un botón que alterne").
- Sin cambios de backend ni de contrato de datos.
