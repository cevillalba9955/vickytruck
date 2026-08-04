# Data Model: Central — Panel de Control de Recorridos y Fletes

Todas las entidades viven en Oracle (Principio IV). Este panel **no crea ni edita**
puntos de entrega ni el directorio de fletes (confirmado en Clarifications de spec.md);
solo consulta y, para `Asignación`, escribe a través del package `CENTRAL_API` (ver
research.md §6). Los nombres de vista/tabla/columna documentados aquí son un supuesto
razonable siguiendo la convención ya validada en 001-chofer-recorrido — a confirmar contra
la instancia real durante la implementación (research.md §5), igual que ocurrió con
`V_RECORRIDOS`/`V_PUNTOS_ENTREGA`.

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

## Flete (NUEVO para esta feature; directorio gestionado fuera de este panel)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | identificador | clave primaria, ya existente en el directorio externo |
| `disponible` | booleano derivado | `true` si no tiene un recorrido `activo` asignado en este momento |
| `ultimaUbicacionLat`, `ultimaUbicacionLon` | decimal, nullable | última ubicación GPS reportada mientras ejecuta un recorrido activo |
| `ultimaUbicacionEn` | timestamp, nullable | marca de tiempo del último reporte; `NULL` si nunca reportó |
| `ubicacionReciente` | booleano derivado | `false` si `ultimaUbicacionEn` es más antigua que el umbral configurado (FR-014, research.md §7) |

**Reglas de validación**:
- Este panel no crea ni edita fletes; `disponible` y `ubicacionReciente` son valores
  derivados en cada respuesta, no columnas propias necesariamente.

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
  reciente } }`.
- **Recorridos disponibles** (FR-003): recorridos con `fleteId = NULL`.
- **Fletes disponibles** (FR-004): fletes sin un recorrido `activo` asignado en este
  momento.
- **Historial** (FR-010, Historia 5): recorridos con `estado = finalizado`, con su línea de
  tiempo completa de eventos (reutiliza los timestamps de `PuntoEntrega`).
