# Contract: MQTT Topics, ACL y Credenciales

**Actualizado 2026-08-06** tras la implementación real — ver "Divergencias
respecto al diseño original" al final. El diseño inicial (namespace `v1/`,
tópicos separados de estado/control, credencial rotable compartida) no es lo
que terminó implementado; este documento describe el contrato **vigente**.

## Topic de ubicación (único tópico MQTT del sistema)

- Topic: `chofer/{fleteId}/ubicacion`
- Publisher: frontend chofer (`frontend/src/services/ubicacionMqtt.js`), con
  una credencial **publish-only propia de ese fleteId**.
- Subscribers:
  - `backend/src/services/mqttBridge.js` (`chofer/+/ubicacion`, credencial de
    servicio propia) — persiste en `integracionStore` para que Central lo
    lea vía `GET /api/central/recorridos/activos`. Es el camino que
    realmente entrega `ultimaUbicacion` en producción hoy.
  - `central/src/services/mqttClient.js` (`chofer/+/ubicacion`, credencial de
    servicio de solo-lectura) — **implementado pero no configurado en
    producción** (`VITE_MQTT_BROKER_URL`/`USERNAME`/`PASSWORD` vacíos en
    `central/.env.production`): el código existe y funcionaría si se
    completan esas variables, pero hoy Central depende exclusivamente del
    polling REST de arriba.

No existen otros tópicos MQTT. Arribo y descarga **nunca se movieron a
MQTT** — siguen siendo `POST /api/recorridos/:token/puntos/:puntoId/arribo`
y `.../descarga` (REST, ver `chofer-api.md` de 001-chofer-recorrido),
persistidos directo en `integracionStore` y expuestos a Oracle/APEX vía
`GET /api/integracion/estado`.

## Payload

```json
{
  "eventId": "8e6f2e72-9eb5-4b68-a9ba-a6c4d27a3f47",
  "fleteId": "13",
  "recorridoId": "3719",
  "lat": -34.6037,
  "lon": -58.3816,
  "en": "2026-08-06T13:35:20.123Z"
}
```

`en` es siempre `Date.prototype.toISOString()` del cliente (JS), por lo
tanto **siempre incluye milisegundos** — relevante para quien parsee este
payload del lado Oracle/PL-SQL (ver `TO_TIMESTAMP` con máscara `.FF3` en
`backend/sql/integracion-cloud/integracion_cloud_api.pkb.sql`).

## QoS y sesiones

| Publisher | QoS | Retained | Clean session |
|---|---|---|---|
| Chofer (`chofer/{fleteId}/ubicacion`) | 1 | No | Sí (`clean: true`) |

No hay política de sesión persistente ni retained: es telemetría efímera
best-effort (Principio VII — no tracking continuo, solo el instante de cada
reporte periódico).

## Credenciales y ACL — el corazón del contrato de seguridad

**El diseño original asumía una credencial MQTT compartida y rotable para
el chofer** (ver research.md, Decisión 5 original). Eso hubiera significado
embeber esa credencial en el bundle público de la SPA del chofer — visible
para cualquiera que abra las herramientas de desarrollador del navegador,
con permiso de publicar en el tópico de **cualquier** flete. Se descartó a
favor de credenciales **por-flete, publish-only, scoped a su propio tópico**:

- Al recibir un recorrido de Oracle con `fleteId`
  (`POST /api/integracion/recorridos`), el backend aprovisiona en EMQX Cloud
  (vía su API HTTP nativa v5, `backend/src/mqtt/emqxProvisioning.js`) un
  usuario `chofer-{fleteId}` con:
  - Password determinística: `HMAC-SHA256(EMQX_TOKEN_PASSWORD_SECRET, fleteId)`
    — no aleatoria, para que `GET /:token` pueda devolverla en cualquier
    momento (recarga de página, reconexión) sin volver a llamar a la API de
    EMQX ni invalidar una conexión ya abierta.
  - Regla de ACL: `{ action: "publish", permission: "allow", topic: "chofer/{fleteId}/ubicacion" }`
    — nada más. No puede publicar en el tópico de otro flete, no puede
    suscribirse a nada.
- `GET /api/recorridos/:token` devuelve esa credencial en `recorrido.mqtt =
  { url, username, password, topic }` (ver `chofer-api.md` de
  001-chofer-recorrido) — el frontend la usa tal cual, nunca la deriva ni la
  cachea en build.
- El backend (`MQTT_USERNAME`/`MQTT_PASSWORD`) y, si se configura, Central
  (`VITE_MQTT_USERNAME`/`PASSWORD`) sí usan una credencial de servicio
  **estática, compartida, solo-suscripción** sobre `chofer/+/ubicacion` —
  aceptable porque son clientes de confianza (backend propio, panel interno),
  no un bundle público distribuido a cualquiera con el link de un chofer.
  Aprovisionada una sola vez con `npm run emqx:setup`
  (`backend/scripts/emqx-setup.js`).
- La revocación de credenciales por-flete (`revocarCredencial(fleteId)` en
  `emqxProvisioning.js`) existe pero **no está conectada a ningún trigger
  todavía** — no hay un evento claro de "recorrido finalizado" en la
  arquitectura actual. Los usuarios `chofer-{fleteId}` quedan en EMQX Cloud
  indefinidamente (no es grave: son publish-only sobre un tópico propio, pero
  es limpieza pendiente).

## Seguridad

- Transporte: `wss://` obligatorio para el navegador (EMQX Cloud, puerto
  8084 típico) — un browser no puede abrir un socket TCP crudo como el que
  usa el backend (`mqtts://`, puerto 8883) para su propia suscripción.
- Auditoría: se puede consultar en cualquier momento si un cliente está
  conectado y cuánto publicó vía la Admin API de EMQX Cloud
  (`GET /clients?username=<user>`), sin depender de logs del backend.

## Divergencias respecto al diseño original (research.md / spec.md previos)

| Diseño original | Implementado |
|---|---|
| Namespace versionado `v1/...` | Sin versionar: `chofer/{fleteId}/ubicacion` |
| Tópico separado `v1/recorrido/{id}/estado` para arribo/descarga vía MQTT | Arribo/descarga se quedaron en REST, nunca via MQTT |
| Tópico `v1/sistema/{tenantId}/control` (heartbeats/alertas) | No implementado, no hay caso de uso identificado |
| Credencial MQTT del chofer rotable/compartida | Credencial publish-only por-flete, aprovisionada dinámicamente |
| Central consume MQTT directo en producción | Código implementado, pero sin credenciales configuradas — dormant, depende de polling REST |
