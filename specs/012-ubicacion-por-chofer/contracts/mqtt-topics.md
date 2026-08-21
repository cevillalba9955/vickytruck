# Contract: MQTT Topics — ruteo por choferId

**Supersede** la sección "Topic de ubicación" de
`specs/003-arquitectura-cloud-mqtt/contracts/mqtt-topics.md` (que documentaba
`chofer/{fleteId}/ubicacion` como el topic vigente). Las credenciales y ACL
descritas ahí (permanente por-`choferId`, wildcard `chofer/+/ubicacion`) **no
cambian** — esta feature solo alinea el topic de publicación con esa
credencial, que ya era por-chofer.

## Topic de ubicación

- Topic: `chofer/{choferId}/ubicacion` (antes: `chofer/{fleteId}/ubicacion`)
- Publisher: frontend chofer (`ubicacionMqtt.js`), con la credencial
  permanente de ese chofer — sin cambios respecto al esquema de credenciales
  ya vigente.
- Subscriber: `backend/src/services/mqttBridge.js`, suscripto a
  `chofer/+/ubicacion` (sin cambios — el wildcard ya cubre cualquier
  segundo nivel, sea `fleteId` o `choferId`).

## Payload

```json
{
  "eventId": "8e6f2e72-9eb5-4b68-a9ba-a6c4d27a3f47",
  "choferId": "42",
  "recorridoId": "3719",
  "lat": -34.6037,
  "lon": -58.3816,
  "en": "2026-08-21T13:35:20.123-03:00"
}
```

Cambios respecto al payload anterior (ver `research.md` Decisión 1 y
`data-model.md`):

| Campo | Antes | Ahora |
|---|---|---|
| `fleteId` | presente, usado para ruteo | **eliminado** |
| `choferId` | ausente | **agregado**, clave de ruteo |
| `recorridoId` | presente, informativo | sin cambios (sigue siendo `token`, informativo) |
| `eventId`, `lat`, `lon`, `en` | presentes | sin cambios |

## Ruteo en el backend (`mqttBridge.js` → `integracionStore.js`)

```
mensaje MQTT → parsearPayload() → { choferId, lat, lon, en, eventId }
  → dedupe.yaVisto(eventId)? descartar (duplicadosDescartados++)
  → store.actualizarUbicacionPorChofer(choferId, evento)
      → ¿hay un recorrido con estado "activo" para ese choferId (recorridoPorChofer)?
          sí → actualiza `recorrido.ultimaUbicacion` (igual que antes, solo cambia la clave de lookup)
          no → retiene en `ultimaUbicacionPorChofer` (nuevo, en memoria, sin exposición pública)
```

## QoS y sesiones

Sin cambios respecto al contrato vigente: QoS 1, sin retained, `clean:
true`. Sigue siendo telemetría efímera best-effort.

## Seguridad

Sin cambios: la credencial y su ACL amplia sobre `chofer/+/ubicacion` ya
estaban preparadas para publicar bajo cualquier segundo nivel de topic — este
cambio no amplía ni reduce esa superficie, solo la usa consistentemente
(antes se pedía una credencial "por-chofer" para publicar en un topic
"por-flete", una inconsistencia de diseño que esta feature corrige).
