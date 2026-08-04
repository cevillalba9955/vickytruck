# Contract: Vínculo del token de publicación al primer dispositivo

Mecanismo interno backend↔bróker (no expuesto al frontend ni a Central como API HTTP). Ver
decisión y limitaciones completas en [research.md §3](../research.md#3-mecanismo-para-atar-el-token-de-publicación-al-primer-dispositivo-fr-005a).

## `clientId` MQTT del dispositivo (frontend)

- `frontend/src/services/deviceId.js` genera un identificador aleatorio (ej. UUID) en el primer
  arranque de la app en ese navegador, lo persiste en `localStorage` (clave propia, ej.
  `vickytruck.deviceId`), y lo reutiliza en cada conexión/reconexión.
- `frontend/src/services/mqttClient.js` pasa ese valor como opción `clientId` al conectar
  (`mqtt.connect(url, { username, password, clientId, ... })`).
- Si `localStorage` no está disponible (modo privado estricto, cuota agotada), se genera un
  `clientId` nuevo en cada carga de página — degrada a "cada recarga cuenta como un dispositivo
  nuevo" para ese caso puntual, aceptado como límite conocido (no bloquea el uso normal).

## Suscripción del backend a eventos de conexión

- El cliente MQTT de servicio del backend (`backend/src/mqtt/client.js`, el mismo ya usado por
  `subscriber.js`) agrega una suscripción a los tópicos de sistema de eventos de conexión de
  EMQX Cloud (ver research.md §3 para el nombre exacto a confirmar contra el deployment real).
- Por cada evento de conexión recibido, extrae `{ username, clientId }`.
- Si `username` no corresponde a un token de recorrido activo conocido por el repositorio, se
  ignora (mismo criterio de descarte silencioso que FR-013 de `003-mqtt-broker-fletes`).

## Lógica de vínculo (`backend/src/state/vinculoDispositivo.js`)

```text
onConexion(token, clientId):
  vinculo = store.obtener(token)
  si vinculo es null:
    store.guardar(token, { clientId, vinculadoEn: ahora() })
    return  # primer dispositivo: nada más que hacer
  si vinculo.clientId == clientId:
    return  # reconexión legítima del mismo dispositivo
  # clientId distinto al vinculado: expulsar esta sesión
  emqxAdminApi.expulsarCliente(clientId)
```

## Expulsión (kick) vía API REST de EMQX Cloud

- Reutiliza el mismo host/credenciales de administración ya usados por
  `backend/src/mqtt/emqxProvisioning.js` (`EMQX_CLOUD_API_URL`, `EMQX_CLOUD_API_KEY`,
  `EMQX_CLOUD_API_SECRET`).
- Llama al endpoint de desconexión/kick de cliente por `clientId` (nombre exacto a confirmar
  contra el deployment real al implementar, mismo criterio que `authId` en
  `emqxProvisioning.js`).
- Idempotente: si el cliente ya se desconectó solo (por su cuenta, o por una expulsión previa),
  un 404 no se trata como error.

## Limpieza del vínculo

`vinculoDispositivo.js` elimina la entrada de un `token` en los mismos puntos donde hoy se
revoca su credencial EMQX (`emqxProvisioning.revocarCredencial`):
- `backend/src/mqtt/subscriber.js`, al detectar que una "descarga" deja el recorrido 100%
  completado.
- `backend/src/routes/central.js`, en `/reasignar` (el token anterior queda invalidado).

## Fuera de alcance de este contrato

- No hay forma de que el frontend consulte "¿mi token ya está vinculado a otro dispositivo?"
  antes de intentar publicar — el chofer se entera de forma indirecta (su conexión se cae poco
  después de intentar publicar) y la app se lo indica como error de conexión al bróker (Edge
  Cases de `spec.md`), no como un estado explícito distinto.
