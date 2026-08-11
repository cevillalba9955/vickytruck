# Data Model: Normalización del formato horario

**Feature**: 006-normalizar-formato-horario

No se agregan entidades nuevas. Esta feature cambia la **representación**
(formato de string) de campos de horario ya existentes en las entidades de
001/002/003/004/005, y agrega su **visualización** donde hoy falta. Ningún
campo cambia de nombre ni de significado.

## Convención de formato (aplica a todos los campos de esta tabla)

- **Wire format** (lo que viaja entre backend/frontend/central/Oracle): ISO
  8601 con offset local fijo de Argentina, `...±HH:MM`, ej.
  `2026-08-11T10:35:20.123-03:00` (research.md, Decisión 1). Generado por
  `ahoraLocalIso()` (duplicada en `backend/src/util/tiempo.js`,
  `frontend/src/services/tiempo.js`, `central/src/services/tiempo.js`) o, en
  Oracle, por `SYSTIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires'`.
- **Display format** (lo que ve el usuario): `HH24:MM:SS`, ej. `"10:35:20"`,
  producido por `formatearHoraLocal()` (mismo módulo, research.md Decisión
  2) a partir del wire format — funciona igual para timestamps nuevos
  (offset `-03:00`) y viejos (`Z`, sin migrar, FR-006/research.md Decisión
  7).
- Los datos **no se migran**: un mismo campo puede tener valores en `Z` (UTC,
  histórico) o en `-03:00` (nuevo) simultáneamente en el store/Oracle; ambos
  se muestran correctamente porque el display format siempre reconvierte.

## Entidades y campos afectados

### Recorrido (`backend/src/state/integracionStore.js`)

| Campo | Wire format hoy | Wire format nuevo | Dónde se genera | Dónde se muestra |
|---|---|---|---|---|
| `updatedAt` | `toISOString()` (UTC `Z`) | `ahoraLocalIso()` (`-03:00`) | `integracionStore.js:128,164`; Oracle `integracion_cloud_api.pkb.sql:200` | **Nuevo**: agregar a `listarActivos()`/`obtenerDetalle()` en `central.js` (hoy NO serializado) y mostrarlo en `MonitorView.jsx`/`RecorridoDetalle.jsx` |
| `asignadoEn`* | `SYSTIMESTAMP` crudo (Oracle) | `SYSTIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires'` | `central_api.pkb.sql:38,105` | Mismo tratamiento que `updatedAt` (representa el evento de "asignación" del spec, Key Entities) |
| `viajeEstado`, `puntoActivoId` | Sin cambios (no son horarios) | — | — | — |

\* `asignadoEn` no tiene un campo JS equivalente confirmado en
`integracionStore.js` — es el timestamp Oracle-side de la asignación de
flete (`central_api.pkb.sql`). Si no llega hoy al cloud vía el payload de
`sincronizar_recorrido`, la corrección en Oracle (Decisión 3) sigue
aplicando igual para cuando se consulte directo en Oracle/APEX, aunque no
haya UI en Central para ese campo específico en el alcance de esta feature
(no es un requisito explícito de FR-001; se corrige en origen por
consistencia, sin agregar UI nueva si no hay endpoint que lo exponga hoy).

### PuntoEntrega (`backend/src/state/integracionStore.js`, Oracle `T_PUNTOS_ENTREGA`)

| Campo | Wire format hoy | Wire format nuevo | Dónde se genera | Dónde se muestra |
|---|---|---|---|---|
| `arriboEn` | `toISOString()` (UTC `Z`) | `ahoraLocalIso()` (`-03:00`) | `integracionStore.js:492` (evento del chofer); Oracle `recorrido_api.pkb.sql:52` (`SYSTIMESTAMP` crudo → `AT TIME ZONE`) | Central: `RecorridoDetalle.jsx:41` (hoy crudo, sin formatear → pasa a `formatearHoraLocal`). Chofer: `DeliveryPointCard.jsx` (**nuevo**, hoy no se muestra pese a que el dato ya llega en el payload, `recorrido.js:42`) |
| `descargaEn` | ídem `arriboEn` | ídem `arriboEn` | `integracionStore.js:492`; `recorrido_api.pkb.sql:52` | ídem `arriboEn` (`RecorridoDetalle.jsx:42`, `DeliveryPointCard.jsx` nuevo) |
| `rangoHorario` | string libre, sin formato definido | **sin cambios** (fuera de alcance, spec Clarifications pregunta 3) | Oracle `integracion_cloud_api.pkb.sql:174` (`p.horario`) | `DeliveryPointCard.jsx:70-73` — sin cambios |
| `arriboLat/Lon`, `descargaLat/Lon` | N/A (no son horarios) | — | — | — |

### Evento de ubicación (GPS/MQTT — `en`)

| Campo | Wire format hoy | Wire format nuevo | Dónde se genera | Dónde se muestra |
|---|---|---|---|---|
| `en` | `toISOString()` (UTC `Z`) | `ahoraLocalIso()` (`-03:00`) | **Origen real**: `frontend/src/services/ubicacionMqtt.js:51` (el chofer publica). Passthrough con fallback: `backend/src/services/mqttBridge.js:43`, `central/src/services/mqttClient.js:38`, `backend/src/routes/recorrido.js:129`. Recalculado en `backend/src/db/ubicacionResolver.js:47` (`resolverUbicacion`) | **Nuevo**: `central/src/components/MonitorView.jsx` → `formatearUbicacion()` hoy solo deriva "reciente"/"no reciente"; se agrega la hora formateada del último reporte |

## Validación / reglas de negocio

- Ningún campo de esta tabla admite formato de 12 horas ni AM/PM en su forma
  de visualización (FR-001).
- `rangoHorario` es la única excepción explícita: no se valida, no se
  reformatea, se muestra tal cual llega (FR-004, Decisión 5).
- No hay reglas de transición de estado nuevas — esta feature no toca el
  ciclo de vida de `Recorrido`/`PuntoEntrega` (eso es 005-chofer-estados-viaje),
  solo la representación y visualización de sus timestamps.
