# Data Model: Arquitectura Cloud + Integración Oracle/APEX + MQTT

**Nota**: no existía este archivo hasta 2026-08-06 (creado retroactivamente
para documentar lo implementado; `tasks.md` ya lo listaba como prerequisito
sin que existiera). A diferencia de 001/002, donde Oracle es la fuente de
verdad y el backend solo lee/escribe contra vistas y packages PL/SQL, acá el
backend cloud **no tiene ningún acceso a Oracle** (Principio IV, FR-001) —
todas las entidades de este documento viven en memoria del proceso Node
(`backend/src/state/integracionStore.js`), pobladas por push HTTP desde
Oracle/APEX y perdidas por completo en cada reinicio del proceso (deploy,
rotación de secrets, crash).

## RecorridoCloud

Espejo en memoria del `Recorrido` real de Oracle (`specs/001-chofer-recorrido/data-model.md`),
recibido vía `POST /api/integracion/recorridos`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | id numérico de Oracle, como string |
| `token` | string, nullable | mismo token que resuelve `GET /api/recorridos/:token` — sin token, el recorrido queda cargado pero inaccesible para el chofer |
| `fleteId` | string, nullable | dispara el aprovisionamiento de `CredencialMqttFlete` (ver abajo) cuando está presente |
| `fleteNombre` | string, nullable | solo para mostrar en Central, no autoritativo |
| `estado` | string | lo que Oracle envíe (`activo`, típicamente); no hay transición automática a `finalizado` calculada en el cloud |
| `updatedAt` | timestamp ISO | seteado por Oracle al armar el payload, o por el store si no viene |
| `ultimaUbicacion` | `{lat, lon, en, eventId}`, nullable | poblado exclusivamente por `mqttBridge.js` al recibir un mensaje válido — no por el POST de arriba |
| `puntos` | `PuntoEntregaCloud[]` | ver abajo |

**Reglas de upsert** (`integracionStore.upsertRecorridos`):
- Re-pushear el mismo `id` actualiza topología (`orden`/`lat`/`lon` de los
  puntos) pero **nunca pisa** el progreso ya confirmado por el chofer
  (`estado`/`arriboEn`/`arriboLat`/etc. de un punto `arribado` o
  `completado` no se resetea a `pendiente`).
- Sin `fleteId`, el recorrido no aparece en `GET /api/central/recorridos/activos`
  ni dispara aprovisionamiento MQTT.

## PuntoEntregaCloud

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | — |
| `orden` | número | posición en la secuencia |
| `estado` | enum: `pendiente` \| `arribado` \| `completado` | mismas transiciones que 001 |
| `lat`, `lon` | decimal, nullable | topología del punto (destino), la manda Oracle |
| `arriboEn`, `descargaEn` | timestamp ISO, nullable | seteados por el backend al aplicar la transición (`new Date().toISOString()`, **no** por Oracle) |
| `arriboLat`, `arriboLon` | decimal, nullable | **agregado 2026-08-06** — GPS del celular del chofer al marcar arribo (si estaba disponible); dato de auditoría, distinto de `lat`/`lon` de arriba |
| `descargaLat`, `descargaLon` | decimal, nullable | ídem para descarga |

**Regla de captura de GPS** (`integracionStore.js`, `transicionarPunto`):
solo se captura en la transición real (`pendiente→arribado`,
`arribado→completado`), nunca en una repetición idempotente de la misma
transición — para no pisar el primer registro con una posición GPS
posterior y desalineada del momento real del evento.

Expuestos a Oracle/APEX vía `GET /api/integracion/estado` (ver
`contracts/integracion-api.md`) para que `INTEGRACION_CLOUD_API.leer_estado_puntos`
los escriba de vuelta sobre `T_PUNTOS_ENTREGA` (columnas ya existentes,
compartidas con `RECORRIDO_API` del flujo on-prem viejo).

## CredencialMqttFlete (no persistida — derivable, no una entidad con estado propio)

No es una fila en ningún store: es el resultado **determinístico** de una
función pura, `derivarCredencial(fleteId)` en
`backend/src/mqtt/emqxProvisioning.js`. El estado real (si el usuario y su
regla de ACL existen) vive en EMQX Cloud, no en el backend.

| Campo | Tipo | Notas |
|---|---|---|
| `username` | string | `chofer-{fleteId}` |
| `password` | string | `HMAC-SHA256(EMQX_TOKEN_PASSWORD_SECRET, fleteId)`, hex — misma entrada, mismo resultado siempre |
| `topic` | string | `chofer/{fleteId}/ubicacion` — único tópico donde puede publicar |
| `url` | string | `EMQX_WSS_URL` del backend, igual para todos los fletes |

**Ciclo de vida**:
1. **Aprovisionamiento**: disparado por `POST /api/integracion/recorridos`
   cuando el recorrido recibido tiene `fleteId` (fire-and-forget, no bloquea
   la respuesta a Oracle). Idempotente — un re-push del mismo `fleteId` no
   crea nada nuevo, solo confirma que sigue existiendo.
2. **Lectura**: `GET /api/recorridos/:token` la deriva (sin llamar a la API
   de EMQX) y la devuelve en `recorrido.mqtt` para que el frontend la use.
3. **Revocación**: `revocarCredencial(fleteId)` existe pero **nada la
   invoca todavía** — no hay trigger de "recorrido finalizado" en esta
   arquitectura (research.md, Decisión 6, pendiente).

## Derivados de solo lectura

- **`GET /api/central/recorridos/activos`** (Central, polling): por cada
  `RecorridoCloud` con `estado = activo` y `fleteId` no nulo, `{ id, flete:
  {id, nombre}, progreso, ultimaUbicacion }` — mismo shape que ya definía
  002-panel-control-central, ahora alimentado por el store cloud en vez de
  Oracle directo.
- **`recorrido.mqtt`** en `GET /api/recorridos/:token`: ver
  `CredencialMqttFlete` arriba; `null` si el recorrido no tiene `fleteId`
  todavía o si el backend corre sin `EMQX_WSS_URL`/`EMQX_TOKEN_PASSWORD_SECRET`
  configurados (dev/test).
