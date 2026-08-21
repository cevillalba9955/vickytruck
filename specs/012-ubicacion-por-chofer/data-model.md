# Data Model: Ubicación en vivo ligada al chofer, no al viaje

## Chofer

Identidad estable de la persona que conduce, ya existente en el store
(`recorrido.choferId`/`choferNombre`), provista por Oracle. Esta feature no
agrega campos nuevos a la entidad — la reutiliza como clave de ruteo.

| Campo | Tipo | Origen | Notas |
|---|---|---|---|
| `choferId` | string | Oracle (push de recorridos) | Ya existía en el store; pasa a exponerse también en `GET /:token` (antes solo se usaba internamente para derivar la credencial MQTT). |

## Recorrido (existente, sin cambios de esquema)

Sigue siendo la asignación de trabajo vigente. Lo único que cambia es que
**deja de ser una precondición** para que el reporte de posición funcione —
`fleteId` ya no participa en el ruteo de ubicación (sigue existiendo para
todo lo demás: auditoría, Central, Oracle).

## Reporte de ubicación (payload MQTT)

Evento publicado por el dispositivo del chofer al topic
`chofer/{choferId}/ubicacion`.

| Campo | Tipo | Antes | Ahora | Notas |
|---|---|---|---|---|
| `eventId` | string (uuid) | sí | sí | Sin cambios — usado por el deduplicador del bridge. |
| `choferId` | string | — | **nuevo** | Reemplaza a `fleteId` como clave de ruteo. |
| `fleteId` | string \| null | sí (clave de ruteo) | **eliminado** | Ya no viaja en el payload — el ruteo no lo necesita. |
| `recorridoId` | string \| null | sí (= token) | sí | Se mantiene como contexto informativo; no participa del ruteo. |
| `lat` / `lon` | number | sí | sí | Sin cambios. |
| `en` | string (ISO -03:00) | sí | sí | Sin cambios — ver `feature-normalizar-formato-horario`. |

## Estado del canal de ubicación (nuevo, solo en memoria del backend)

No es una entidad persistente — es un snapshot agregado que vive mientras
corre el proceso del bridge MQTT.

| Campo | Tipo | Descripción |
|---|---|---|
| `recibidos` | number | Mensajes MQTT recibidos en total desde que arrancó el proceso. |
| `procesados` | number | De los recibidos, cuántos se aplicaron a un recorrido activo o a la retención por-chofer. |
| `duplicadosDescartados` | number | Descartados por el deduplicador (`eventId` ya visto). |
| `invalidos` | number | Payloads que no parsearon como JSON válido. |
| `reconexiones` | number | Veces que el cliente MQTT del backend tuvo que reconectar. |
| `ultimoMensajeEn` | string (ISO) \| null | Timestamp del último mensaje efectivamente procesado. |
| `conectado` | boolean | Si el cliente MQTT del backend está conectado en este momento. |
| `habilitado` | boolean | `false` si el backend corre sin `MQTT_BROKER_URL` configurado (dev/test) — el resto de los campos no aplica en ese caso. |

## Última ubicación por chofer (nuevo, solo en memoria del backend)

Retención acotada habilitada por la enmienda a la Constitución v5.0.0
(Principio VII) — ver spec.md FR-006 y Assumptions.

| Campo | Tipo | Descripción |
|---|---|---|
| `choferId` | string | Clave del mapa `ultimaUbicacionPorChofer`. |
| `lat` / `lon` | number | Última coordenada recibida de ese chofer. |
| `en` | string (ISO) | Timestamp del evento. |
| `eventId` | string \| null | Para trazabilidad/depuración, igual que en `ultimaUbicacion` de un recorrido. |

Sin exposición pública todavía (ningún endpoint ni panel la lee fuera del
propio store) — es la base documentada en spec.md como fuera de alcance de
UI en esta entrega.

## Caché local del dispositivo (nuevo, `localStorage` del navegador)

| Campo | Tipo | Descripción |
|---|---|---|
| `choferId` | string | Del último `GET /:token` exitoso que incluyó uno. |
| `mqtt` | `{ url, username, password, topic }` \| null | La config MQTT devuelta por ese mismo `GET /:token`. |

Sin scope por token (a diferencia de `recorridoCache.js`) — representa "el
último chofer que usó este dispositivo", no el estado de un recorrido
puntual.

## Relaciones

```
Chofer (choferId) 1───* Recorrido (puede tener 0 o 1 activo en un momento dado)
Chofer (choferId) 1───1 Última ubicación conocida (siempre la más reciente, con o sin recorrido activo)
Chofer (choferId) 1───1 Credencial MQTT permanente (ya existente, sin cambios)
Recorrido (fleteId, si activo) 1───1 ultimaUbicacion (ya existente, solo se actualiza si hay match por choferId → recorridoPorChofer)
```
