# Data Model: Hora y alerta de distancia mínima en el mapa de Detalle

Sin cambios de datos persistidos ni de contrato de API (ver research.md,
Decisión 1). Este documento describe únicamente los view-models nuevos/
extendidos que produce `central/src/services/marcadores.js` a partir de
datos que el frontend ya recibe.

## Entrada (ya existente, sin cambios)

Por cada elemento de `detalle.puntos` (respuesta de `GET
/api/central/recorridos/:id` y de cada recorrido en `GET
/api/central/recorridos/historial`):

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | ya usado |
| `orden` | number | ya usado |
| `lat`, `lon` | number | destino del punto — ya usado |
| `estado` | `"pendiente" \| "arribado" \| "completado"` | ya usado |
| `arriboEn` | ISO 8601 \| null | ya existe, hoy solo lo lee la tabla |
| `arriboLat`, `arriboLon` | number \| null | ya existe, hoy solo lo lee la tabla |
| `descargaEn` | ISO 8601 \| null | ya existe, hoy solo lo lee la tabla |
| `descargaLat`, `descargaLon` | number \| null | ya existe, hoy solo lo lee la tabla |

Y de `detalle.recorrido`: `cierreEn`/`cierreLat`/`cierreLon` (ya existente),
más `primerEventoConUbicacion(puntos)` (ya calculado en `tiempo.js` a partir
de `inicioEn`/`inicioLat`/`inicioLon` de los puntos) para la ubicación de
inicio.

## Salida nueva/extendida (view-model del mapa)

### `construirPuntosEnMapa(puntos)` — extendida

Agrega tres campos a cada punto de salida (los ya existentes `id`, `orden`,
`lat`, `lon`, `estado` no cambian):

| Campo nuevo | Tipo | Regla |
|---|---|---|
| `arriboEn` | ISO 8601 \| null | copiado tal cual del punto de entrada |
| `descargaEn` | ISO 8601 \| null | copiado tal cual del punto de entrada |
| `alerta` | `{ llegada: boolean \| null, descarga: boolean \| null }` | `true` si ese evento tiene GPS registrado y `distanciaMetros(...) > RADIO_PROXIMIDAD_M`; `false` si tiene GPS y está dentro del radio; `null` si el evento no tiene GPS registrado (FR-003) |

Un punto se considera "fuera de rango" a nivel visual (FR-002) cuando
`alerta.llegada === true || alerta.descarga === true`.

### `construirMarcadorExtremo({ iso, lat, lon }, tipo)` — nueva

| Campo | Tipo | Regla |
|---|---|---|
| `tipo` | `"inicio" \| "cierre"` | recibido como parámetro |
| `iso` | ISO 8601 | recibido |
| `lat`, `lon` | number | recibido |

Devuelve `null` cuando `lat`/`lon` son `null`/`undefined` (FR-007) — el
llamador (`RecorridoDetalle.jsx`) filtra los `null` antes de pasarlos al
mapa, igual que ya hace `construirPuntosEnMapa` con los puntos sin
coordenadas.

### `RADIO_PROXIMIDAD_M` — constante movida (no nueva)

Se reubica desde `RecorridoDetalle.jsx` a `services/marcadores.js` (junto a
`distanciaMetros`) y se exporta, para que tabla y mapa usen el mismo valor
sin duplicarlo (research.md, Decisión 2). Valor sin cambios: `500` metros.

## Relaciones

```
detalle.puntos[]  ──┬─> construirPuntosEnMapa()  ──> puntos-en-mapa[] (con arriboEn/descargaEn/alerta)
                     └─> primerEventoConUbicacion() ─> { iso, lat, lon } ─> construirMarcadorExtremo(_, "inicio")

detalle.recorrido.cierreEn/cierreLat/cierreLon ─> construirMarcadorExtremo(_, "cierre")
```

No hay nuevas entidades persistidas, ni transiciones de estado nuevas — los
estados de punto (`pendiente`/`arribado`/`completado`) y del recorrido no
cambian con esta feature.
