# Quickstart: validar el mapa consolidado de Central

## Prerrequisitos

- Backend y `central` corriendo en modo desarrollo (ver quickstart de
  003-arquitectura-cloud-mqtt para levantar el backend con el store
  operacional en memoria).
- Al menos 2 recorridos de prueba con `puntos` (topología con `lat`/`lon`)
  cargados vía `POST /api/integracion/recorridos` (ver
  `contracts/mapa-central-api.md`), con estado `activo`.

## 1. Levantar backend y Central

```bash
cd backend
npm start
```

```bash
cd central
npm run dev
```

Abrir la URL que imprime Vite y navegar a la sección **Mapa**.

## 2. Validar US1 — vista consolidada por color

1. Con 0 recorridos activos, confirmar que la vista de Mapa ya no muestra
   únicamente el mensaje "No hay recorridos activos" — ver paso 5 (US4).
2. Cargar (o esperar) al menos 2 recorridos activos con puntos de entrega.
   Confirmar que el mapa muestra, sin seleccionar ningún recorrido primero:
   - los puntos de entrega de ambos recorridos, y
   - la posición de flete de cada uno (si ya reportó ubicación).
3. Confirmar que todos los marcadores (posición + puntos) de un mismo
   recorrido comparten color, y que ese color no se repite con el del otro
   recorrido activo.
4. Con un recorrido activo que todavía no reportó `ultimaUbicacion`,
   confirmar que sus puntos igual aparecen (con su color), sin ningún
   marcador de posición inventado.
5. Hacer click sobre el marcador de posición de un flete y confirmar que
   abre el Detalle de ese recorrido (comportamiento ya existente,
   preservado).

## 3. Validar US2 — ícono distinto para el flete/chofer

1. Con un recorrido que tenga posición de flete y puntos de entrega visibles,
   confirmar que el marcador de posición usa una forma distinta a la de los
   marcadores de punto de entrega (aun compartiendo color).
2. Con varios recorridos activos, confirmar que todas las posiciones de
   flete comparten la misma familia de ícono entre sí (solo cambia el
   color), y lo mismo para los puntos de entrega.

## 4. Validar US3 — nombre del cliente al pasar el mouse

1. Pasar el mouse (sin click) sobre un punto de entrega con cliente
   informado y confirmar que aparece el nombre del cliente.
2. Pasar el mouse sobre un punto sin cliente informado y confirmar el
   fallback "Punto {orden}".
3. Pasar el mouse sobre una posición de flete y confirmar que se identifica
   a qué flete/recorrido pertenece (no un nombre de cliente).

## 5. Validar US4 — punto de salida siempre visible

1. Con 0 recorridos activos, confirmar que el mapa muestra el punto de
   salida por defecto (`lat=-34.8097527`, `lon=-58.4574414`) — no la
   ausencia total de mapa.
2. Con 2+ recorridos activos que parten del punto de salida por defecto
   (caso sin `puntoSalida` propio en el payload de Oracle), confirmar que
   aparece **un único** marcador de salida compartido — no uno por
   recorrido.
3. Cargar un recorrido con `puntoSalida` propio (distinto al
   predeterminado) vía `POST /api/integracion/recorridos` y confirmar que
   aparece, además del marcador por defecto, un marcador propio para ese
   origen, con el color de ese recorrido.
4. Pasar el mouse sobre el marcador de salida por defecto y confirmar que
   se identifica como punto de salida (no como un punto de entrega), y que
   no dispara ningún click (no abre ningún Detalle — no pertenece a un
   recorrido en particular).

## 6. Validar que no hay pedidos de red adicionales (Constraint de plan.md)

En las herramientas de red del navegador, confirmar que abrir la vista de
Mapa con varios recorridos activos no dispara un pedido por recorrido —
todo (posiciones, puntos, punto de salida) llega en la misma respuesta ya
polleada de `GET /api/central/recorridos/activos`.

## 7. Correr los tests existentes como guardia de no-regresión (FR-007)

```bash
cd backend
npm test
```

```bash
cd central
npm test
```

Todos los tests ya existentes de `MapaSeguimiento`, `MonitorView` y
`RecorridoDetalle` deben seguir pasando sin modificar sus aserciones de
datos — solo se agregan tests nuevos para los tipos de marcador, el color
por recorrido y el punto de salida.
