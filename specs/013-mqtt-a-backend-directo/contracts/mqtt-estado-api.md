# Contract: GET /api/integracion/mqtt/estado (actualizado)

Actualiza el contrato original de
`specs/012-ubicacion-por-chofer/contracts/mqtt-estado-api.md`: agrega el
campo `canalPreferido`. El resto del contrato (auth, semántica de los demás
campos, códigos de error) no cambia.

## Request

```
GET /api/integracion/mqtt/estado
```

Autenticación: mismo middleware `validarAuthIntegracion` que protege el
resto de `/api/integracion/*` — sin headers ni credenciales nuevas.

## Response 200 — canal habilitado, modo directo activo (caso por defecto)

```json
{
  "habilitado": true,
  "canalPreferido": "directo",
  "conectado": true,
  "recibidos": 0,
  "procesados": 0,
  "duplicadosDescartados": 0,
  "invalidos": 0,
  "reconexiones": 0,
  "ultimoMensajeEn": null
}
```

Nótese que `habilitado`/`conectado` pueden ser `true` (el bridge del
backend puede seguir suscripto si `MQTT_BROKER_URL` está configurado) aun
con `canalPreferido: "directo"` — significa que el broker está técnicamente
operativo pero nadie publica ahí a propósito, no que haya una falla.
`recibidos: 0` en este escenario es esperado, no un error.

## Response 200 — canal habilitado, modo broker activo

```json
{
  "habilitado": true,
  "canalPreferido": "broker",
  "conectado": true,
  "recibidos": 1284,
  "procesados": 1201,
  "duplicadosDescartados": 80,
  "invalidos": 3,
  "reconexiones": 2,
  "ultimoMensajeEn": "2026-09-15T14:02:11.500-03:00"
}
```

Idéntico al comportamiento documentado en 012 antes de esta feature.

## Response 200 — canal no configurado (`MQTT_BROKER_URL` ausente)

```json
{ "habilitado": false, "canalPreferido": "directo" }
```

`canalPreferido` se incluye siempre, incluso con `habilitado: false` — es
independiente de si el bridge del backend tiene o no un broker configurado
para suscribirse.

## Semántica de los campos

| Campo | Significado |
|---|---|
| `canalPreferido` | **Nuevo.** `"directo"` o `"broker"`, según `UBICACION_CANAL_PREFERIDO` — ver `contracts/ubicacion-canal-config.md`. Es la señal autoritativa de intención de configuración; distingue "inactivo a propósito" de "debería estar recibiendo mensajes". |
| `conectado` | Estado actual del cliente MQTT del backend (no acumulado). Independiente de `canalPreferido`. |
| `recibidos` | Total de mensajes MQTT recibidos desde que arrancó el proceso. |
| `procesados` | De los recibidos, cuántos resultaron en una actualización real. |
| `duplicadosDescartados` | Descartados por el deduplicador de `eventId`. |
| `invalidos` | Payloads que no parsearon como JSON válido. |
| `reconexiones` | Conteo acumulado de eventos `reconnect` del cliente MQTT. |
| `ultimoMensajeEn` | Timestamp (`-03:00`) del último mensaje efectivamente procesado; `null` si ninguno todavía. |

**Cómo leer `canalPreferido: "directo"` junto con `recibidos: 0`**: es el
estado esperado en operación normal, no un síntoma de falla — ver FR-009 /
FR-010 del spec. Un operador que necesita confirmar que el canal directo
tiene actividad debe mirar la última ubicación conocida por chofer (ya
expuesta a Central), no este endpoint.

## Errores

Sin cambios: mismos códigos que el resto de `/api/integracion/*` ante auth
inválida/ausente.
