# Implementation Plan: Normalización del formato horario

**Branch**: `006-normalizar-formato-horario` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-normalizar-formato-horario/spec.md`

## Summary

Normaliza todo horario de eventos puntuales visible al usuario (asignación
de recorrido, arribo, descarga, última ubicación conocida) a formato de 24
horas con segundos (`HH24:MM:SS`) en hora local de Argentina, y corrige el
problema de fondo que hoy genera la inconsistencia: el contrato interno de
intercambio de timestamps pasa de UTC ISO 8601 (`Z`) a ISO 8601 con offset
local fijo `-03:00` en los tres componentes JS (backend, frontend chofer,
central) y en los paquetes PL/SQL de Oracle, reemplazando el uso de
`SYSTIMESTAMP` crudo (bug de zona horaria ya documentado en el propio README
del proyecto) por una conversión explícita `AT TIME ZONE
'America/Argentina/Buenos_Aires'`. `rangoHorario` (ventana de entrega, texto
libre de Oracle) queda fuera de alcance. Los timestamps ya almacenados no se
migran; el formateo de visualización reconvierte cualquier timestamp
(histórico en `Z` o nuevo en `-03:00`) a `HH24:MM:SS` local de forma
uniforme. Enfoque técnico: dos funciones puras pequeñas
(`ahoraLocalIso`/`formatearHoraLocal`) duplicadas en cada uno de los tres
proyectos JS independientes (sin paquete compartido nuevo, research.md
Decisión 6), más cambios puntuales en 3 paquetes PL/SQL de Oracle y en
componentes de UI que hoy o bien muestran el timestamp crudo sin formatear
(`RecorridoDetalle.jsx`) o directamente no lo muestran pese a que el dato ya
llega (`DeliveryPointCard.jsx`, `MonitorView.jsx`).

## Technical Context

**Language/Version**: JavaScript ESM (Node.js 20+, React 18) + PL/SQL —
mismo stack que `backend/`, `frontend/` (chofer) y `central/` existentes; no
se agrega ningún lenguaje ni runtime nuevo.

**Primary Dependencies**: ninguna dependencia nueva. No se usa `moment`,
`dayjs`, `date-fns` ni ninguna librería de fechas — las dos funciones
necesarias (`ahoraLocalIso`, `formatearHoraLocal`) se implementan con
`Date`/`Intl.DateTimeFormat` nativos (research.md Decisiones 1-2), evitando
una dependencia nueva para un problema acotado.

**Storage**: N/A — no se agrega persistencia ni se migran datos existentes
(FR-006). Los paquetes PL/SQL de Oracle (`backend/sql/*.pkb.sql`,
`backend/sql/integracion-cloud/*.pkb.sql`) se modifican in-place; no hay
cambio de esquema (`CREATE TABLE`/`ALTER TABLE`) — las tablas Oracle viven
fuera de este repo (research.md Decisión 3).

**Testing**:
- Backend: `node --test` (unit para el módulo `util/tiempo.js`; contract e
  integration existentes actualizados para esperar el nuevo formato
  `-03:00` en vez de `Z`).
- Frontend (chofer) y Central: `vitest` + `@testing-library/react` (unit
  para `services/tiempo.js` de cada uno; componentes actualizados).
- **Sin infraestructura de test para PL/SQL en este repo** — los cambios en
  `backend/sql/**/*.pkb.sql` requieren validación manual contra un entorno
  Oracle/APEX real antes de mergear (quickstart.md, "Verificación técnica
  del contrato"), en particular `leer_estado_puntos`, ya marcada
  previamente como no probada contra el backend real.

**Target Platform**: mismos tres de siempre — chofer en navegador móvil
(Principio I), Central en navegador de escritorio embebido en APEX o acceso
directo (Principio III), backend en Fly.io. Sin cambios de plataforma.

**Project Type**: extensión de los tres componentes web existentes
(`backend/`, `frontend/` chofer, `central/`) más los paquetes PL/SQL de
Oracle ya versionados en `backend/sql/` — sin proyectos nuevos.

**Performance Goals**: sin objetivos de performance nuevos — es un cambio de
formato/representación, no de volumen ni frecuencia de datos.

**Constraints**:
- MUST no introducir un paquete npm o carpeta compartida entre `backend/`,
  `frontend/` y `central/` — son tres despliegues independientes
  (Fly.io/Wrangler) sin tooling de monorepo hoy; la función de formateo se
  duplica, no se comparte (Principio VII, research.md Decisión 6).
- MUST no migrar ningún timestamp histórico ya almacenado (FR-006) — el
  formateo de visualización MUST funcionar igual para datos viejos (`Z`) y
  nuevos (`-03:00`) sin rama condicional en la UI (research.md Decisión 2).
- MUST no tocar `rangoHorario` en ningún punto — generación, transporte ni
  visualización (FR-004, research.md Decisión 5).
- El cambio de máscara de parseo en Oracle (`leer_estado_puntos`,
  `c_mascara_iso_utc`) MUST desplegarse coordinado con el cambio del lado
  cloud que empieza a emitir `-03:00` — ver contracts/formato-horario.md,
  única dependencia de despliegue coordinado de esta feature.

**Scale/Scope**: mismo orden de magnitud que las features anteriores — hasta
10 puntos por recorrido, decenas de fletes activos simultáneos; el alcance
de archivos toca los tres proyectos JS y 3 paquetes PL/SQL, sin agregar
infraestructura ni endpoints nuevos (solo se agrega `updatedAt` a la
serialización ya existente de `GET /api/central/recorridos/activos` y
`GET /api/central/recorridos/:id`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principio I (Chofer página única móvil-primero)**: PASS — la
  visualización nueva de `arriboEn`/`descargaEn` se agrega dentro de
  `DeliveryPointCard.jsx`, ya renderizado en la única vista existente; no se
  agrega navegación ni pantalla nueva.
- **Principio II (Ruta acotada a 10 puntos, con reordenamiento limitado por
  el chofer)**: N/A — esta feature no toca el orden, el conteo ni el
  reordenamiento de puntos.
- **Principio III (Central compatible con embebido APEX y acceso
  directo)**: PASS — los cambios en `central/` son texto formateado dentro
  de componentes ya existentes (`RecorridoDetalle.jsx`, `MonitorView.jsx`),
  sin popups ni mecanismos incompatibles con iframe.
- **Principio IV (Fuentes de verdad por dominio, sincronización
  explícita)**: PASS con atención — el cambio de formato de timestamps es,
  en los hechos, un cambio del contrato de sincronización entre Oracle y el
  cloud. Se documenta explícitamente en
  `contracts/formato-horario.md` (delta sobre `integracion-api.md` y
  `mqtt-topics.md` de 003-arquitectura-cloud-mqtt), no se asume consistencia
  implícita: se señala la dependencia de despliegue coordinado
  (Oracle/APEX) como el único paso que requiere coordinación fuera de este
  repo.
- **Principio V (Trazabilidad de estado y ubicación en tiempo casi real)**:
  PASS — esta feature refuerza directamente este principio: corrige la causa
  de fondo (research.md Decisión 3) por la que la hora mostrada podía no
  reflejar el instante real, que es justamente lo que este principio exige.
- **Principio VI (Mensajería interna confiable)**: N/A — sin cambios a
  mensajería.
- **Principio VII (Simplicidad y datos mínimos necesarios)**: PASS — se
  evaluó y descartó explícitamente introducir un paquete compartido o una
  carpeta `common/` cruzando los tres proyectos (research.md Decisión 6);
  duplicar ~15 líneas de función pura en 3 archivos pequeños es la opción
  más simple dado que no existe tooling de monorepo en este repo. No se
  agregan dependencias nuevas (`Date`/`Intl.DateTimeFormat` nativos).

**Restricciones Técnicas** — "Cambios en el modelo de datos Oracle local...
requieren revisión explícita de compatibilidad y del contrato de
sincronización": aplica directamente (los 3 paquetes `.pkb.sql` modificados)
y queda cubierto por `contracts/formato-horario.md` + el paso de
verificación manual en `quickstart.md`.

Sin violaciones que requieran registro en Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/006-normalizar-formato-horario/
├── plan.md                        # This file (/speckit-plan command output)
├── research.md                    # Phase 0 output (/speckit-plan command)
├── data-model.md                  # Phase 1 output (/speckit-plan command)
├── quickstart.md                  # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── formato-horario.md         # Delta sobre integracion-api.md y mqtt-topics.md (003)
└── tasks.md                       # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/src/
├── util/
│   └── tiempo.js                  # NUEVO: ahoraLocalIso() (research.md Decisión 1),
│                                   #        formatearHoraLocal() si algún endpoint necesita
│                                   #        devolver texto ya formateado (a confirmar en tasks)
├── state/
│   └── integracionStore.js        # MODIFICADO: reemplaza new Date().toISOString() por
│                                   #             ahoraLocalIso() en updatedAt (:128,164),
│                                   #             eventos de ubicación (:241,263,284,371),
│                                   #             transicionarPunto/arribo-descarga (:492)
├── services/
│   └── mqttBridge.js              # MODIFICADO: fallback de `en` usa ahoraLocalIso() (:43)
├── routes/
│   ├── recorrido.js               # MODIFICADO: fallback de ubicación usa ahoraLocalIso() (:129)
│   └── central.js                 # MODIFICADO: listarActivos()/obtenerDetalle() agregan
│                                   #             updatedAt (hoy no serializado a Central)
└── db/
    └── ubicacionResolver.js       # MODIFICADO: resolverUbicacion ya no reformatea con
                                    #             toISOString() (:47) — conserva el wire format
                                    #             de origen tal cual (ya viene correcto)

backend/sql/
├── recorrido_api.pkb.sql               # MODIFICADO: SYSTIMESTAMP crudo → CAST(SYSTIMESTAMP
│                                        #             AT TIME ZONE 'America/Argentina/Buenos_Aires'
│                                        #             AS TIMESTAMP) para ARRIBO_EN/DESCARGA_EN (:52)
├── central_api.pkb.sql                 # MODIFICADO: ídem para ASIGNADO_EN (:38,105)
└── integracion-cloud/
    └── integracion_cloud_api.pkb.sql   # MODIFICADO: updatedAt vía AT TIME ZONE en vez de
                                         #             'UTC' (:200); c_mascara_iso_utc y
                                         #             TO_TIMESTAMP → TO_TIMESTAMP_TZ con
                                         #             máscara TZH:TZM (:74,328,332)

backend/tests/
├── unit/
│   └── tiempo.test.js                  # NUEVO: casos de ahoraLocalIso (offset fijo -03:00)
├── contract/                           # MODIFICADOS (get-recorrido, get-recorridos-activos,
│                                        # get-recorrido-detalle, post-arribo, post-descarga,
│                                        # post-ubicacion): aserciones de formato -03:00
└── integration/                        # MODIFICADOS donde usan timestamps como fixture
    └── (ubicacion-tiempo-real.test.js, monitorear-recorridos.test.js, etc.)

frontend/src/
├── services/
│   ├── tiempo.js                  # NUEVO: ahoraLocalIso()/formatearHoraLocal()
│   └── ubicacionMqtt.js           # MODIFICADO: en: ahoraLocalIso() (:51) — origen real del
│                                   #             timestamp de ubicación del chofer
└── components/
    └── DeliveryPointCard.jsx      # MODIFICADO: agrega visualización de arriboEn/descargaEn
                                    #             formateados con formatearHoraLocal (dato ya
                                    #             llega en el payload, hoy no se renderiza)

frontend/tests/
├── services/
│   └── tiempo.test.js             # NUEVO
└── components/
    └── DeliveryPointCard.test.jsx # MODIFICADO: casos de arribo/descarga visibles en HH24:MM:SS

central/src/
├── services/
│   ├── tiempo.js                  # NUEVO
│   └── mqttClient.js              # MODIFICADO: fallback en: ahoraLocalIso() (:38)
└── components/
    ├── RecorridoDetalle.jsx       # MODIFICADO: formatearHoraLocal(p.arriboEn)/(p.descargaEn)
    │                               #             en vez de mostrar el string crudo (:41-42)
    └── MonitorView.jsx            # MODIFICADO: formatearUbicacion agrega la hora del último
                                    #             reporte; nueva columna/valor para updatedAt

central/tests/
├── services/
│   └── tiempo.test.js             # NUEVO
└── components/
    ├── RecorridoDetalle.test.jsx  # NUEVO (no existe hoy ningún test de este componente)
    └── MonitorView.test.jsx       # MODIFICADO
```

**Structure Decision**: extensión de los tres componentes web ya existentes
más los paquetes PL/SQL de Oracle ya versionados en `backend/sql/` — sin
proyectos nuevos, sin endpoints nuevos (solo se agrega un campo a dos
respuestas ya existentes de Central). El único tipo de archivo nuevo
repetido es el módulo de utilidad `tiempo.js`, duplicado deliberadamente 3
veces (research.md Decisión 6) en vez de compartido, y su test
correspondiente en cada proyecto.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

Sin violaciones — tabla vacía. La duplicación de `tiempo.js` en 3 proyectos
podría parecer, a primera vista, una violación de "no repetir código", pero
no es una violación de ningún principio de la constitución: Principio VII
pide simplicidad y evitar infraestructura nueva, no evitar duplicación de
~15 líneas entre despliegues independientes — ver research.md Decisión 6
para el análisis completo de alternativas descartadas (paquete compartido,
carpeta `common/`).

## Constitution Check — re-chequeo post Fase 1

Tras `data-model.md` y `contracts/formato-horario.md`: sin cambios respecto
al chequeo inicial. El único punto que ameritaba atención (Principio IV,
cambio del contrato de sincronización Oracle↔cloud) quedó documentado con un
contrato explícito (`contracts/formato-horario.md`) que señala la
dependencia de despliegue coordinado con Oracle/APEX, en vez de asumir
consistencia implícita. PASS en las 5 dimensiones aplicables (I, III, IV,
V, VII), 2 N/A (Principios II, VI sin impacto).
