# Data Model: Central — Mapa de Seguimiento de Fletes

No se agrega ninguna entidad persistida nueva. Este documento describe las
vistas derivadas (solo lectura, calculadas en el frontend a partir de datos
ya expuestos por el backend) que introduce esta feature.

## MarcadorFlete (derivado, no persistido)

Calculado por `central/src/services/marcadores.js` a partir de cada elemento
de la respuesta de `GET /api/central/recorridos/activos` (ver
`RecorridoCloud`/`Derivados de solo lectura` en
`specs/003-arquitectura-cloud-mqtt/data-model.md`).

| Campo | Tipo | Origen |
|---|---|---|
| `recorridoId` | string | `recorrido.id` |
| `fleteNombre` | string, nullable | `recorrido.flete.nombre` |
| `lat`, `lon` | decimal | `recorrido.ultimaUbicacion.lat/.lon` |
| `en` | timestamp ISO | `recorrido.ultimaUbicacion.en` |
| `reciente` | boolean | `recorrido.ultimaUbicacion.reciente` (mismo umbral ya definido en 002-panel-control-central, FR-014) |

**Regla de filtrado (FR-007)**: un `RecorridoCloud` sin `ultimaUbicacion`
(`null` o sin `lat`/`lon`) **no produce** ningún `MarcadorFlete` — no se
inventa una posición por defecto.

## PuntoEnMapa (derivado, no persistido)

Calculado a partir de la respuesta extendida de
`GET /api/central/recorridos/:id` (ver `contracts/central-map-api.md` para
el cambio de contrato que agrega `lat`/`lon`).

| Campo | Tipo | Origen |
|---|---|---|
| `id` | string | `punto.id` |
| `orden` | número | `punto.orden` |
| `lat`, `lon` | decimal | `punto.lat`/`punto.lon` (topología fija del punto, agregado en esta feature a la respuesta de detalle) |
| `estado` | enum: `pendiente` \| `arribado` \| `completado` | `punto.estado` |

**Regla**: los `PuntoEnMapa` se muestran siempre que el recorrido tenga
puntos, independientemente de si existe o no `MarcadorFlete` para ese
recorrido (un flete puede no haber reportado ubicación todavía y aun así el
recorrido tiene su topología fija ya conocida — ver Edge Cases de `spec.md`).

## Sin cambios a entidades existentes

`RecorridoCloud`, `PuntoEntregaCloud` y `CredencialMqttFlete` (definidas en
`specs/003-arquitectura-cloud-mqtt/data-model.md`) no cambian de forma. El
único cambio de backend es que `serializarPuntosCentral` (que alimenta
`GET /api/central/recorridos/:id` y `GET /api/central/recorridos/historial`)
pasa a incluir dos campos (`lat`, `lon`) que ya existían en el objeto
`punto` interno pero no se serializaban hacia Central.
