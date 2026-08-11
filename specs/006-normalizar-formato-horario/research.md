# Research: Normalización del formato horario

**Feature**: 006-normalizar-formato-horario | **Fecha**: 2026-08-11

Investigación de código real (no hipotética) sobre generación, transporte y
visualización de horarios en los tres componentes (`backend/`, `frontend/`
chofer, `central/`) y en los paquetes PL/SQL de Oracle (`backend/sql/`).
Todas las rutas y líneas fueron confirmadas por lectura directa del código
antes de escribir este documento.

## Decisión 1: Formato de intercambio interno — ISO 8601 con offset local fijo `-03:00`, no UTC

**Decisión**: Todo timestamp generado por el sistema (backend, frontend
chofer, central, Oracle) para intercambio entre sistemas (`updatedAt`,
`arriboEn`, `descargaEn`, `asignadoEn`, `en` de ubicación MQTT) se expresa
como ISO 8601 con la hora de pared de Argentina y offset explícito `-03:00`,
por ejemplo `2026-08-11T10:35:20.123-03:00`, reemplazando el
`Date.prototype.toISOString()` (siempre UTC con sufijo `Z`) usado hoy en
todo el código JS y el `TO_CHAR(... AT TIME ZONE 'UTC' ...)` usado en Oracle.

**Rationale**: confirmado por clarificación con el usuario (spec,
Clarifications, sesión 2026-08-11, pregunta 1) — Opción B. Argentina no tiene
horario de verano desde 2009, por lo que un offset fijo `-03:00` es válido en
todo momento del año; no hace falta lógica de DST.

**Cómo generarlo (JS, backend/frontend/central)**: no existe en JS un
equivalente nativo a `toISOString()` con offset local. Enfoque elegido —
desplazar el instante UTC por el offset fijo y reusar `toISOString()` para el
formateo de los campos, reemplazando el sufijo:

```js
const OFFSET_MINUTOS_AR = -180; // Argentina, UTC-3, sin horario de verano
export function ahoraLocalIso(fecha = new Date()) {
  const desplazada = new Date(fecha.getTime() + OFFSET_MINUTOS_AR * 60000);
  return desplazada.toISOString().replace("Z", "") + "-03:00";
}
```

Es una función pura, sin dependencia del `TZ` del proceso Node ni del huso
horario configurado en el dispositivo del chofer (crítico: `frontend/`
corre en el navegador/celular del chofer, cuya zona horaria de sistema no es
controlable ni confiable). Se usa en los puntos de **generación** de
timestamps:

- `backend/src/state/integracionStore.js:128,164,241,263,284,371,492`
- `backend/src/services/mqttBridge.js:43` (fallback si falta `en` en el payload)
- `backend/src/routes/recorrido.js:129`
- `frontend/src/services/ubicacionMqtt.js:51` (origen real de `en` — el
  chofer publica su ubicación desde acá)
- `central/src/services/mqttClient.js:38` (fallback, raramente usado — el
  timestamp real ya viene del payload del chofer)

**Oracle**: `SYSTIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires'`
seguido de `TO_CHAR(..., 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM')` produce el
mismo formato — ver Decisión 3.

**Alternativas consideradas**:
- Mantener UTC internamente y convertir solo en pantalla (Opción A del
  clarify) — descartada explícitamente por el usuario: no resuelve el
  problema de fondo de raíz en los contratos/logs/auditoría entre sistemas.
- Usar `Intl.DateTimeFormat` con `timeZone: 'America/Argentina/Buenos_Aires'`
  para *generar* el string de intercambio — descartada por ser más compleja
  de ensamblar en formato ISO estricto que el desplazamiento numérico fijo;
  se reserva `Intl.DateTimeFormat` para el formateo de *visualización*
  (Decisión 2), donde sí es la herramienta idónea.

## Decisión 2: Formateo de visualización — siempre reconvertir, nunca asumir que el string ya es local

**Decisión**: La función que muestra `HH24:MM:SS` en pantalla **parsea el
string recibido y lo reconvierte explícitamente** a hora de Buenos Aires,
sin asumir que el offset ya presente en el string es `-03:00`:

```js
const formateadorHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
export function formatearHoraLocal(iso) {
  return formateadorHora.format(new Date(iso));
}
```

**Rationale**: los datos históricos (FR-006, ver Decisión 4) van a seguir
guardados en UTC `Z` indefinidamente — no se migran. Si el formateador de
visualización asumiera "el string ya es hora local, solo recorto
substring(11,19)" fallaría silenciosamente para todo dato histórico
(mostraría la hora UTC, no la de Buenos Aires). Reconvertir explícitamente
con `Intl.DateTimeFormat` funciona igual de bien para timestamps viejos
(`...Z`) y nuevos (`...-03:00`), sin caso especial. `new Date(iso)` parsea
ambos formatos correctamente (offset ISO 8601 estándar).

**Alternativas consideradas**:
- Recortar el substring `HH:MM:SS` directamente del string ya que, para
  datos *nuevos*, ya viene en hora local — descartada: rompe para datos
  históricos (mezclados en el tiempo con los nuevos, FR-006) y acopla la UI a
  un detalle interno del formato de origen en vez de a la semántica ("mostrar
  la hora de Buenos Aires de este instante").

## Decisión 3: Corrección del bug de zona horaria en Oracle sin cambiar el esquema de tablas

**Decisión**: en vez de depender de confirmar `DBTIMEZONE`/el TZ del sistema
operativo del server Oracle (que hoy nadie confirmó — riesgo documentado en
`backend/sql/integracion-cloud/README.md:203-210`), cada punto que hoy asigna
`SYSTIMESTAMP` crudo pasa a convertir explícitamente vía `AT TIME ZONE
'America/Argentina/Buenos_Aires'`, independientemente de cómo esté
configurado el server:

- `backend/sql/recorrido_api.pkb.sql:52` (llena `ARRIBO_EN`/`DESCARGA_EN`):
  `SYSTIMESTAMP` → `CAST(SYSTIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires' AS TIMESTAMP)`.
- `backend/sql/central_api.pkb.sql:38,105` (llena `ASIGNADO_EN`): mismo
  cambio.
- `backend/sql/integracion-cloud/integracion_cloud_api.pkb.sql:200`
  (`updatedAt` del payload hacia el cloud): de
  `TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')` a
  `TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM')`.

El `CAST(... AS TIMESTAMP)` es necesario porque, según `backend/sql/central_api.pks.sql:37,45`
y `backend/sql/recorrido_api.pks.sql:36,46`, los parámetros/columnas están
tipados como `TIMESTAMP` a secas (sin `WITH TIME ZONE`) — no hay ningún
`CREATE TABLE` versionado en este repo para `T_PUNTOS_ENTREGA`/recorridos
(vive en el esquema APEX, fuera de este repo), así que cambiar el tipo de
columna requeriría coordinación con quien administra ese esquema, fuera del
alcance de esta feature. `AT TIME ZONE` seguido de `CAST AS TIMESTAMP`
resuelve el bug (el valor numérico guardado siempre representa la hora de
pared de Buenos Aires) sin tocar el DDL.

**Rationale**: resuelve exactamente el riesgo documentado en el propio
README del proyecto, sin depender de una variable de entorno externa
(`DBTIMEZONE`) que nadie confirmó y que podría cambiar sin aviso (migración
de infraestructura, cambio de datacenter). `AT TIME ZONE` con nombre de zona
IANA es una conversión explícita y auditable en el propio código PL/SQL —
consistente con el Principio IV de la constitución ("sincronización
explícita").

**Alternativas consideradas**:
- Confirmar `DBTIMEZONE` y, si coincide con Argentina, no tocar nada —
  descartada: es una suposición frágil (server podría migrar de
  infraestructura/región sin que nadie actualice este supuesto), y no dejaría
  rastro auditable de que el horario es correcto a propósito.
- Migrar las columnas a `TIMESTAMP WITH TIME ZONE` — descartada por requerir
  una migración de esquema fuera del alcance/control de este repo (riesgo
  alto, coordinación externa no confirmada); el `CAST` explícito logra el
  mismo resultado práctico sin esa dependencia.

## Decisión 4: Máscara de parseo en Oracle — de `TO_TIMESTAMP` con `Z` fijo a `TO_TIMESTAMP_TZ` con offset

**Decisión**: `backend/sql/integracion-cloud/integracion_cloud_api.pkb.sql:74`
(`c_mascara_iso_utc CONSTANT VARCHAR2(40) := 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'`)
y su uso en `:328,332` (`TO_TIMESTAMP(rec.arribo_en, c_mascara_iso_utc)`,
dentro de `leer_estado_puntos`, que lee `GET /api/integracion/estado` del
cloud) pasan a `TO_TIMESTAMP_TZ(rec.arribo_en, 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM')`
seguido de `CAST(... AS TIMESTAMP)` para escribir en la columna sin TZ — ya
que el cloud, tras la Decisión 1, va a mandar `arriboEn`/`descargaEn` con
offset `-03:00` en vez de `Z`.

**Riesgo operativo a señalar en tasks.md**: `leer_estado_puntos` es la
función marcada como "sin probar" en el historial reciente del proyecto —
cualquier cambio acá necesita una prueba manual explícita contra el backend
real antes de mergear (no solo tests unitarios de Oracle, que este repo no
tiene infraestructura para correr).

**Rationale**: consecuencia directa de la Decisión 1 — si el string ya no es
siempre `Z`, la máscara fija que asume `"Z"` literal falla en runtime
(`ORA-01821` o similar) para todo timestamp nuevo. `TO_TIMESTAMP_TZ` es la
función correcta de Oracle para parsear un literal que incluye offset
explícito.

## Decisión 5: `rangoHorario` queda intacto — sin tocar

**Decisión**: `punto.rangoHorario` (`frontend/src/components/DeliveryPointCard.jsx:70-73`,
también expuesto sin cambios por `serializePunto` en
`backend/src/routes/recorrido.js`) no se toca en ningún punto de esta
feature: ni generación, ni transporte, ni visualización. Confirmado por
clarificación con el usuario (spec, Clarifications, pregunta 3) — es un
campo de texto libre (string) provisto por Oracle (`p.horario` en
`integracion_cloud_api.pkb.sql:174`), no un horario estructurado; se muestra
tal cual.

**Rationale**: evita repetir el error de la primera iteración de este plan,
donde se asumió erróneamente que `rangoHorario` debía reinterpretarse o
mostrar un fallback ante formato inválido — el usuario corrigió
explícitamente que es un string opaco.

## Decisión 6: Reusar el mismo par de funciones en los tres componentes JS, sin paquete compartido nuevo

**Decisión**: `ahoraLocalIso()` (Decisión 1) y `formatearHoraLocal()`
(Decisión 2) se implementan como un módulo pequeño y puro, **duplicado** en
cada uno de los tres proyectos JS independientes:

- `backend/src/util/tiempo.js` (carpeta nueva; ninguna existente
  —`db/middleware/mqtt/routes/services/state`— es el lugar natural para una
  utilidad pura sin I/O).
- `frontend/src/services/tiempo.js` (mismo patrón que `services/api.js`,
  `geolocation.js` ya existentes en ese proyecto).
- `central/src/services/tiempo.js` (mismo patrón que `services/marcadores.js`
  ya existente — lógica pura sin I/O, co-ubicada con servicios).

**Rationale** (Principio VII, Simplicidad): `backend/`, `frontend/` y
`central/` son tres proyectos npm independientes, cada uno con su propio
`package.json`, pipeline de build (Vite/Wrangler vs Node directo) y deploy
(`fly deploy` vs `wrangler deploy`) — no hay workspace/monorepo tooling
(`npm workspaces`, `lerna`, etc.) en el repo hoy. Introducir uno solo para
compartir ~15 líneas de función pura sería una pieza de infraestructura
nueva desproporcionada al problema, y una violación mayor de Principio VII
que duplicar un archivo pequeño y estable (Argentina no cambia de huso
horario; el archivo no requiere mantenimiento futuro esperado).

**Alternativas consideradas**:
- Paquete npm compartido publicado o `npm link` local — descartado por
  Principio VII (nueva infraestructura de build/publish sin necesidad
  demostrada).
- Carpeta `common/` en la raíz del repo importada por path relativo cruzando
  proyectos — descartado: los tres proyectos se despliegan de forma
  independiente (Fly.io vs Cloudflare Workers vía Wrangler) y un import
  cruzado de carpeta rompería el bundling independiente de cada uno.

## Decisión 7: Datos históricos — sin migración, mostrados vía Decisión 2

**Decisión**: confirmado por clarificación (spec, Clarifications, pregunta
2) — no se migra ningún instante histórico. `formatearHoraLocal()`
(Decisión 2) ya resuelve mostrar correctamente tanto los timestamps
históricos (`...Z`, potencialmente con el desfasaje del bug de Oracle ya
conocido y aceptado) como los nuevos (`...-03:00`), sin necesitar lógica
condicional adicional en la UI.

## Resumen de puntos de visualización a modificar/agregar

Hallazgo clave de la investigación: **hoy no existe ninguna función de
formateo de hora en ningún componente** (`grep` sin resultados para
`toLocaleTimeString`/`toLocaleString`/`Intl.DateTimeFormat`/`getHours` en
`central/src/components` y `frontend/src/components`). Los puntos a tocar:

| Componente | Archivo:línea | Estado actual | Cambio |
|---|---|---|---|
| Central — detalle de recorrido | `central/src/components/RecorridoDetalle.jsx:41-42` | Muestra el string ISO crudo sin formatear (`{p.arriboEn}`) | Formatear con `formatearHoraLocal` |
| Central — monitor en vivo | `central/src/components/MonitorView.jsx` (`formatearUbicacion`) | Solo deriva "reciente"/"no reciente", no muestra la hora | Agregar la hora formateada de `ultimaUbicacion.en` |
| Central — monitor/detalle | `central/src/components/MonitorView.jsx`, `RecorridoDetalle.jsx` | `updatedAt`/`asignadoEn` de Recorrido no llega a la UI (ni siquiera está serializado en `backend/src/routes/central.js` → `listarActivos()`/`obtenerDetalle()`) | Agregar `updatedAt` a la serialización de Central y mostrarlo |
| Chofer — tarjeta de punto | `frontend/src/components/DeliveryPointCard.jsx` | `arriboEn`/`descargaEn` ya viajan en el payload (`recorrido.js:42-43`) pero no se renderizan en ningún lado | Agregar su visualización formateada |

`arriboEn`/`descargaEn` ya llegan al frontend del chofer (el backend ya los
serializa); es la UI la que nunca los mostró. Lo mismo con `ultimaUbicacion.en`
en Central. Es decir: para Historia 1 y 2 del spec, la mayor parte del
trabajo es agregar la visualización que hoy no existe, no solo reformatear
una que ya existía (excepción: `RecorridoDetalle.jsx:41-42`, que sí muestra
el dato hoy, crudo).
