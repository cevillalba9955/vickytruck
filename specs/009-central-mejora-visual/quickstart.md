# Quickstart: validar el rediseño visual de Central

## Prerrequisitos

- Node `>=20.12` (ya requerido por `central/package.json`).
- Dependencias instaladas: `cd central && npm install` (instala `antd` y
  `@ant-design/icons` una vez agregadas al `package.json`).
- Variables de entorno existentes de `central/.env` (sin cambios para esta
  feature).

## 1. Levantar Central en modo desarrollo

```bash
cd central
npm run dev
```

Abrir la URL que imprime Vite (por defecto `http://localhost:5173`).

## 2. Validar US1 — jerarquía visual clara

1. Con recorridos activos disponibles (o datos de prueba desde el backend de
   Central), confirmar que el panel muestra una navegación lateral con
   Monitoreo / Mapa / Historial, y que la sección activa se distingue
   visualmente del resto (Acceptance Scenario 1).
2. En Monitoreo, confirmar que la tabla tiene encabezados diferenciados,
   separación de filas y bordes consistentes (Acceptance Scenario 2) — sin
   que cambien los datos ya mostrados antes del rediseño.
3. Abrir el Detalle de un recorrido y confirmar que la información
   (estado, cierre, línea de tiempo de puntos, mapa) aparece dentro de un
   panel con jerarquía clara, no como texto suelto (Acceptance Scenario 3).

## 3. Validar US2 — navegación sin perder contexto

1. Hacer clic en cada sección (Monitoreo, Mapa, Historial) y confirmar que
   el menú lateral resalta la sección activa en cada cambio.
2. Desde Monitoreo, abrir el Detalle de un recorrido y confirmar que existe
   una acción de retorno visualmente clara ("← Volver al monitoreo") que
   regresa a Monitoreo.
3. Repetir el mismo flujo de detalle/retorno desde Historial.

## 4. Validar US3 — indicadores de estado siguen siendo distinguibles

1. Con un recorrido cuya `ultimaUbicacion.reciente` sea `false`, confirmar
   que la fila sigue siendo visualmente distinguible de las filas con
   ubicación reciente en Monitoreo.
2. Con el canal MQTT desconectado (o forzando el estado en desarrollo),
   confirmar que el aviso de estado del canal (`role="status"`) sigue siendo
   visible.
3. Con un recorrido en estado `esperandoFinalizar: true`, confirmar que
   sigue mostrando "Regresando a base" de forma distinguible.

## 5. Validar compatibilidad con iframe y acceso directo (Principio III)

1. **Acceso directo**: abrir la URL de Central directamente (fuera de
   cualquier frame) y repasar los pasos 2–4 sin errores en consola.
2. **Embebido**: servir una página HTML mínima con
   `<iframe src="http://localhost:5173" style="width: 480px; height: 700px">`
   (ancho angosto, simulando una región de una página APEX) y confirmar que
   el panel se sigue viendo y usando correctamente, con scroll interno donde
   haga falta, sin romper la navegación ni superponer elementos
   (Edge case de iframe angosto).

## 6. Correr los tests existentes como guardia de no-regresión (FR-006)

```bash
cd central
npm test
```

Todos los tests de `central/tests/components/` (incluyendo
`MonitorView.test.jsx` y `RecorridoDetalle.test.jsx`, que verifican textos y
roles ARIA concretos) deben seguir pasando sin modificaciones de
comportamiento — solo se permiten los tests nuevos que cubran US2
(sección activa en el menú), no cambios a las aserciones de datos
existentes.
