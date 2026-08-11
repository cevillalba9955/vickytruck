# Contract: Delta de formato horario sobre `integracion-api.md` y `mqtt-topics.md`

Este documento describe el cambio de formato que esta feature introduce
sobre los contratos ya existentes de
[003-arquitectura-cloud-mqtt/contracts/integracion-api.md](../../003-arquitectura-cloud-mqtt/contracts/integracion-api.md)
y
[003-arquitectura-cloud-mqtt/contracts/mqtt-topics.md](../../003-arquitectura-cloud-mqtt/contracts/mqtt-topics.md).
No reemplaza esos documentos ni cambia ningún endpoint, campo, método o
código de estado — solo el **formato del valor string** de los campos de
horario que ya existían.

## Qué cambia

Todo campo de horario (`updatedAt`, `arriboEn`, `descargaEn`, `en` de
ubicación) que hoy se emite como ISO 8601 UTC (`Z`) pasa a emitirse como ISO
8601 con offset local fijo de Argentina (`-03:00`, sin horario de verano).

| Campo | Antes | Después |
|---|---|---|
| `updatedAt` (recorrido) | `"2026-08-05T13:20:00Z"` | `"2026-08-05T10:20:00.000-03:00"` |
| `arriboEn` / `descargaEn` (punto) | `"2026-08-05T13:31:00Z"` | `"2026-08-05T10:31:00.000-03:00"` |
| `en` (evento MQTT de ubicación) | `"2026-08-06T13:35:20.123Z"` | `"2026-08-06T10:35:20.123-03:00"` |

`rangoHorario` **no cambia** — sigue siendo el string libre que ya era, sin
formato definido (ver `research.md` Decisión 5).

## Compatibilidad con datos históricos (sin migración, FR-006)

Los valores ya guardados con `Z` (UTC) **no se reescriben**. Cualquier
consumidor de estos campos (Oracle, backend, frontend, central) DEBE seguir
aceptando ambos formatos (`Z` y `±HH:MM`) al leer — nunca asumir que el
offset es siempre `-03:00` solo porque esta feature ya se desplegó. Ver
`research.md` Decisión 2 y 7.

## Impacto en Oracle (lado consumidor del contrato, fuera de este repo salvo el código PL/SQL versionado acá)

`backend/sql/integracion-cloud/integracion_cloud_api.pkb.sql`:

- `leer_estado_puntos` (línea ~328-332) parsea `arriboEn`/`descargaEn` del
  `GET /api/integracion/estado` con `TO_TIMESTAMP(rec.arribo_en,
  c_mascara_iso_utc)`, donde `c_mascara_iso_utc` (línea 74) asume literal
  `"Z"`. **Rompe** en runtime para cualquier timestamp nuevo con offset
  `-03:00` si no se actualiza la máscara — ver `research.md` Decisión 4 para
  el cambio necesario (`TO_TIMESTAMP_TZ` con máscara `TZH:TZM`).
- Este cambio de máscara debe desplegarse en Oracle/APEX **junto con** (no
  antes ni mucho después de) el cambio del lado cloud que empieza a emitir
  `-03:00` en vez de `Z`, para evitar una ventana donde `leer_estado_puntos`
  reciba un formato que su máscara vigente no sepa parsear. Es la única
  dependencia de despliegue coordinado de esta feature (Oracle/APEX vive
  fuera de este repo — coordinar con quien administra ese entorno antes de
  mergear el cambio del lado cloud).

## Impacto en longitud de campo

`arribo_en VARCHAR2(40)` / `descarga_en VARCHAR2(40)` en el `JSON_TABLE` de
`leer_estado_puntos` — el string más largo posible con el nuevo formato
(`2026-08-11T10:35:20.123-03:00`, 29 caracteres) entra sin problema dentro
del límite de 40 declarado; no requiere cambio de tamaño.

## No hay cambios de:

- Métodos HTTP, paths, códigos de estado, autenticación.
- Nombres de campos.
- Tópicos MQTT, QoS, ACL, credenciales (ver `mqtt-topics.md`, sin cambios).
- El campo `rangoHorario`.
