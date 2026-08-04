# Data Model: Transporte de Ubicación y Acciones vía Bróker MQTT en la Nube

Esta feature no agrega tablas ni columnas en Oracle (Principio IV: sin cambios de
esquema). Los "datos" que introduce son la forma de los mensajes MQTT y las credenciales
asociadas al canal — documentados aquí como el equivalente de un modelo de datos para un
transporte basado en mensajería.

## Canal de mensajería del flete (Topic)

| Campo | Descripción |
|---|---|
| `token` | El mismo enlace único de recorrido diario ya definido en 001-chofer-recorrido (`recorridoRepository.obtenerPorToken`). Identifica de forma inequívoca a qué flete/recorrido corresponde el canal (FR-007). No es un dato nuevo: es el identificador ya existente, reutilizado como segmento de tópico y como nombre de usuario MQTT. |
| `ubicacionTopic` | `vickytruck/fletes/{token}/ubicacion` — QoS 0, retained. |
| `eventosTopic` | `vickytruck/fletes/{token}/eventos` — QoS 1, no retained. |
| Validez | El canal (sus credenciales) es válido únicamente mientras el recorrido correspondiente está activo; se revoca al finalizar o reasignar (FR-008). |

## Mensaje de ubicación

Publicado por el flete en `ubicacionTopic`.

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `lat` | number | Sí | Igual al parámetro `lat` que ya recibía `POST /:token/ubicacion`. |
| `lon` | number | Sí | Igual al parámetro `lon` que ya recibía `POST /:token/ubicacion`. |
| `en` | string (ISO 8601) | Sí | Marca de tiempo del dispositivo al momento de tomar la posición. |

Efímero y no autoritativo (igual que hoy); se sobrescribe con cada publicación; se pierde
sin problema ante una interrupción del bróker o un reinicio del backend (FR-012).

## Mensaje de acción

Publicado por el flete en `eventosTopic`, uno por cada "Llegué" o "Descarga completa".

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `tipo` | `"arribo"` \| `"descarga"` | Sí | Determina si dispara `repository.marcarArribo` o `repository.marcarDescarga`. |
| `puntoId` | string | Sí | Igual al parámetro de ruta `:puntoId` que ya recibían los POST reemplazados. |
| `lat` | number \| null | No | Ubicación GPS del dispositivo al momento del evento, si estaba disponible (igual comportamiento que FR-006 de 001: la ausencia no bloquea el registro). |
| `lon` | number \| null | No | Idem `lat`. |

La marca de tiempo del evento la sigue generando el backend al procesar el mensaje (hora
de servidor), no el payload — mismo comportamiento que el handler HTTP que reemplaza. Debe
preservarse hasta ser recibido por el backend (FR-012); el backend aplica la misma lógica
idempotente ya existente ante reintentos duplicados del cliente (research.md §4 de esta
feature; research.md §6 de 001-chofer-recorrido).

## Credencial MQTT por token

Entidad operativa nueva, administrada por `backend/src/mqtt/emqxProvisioning.js` contra la
API de EMQX Cloud (no se persiste en Oracle — no es un dato de negocio, es configuración
de acceso al bróker).

| Campo | Descripción |
|---|---|
| `username` | = `token` del recorrido. |
| `password` | Generada al aprovisionar; opaca, sin significado propio. |
| Alcance (ACL) | PUBLISH únicamente en `vickytruck/fletes/{token}/#`, vía la regla de ACL global con placeholder `${username}` (research.md §2) — no requiere una entrada de ACL individual. |
| Ciclo de vida | Se crea junto con la generación del enlace único (extiende el flujo de asignación de 002, FR-006 de esa spec); se revoca cuando el recorrido finaliza o se reasigna a otro flete (FR-008 de esta spec, análogo a la invalidación del enlace único que ya hace 002 FR-009 al reasignar). |

## Credencial de servicio (backend / Central)

| Campo | Descripción |
|---|---|
| `username` / Client ID | Fijo, uno para `backend/` y uno para `central/`, configurados por variable de entorno (mismo patrón que las credenciales de Oracle ya usadas por `backend/`). |
| Alcance (ACL) | SUBSCRIBE en `vickytruck/fletes/+/ubicacion` y `vickytruck/fletes/+/eventos`; sin permiso de PUBLISH. |
| Ciclo de vida | Aprovisionada una vez de forma administrativa (fuera del código de la feature), no rota por token. |
