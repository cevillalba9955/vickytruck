# Implementation Plan: Transporte de Ubicación y Acciones vía Bróker MQTT en la Nube

**Branch**: `003-mqtt-broker-fletes` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-mqtt-broker-fletes/spec.md`

## Summary

Reemplaza el transporte de dos flujos ya existentes del chofer — el reporte periódico de
ubicación instantánea (hoy `POST /:token/ubicacion`) y los eventos "Llegué"/"Descarga
completa" (hoy `POST /:token/puntos/:puntoId/arribo|descarga`) — por publicaciones MQTT
hacia un bróker en la nube (EMQX Cloud), en vez de llamadas HTTP directas del navegador
del chofer al backend. El backend deja de necesitar exponer esos endpoints al chofer;
en su lugar, se conecta hacia afuera al bróker y se suscribe a los mismos datos. Central
también se suscribe directamente al bróker (aclarado en spec.md), de forma adicional al
polling REST ya existente de 002, para reflejar ubicación y acciones sin depender de una
redistribución del backend. La carga inicial del recorrido (`GET /:token`) y la
persistencia en Oracle de los eventos de arribo/descarga no cambian: solo cambia el medio
de transporte de estos dos flujos específicos.

## Technical Context

**Language/Version**: JavaScript ESM (sin cambios). Backend: Node.js ≥ 20.12. Frontend
(`frontend/`, `central/`): React 18, mismas convenciones que 001/002.

**Primary Dependencies**:
- Todos los componentes (`backend/`, `frontend/`, `central/`) agregan `mqtt` (mqtt.js) —
  única librería MQTT del proyecto, ya que soporta tanto conexión TCP/TLS desde Node.js
  (`backend/`) como MQTT-sobre-WebSocket desde el navegador (`frontend/`, `central/`), sin
  necesitar clientes distintos por entorno (Principio VII).
- `backend/` usa `fetch` nativo de Node ≥ 20 (sin dependencia nueva) para llamar a la API
  de administración de EMQX Cloud al aprovisionar/revocar credenciales MQTT por token.

**Storage**: Sin cambios respecto a 001/002. Oracle sigue siendo la única fuente de verdad
para los eventos de arribo/descarga (Principio IV); `backend/src/state/ubicacionEnMemoria.js`
sigue siendo el caché efímero en memoria de la última ubicación instantánea (Principio
VII), solo que ahora lo alimenta un handler de suscripción MQTT en vez del handler HTTP
`POST /:token/ubicacion` que reemplaza. El endpoint REST interno que ya usa
`centralRepository.js` para servir el snapshot inicial del panel no cambia.

**Testing**: `node --test` en `backend/` para el nuevo módulo de suscripción MQTT (mapeo
mensaje → `ubicacionStore.registrar` / `repository.marcarArribo` / `repository.marcarDescarga`,
usando un cliente MQTT en memoria/fake para no depender de EMQX Cloud real en tests) y para
el aprovisionamiento/revocación de credenciales (fake de la API de EMQX Cloud). `vitest` +
Testing Library en `frontend/` y `central/` para los nuevos servicios `mqttClient.js`
(conexión, reconexión, cola de reintento) con un broker MQTT en memoria o mock de `mqtt.js`.

**Target Platform**: Los tres componentes agregan una conexión saliente (TCP/TLS desde
`backend/`, WSS desde los navegadores de `frontend/` y `central/`) hacia el bróker EMQX
Cloud; ninguno pasa a requerir puertos entrantes nuevos. `backend/` sigue sirviendo por
HTTPS su propia API de solo lectura (`GET /:token`, endpoints de Central) — esta feature
no elimina esa necesidad, solo el flujo específico de ubicación/acciones deja de pasar por
ahí.

**Project Type**: web (dos frontends + un backend compartido, igual que 002; se agrega un
bróker MQTT externo como intermediario, sin nuevos servicios propios).

**Performance Goals**: sin cambios respecto a las metas ya definidas en 001/002 para estos
flujos (SC-002, SC-003 de esta spec): intervalo de ubicación comparable al actual (≈60s
por defecto) y eventos de arribo/descarga reflejados en pocos segundos con conectividad
normal.

**Constraints**:
- El backend MUST iniciar su conexión al bróker siempre hacia afuera (cliente MQTT
  saliente), nunca aceptando conexiones entrantes para este flujo (FR-003).
- El dispositivo del chofer MUST publicar sin credenciales que permitan leer o escribir
  fuera de su propio recorrido activo (FR-004, FR-006, FR-008).
- Central, al conectarse por WSS al bróker desde dentro de un `<iframe>` embebido en APEX
  (Principio III), MUST seguir funcionando igual que accedida directamente; una conexión
  WebSocket saliente a un tercero no depende de cookies de terceros ni de la ventana de
  nivel superior, pero el CSP de la página contenedora (si existe) debe permitir
  `connect-src` hacia el dominio del bróker — a verificar/documentar en el entorno real
  (research.md).
- Los eventos "Llegué"/"Descarga completa" MUST viajar con una garantía de entrega
  superior a la de la ubicación instantánea (FR-012): QoS y sesión persistente en el lado
  de los suscriptores, ver research.md.

**Scale/Scope**: mismo orden de magnitud que 001/002 — decenas de fletes activos
simultáneos, sin requisitos de alta escala; acorde al tier "Serverless" de EMQX Cloud.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación |
|---|---|
| I. Chofer: página única, móvil-primero | PASS — no se agregan pantallas ni pasos; el cambio de transporte es interno al mismo `frontend/`, invisible para la interacción del chofer. |
| II. Ruta acotada y ordenada (máx. 10 puntos) | N/A — esta feature no toca la definición ni el límite de puntos por recorrido. |
| III. Central compatible con embebido en Oracle APEX y con acceso directo | PASS con nota — la suscripción MQTT-sobre-WebSocket de `central/` es una conexión saliente sin cookies de terceros, compatible con iframe; se documenta en research.md la verificación de CSP/`connect-src` en el entorno real de despliegue como riesgo a validar, no un bloqueo de diseño. |
| IV. Oracle como fuente única de verdad | PASS — los eventos de arribo/descarga se siguen persistiendo en Oracle exactamente igual que hoy (FR-006 de 001); solo cambia el canal por el que llegan al backend. La ubicación instantánea sigue siendo el mismo dato efímero no autoritativo ya aceptado (Clarifications de 001). |
| V. Trazabilidad de estado y ubicación en tiempo (casi) real | PASS — mejora la propagación: Central pasa a recibir ubicación/acciones por push directo del bróker, además del polling REST ya existente. |
| VI. Mensajería interna | N/A — fuera de alcance, confirmado en Assumptions de spec.md (el sentido de esta feature es únicamente flete → backend/Central). |
| VII. Simplicidad y datos mínimos necesarios | Ver Complexity Tracking — se introduce un bróker externo y un mecanismo de aprovisionamiento de credenciales, justificado porque es el objetivo explícito de la feature (evitar exponer IP propia / puertos entrantes del backend para este flujo específico), algo que la conexión HTTP directa actual no puede lograr. |
| Restricción: Framework backend (Express obligatorio) | PASS — no se introduce un framework HTTP nuevo; el cliente MQTT del backend es un módulo adicional (`src/mqtt/`) dentro del mismo proceso Express ya existente, no un servicio separado. |

No hay violaciones sin justificar; ver Complexity Tracking para el detalle de la única
adición de infraestructura (bróker MQTT + aprovisionamiento de credenciales).

**Re-check post Fase 1**: el diseño de research.md/data-model.md/contracts (ACL por
placeholder, retained solo para ubicación, suscripción de Central aditiva al polling
existente) no introduce ninguna evaluación nueva ni cambia las anteriores — la tabla
sigue vigente sin modificaciones.

## Project Structure

### Documentation (this feature)

```text
specs/003-mqtt-broker-fletes/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/                              # YA EXISTE (001/002) — se EXTIENDE
├── src/
│   ├── mqtt/
│   │   ├── client.js                   # NUEVO — conexión mqtt.js saliente (mqtts://)
│   │   │                                # hacia EMQX Cloud; reconexión automática,
│   │   │                                # sesión persistente (clean:false) para no
│   │   │                                # perder eventos QoS1 encolados (FR-011, FR-012)
│   │   ├── subscriber.js               # NUEVO — suscribe a
│   │   │                                # vickytruck/fletes/+/ubicacion (QoS0, retained)
│   │   │                                # y vickytruck/fletes/+/eventos (QoS1); resuelve
│   │   │                                # token -> recorrido (repository.obtenerPorToken,
│   │   │                                # ya existe) y llama ubicacionStore.registrar /
│   │   │                                # repository.marcarArribo / marcarDescarga
│   │   │                                # (mismas funciones que ya usa recorrido.js)
│   │   └── emqxProvisioning.js         # NUEVO — aprovisiona/revoca credenciales MQTT
│   │                                    # (usuario=token) contra la API de EMQX Cloud al
│   │                                    # generar/finalizar un recorrido (FR-008)
│   ├── db/                             # ya existe, sin cambios de esquema
│   ├── state/
│   │   └── ubicacionEnMemoria.js       # ya existe, sin cambios de contrato — ahora lo
│   │                                    # alimenta mqtt/subscriber.js en vez de recorrido.js
│   ├── routes/
│   │   ├── recorrido.js                # MODIFICADO — GET /:token deja de exponer los
│   │   │                                # endpoints POST de ubicación/arribo/descarga al
│   │   │                                # chofer (FR-001, FR-002) y en su lugar devuelve
│   │   │                                # la configuración de conexión MQTT (broker WSS,
│   │   │                                # credenciales por token) para que el frontend
│   │   │                                # publique directamente
│   │   └── central.js                  # MODIFICADO — nuevo GET /api/central/mqtt-config
│   │                                    # (credencial de servicio de solo lectura, desde
│   │                                    # variable de entorno) para que central/ conozca
│   │                                    # cómo suscribirse directamente al bróker
│   └── server.js                       # MODIFICADO — arranca mqtt/client.js al iniciar
└── tests/
    ├── unit/                           # + emqxProvisioning, mapeo de mensajes
    ├── contract/                       # + contrato de GET /:token con datos de conexión MQTT
    └── integration/                    # + flujo publish (fake broker) -> backend recibe
                                         # -> Oracle actualizado / ubicacionStore actualizado

frontend/                              # YA EXISTE (001) — se EXTIENDE
├── src/
│   ├── services/
│   │   ├── mqttClient.js               # NUEVO — conexión wss saliente con las
│   │   │                                # credenciales recibidas de GET /:token; publica
│   │   │                                # ubicación (retained) y acciones (QoS1)
│   │   ├── offlineQueue.js             # MODIFICADO — la cola de reintento ya existente
│   │   │                                # (FR-010 de 001) ahora reintenta publish MQTT en
│   │   │                                # vez de POST HTTP para arribo/descarga
│   │   └── api.js                      # MODIFICADO — GET /:token sigue siendo HTTP; dejan
│   │                                    # de usarse los POST reemplazados
│   └── components/                     # sin cambios de UI visible (Principio I)
└── tests/
    └── components/                     # + mqttClient (mock de mqtt.js), cola offline

central/                               # YA EXISTE (002) — se EXTIENDE
├── src/
│   ├── services/
│   │   ├── mqttClient.js               # NUEVO — conexión wss de solo lectura (credencial
│   │   │                                # de servicio de Central), se suscribe a
│   │   │                                # vickytruck/fletes/+/ubicacion y .../eventos;
│   │   │                                # actualiza el estado en vivo del panel además del
│   │   │                                # polling REST ya existente (polling.js, sin cambios)
│   │   └── polling.js                  # ya existe, sin cambios — sigue siendo la vía de
│   │                                    # snapshot inicial y respaldo si el bróker no está
│   │                                    # disponible
└── tests/
    └── components/                     # + mqttClient (mock de mqtt.js)
```

**Structure Decision**: Se reutilizan íntegramente los tres paquetes ya existentes
(`backend/`, `frontend/`, `central/`); no se crea un cuarto servicio. El bróker MQTT
(EMQX Cloud) es infraestructura externa gestionada, no un componente de este repositorio.
`backend/` gana un módulo `src/mqtt/` que reemplaza, para los dos flujos en alcance, la
función que hoy cumplen las rutas `POST` de `recorrido.js`; esas rutas se retiran (FR-001,
FR-002) y `GET /:token` se extiende para entregar la configuración de conexión MQTT en vez
de asumir que el frontend seguirá llamando esos POST. `frontend/` y `central/` ganan cada
uno su propio `mqttClient.js`, reutilizando la misma librería (`mqtt`) para minimizar
superficie de dependencias (Principio VII); en `central/` este cliente es aditivo al
`polling.js` ya construido en 002, no un reemplazo — si el bróker no está disponible,
Central sigue viendo datos (algo más obsoletos) vía polling, sin quedar ciega.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|----------------------------------------|
| Bróker MQTT externo (EMQX Cloud) + módulo de aprovisionamiento de credenciales por token (`emqxProvisioning.js`) | Es el objetivo explícito y principal de esta feature: evitar que el backend deba exponer una IP pública/puertos entrantes para recibir ubicación y acciones de los fletes (Input de spec.md). | Mantener el `POST` HTTP directo ya implementado en 001 no permite ese objetivo — seguiría exigiendo que el backend acepte conexiones entrantes de cada chofer para este flujo específico, que es exactamente lo que la feature busca eliminar. |
