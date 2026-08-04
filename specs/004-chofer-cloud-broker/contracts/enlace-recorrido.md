# Contract: Payload embebido en el enlace de recorrido

Reemplaza a `GET /api/recorridos/:token` (ver
[chofer-api.md](../../001-chofer-recorrido/contracts/chofer-api.md) y su extensión en
[mqtt-canal.md](../../003-mqtt-broker-fletes/contracts/mqtt-canal.md)), que queda **retirado**:
el frontend del chofer ya no hace ningún `fetch` para obtener el recorrido ni la configuración
MQTT; ambos llegan embebidos en el enlace.

## Forma del enlace

```text
<CHOFER_FRONTEND_URL>/#/r/<payload>
```

- `<CHOFER_FRONTEND_URL>`: origen del frontend en Cloudflare Pages/Workers (ej.
  `https://vickytruck-chofer.pages.dev`), configurado en el backend por variable de entorno.
- `<payload>`: el JSON de abajo, `JSON.stringify` compacto (sin espacios) y codificado en
  Base64URL (alfabeto `A–Z a–z 0–9 - _`, sin `=` de relleno).
- El fragmento (todo lo que sigue a `#`) nunca se envía al servidor que sirve el frontend; solo
  lo lee `window.location.hash` en el cliente.

## Esquema del payload (idéntico al `body` que hoy devuelve `GET /:token`)

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
  "puntos": [
    {
      "id": "p1",
      "orden": 1,
      "totalPuntos": 10,
      "latitud": -34.6,
      "longitud": -58.38,
      "estado": "pendiente",
      "arriboEn": null,
      "descargaEn": null
    }
  ]
}
```

Sin cambios de campos respecto al contrato que reemplaza — solo cambia el canal de entrega.

## Comportamiento del frontend al decodificar

1. Lee `window.location.hash`; si no matchea el patrón `#/r/<payload>`, se trata como
   "enlace inválido" (mismo mensaje que hoy da `404 enlace_invalido`, FR-007) — sin distinguir
   para el usuario si falta el fragmento o si el Base64/JSON es inválido, por privacidad
   (no exponer detalles internos, FR-007).
2. Decodifica Base64URL → JSON.parse. Cualquier error de decodificación se trata igual que el
   punto 1.
3. Valida forma mínima (`recorrido.mqtt.url/username/password`, `puntos` es un array no vacío
   de máximo 10 elementos, Principio II); si no cumple, mismo tratamiento que el punto 1.
4. No hay estado "cargando" de red para este paso (a diferencia del contrato anterior): la
   decodificación es síncrona y local. El estado "cargando" que sigue mostrando la UI
   (`main.jsx`) pasa a cubrir únicamente la conexión al bróker, no la obtención del recorrido.

## Casos de error ya no aplicables

- `404 enlace_invalido` / `410` HTTP: no existen más como respuestas de red — se reemplazan por
  la validación local del punto 3 de arriba. El *significado* para el usuario (mensaje de
  enlace inválido/expirado, FR-007) se mantiene igual.
- Los reintentos de red ante backend caído: ya no aplican a este paso (no hay red involucrada en
  mostrar el recorrido); solo aplican a la conexión al bróker (ver Edge Cases de `spec.md`).
