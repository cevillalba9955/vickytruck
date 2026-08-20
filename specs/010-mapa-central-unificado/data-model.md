# Data Model: Mapa Central Unificado

No se agrega ninguna entidad persistida nueva. Este documento describe los
campos que se agregan a la respuesta ya existente de
`GET /api/central/recorridos/activos`, y las vistas derivadas (solo lectura,
calculadas en el frontend) que introduce esta feature.

## Cambios al backend: `GET /api/central/recorridos/activos`

Cada elemento de `recorridos` (ver `RecorridoCloud` en
`specs/003-arquitectura-cloud-mqtt/data-model.md`) agrega:

| Campo | Tipo | Origen | Notas |
|---|---|---|---|
| `puntos` | array de punto (mismo formato que `serializarPuntosCentral`, ya usado en `listarHistorial`/`obtenerDetalle`) | `recorrido.puntos` | Antes ausente en `listarActivos()`; necesario para pintar todos los puntos de todos los recorridos activos a la vez (US1). |
| `puntoSalida` | `{ lat, lon }`, opcional | Campo opcional del payload de upsert de Oracle (Endpoint 1, `integracion-api.md`) | Presente solo si ese recorrido indica un origen distinto al predeterminado (FR-006/FR-008). Ausente en el caso hoy habitual. |

La respuesta de nivel superior (junto a `recorridos`) agrega:

| Campo | Tipo | Origen | Notas |
|---|---|---|---|
| `puntoSalidaDefault` | `{ lat, lon }` | Constante de configuración del backend cloud (research.md, Decisión 2) | Siempre presente, independiente de si `recorridos` está vacío (US4). Valor actual: `{ lat: -34.8097527, lon: -58.4574414 }`. |

## Cambios al contrato Oracle → Cloud (Endpoint 1, upsert de recorridos)

`specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md`, cuerpo de
cada recorrido en `POST /api/integracion/recorridos`, agrega:

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `puntoSalida` | `{ lat, lon }` | No | Si se omite, el recorrido usa `puntoSalidaDefault`. Igual que `puntos[].lat/.lon`, es topología fija (no un evento del chofer). |

## MarcadorMapa (derivado, no persistido)

Calculado por `central/src/services/marcadores.js` a partir de la respuesta
extendida de `GET /api/central/recorridos/activos`. Reemplaza/extiende al
`MarcadorFlete` de 004-mapa-seguimiento-central agregando el `color` y el
`tipo` de marcador.

| Campo | Tipo | Origen |
|---|---|---|
| `recorridoId` | string | `recorrido.id` |
| `tipo` | enum: `flete` \| `punto` \| `salidaDefault` \| `salidaRecorrido` | derivado según de qué campo sale el marcador |
| `color` | string (hex) | asignado por posición del recorrido en la lista `recorridos`, sobre una paleta fija (research.md, Decisión 3); `null`/sin color para `tipo: "salidaDefault"` |
| `lat`, `lon` | decimal | `ultimaUbicacion.lat/.lon` (tipo `flete`), `punto.lat/.lon` (tipo `punto`), `puntoSalida.lat/.lon` (tipo `salidaRecorrido`) o `puntoSalidaDefault.lat/.lon` (tipo `salidaDefault`) |
| `etiquetaHover` | string | nombre del flete/recorrido (`flete`), nombre de cliente o `"Punto {orden}"` (`punto`), o texto fijo identificando el punto de salida (`salidaDefault`/`salidaRecorrido`) |
| `clienteId`/`orden`/`estado` | — | solo en `tipo: "punto"`, igual que `PuntoEnMapa` ya existente (004-mapa-seguimiento-central) |

**Regla de filtrado (heredada de FR-007/004)**: un recorrido sin
`ultimaUbicacion` no produce marcador `tipo: "flete"`; un punto sin `lat`/`lon`
válidos no produce marcador `tipo: "punto"` — ninguna de las dos reglas
cambia con esta feature.

**Regla de unicidad del punto de salida (FR-006, US4)**: `tipo:
"salidaDefault"` se calcula **una sola vez** por respuesta (no una vez por
recorrido), independientemente de cuántos recorridos activos compartan el
punto de salida predeterminado. `tipo: "salidaRecorrido"` se calcula una vez
por cada recorrido que traiga `puntoSalida` propio.

## Sin cambios a entidades existentes

`RecorridoCloud`, `PuntoEntregaCloud` y `CredencialMqttFlete` (definidas en
`specs/003-arquitectura-cloud-mqtt/data-model.md`) no cambian de forma más
allá de los campos agregados arriba. El límite de 10 puntos por recorrido
(Principio II) y las reglas de progreso/estado de punto no cambian.
