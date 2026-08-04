# backend

API HTTP (Express) de Central, sobre Oracle (fuente única de verdad, Principio IV) y un
bróker MQTT en la nube para ubicación/acciones de los fletes (003-mqtt-broker-fletes). El
frontend del chofer se despliega por separado, en un hosting público sin conectividad
hacia este backend (004-chofer-cloud-broker): Central genera, al asignar un recorrido, un
enlace con el recorrido y el token de publicación embebidos, y a partir de ahí el chofer
solo habla con el bróker.

## Variables de entorno

Ver [`.env.example`](./.env.example) para el detalle completo y comentado (Oracle,
Central, servidor HTTP y bróker MQTT).

## Puesta en marcha del bróker MQTT (EMQX Cloud)

Antes de levantar el backend por primera vez en un entorno nuevo:

1. Crear un deployment EMQX Cloud (tier **Serverless**, acorde a la escala del proyecto
   — ver [`specs/003-mqtt-broker-fletes/research.md`](../specs/003-mqtt-broker-fletes/research.md)
   §2) y una API Key/Secret de administración para ese deployment.
2. Completar en `.env` las variables `EMQX_*` documentadas en `.env.example`.
3. Ejecutar una sola vez (o cada vez que cambien las credenciales de servicio):

   ```bash
   npm run emqx:setup
   ```

   Esto crea/actualiza las credenciales de servicio de backend y Central, y aplica la
   regla de ACL global que aísla a cada flete dentro de su propio tópico
   (`backend/scripts/emqx-setup.js`, ver comentarios ahí sobre los paths de la API de
   EMQX Cloud usados — a confirmar contra el dashboard real si el deployment difiere).

4. `npm start` conecta el backend al bróker automáticamente (`src/mqtt/client.js`) y
   arranca la suscripción (`src/mqtt/subscriber.js`).

Las credenciales MQTT de cada flete (una por token de recorrido) se aprovisionan solas,
de forma perezosa, en el momento en que Central genera o vuelve a pedir el enlace del
recorrido (`POST /api/central/recorridos/:id/asignar`, `.../reasignar`, o simplemente
`GET /api/central/recorridos/:id` para un recorrido ya activo — `src/services/enlaceRecorrido.js`)
— no requieren ningún paso manual adicional. Se revocan automáticamente al reasignar el
recorrido a otro flete o al completarse el último punto de entrega.

## Frontend del chofer desplegado en la nube (004-chofer-cloud-broker)

El frontend del chofer (`frontend/`) se despliega en un hosting público (ej. Cloudflare
Pages/Workers) sin conectividad hacia este backend. Todo lo que necesita para mostrar el
recorrido y publicar en el bróker viaja embebido en el enlace que Central genera —
`CHOFER_FRONTEND_URL` (ver `.env.example`) es el origen de ese frontend, usado para armar
la URL completa.

Como el enlace de WhatsApp puede reenviarse fácilmente, el token de publicación queda
atado al primer dispositivo que lo usa (`src/mqtt/conexionWatcher.js` +
`src/state/vinculoDispositivo.js`): un segundo dispositivo con el mismo enlace puede ver
el recorrido, pero su intento de publicar es expulsado del bróker. Es un mecanismo
reactivo (detecta y expulsa), no preventivo — ver
[`specs/004-chofer-cloud-broker/research.md`](../specs/004-chofer-cloud-broker/research.md)
§3 para el porqué (el plan EMQX Cloud Serverless usado por el proyecto no soporta
autenticación HTTP por webhook).

## Scripts

- `npm start` — levanta el servidor HTTP + la conexión MQTT.
- `npm test` — corre los tests (`node --test`), sin depender de Oracle ni de EMQX Cloud
  reales (usa repositorios y clientes MQTT en memoria/fake).
- `npm run smoke:oracle` — verifica conectividad real contra Oracle.
- `npm run emqx:setup` — aplica la configuración administrativa de EMQX Cloud (ver arriba).
