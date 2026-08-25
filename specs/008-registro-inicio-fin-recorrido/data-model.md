# Data Model: Registro de inicio y fin de recorrido con regreso a base

Extiende el modelo de `specs/001-chofer-recorrido/data-model.md` y
`specs/005-chofer-estados-viaje/data-model.md` sobre la misma implementación
real: `backend/src/state/integracionStore.js`. No se agrega persistencia
nueva ni tablas; todo vive en el mismo `Map` de recorridos ya existente.

## Recorrido (campos nuevos)

| Campo | Tipo | Notas |
|---|---|---|
| `cierreEn` | timestamp \| `null` | Nuevo. Fecha/hora de servidor (o del cliente, validada — mismo criterio que `arriboEn`/`descargaEn`) en que el chofer tocó FINALIZAR. `null` hasta ese momento. |
| `cierreLat` | number \| `null` | Nuevo. Ubicación GPS del chofer al tocar FINALIZAR, si el dispositivo la proveyó. |
| `cierreLon` | number \| `null` | Nuevo. Idem `cierreLat`. |

**Sin cambios de forma, pero con transición modificada**: `estado`
(`activo`/`finalizado`) sigue existiendo igual; lo que cambia es **quién**
lo mueve a `finalizado` (ver "Transición de `estado`" abajo) — deja de ser
una derivación automática de `transicionarPunto` y pasa a ser el efecto de
`finalizarRecorrido`.

## PuntoEntrega (campos nuevos)

| Campo | Tipo | Notas |
|---|---|---|
| `inicioEn` | timestamp \| `null` | Nuevo. Fecha/hora de servidor (o del cliente, validada) en que el chofer tocó INICIAR con este punto como el primero pendiente en ese momento. `null` hasta ese momento. |
| `inicioLat` | number \| `null` | Nuevo. Ubicación GPS del chofer al tocar INICIAR, si el dispositivo la proveyó. |
| `inicioLon` | number \| `null` | Nuevo. Idem `inicioLat`. |

**Reglas de validación**:
- `inicioEn`/`inicioLat`/`inicioLon` se capturan una única vez por "toque de
  INICIAR real" (no en reintentos idempotentes) — mismo criterio que ya usa
  `transicionarPunto` para `arriboEn`/`descargaEn` (evita pisar el primer
  registro con un reintento tardío).
- Si el chofer toca CANCELAR inmediatamente después de INICIAR (mientras
  `ultimaOperacion.sincronizada === false`), `inicioEn`/`inicioLat`/
  `inicioLon` de ese punto se revierten a `null` como parte del snapshot
  restaurado (ver "Extensión de `ultimaOperacion`" abajo) — consistente con
  que el resto del estado del punto también vuelve a como estaba antes.
- Si Central/IR PRIMERO cambia cuál es "el primer pendiente" antes de que
  el chofer toque INICIAR, no hay conflicto: `inicioEn` solo se escribe en
  el punto que efectivamente resulta activo al momento del toque, igual que
  ya determina `iniciarViaje` hoy para `puntoActivoId`.

**Sin cambios**: `id`, `orden`, `latitud`/`longitud`, `estado`
(`pendiente`/`arribado`/`completado`), `arriboEn`/`arriboLat`/`arriboLon`,
`descargaEn`/`descargaLat`/`descargaLon`, los 5 campos informativos de 005
(`cliente`/`direccion`/`rangoHorario`/`notasEntrega`/`remitoIds`).

## Extensión de `ultimaOperacion` (tipo `iniciar`)

El `snapshotPrevio` del tipo `iniciar` (ya definido en
`specs/005-chofer-estados-viaje/data-model.md`) se extiende para incluir los
campos nuevos, de modo que CANCELAR siga revirtiendo el punto a un estado
exactamente igual al previo:

- `iniciar` (antes): `{ viajeEstado: 'detenido', puntoActivoId: null }`
- `iniciar` (extendido): `{ viajeEstado: 'detenido', puntoActivoId: null, puntoEstado: 'pendiente', inicioEn: null, inicioLat: null, inicioLon: null }`

`finalizar` **no** participa de `ultimaOperacion` (Decisión 6 de
research.md) — no es cancelable.

## Transición de `estado` (activo → finalizado)

```text
activo --(todos los puntos completado, viajeEstado === detenido)--> [esperando FINALIZAR, estado sigue "activo"]
[esperando FINALIZAR] --(FINALIZAR, registra cierreEn/cierreLat/cierreLon)--> finalizado
```

- **Antes de esta feature**: `transicionarPunto` asignaba
  `estado = "finalizado"` automáticamente en el mismo momento en que el
  último punto pasaba a `completado` (`integracionStore.js:507-516`).
- **Con esta feature**: ese bloque se elimina (research.md, Decisión 2). El
  recorrido permanece `estado: "activo"` con todos los puntos `completado`
  y `viajeEstado: "detenido"` — un estado nuevo, observable, que este
  documento llama informalmente "esperando FINALIZAR" (no es un valor nuevo
  de ningún enum, es la combinación derivada de los campos existentes).
- **`finalizarRecorrido(token, ubicacion, clienteEn)`** (método nuevo del
  store) es la única vía que queda para llegar a `estado = "finalizado"`:
  - Válido solo si `viajeEstado === "detenido"` y todos los puntos están
    `completado` (mismos criterios que antes disparaban la derivación
    automática); si no, `409 transicion_invalida`.
  - Si ya está `finalizado`, responde `ok` idempotente sin sobrescribir
    `cierreEn`/`cierreLat`/`cierreLon` (research.md, Decisión 3).
  - Al aplicarse: `r.estado = "finalizado"`, `r.cierreEn = <timestamp>`,
    `r.cierreLat`/`r.cierreLon = <ubicación o null>`.

## Campo derivado `esperandoFinalizar` (solo lectura, Central)

No es un campo persistido — se calcula igual que `progreso` en cada
respuesta de `listarActivos()`:

```text
esperandoFinalizar = viajeEstado === "detenido"
  && puntos.length > 0
  && puntos.every(p => p.estado === "completado")
```

Ver research.md, Decisión 5.

## Serialización por consumidor (quién ve qué)

| Consumidor | Endpoint | Ve `inicioEn` | Ve `inicioLat`/`inicioLon` | Ve `cierreEn` | Ve `cierreLat`/`cierreLon` | Ve `esperandoFinalizar` |
|---|---|---|---|---|---|---|
| Chofer | `GET /api/recorridos/:token` | Sí (mismo nivel que `arriboEn`/`descargaEn`, ya visibles hoy) | No (mismo criterio que `arriboLat`/`descargaLat`, ya ocultos hoy) | Sí (a nivel `recorrido`) | No | N/A (el chofer ya sabe si está `detenido` sin pendientes) |
| Central | `GET /api/central/recorridos/activos` | N/A (este endpoint no expone puntos individuales) | N/A | N/A (recorrido todavía `activo`, `cierreEn` es `null`) | N/A | Sí (FR-010, research.md Decisión 5) |
| Central | `GET /api/central/recorridos/historial`, `.../:id` | Sí (dentro de `puntos`, vía `serializarPuntosCentral`) | **Sí** (research.md, Decisión 7 — 2026-08-25, revierte Decisión 4) | Sí (a nivel `recorrido`) | **Sí** (research.md, Decisión 7) | N/A (estos endpoints son solo para recorridos ya `finalizado` o el detalle puntual) |
| Oracle/APEX | `GET /api/integracion/estado` | No (fuera de alcance — Oracle no consume estos campos en esta spec) | No | No | No | No |

**Nota (2026-08-25, User Story 3)**: `inicioLat`/`inicioLon`/`cierreLat`/
`cierreLon` ya existían en el modelo y se guardaban desde la versión
original (tabla "Recorrido"/"PuntoEntrega" arriba, sin cambios de forma);
lo único que cambia es su visibilidad para Central, alineándola con la que
ya tienen `arriboLat`/`arriboLon`/`descargaLat`/`descargaLon` desde
009-central-mejora-visual. El chofer (`GET /api/recorridos/:token`) no
gana visibilidad nueva — sigue sin ver ninguna de las cuatro coordenadas de
auditoría, igual que ya ocurre con las de arribo/descarga.

## Relación con `specs/005-chofer-estados-viaje/data-model.md`

- **Recorrido**: se agregan `cierreEn`/`cierreLat`/`cierreLon`; `estado`
  mantiene su forma (`activo`/`finalizado`) pero cambia su regla de
  transición (arriba).
- **PuntoEntrega**: se agregan `inicioEn`/`inicioLat`/`inicioLon`, mismo
  patrón estructural que `arriboEn`/`arriboLat`/`arriboLon`.
- **`ultimaOperacion`**: el `snapshotPrevio` de tipo `iniciar` se extiende
  (arriba); los demás tipos (`llegue`, `descarga-completa`, `ir-primero`) no
  cambian.
- **Nada de esto afecta** `viajeEstado`/`puntoActivoId` ni sus transiciones
  (`detenido`/`manejando`/`descargando`), que siguen exactamente como las
  definió 005.
