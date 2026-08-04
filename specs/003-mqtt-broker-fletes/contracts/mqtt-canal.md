# Contract: Canal MQTT del Flete (bróker EMQX Cloud)

Reemplaza, para los dos flujos en alcance, los siguientes endpoints del
[contrato HTTP del chofer](../../001-chofer-recorrido/contracts/chofer-api.md):

- `POST /api/recorridos/:token/ubicacion` → **retirado**, reemplazado por publicación en
  `vickytruck/fletes/{token}/ubicacion`.
- `POST /api/recorridos/:token/puntos/:puntoId/arribo` → **retirado**, reemplazado por
  publicación en `vickytruck/fletes/{token}/eventos` con `tipo: "arribo"`.
- `POST /api/recorridos/:token/puntos/:puntoId/descarga` → **retirado**, reemplazado por
  publicación en `vickytruck/fletes/{token}/eventos` con `tipo: "descarga"`.

`GET /api/recorridos/:token` **no se retira**; se extiende (ver más abajo) para entregar
la configuración de conexión MQTT que el frontend necesita para publicar.

## GET /api/recorridos/:token (extendido)

Mismo contrato que hoy (ver `chofer-api.md`), con un campo nuevo en `recorrido`:

**200 OK**
```json
{
  "recorrido": {
    "estado": "activo",
    "mqtt": {
      "url": "wss://<host-emqx-cloud>:8084/mqtt",
      "username": "<token>",
      "password": "<credencial generada al asignar el recorrido>",
      "ubicacionTopic": "vickytruck/fletes/<token>/ubicacion",
      "eventosTopic": "vickytruck/fletes/<token>/eventos",
      "intervaloUbicacionMs": 60000
    }
  },
  "progreso": { "pendientes": 6, "arribados": 1, "completados": 3 },
  "puntos": [ "... igual que hoy ..." ]
}
```

`intervaloUbicacionMs` reemplaza al campo del mismo nombre que hoy vive directamente en
`recorrido` (ver `chofer-api.md`); se mueve dentro de `mqtt` porque solo tiene sentido en
el contexto de la publicación periódica.

Los códigos de error (`404`, `410`, formato `{ "error": "enlace_invalido" }`) no cambian.

## Publicación: `vickytruck/fletes/{token}/ubicacion`

Publicada por el flete. QoS 0, **retained**.

```json
{ "lat": -34.60, "lon": -58.38, "en": "2026-08-04T12:00:00Z" }
```

- `lat`, `lon`: obligatorios (equivalente a la validación `400 ubicacion_invalida` que
  hacía el endpoint HTTP retirado; un mensaje sin ambos campos se descarta en el backend,
  ver FR-013 de spec.md).
- `en`: obligatorio, ISO 8601, hora del dispositivo al capturar la posición.
- Efímero: el backend solo actualiza `ubicacionEnMemoria.js`, nunca escribe en Oracle.

## Publicación: `vickytruck/fletes/{token}/eventos`

Publicada por el flete. QoS 1, no retained.

```json
{ "tipo": "arribo", "puntoId": "p3", "lat": -34.60, "lon": -58.38 }
```

- `tipo`: `"arribo"` o `"descarga"`, obligatorio.
- `puntoId`: obligatorio.
- `lat`, `lon`: opcionales (si el dispositivo no tiene señal GPS en el momento, se omiten
  o se envían `null` — igual comportamiento que FR-006 de 001, no bloquea el registro).

**Resultado en el backend** (equivalente a las respuestas `200`/`404`/`409` que hoy
devuelven los endpoints HTTP retirados, salvo que aquí no hay un cliente HTTP esperando
una respuesta síncrona):
- Transición válida (o repetición idempotente del mismo evento): se persiste en Oracle
  exactamente igual que hoy (`repository.marcarArribo` / `marcarDescarga`).
- `puntoId` inexistente en el recorrido del token, o transición inválida (ej. "descarga"
  antes de "arribo"): el mensaje se descarta sin interrumpir la suscripción (FR-013),
  registrando el motivo en el log del backend para diagnóstico — no hay forma de devolver
  un error al publicador en MQTT como en HTTP, por lo que estos casos no deben ocurrir en
  operación normal (el frontend ya construye el mensaje a partir del estado que conoce del
  recorrido) y su aparición indica un bug o un mensaje corrupto/fuera de orden.

## GET /api/central/mqtt-config (nuevo)

Endpoint de solo lectura, sin autenticación adicional (mismo criterio que el resto de
`/api/central`, ver `central-api.md` de 002), consumido únicamente por
`central/src/services/mqttClient.js` al cargar el panel. Existe para que la credencial de
servicio de Central (ver data-model.md) viva en la configuración del backend (variable de
entorno), no compilada de forma estática dentro del bundle de `central/`.

**200 OK**
```json
{
  "url": "wss://<host-emqx-cloud>:8084/mqtt",
  "username": "<credencial de servicio de central>",
  "password": "<credencial de servicio de central>",
  "ubicacionTopicFilter": "vickytruck/fletes/+/ubicacion",
  "eventosTopicFilter": "vickytruck/fletes/+/eventos"
}
```

No expone credenciales de ningún flete individual, solo la credencial de servicio de
solo-lectura ya provista por variable de entorno del backend.

## Suscripción de solo lectura (backend / Central)

`vickytruck/fletes/+/ubicacion` y `vickytruck/fletes/+/eventos`, con la credencial de
servicio correspondiente (ver [data-model.md](../data-model.md)). El segmento `+`
(wildcard de un nivel) permite recibir mensajes de cualquier token activo sin necesitar
suscribirse/desuscribirse por cada recorrido que se asigna o finaliza.

- `backend/`: sesión persistente (`clean: false`), QoS 1 en la suscripción a `eventos`,
  para no perder mensajes durante una desconexión temporal del bróker (FR-011).
- `central/`: misma suscripción, aditiva al polling REST ya existente de 002 (ver
  research.md §5); si la conexión falla o no está disponible, Central sigue funcionando
  vía polling, con la degradación de latencia ya existente antes de esta feature.

## Notas transversales

- Ningún tópico expone datos de un token en el tópico de otro (aislamiento por ACL, ver
  research.md §2 y data-model.md) — un flete solo puede publicar en su propio
  `vickytruck/fletes/{token}/#`.
- El formato de payload es JSON plano en ambos tópicos, sin envolturas adicionales
  (Principio VII: sin capas de serialización propietarias).
