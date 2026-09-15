# Feature Specification: Reporte de ubicación directo al backend (broker opcional)

**Feature Branch**: `013-mqtt-a-backend-directo`

**Created**: 2026-09-15

**Status**: Draft

**Input**: User description: "migrar reporte de ubicacion de mqtt a directo al backend. luego de comprobar funcionamiento real no se aprecia beneficio utilizar el broker de intermediario. sin eliminar la funcionalidad hacer que pueda ser opcional, dejando como preferencia que los reportes de ubicacion se realicen directamente contra el backend"

## Clarifications

### Session 2026-09-15

- Q: ¿Qué nivel de diagnóstico/observabilidad necesita el canal de reporte
  directo (REST), comparado con el que ya existe para el broker (contadores
  de mensajes recibidos/procesados/descartados)? → A: Reusar la última
  ubicación conocida y su timestamp por chofer (ya expuesta hoy a Central)
  como evidencia de actividad del canal directo, sin agregar contadores
  dedicados nuevos.
- Q: SC-001 dice que Central debe ver la posición "con la misma latencia"
  en modo directo. ¿Cómo se mide eso de forma concreta? → A: Contra el
  intervalo periódico ya configurado en el sistema (el mismo que hoy
  dispara cada reporte), sin definir un umbral de segundos nuevo y
  separado.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Central sigue viendo al chofer sin depender del broker externo (Priority: P1)

Un operador de Central mira el mapa en vivo. El chofer reporta su posición
periódicamente mientras viaja. Hoy ese reporte pasa primero por un servicio
externo de mensajería (broker) antes de llegar a Central. Luego de operar el
sistema en producción, no se observó ningún beneficio real en mantener ese
intermediario para el caso de uso actual: agrega una dependencia externa,
credenciales propias y una capa de infraestructura adicional sin mejorar lo
que el operador efectivamente ve. El operador necesita que el mapa en vivo
siga funcionando igual (o mejor) cuando el reporte de posición vaya directo
al backend, sin pasar por ese intermediario.

**Why this priority**: Es el objetivo central de la migración — si el
reporte directo no logra mantener a Central actualizada con la misma
confiabilidad que tenía con el broker, la migración no aporta valor y
además podría degradar una funcionalidad que ya funciona en producción.

**Independent Test**: Con el sistema configurado en su modo por defecto
(reporte directo), hacer que un chofer reporte su posición y confirmar que
Central refleja esa posición sin que el reporte haya pasado por el broker
externo en ningún momento.

**Acceptance Scenarios**:

1. **Given** el sistema configurado en el modo por defecto (reporte directo
   al backend), **When** el chofer reporta su posición durante el viaje,
   **Then** Central recibe y muestra esa posición sin que el broker externo
   intervenga en ningún punto del camino.
2. **Given** el mismo escenario, **When** se compara con el comportamiento
   previo a esta migración, **Then** la frescura y confiabilidad con la que
   Central ve la posición del chofer no empeora.

---

### User Story 2 - Volver a usar el broker sigue siendo posible sin tocar la app del chofer (Priority: P2)

El equipo decide, por la razón que sea (prueba puntual, incidente,
comparación), volver a usar el broker externo como método de reporte de
ubicación en vez del reporte directo. Necesita poder hacerlo mediante un
cambio de configuración del sistema, sin reescribir ni redistribuir la
aplicación del chofer, y sin que la funcionalidad del broker haya sido
eliminada del sistema.

**Why this priority**: No es el modo de operación esperado del día a día
(por eso P2, no P1), pero es una condición explícita del pedido: no
eliminar la funcionalidad existente, solo dejar de depender de ella por
defecto. Sin esto, la migración sería irreversible en la práctica.

**Independent Test**: Cambiar la configuración del sistema para preferir el
broker en lugar del reporte directo, sin modificar la aplicación del
chofer, y confirmar que el reporte de posición vuelve a llegar a Central
usando el broker.

**Acceptance Scenarios**:

1. **Given** el sistema corriendo con el broker configurado y disponible,
   **When** se cambia la configuración para preferir el broker en lugar del
   reporte directo, **Then** los reportes de ubicación vuelven a viajar por
   el broker sin necesidad de cambios en la app del chofer.
2. **Given** el sistema en modo broker, **When** un operador consulta el
   estado del canal de mensajería (funcionalidad ya existente), **Then** ve
   reflejada la actividad real de ese canal, igual que antes de esta
   migración.

---

### User Story 3 - Queda claro qué modo de reporte está activo y si tiene actividad reciente (Priority: P3)

Alguien del equipo necesita confirmar, sin ambigüedad, si el sistema está
operando en modo directo o en modo broker en un momento dado — por ejemplo
para verificar que una migración o un cambio de configuración realmente
tomó efecto, o para descartar el broker como causa de un problema cuando en
realidad está inactivo a propósito. En modo directo, además necesita poder
confirmar que el canal tiene actividad reciente sin depender de contadores
nuevos: le alcanza con ver, para un chofer dado, que su última ubicación
conocida en Central tiene un timestamp reciente y coherente con el
intervalo de reporte esperado.

**Why this priority**: Es una mejora de diagnóstico que facilita confirmar
las Historias 1 y 2, pero ninguna de las dos depende de esto para funcionar
— por eso prioridad más baja, P3.

**Independent Test**: Consultar el estado del canal de mensajería estando
el sistema en modo directo (broker no utilizado por preferencia) y
confirmar que la respuesta indica claramente que el broker está inactivo
por configuración, no caído por falla; por separado, confirmar que la
última ubicación conocida de un chofer activo en Central tiene un
timestamp reciente, sin necesidad de ninguna métrica adicional del canal
directo.

**Acceptance Scenarios**:

1. **Given** el sistema en modo directo por defecto, **When** se consulta
   el estado del canal de mensajería, **Then** la respuesta distingue
   claramente "inactivo por preferencia de configuración" de "debería estar
   activo pero no responde".
2. **Given** el sistema en modo directo y un chofer reportando posición con
   normalidad, **When** alguien del equipo revisa la última ubicación
   conocida de ese chofer en Central, **Then** ve un timestamp reciente
   (coherente con el intervalo de reporte configurado) como evidencia
   suficiente de que el canal directo está activo, sin necesitar contadores
   agregados dedicados a ese canal.

---

### Edge Cases

- ¿Qué pasa si el backend no está disponible en el momento de un reporte
  directo (sin conectividad, caída puntual)? Igual que el comportamiento ya
  existente para este tipo de dato: el reporte de esa posición puntual se
  omite y se reintenta en el próximo ciclo periódico; no se reintenta fuera
  de ese ciclo ni se guarda para reenvío posterior, porque es información
  efímera de posición, no una acción del viaje.
- ¿Qué pasa si el sistema está configurado en modo directo pero el broker
  sigue técnicamente accesible? No se usa igual — el modo activo lo decide
  la configuración, no la disponibilidad de uno u otro canal. No hay
  intento automático de usar el broker como respaldo del reporte directo
  (ni viceversa): es un modo elegido, no una cadena de conmutación por
  falla.
- ¿Qué pasa con choferes que en un momento dado tengan la app configurada
  para el modo anterior (broker) mientras el resto del sistema ya migró?
  Deben poder seguir reportando sin errores mientras el broker siga
  disponible como funcionalidad — la migración no elimina esa capacidad.
- ¿Qué pasa si se cambia el modo de preferencia mientras hay choferes con
  viajes en curso? El nuevo modo aplica a los próximos reportes de
  ubicación; no se exige interrumpir ni reiniciar viajes en curso para que
  el cambio de configuración tenga efecto.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir que la aplicación del chofer reporte
  su posición directamente al backend, sin depender de un servicio externo
  de mensajería (broker) como intermediario obligatorio.
- **FR-002**: El sistema DEBE usar el reporte directo al backend como modo
  de operación por defecto para la posición en vivo del chofer.
- **FR-003**: Cuando el reporte de posición se realiza directo al backend,
  Central DEBE ver reflejada esa posición con la misma confiabilidad y
  frescura con las que la veía cuando el reporte pasaba por el broker (sin
  regresión de visibilidad por dejar de usar el broker como canal
  principal).
- **FR-004**: El sistema DEBE conservar, sin eliminar, la capacidad de
  reportar la posición del chofer a través del broker externo existente,
  totalmente funcional, para su uso cuando así se prefiera.
- **FR-005**: La elección entre reporte directo y reporte vía broker DEBE
  definirse mediante una configuración del sistema, no requerir distribuir
  una versión distinta de la aplicación del chofer para cada modo.
- **FR-006**: El sistema NO DEBE requerir que el broker externo esté
  configurado, disponible o accesible para que el reporte de posición
  funcione cuando el modo directo es el preferido.
- **FR-007**: El sistema NO DEBE alternar automáticamente entre reporte
  directo y broker en base a fallas puntuales de uno u otro canal — el modo
  activo en un momento dado lo determina únicamente la configuración
  vigente, no un mecanismo de conmutación por falla.
- **FR-008**: Cuando el reporte directo no puede completarse por falta de
  conectividad u otra falla puntual, el sistema DEBE tratarlo igual que hoy
  trata un fallo de reporte de ubicación: se omite ese reporte puntual y se
  reintenta en el siguiente ciclo periódico, sin encolarlo para reenvío
  posterior.
- **FR-009**: La funcionalidad existente para consultar el estado/salud del
  canal de broker DEBE seguir funcionando, y DEBE indicar explícitamente
  cuando el broker está inactivo por preferencia de configuración (modo
  directo activo), diferenciándolo de una falla real del canal.
- **FR-010**: El canal de reporte directo NO requiere contadores agregados
  dedicados (mensajes recibidos/procesados/descartados) como los que ya
  existen para el broker; la evidencia de que está funcionando es la última
  ubicación conocida por chofer y su timestamp, ya expuesta a Central hoy.
- **FR-011**: El reporte de acciones del viaje (marcar llegada, marcar
  descarga, inicio/cierre de recorrido — ya existente y siempre directo al
  backend) NO debe verse afectado por esta migración.
- **FR-012**: Un chofer que reporta su posición vía broker (mientras ese
  modo esté configurado o durante una transición) DEBE poder seguir
  haciéndolo sin errores, usando la misma identidad/credencial de chofer
  que ya usa para el resto de sus acciones.

### Key Entities

- **Reporte de ubicación**: evento puntual con la posición del chofer en un
  momento dado; hoy viaja por uno de dos canales posibles (broker externo o
  directo al backend) según cuál esté configurado como preferido.
- **Modo de reporte de ubicación**: configuración del sistema que determina
  si los reportes de posición usan el canal directo (por defecto) o el
  broker externo (opcional, retenido para cuando se prefiera).
- **Estado del canal de broker**: resumen de salud/actividad del canal de
  mensajería externo (funcionalidad ya existente), que debe seguir
  reflejando correctamente si el broker está inactivo por preferencia o
  caído por falla. El canal directo no tiene un resumen agregado
  equivalente: su evidencia de actividad es la última ubicación conocida
  por chofer y su timestamp (ver FR-010).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el modo por defecto (directo), la posición de un chofer
  activo se refleja en Central dentro del mismo intervalo periódico de
  reporte ya configurado en el sistema (el que hoy dispara cada ciclo de
  reporte), con la misma tasa de éxito que tenía antes de esta migración —
  ningún reporte de posición se pierde por haber dejado de pasar por el
  broker.
- **SC-002**: El equipo puede volver a operar con el broker como canal de
  reporte de ubicación cambiando solo la configuración del sistema, sin
  publicar una nueva versión de la app del chofer, y confirmar en minutos
  que el cambio tomó efecto.
- **SC-003**: Una prueba controlada confirma de punta a punta que el
  reporte vía broker sigue funcionando igual que antes de la migración,
  aun cuando no sea el modo usado por defecto.
- **SC-004**: En el modo por defecto, ningún reporte de posición del chofer
  requiere que exista una conexión activa al broker externo ni una
  credencial de broker aprovisionada para funcionar.

## Assumptions

- La preferencia entre reporte directo y broker es una configuración a
  nivel de sistema/entorno (decidida por quien opera el despliegue), no un
  interruptor visible u operable por el chofer ni por Central dentro de la
  aplicación.
- "Opcional" significa que el broker deja de ser necesario para la
  operación normal y pasa a ser un modo alternativo activable por
  configuración — no un mecanismo de respaldo automático que se dispare
  solo cuando el reporte directo falla en el momento.
- El reporte de posición sigue siendo información efímera y de mejor
  esfuerzo (no crítica, no auditable) en ambos modos — esta migración no
  cambia esa naturaleza, solo el canal por el que viaja por defecto.
- La infraestructura y credenciales del broker externo permanecen
  disponibles en el entorno (no se desmantelan como parte de esta
  migración), ya que la funcionalidad debe seguir siendo usable cuando se
  prefiera.
