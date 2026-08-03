# Data Model: App Chofer — Recepción y Ejecución de Recorrido de Entregas

Todas las entidades viven en Oracle (Principio IV); este documento describe su forma
lógica, no el DDL final (que depende de las tablas ya precargadas por la feature de
Central — se documenta aquí el contrato mínimo que este backend necesita leer/escribir).

**Lectura vs escritura (confirmado contra la instancia real, 2026-08-03)**: este backend
lee `V_RECORRIDOS`/`V_PUNTOS_ENTREGA`, que son vistas generadas de solo lectura, y escribe
exclusivamente a través del package PL/SQL `RECORRIDO_API`
(`backend/sql/recorrido_api.pks.sql` — ver research.md §7). Los campos de esta sección
describen lo que el backend lee/necesita, no necesariamente el nombre de las tablas base
reales detrás de las vistas.

## Recorrido

Representa el conjunto ordenado de hasta 10 puntos de entrega asignado a un flete.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | identificador | clave primaria (gestionada por Oracle/Central) |
| `token` | string opaco | enlace único de acceso del chofer; único, indexado |
| `estado` | enum: `activo` \| `finalizado` | `finalizado` cuando todos los puntos están `completado` |
| `creadoEn` | timestamp | fecha de asignación (informativo) |

**Reglas de validación**:
- Un `Recorrido` tiene entre 1 y 10 `PuntoEntrega` (Principio II).
- `token` debe ser único en todo el sistema.
- La transición a `estado = finalizado` es derivada (todos los puntos `completado`), no
  se setea manualmente desde esta feature.

## PuntoEntrega

Un destino dentro de un recorrido.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | identificador | clave primaria |
| `recorridoId` | FK → Recorrido | — |
| `orden` | entero 1..10 | posición en la secuencia definida por Central; único dentro del recorrido |
| `latitud`, `longitud` | decimal | ubicación del destino (provista por Central) |
| `estado` | enum: `pendiente` \| `arribado` \| `completado` | ver transiciones abajo |
| `arriboEn` | timestamp, nullable | marca de tiempo del evento "arribo" |
| `arriboLat`, `arriboLon` | decimal, nullable | ubicación GPS del chofer al marcar arribo, si estaba disponible |
| `descargaEn` | timestamp, nullable | marca de tiempo del evento "descarga completa" |
| `descargaLat`, `descargaLon` | decimal, nullable | ubicación GPS del chofer al marcar descarga, si estaba disponible |

**Transiciones de estado** (FR-004, FR-005, FR-007):

```text
pendiente --(marcar arribo)--> arribado --(marcar descarga completa)--> completado
```

- No existe transición directa `pendiente → completado`.
- No hay reglas de orden entre puntos distintos: cualquier punto `pendiente` puede
  recibir "arribo" sin importar el estado de los demás (marcado libre, ver
  Clarifications de spec.md).
- Repetir la misma transición ya aplicada (ej. arribo sobre un punto ya `arribado`) es
  idempotente a nivel de API (ver research.md §6); a nivel de UI esa acción no se ofrece
  (FR-007).

## EnlaceUnico (token)

Modelado como el atributo `token` de `Recorrido` (no como tabla separada) salvo que la
feature de Central requiera rotación/revocación de múltiples tokens por recorrido, lo
cual no se asume en este alcance (ver Assumptions de spec.md).

| Estado lógico | Efecto al resolver el token |
|---|---|
| Vigente, recorrido `activo` | Devuelve el recorrido completo (FR-002, FR-003) |
| Revocado / inexistente / recorrido ya `finalizado` hace tiempo | 404/410 con mensaje de enlace inválido, sin exponer datos de otros recorridos (FR-012) |

## Derivados de solo lectura para la UI

- **Progreso del recorrido** (FR-008): `{ pendientes, arribados, completados }`,
  calculado a partir del conteo de `PuntoEntrega.estado` — no se persiste, se deriva en
  cada respuesta de la API.
- **Posición en la secuencia** ("3 de 10", FR-003): `orden` del punto y `COUNT(*)` de
  puntos del recorrido.
