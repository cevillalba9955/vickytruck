# Data Model: Central — Panel de Control de Recorridos y Fletes

La mayoría de las entidades viven en Oracle (Principio IV): `Recorrido`, `Asignación` y
`PuntoEntrega`. La **excepción** es la última ubicación conocida de un flete: vive
principalmente en memoria del backend compartido con 001-chofer-recorrido, con un
respaldo derivado de eventos ya persistidos en Oracle cuando no hay dato en memoria (ver
research.md §8). Este panel **no crea ni edita** puntos de entrega ni el directorio de
fletes (confirmado en Clarifications de spec.md); solo consulta y, para `Asignación`,
escribe a través del package `CENTRAL_API` (ver research.md §6). Los nombres de
vista/tabla/columna documentados aquí son un supuesto razonable siguiendo la convención
ya validada en 001-chofer-recorrido — a confirmar contra la instancia real durante la
implementación (research.md §5), igual que ocurrió con `V_RECORRIDOS`/`V_PUNTOS_ENTREGA`.

## Recorrido (extiende la entidad ya definida en 001-chofer-recorrido)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | identificador | ya existente |
| `token` | string opaco | ya existente; generado al asignar (FR-006) |
| `estado` | enum: `activo` \| `finalizado` | ya existente |
| `fleteId` | FK → Flete, nullable | **NUEVO** para esta feature — `NULL` cuando el recorrido está precargado sin asignar |
| `asignadoEn` | timestamp, nullable | **NUEVO** — fecha/hora de la asignación vigente |

**Estado derivado para esta feature**:

```text
sin_asignar (fleteId = NULL) --(asignar)--> activo (fleteId = X) --(todos los puntos completados)--> finalizado
                                        --(reasignar)--> activo (fleteId = Y, mismos puntos/estado)
```

**Reglas de validación**:
- Un recorrido con `fleteId = NULL` es "disponible para asignación" (FR-003).
- Un recorrido con `fleteId` no nulo y `estado = activo` no puede recibir una segunda
  asignación simple (FR-007); solo la acción explícita de reasignación puede cambiar su
  `fleteId` (FR-009).
- La reasignación no modifica el estado de los `PuntoEntrega` ya registrados (FR-009,
  Historia 4).

## Flete (directorio estático en Oracle — NUEVO para esta feature en cuanto a su consumo)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | identificador | clave primaria, ya existente en el directorio externo (`V_FLETES`) |
| `nombre` | string | dato estático del directorio (`V_FLETES`) |
| `disponible` | booleano derivado | `true` si no tiene un recorrido `activo` asignado en este momento (se calcula contra `Recorrido`, no vive en `V_FLETES`) |

**`V_FLETES` es puramente estático** (research.md §8): no tiene ni tendrá columnas de
ubicación. `id` y `nombre` son los únicos campos que este panel necesita de ahí.

**Reglas de validación**:
- Este panel no crea ni edita fletes; `disponible` es un valor derivado en cada
  respuesta, no una columna propia de `V_FLETES`.

## Ubicación conocida de un flete (derivada — NO vive en `V_FLETES`)

| Campo | Tipo | Notas |
|---|---|---|
| `lat`, `lon` | decimal, nullable | posición más reciente disponible, según la prioridad de abajo |
| `en` | timestamp, nullable | marca de tiempo de esa posición; `NULL` si no hay ninguna fuente disponible |
| `reciente` | booleano derivado | `false` si `en` es más antiguo que el umbral configurado (`UBICACION_STALE_MS`, research.md §7), sin importar la fuente |
| `fuente` (interno, no necesariamente expuesto en la API) | enum: `memoria` \| `evento_oracle` \| `ninguna` | de dónde salió el dato, para depuración/tests |

**Prioridad de obtención** (FR-016, research.md §8):
1. Posición en memoria del backend compartido con 001-chofer-recorrido (`Ubicación
   instantánea (en memoria)`, ver `specs/001-chofer-recorrido/data-model.md`).
2. Si no hay dato en memoria: última ubicación de un evento `arribo` o `descarga` ya
   persistido en Oracle para el recorrido activo de ese flete (`PuntoEntrega.arriboLat/Lon`
   o `descargaLat/Lon`, el que tenga el timestamp más reciente).
3. Si tampoco hay evento persistido: sin ubicación disponible (`lat`/`lon`/`en` en
   `null`, `reciente = false`).

## Asignación (NUEVO — relación Recorrido↔Flete con historial implícito)

| Campo | Tipo | Notas |
|---|---|---|
| `recorridoId` | FK → Recorrido | — |
| `fleteId` | FK → Flete | flete vigente en el momento de la consulta |
| `asignadoEn` | timestamp | fecha/hora de la asignación vigente (ver `Recorrido.asignadoEn`) |
| `tokenAnteriorInvalidado` | booleano, solo en respuesta de reasignación | informativo, para que el frontend confirme que el enlace previo ya no es válido (US4, escenario 2) |

**Nota**: no se modela como tabla separada obligatoria; puede vivir como columnas de
`Recorrido` (`fleteId`, `asignadoEn`) si el esquema real lo permite así, o como una tabla
de historial de asignaciones si se necesita conservar reasignaciones pasadas — decisión
de implementación a confirmar con el dueño del esquema (fuera del alcance de este
documento fijar la forma física exacta).

## PuntoEntrega (reutilizada de 001-chofer-recorrido — solo lectura desde este panel)

Mismos campos que en `specs/001-chofer-recorrido/data-model.md` (`id`, `orden`,
`latitud`, `longitud`, `estado`, `arriboEn`/`arriboLat`/`arriboLon`,
`descargaEn`/`descargaLat`/`descargaLon`). Este panel solo los lee (Historia 3 — detalle
de recorrido); no ofrece ninguna acción de escritura sobre ellos (fuera de alcance).

## Derivados de solo lectura para la UI de Central

- **Resumen de monitoreo** (FR-001, Historia 1): por cada recorrido `activo`, `{ fleteId,
  progreso: { pendientes, arribados, completados }, ultimaUbicacion: { lat, lon, en,
  reciente } }`, donde `ultimaUbicacion` sigue la prioridad memoria → evento Oracle →
  sin datos descripta arriba (FR-016).
- **Recorridos disponibles** (FR-003): recorridos con `fleteId = NULL`.
- **Fletes disponibles** (FR-004): fletes sin un recorrido `activo` asignado en este
  momento.
- **Historial** (FR-010, Historia 5): recorridos con `estado = finalizado`, con su línea de
  tiempo completa de eventos (reutiliza los timestamps de `PuntoEntrega`).
