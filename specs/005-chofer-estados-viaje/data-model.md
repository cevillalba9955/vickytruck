# Data Model: App Chofer — Información de Recorrido y Estados de Viaje Guiados

Extiende el modelo de `specs/001-chofer-recorrido/data-model.md` (Recorrido,
PuntoEntrega) sobre la misma implementación real: `backend/src/state/integracionStore.js`
(store en memoria, cloud-autoritativo para el plano operativo en vivo —
Principio IV). No se agrega persistencia nueva ni tablas; todo vive en el
mismo `Map` de recorridos ya existente.

## Recorrido (campos nuevos)

| Campo | Tipo | Notas |
|---|---|---|
| `viajeEstado` | enum: `detenido` \| `manejando` \| `descargando` | Nuevo. Default `detenido` al crear el recorrido (`upsertRecorridos`). No aplica cuando `recorrido.estado === 'finalizado'`. |
| `puntoActivoId` | string \| `null` | Nuevo. `id` del punto sobre el que aplica LLEGUE/DESCARGA COMPLETA. `null` en `detenido`. |
| `ultimaOperacion` | objeto \| `null` | Nuevo, para CANCELAR (ver abajo). |

### `ultimaOperacion`

| Campo | Tipo | Notas |
|---|---|---|
| `tipo` | enum: `iniciar` \| `llegue` \| `descarga-completa` \| `ir-primero` | Qué operación se puede revertir. |
| `puntoId` | string | Punto afectado. |
| `snapshotPrevio` | objeto | Campos exactos a restaurar si se cancela (ver por tipo, abajo). |
| `sincronizada` | boolean | `false` al crearse; pasa a `true` la primera vez que `GET /api/integracion/estado` sirve una respuesta que incluye este recorrido (research.md, Decisión 3). CANCELAR solo válido mientras es `false`. |
| `en` | timestamp | Informativo. |

`snapshotPrevio` por tipo:
- `iniciar`: `{ viajeEstado: 'detenido', puntoActivoId: null }`
- `llegue`: `{ viajeEstado: 'manejando', puntoActivoId, puntoEstado: 'pendiente', arriboEn: null, arriboLat: null, arriboLon: null }`
- `descarga-completa`: `{ viajeEstado: 'descargando', puntoActivoId, puntoEstado: 'arribado', descargaEn: null, descargaLat: null, descargaLon: null }`
- `ir-primero`: `{ ordenPrevio: [{ puntoId, orden }, ...] }` (orden previo de todos los puntos `pendiente` afectados, para restaurarlo tal cual).

**Reemplazo, no acumulación** (FR-018): cada nueva operación de viaje
sobrescribe `ultimaOperacion` completo, sin importar si la anterior seguía
`sincronizada: false`.

## PuntoEntrega (campos nuevos)

| Campo | Tipo | Notas |
|---|---|---|
| `cliente` | string \| `null` | Nombre del cliente. Visible al chofer (FR-002). |
| `direccion` | string \| `null` | Visible al chofer (FR-002). |
| `rangoHorario` | string \| `null` | Texto ya formateado desde Oracle (ej. "09:00–12:00"); esta app no lo valida ni calcula (Assumptions de spec.md). Visible al chofer (FR-002). |
| `notasEntrega` | string \| `null` | Visible al chofer (FR-002). |
| `remitoIds` | string[] | Nuevo, reemplaza el concepto singular `remito_id` del payload de Oracle. Lista de cero o más (FR-004a). **Dato interno — NUNCA se expone al chofer** (FR-003); disponible para Central. |

**Reglas de validación**:
- Todos los campos nuevos son opcionales/nullable a nivel de payload
  (FR-004): un punto sin `direccion`/`rangoHorario`/`notasEntrega` o con
  `remitoIds: []` es válido y se procesa igual que cualquier otro.
- `remitoIds` no tiene límite superior definido por esta especificación.
- Estos campos son de solo lectura para el chofer (Assumptions): el chofer
  nunca los edita; solo Oracle los actualiza vía `sincronizar_recorrido`.

**Sin cambios**: `id`, `orden`, `latitud`/`longitud`, `estado`
(`pendiente`/`arribado`/`completado`), `arriboEn`/`arriboLat`/`arriboLon`,
`descargaEn`/`descargaLat`/`descargaLon` — mismas reglas y transiciones que
ya definía 001-chofer-recorrido (`PUNTO_ESTADO_TRANSICION`, sin transiciones
inversas públicas; el "revertir" de CANCELAR es una restauración interna
acotada, no una transición nueva del state-machine — ver research.md,
Decisión 3).

## Transiciones de `viajeEstado`

```text
detenido --(INICIAR, fija puntoActivoId = primer punto pendiente)--> manejando
manejando --(LLEGUE, marca arribo en puntoActivoId)--> descargando
descargando --(DESCARGA COMPLETA, marca descarga en puntoActivoId)--> detenido (puntoActivoId = null)
```

- `INICIAR` solo válido si `viajeEstado === 'detenido'` y existe al menos un
  punto `pendiente`.
- `LLEGUE` solo válido si `viajeEstado === 'manejando'`.
- `DESCARGA COMPLETA` solo válido si `viajeEstado === 'descargando'`.
- Cualquier otra combinación devuelve `409 transicion_invalida` (mismo
  patrón que ya usan hoy `marcarArribo`/`marcarDescarga`).
- `IR PRIMERO` solo válido si `viajeEstado === 'detenido'`, sobre un punto
  `pendiente` distinto del primero (FR-015); no es una transición de
  `viajeEstado`, reordena `orden` entre puntos `pendiente`.
- `CANCELAR` restaura desde `ultimaOperacion.snapshotPrevio` si
  `ultimaOperacion existe && !sincronizada`; limpia `ultimaOperacion` tras
  aplicarse.
- Cuando `viajeEstado === 'detenido'` y no quedan puntos `pendiente`, no hay
  transición disponible salvo la confirmación client-side de FINALIZAR
  (FR-013), que no cambia ningún campo de este modelo (el recorrido ya
  queda `finalizado` por la regla derivada existente de 001-chofer-recorrido:
  todos los puntos `completado`).

## Serialización por consumidor (quién ve qué)

| Consumidor | Endpoint | Ve `cliente`/`direccion`/`rangoHorario`/`notasEntrega` | Ve `remitoIds` | Ve `viajeEstado`/`puntoActivoId` |
|---|---|---|---|---|
| Chofer | `GET /api/recorridos/:token` | Sí (FR-002) | **No** (FR-003) | Sí (necesita saberlo para renderizar el estado guiado) |
| Central | `GET /api/central/recorridos/activos`, `.../:id`, `.../historial` | No (fuera de alcance de esta spec para Central) | Sí (FR-003, "control interno de Central") | Sí (FR-021) |
| Oracle/APEX | `GET /api/integracion/estado` | N/A (Oracle es el origen de estos campos, no hace falta devolvérselos) | N/A (ídem) | No (Oracle no necesita el estado de viaje, solo `orden`/`estado`/eventos — ver contracts/) |

## Relación con `specs/001-chofer-recorrido/data-model.md`

- **Recorrido**: se mantienen `id`, `token`, `estado`, `creadoEn`; se agregan
  `viajeEstado`, `puntoActivoId`, `ultimaOperacion` (arriba). El campo
  `estado` (`activo`/`finalizado`) sigue siendo independiente de
  `viajeEstado` — un recorrido `activo` siempre tiene un `viajeEstado`
  válido; un recorrido `finalizado` no lo usa más.
- **PuntoEntrega**: se agregan los 5 campos informativos de arriba; el resto
  del modelo (incluidas las reglas de transición y de marcado idempotente)
  no cambia.
- **EnlaceUnico (token)**: sin cambios.
- **Derivados de solo lectura para la UI**: se agrega "punto activo
  derivado" = el punto cuyo `id === recorrido.puntoActivoId`; "lista de
  pendientes ordenada" ya existía (por `orden`), ahora también determina
  cuál es "el primero" a efectos de INICIAR/IR PRIMERO.
