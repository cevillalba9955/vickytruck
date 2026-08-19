# Data Model: Rediseño visual de Central

El MVP original (Historias 1-3) fue exclusivamente de presentación (FR-006):
no agregó, quitó ni modificó entidades, campos ni relaciones de datos. Los
refinamientos post-implementación (Historias 4-6, ver spec.md y research.md
Decisiones 6-12) **sí** ampliaron de forma aditiva los payloads de
`GET /api/central/recorridos/*` — nunca removiendo ni cambiando de forma un
campo existente, y siempre con datos que el backend ya trackeaba en memoria
(nada nuevo viene de Oracle). Esta sección refleja el estado actual.

## `GET /api/central/recorridos/activos` (`MonitorView`)

Por recorrido activo:

| Campo | Desde | Notas |
|---|---|---|
| `id`, `flete.{id,nombre}`, `progreso`, `viajeEstado`, `puntoActivoId`, `esperandoFinalizar`, `ultimaUbicacion.{lat,lon,en,reciente}`, `updatedAt` | MVP original | sin cambios |
| `chofer.{id,nombre}` \| `null` | Historia 4 | distinto de `flete`; `null` si Oracle todavía no lo informó |
| `puntoActivo.{id,orden,cliente}` \| `null` | Historia 4 | `cliente` puede ser `null` aunque `puntoActivo` exista (UI cae a "Punto {orden}") |

## `GET /api/central/recorridos/historial` (`HistorialView`)

Por recorrido finalizado:

| Campo | Desde | Notas |
|---|---|---|
| `id`, `fleteId`, `cierreEn`, `puntos[]` | MVP original | `fleteId` se conserva por compatibilidad aunque ya no se usa en la UI |
| `flete.{id,nombre}` | Historia 5 | |
| `chofer.{id,nombre}` \| `null` | Historia 5 | |

"Tiempo total" (Historia 5) es derivado en el frontend a partir de
`puntos[].inicioEn`/`arriboEn` y `cierreEn` — no es un campo del payload.

## `GET /api/central/recorridos/:id` (`RecorridoDetalle`, vía Monitoreo o Historial)

`recorrido`:

| Campo | Desde | Notas |
|---|---|---|
| `id`, `estado`, `fleteId`, `updatedAt`, `cierreEn` | MVP original | |
| `flete.{id,nombre}`, `chofer.{id,nombre}\|null` | Historia 6 | mismo criterio que activos/historial |

`puntos[]` (función compartida `serializarPuntosCentral`, también usada por
`listarHistorial`):

| Campo | Desde | Notas |
|---|---|---|
| `id`, `orden`, `lat`, `lon`, `estado`, `inicioEn`, `arriboEn`, `descargaEn`, `remitoIds` | MVP original / features previas | `lat`/`lon` = destino fijo del punto, no GPS de auditoría |
| `cliente` \| `null` | Historia 6 | ya se guardaba en el punto (`camposInformativos`), no se serializaba a Central fuera del caso puntual de `puntoActivo` (Historia 4) |
| `arriboLat`, `arriboLon` \| `null` | Historia 6 | GPS capturado por el chofer al marcar arribo (auditoría, no el destino) |
| `descargaLat`, `descargaLon` \| `null` | Historia 6 | ídem, al marcar descarga completa |

**Explícitamente fuera de alcance** (no se exponen a Central, verificado por
`backend/tests/contract/get-recorrido-detalle.test.js`): `inicioLat`,
`inicioLon` (GPS al tocar INICIAR), `cierreLat`, `cierreLon` (GPS al tocar
FINALIZAR).

"Hora inicio", "Tiempo total" y "Fecha" del encabezado (Historia 6) son
derivados en el frontend (`central/src/services/tiempo.js`:
`primerEventoIso`, `calcularTiempoTotalMin`), no campos del payload. El
color de proximidad GPS (Historia 6) se deriva en el frontend
(`central/src/services/marcadores.js`: `distanciaMetros`, fórmula de
Haversine) comparando `puntos[].lat/lon` contra
`arriboLat/arriboLon`/`descargaLat/descargaLon` del mismo punto — no hay
umbral ni resultado de esta comparación persistido en el backend.

## Marcador de mapa (`MapaSeguimiento`, vía `services/marcadores.js`)

Sin cambios respecto del MVP original.

## Contratos

No se agregó `contracts/`: todos los cambios son campos adicionales en
endpoints ya existentes (`GET /api/central/recorridos/activos|historial|:id`),
sin nuevos endpoints, mensajes MQTT ni CLIs. Cobertura de contrato:

- `backend/tests/unit/integracion-store-central.test.js`: `chofer`,
  `puntoActivo.cliente` (activos), `flete`/`chofer` (historial/detalle),
  `cliente`/`arriboLat`/`arriboLon`/`descargaLat`/`descargaLon` (detalle),
  ausencia de `inicioLat`/`cierreLat`.
- `backend/tests/integration/central-cloud-monitoreo.test.js`: loop
  end-to-end (Oracle push → chofer marca arribo con GPS real → Central ve
  `arriboLat`/`arriboLon`, `flete`, `chofer`, `puntoActivo.cliente`).
