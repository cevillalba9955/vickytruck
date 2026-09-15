# Data Model: Reporte de ubicación directo al backend (broker opcional)

Sin nuevas entidades persistentes ni cambios de esquema Oracle. Esta
feature reconfigura el ruteo de una entidad ya existente (Reporte de
ubicación) y consolida su destino en un store en memoria ya existente
(`integracionStore`), retirando un store redundante.

## Entidades

### Modo de canal de ubicación (configuración, no persistente)

Valor derivado de una variable de entorno del backend, sin representación
en Oracle ni en ningún store — se lee en cada request, no se cachea entre
requests.

| Campo | Tipo | Valores | Notas |
|---|---|---|---|
| `canalPreferido` | string enum | `"directo"` \| `"broker"` | Fuente: `process.env.UBICACION_CANAL_PREFERIDO`. Cualquier valor ausente, vacío o distinto de `"broker"` (case-insensitive) resuelve a `"directo"`. |

### Reporte de ubicación (evento, ya existente — sin cambios de forma)

Sigue siendo `{ lat, lon, en, eventId?, choferId, recorridoId? }` en su
forma interna (la que ya construye `mqttBridge.js` al procesar un mensaje).
Lo que cambia es el origen: ahora también puede construirse dentro del
handler `POST /:token/ubicacion` a partir del `choferId` resuelto del
recorrido, en vez de solo desde un mensaje MQTT entrante.

- **Validación**: `lat`/`lon` requeridos y numéricos (ya validado hoy en
  `POST /:token/ubicacion`, sin cambios). Si el recorrido resuelto no tiene
  `choferId` (`recorrido.choferId == null`), el reporte se descarta sin
  error de cliente — la respuesta sigue siendo `200 { ok: true }` (mismo
  criterio best-effort que ya rige este endpoint).
- **Destino único**: `integracionStore.actualizarUbicacionPorChofer(choferId,
  { lat, lon, en })` — el mismo método y la misma instancia de store que ya
  usa `mqttBridge.js`. Dos entradas distintas (bridge MQTT, handler REST),
  un solo lugar de verdad para "última ubicación conocida por chofer".

### Estado del canal de broker (ya existente, un campo nuevo)

Respuesta de `GET /api/integracion/mqtt/estado` — ver
[contracts/mqtt-estado-api.md](./contracts/mqtt-estado-api.md) para el
contrato completo. Cambio de forma: se agrega `canalPreferido` (ver arriba)
a la respuesta existente, siempre presente.

## Entidades retiradas

### `ubicacionEnMemoria` (store, retirado)

El módulo `backend/src/state/ubicacionEnMemoria.js` (`Map<recorridoId,
{lat, lon, en}>`) se elimina junto con su test unitario dedicado
(`ubicacion-en-memoria.test.js`). Nada en producción leía su método
`.obtener()` — solo lo ejercitaban tests del propio módulo y del contrato
`post-ubicacion.test.js`, que se actualiza para verificar contra
`integracionStore` en su lugar (ver plan.md, Project Structure).

## Relaciones

```text
Chofer (choferId) ──┬── reporta vía broker ──> mqttBridge ──┐
                     │                                       ├──> integracionStore.actualizarUbicacionPorChofer(choferId, …)
                     └── reporta vía directo ─> recorrido.js ┘         │
                                                                        ▼
                                                          recorrido.ultimaUbicacion
                                                                        │
                                                                        ▼
                                                    GET /api/central/recorridos/activos
                                                    (resolverUbicacion → Central)
```

Ambos canales convergen en el mismo punto de escritura; cuál de los dos se
ejercita en un momento dado lo decide únicamente `canalPreferido` (vía
`mqtt: null` en `GET /:token`, que hace que el chofer nunca intente
publicar por broker y caiga siempre al POST directo).
