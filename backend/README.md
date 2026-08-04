# backend

API HTTP (Express) del chofer y de Central, sobre Oracle (fuente única de verdad,
Principio IV) y un bróker MQTT en la nube para ubicación/acciones de los fletes
(003-mqtt-broker-fletes).

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
de forma perezosa, la primera vez que su enlace único hace `GET /api/recorridos/:token`
— no requieren ningún paso manual adicional. Se revocan automáticamente al reasignar el
recorrido a otro flete o al completarse el último punto de entrega.

## Scripts

- `npm start` — levanta el servidor HTTP + la conexión MQTT.
- `npm test` — corre los tests (`node --test`), sin depender de Oracle ni de EMQX Cloud
  reales (usa repositorios y clientes MQTT en memoria/fake).
- `npm run smoke:oracle` — verifica conectividad real contra Oracle.
- `npm run emqx:setup` — aplica la configuración administrativa de EMQX Cloud (ver arriba).
