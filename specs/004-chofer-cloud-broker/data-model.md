# Data Model: Entrega de Recorrido y Token de Bróker para Frontend Desplegado en la Nube

No se agregan tablas ni columnas nuevas en Oracle (Principio IV) — todas las entidades nuevas de
esta funcionalidad son o bien una **proyección sin estado** de datos ya existentes (el enlace),
o bien **estado efímero en memoria del backend** (el vínculo a primer dispositivo), en el mismo
espíritu que `ubicacionEnMemoria.js` de `001-chofer-recorrido`.

## Enlace de recorrido (proyección, sin persistencia propia)

Representa el enlace único completo que Central distribuye por un canal externo. No es una
entidad con ciclo de vida propio: se recalcula bajo demanda a partir del recorrido, sus puntos y
la credencial MQTT ya determinística del token.

| Campo | Origen | Notas |
|---|---|---|
| `token` | `recorrido.token` (Oracle, ya existente) | Identificador del recorrido/flete; igual que hoy. |
| `frontendBaseUrl` | Variable de entorno del backend (`CHOFER_FRONTEND_URL`) | Host del frontend en Cloudflare Pages/Workers. |
| `payload` | Ver "Payload de recorrido" abajo | Codificado en Base64URL dentro del fragmento de la URL. |
| `url` | `${frontendBaseUrl}/#/r/${payload en Base64URL}` | Es el enlace final, listo para copiar/enviar. |

**Reglas**:
- Determinístico: mismos `token` + estado actual del recorrido ⇒ mismo `url` (FR-006, US3
  acceptance scenario 2).
- Deja de ser válido (el `payload` embebido queda obsoleto) cuando el recorrido finaliza o se
  revoca — en ese momento el token de publicación embebido ya no es aceptado por el bróker
  (FR-005), y cualquier copia del enlace que aún circule sirve el `payload` viejo pero sin poder
  publicar.
- No soporta actualización en caliente (FR-005b, Assumptions de `spec.md`): si Central modifica
  los puntos de un recorrido con enlace ya distribuido, debe revocar y generar un enlace nuevo;
  no existe un mecanismo para "editar" el payload de un enlace ya emitido.

## Payload de recorrido (estructura embebida en el enlace)

Mismo contenido que hoy expone `GET /api/recorridos/:token` (ver
`specs/003-mqtt-broker-fletes/contracts/mqtt-canal.md`), sin cambios de forma — solo cambia el
canal de entrega (embebido en URL en vez de respuesta HTTP). Ver esquema completo en
[contracts/enlace-recorrido.md](./contracts/enlace-recorrido.md).

## Token de publicación en el bróker

Ya definido en `003-mqtt-broker-fletes` (username = token, password derivado
determinísticamente). Esta funcionalidad no cambia su forma, pero sí:
- **Cuándo se aprovisiona**: antes, en cada `GET /:token` (ahora retirado); ahora, en el momento
  en que Central genera/solicita el enlace (`POST /asignar`, `/reasignar`, o una relectura
  posterior del mismo enlace).
- **Nuevo atributo de ciclo de vida**: *vínculo a primer dispositivo* (ver abajo) — no es un
  campo del token en sí, sino un estado asociado observado en tiempo de ejecución.

## Vínculo de dispositivo (nuevo, estado efímero en memoria del backend)

| Campo | Tipo | Descripción |
|---|---|---|
| `token` | string | Igual al username MQTT del flete/recorrido. |
| `clientId` | string | `clientId` MQTT del primer dispositivo que conectó exitosamente con ese token. |
| `vinculadoEn` | timestamp | Momento en que se registró el vínculo (diagnóstico/depuración, no autoritativo). |

**Ciclo de vida**:
- Se crea al observar el primer evento de conexión (`$SYS`/evento de cliente conectado) para un
  `token` sin vínculo previo.
- Se consulta en cada evento de conexión posterior para ese `token`: `clientId` igual ⇒ no-op
  (reconexión legítima); `clientId` distinto ⇒ se dispara la expulsión (kick) de esa sesión
  (ver [contracts/vinculo-dispositivo.md](./contracts/vinculo-dispositivo.md)).
- Se elimina cuando el token se revoca (recorrido finalizado/reasignado), igual que ya ocurre
  hoy con la credencial EMQX (`emqxProvisioning.revocarCredencial`) — mismo punto del código
  (`backend/src/mqtt/subscriber.js`, al detectar recorrido 100% completado, y
  `central.js` en `/reasignar`).
- Se pierde sin problema ante un reinicio del backend (dato efímero, no autoritativo, Principio
  VII) — el primer dispositivo que reconecte después del reinicio queda registrado como "primer
  dispositivo" nuevamente. Riesgo aceptado, equivalente al ya asumido para
  `ubicacionEnMemoria.js`.

## Diagrama de relaciones

```text
Recorrido (Oracle) ──1:1── Token de publicación (EMQX Cloud, username/password)
      │                              │
      │ (proyección determinística)  │ (observado en tiempo de ejecución)
      ▼                              ▼
Enlace de recorrido (URL)     Vínculo de dispositivo (memoria backend: token → clientId)
      │
      ▼
Payload de recorrido (JSON embebido: puntos + progreso + config MQTT)
```
