# Feature Specification: Cierre de recorrido desde Oracle, ubicación por chofer y broker apagado

**Feature Branch**: `015-cierre-desde-oracle`

**Created**: 2026-10-09

**Status**: Implementado (documentado retroactivamente — ver Notas de proceso)

**Input**: User description: "Documentar retroactivamente (feature ya implementada y probada en producción el 2026-10-09) el cierre forzado de recorridos desde Oracle/APEX: cuando el chofer no toca FINALIZAR, Oracle llama a INTEGRACION_CLOUD_API.finalizar_recorrido, que hace POST /api/integracion/recorridos/:id/finalizar (API key de integración). Central sigue siendo de solo lectura. El cierre no exige puntos completados, queda sin GPS y con cierreOrigen="oracle" (vs "chofer"), es idempotente, bloquea acciones del chofer (409) y un re-push de sincronizar_recorrido no lo reactiva. Incluye la corrección de ruteo de ubicación por chofer (actualizar todos los recorridos activos del chofer en vez de un índice obsoleto que apuntaba a un recorrido finalizado) y el apagado del broker MQTT en modo directo (sin aprovisionamiento EMQX ni suscripción de Central)."

## Notas de proceso

Esta feature surgió de un incidente en producción (2026-10-09) y se
resolvió directamente en conversación, en tres pasos encadenados, sin pasar
primero por `/speckit-clarify`/`/speckit-plan`/`/speckit-tasks`:

1. **Incidente**: un chofer reportaba ubicación pero su ícono no aparecía en
   el mapa de Central. Causa: tenía dos recorridos activos a la vez (uno con
   todas las entregas hechas pero sin FINALIZAR, y uno nuevo); al finalizar
   el nuevo, sus reportes de ubicación seguían yendo a ese recorrido ya
   cerrado, fuera del mapa.
2. **Decisión sobre el cierre**: se evaluó permitir que Central finalice el
   recorrido, pero se descartó para mantener Central de solo lectura (sin
   autenticación propia para acciones que modifiquen datos). El cierre
   forzado quedó del lado de Oracle/APEX, que ya es la autoridad de los
   recorridos y ya tiene un canal de integración autenticado.
3. **Broker MQTT**: el análisis del incidente confirmó que, con el reporte
   directo al backend como canal por defecto (feature 013), el broker no
   recibía ninguna ubicación pero seguía activo en otras piezas
   (aprovisionamiento de credenciales en cada sincronización, conexión
   desde Central con una credencial embebida en la página pública). Se
   apagó por configuración, sin borrar código.

Este documento las deja registradas retroactivamente. El detalle de las
tareas está en `tasks.md`; no hay `plan.md`/`research.md` separados.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - La ubicación del chofer siempre llega a su recorrido en curso (Priority: P1)

Como operador de Central, quiero ver en el mapa la ubicación de cada chofer
con un recorrido en curso, aunque ese chofer tenga (o haya tenido el mismo
día) otro recorrido abierto o recién cerrado, para no perder de vista a un
chofer por un problema interno del sistema.

**Why this priority**: es el incidente que originó la feature — la
visibilidad de la ubicación en vivo es el valor central del sistema
(Principio V) y se estaba perdiendo en silencio.

**Independent Test**: con un chofer que tiene dos recorridos en curso, se
cierra uno de ellos; luego el chofer reporta su ubicación y se verifica que
aparece en el mapa sobre el recorrido que sigue en curso.

**Acceptance Scenarios**:

1. **Given** un chofer con dos recorridos en curso, **When** el más nuevo se
   cierra y el chofer reporta su ubicación, **Then** Central muestra esa
   ubicación sobre el recorrido que sigue en curso.
2. **Given** un chofer con dos recorridos en curso, **When** reporta su
   ubicación, **Then** ambos recorridos muestran esa misma ubicación.
3. **Given** dos choferes distintos con un recorrido cada uno, **When** uno
   reporta su ubicación, **Then** solo cambia la ubicación de su propio
   recorrido.

---

### User Story 2 - Oracle cierra un recorrido que el chofer dejó abierto (Priority: P1)

Como operador de Oracle/APEX, quiero poder dar por finalizado un recorrido
cuando el chofer no tocó FINALIZAR en la app, para que deje de figurar como
activo en Central y no interfiera con los recorridos siguientes del mismo
chofer.

**Why this priority**: sin esta vía, un recorrido olvidado queda activo
indefinidamente (hasta el próximo reinicio del backend), ensucia el
monitoreo y fue el origen del incidente de la Historia 1.

**Independent Test**: desde Oracle, cerrar un recorrido activo con entregas
pendientes; verificar que sale de los activos de Central, aparece en el
historial marcado como cerrado por Oracle, y que Oracle registra la hora de
cierre.

**Acceptance Scenarios**:

1. **Given** un recorrido en curso (con o sin entregas pendientes), **When**
   Oracle lo finaliza, **Then** deja de aparecer en Monitoreo y pasa al
   Historial con origen de cierre "oracle", hora de cierre y sin ubicación
   de cierre.
2. **Given** un recorrido ya finalizado (por el chofer o por Oracle),
   **When** Oracle vuelve a pedir su cierre, **Then** la operación responde
   bien y el cierre original (hora y origen) no cambia.
3. **Given** un recorrido finalizado por Oracle, **When** el chofer intenta
   iniciar, reordenar, marcar llegada/arribo/descarga o cancelar, **Then**
   el sistema rechaza la acción y el recorrido no cambia.
4. **Given** un recorrido finalizado por Oracle, **When** Oracle lo vuelve a
   sincronizar, **Then** sigue finalizado (no se reactiva).
5. **Given** un recorrido que el sistema cloud no conoce, **When** Oracle
   pide su cierre, **Then** Oracle recibe un resultado "no encontrado".
6. **Given** un cierre exitoso desde Oracle, **When** termina la operación,
   **Then** Oracle ya tiene la hora de cierre guardada en su tabla de
   viajes, sin un paso manual adicional.

---

### User Story 3 - Sin dependencia activa del broker externo (Priority: P2)

Como responsable del sistema, quiero que, mientras el reporte de ubicación
vaya directo al backend, ninguna pieza use el broker de mensajería externo,
para no mantener credenciales ni llamadas a un servicio que no aporta nada.

**Why this priority**: no afecta lo que ve el operador (el polling ya cubre
la ubicación en vivo), pero reduce dependencias externas y retira una
credencial que estaba expuesta en la página pública de Central.

**Independent Test**: con el sistema en modo directo, sincronizar un
recorrido desde Oracle y abrir Central; verificar que no se crea ninguna
credencial en el broker y que Central no intenta conectarse a él.

**Acceptance Scenarios**:

1. **Given** el modo de reporte directo (default), **When** Oracle
   sincroniza un recorrido con chofer asignado, **Then** no se crea ni
   actualiza ninguna credencial en el broker.
2. **Given** el modo broker activado explícitamente, **When** Oracle
   sincroniza un recorrido con chofer asignado, **Then** la credencial del
   chofer se aprovisiona como antes.
3. **Given** Central publicado en modo directo, **When** un operador la
   abre, **Then** no hay conexión al broker ni indicador de canal MQTT, y
   la ubicación se refresca por polling cada 5 segundos.

---

### Edge Cases

- **Chofer con dos recorridos en curso a la vez**: la ubicación se refleja
  en ambos (misma posición real del chofer); no se intenta adivinar cuál es
  "el bueno".
- **Cierre desde Oracle con entregas pendientes**: se permite; las entregas
  quedan en el estado en que estaban y Oracle las recibe así.
- **Acciones del chofer encoladas sin conexión** que llegan después del
  cierre: el sistema las rechaza y la app las descarta, sin reintentar.
- **Backend reiniciado antes del cierre** (store en memoria vacío): el
  cierre responde "no encontrado"; para cerrarlo en el cloud hay que volver
  a sincronizarlo primero.
- **App del chofer abierta al momento del cierre**: al refrescar ve el
  recorrido como finalizado. El texto actual dice que todas las entregas se
  completaron aunque Oracle haya cerrado con pendientes (limitación
  conocida, ver Assumptions).
- **Reactivar el broker**: es solo configuración; requiere una credencial
  nueva para Central (la anterior se retiró).

## Requirements *(mandatory)*

### Functional Requirements

**Ubicación por chofer (Historia 1)**

- **FR-001**: Cada reporte de ubicación de un chofer DEBE reflejarse en
  todos sus recorridos en curso al momento del reporte, y en ningún
  recorrido finalizado.
- **FR-002**: El sistema NO DEBE depender de qué recorrido del chofer se
  sincronizó último para decidir dónde mostrar su ubicación.

**Cierre desde Oracle (Historia 2)**

- **FR-003**: Oracle/APEX DEBE poder finalizar un recorrido en el cloud
  mediante el canal de integración autenticado existente.
- **FR-004**: Central DEBE seguir siendo de solo lectura: no ofrece ninguna
  acción de cierre.
- **FR-005**: El cierre desde Oracle NO DEBE exigir entregas completadas.
- **FR-006**: El recorrido cerrado DEBE registrar hora de cierre, origen del
  cierre ("oracle") y ninguna ubicación de cierre; el cierre del chofer
  DEBE registrar origen "chofer".
- **FR-007**: El origen del cierre DEBE estar visible para Oracle (consulta
  de estado) y en el Historial/Detalle de Central.
- **FR-008**: El cierre DEBE ser idempotente: repetirlo no cambia la hora ni
  el origen del cierre original.
- **FR-009**: Un recorrido finalizado DEBE rechazar toda acción del chofer
  que modifique su progreso u orden.
- **FR-010**: Una nueva sincronización desde Oracle NO DEBE reactivar un
  recorrido finalizado.
- **FR-011**: Un pedido de cierre de un recorrido desconocido DEBE
  responder "no encontrado".
- **FR-012**: Tras un cierre exitoso, Oracle DEBE quedar con la hora de
  cierre persistida en su tabla de viajes en la misma operación.

**Broker apagado en modo directo (Historia 3)**

- **FR-013**: En modo directo, la sincronización de recorridos NO DEBE
  aprovisionar credenciales en el broker externo; en modo broker DEBE
  seguir haciéndolo.
- **FR-014**: La versión publicada de Central NO DEBE incluir credenciales
  del broker ni conectarse a él mientras el sistema opere en modo directo.
- **FR-015**: Volver al modo broker DEBE ser posible solo con cambios de
  configuración, sin cambios de código.

### Key Entities

- **Recorrido**: agrega el atributo **origen de cierre** (`chofer` |
  `oracle` | vacío si sigue abierto), junto a la hora y la ubicación de
  cierre ya existentes.
- **Viaje en Oracle (tabla de viajes)**: recibe la hora de cierre (y, si el
  cierre fue del chofer, su ubicación) al leer el estado desde el cloud.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los choferes con al menos un recorrido en curso
  que reportan ubicación aparecen en el mapa de Central dentro del ciclo de
  refresco siguiente (≤ 5 segundos), incluido el caso de dos recorridos
  abiertos del mismo chofer.
- **SC-002**: Un operador de Oracle puede cerrar un recorrido olvidado en
  una sola operación, y el recorrido deja de verse en Monitoreo en el
  siguiente refresco de Central.
- **SC-003**: Repetir el cierre de un mismo recorrido no altera su hora de
  cierre (0 cambios tras N repeticiones).
- **SC-004**: En modo directo, se realizan 0 llamadas al servicio de
  administración del broker por cada sincronización de recorridos.
- **SC-005**: La página publicada de Central contiene 0 credenciales del
  broker.

## Assumptions

- Oracle/APEX es la autoridad para decidir el cierre de un recorrido
  (Principio IV); el sistema cloud no valida si el cierre es "correcto"
  desde el punto de vista del negocio.
- El estado propio del recorrido dentro de Oracle (si APEX lleva su propio
  "finalizado") lo actualiza el proceso de APEX que invoca el cierre; esta
  feature solo garantiza la hora de cierre en la tabla de viajes.
- La limitación del mensaje de la app del chofer ("todas las entregas
  fueron completadas") ante un cierre con pendientes queda fuera de
  alcance; puede resolverse aparte usando el origen del cierre.
- Borrar la credencial retirada en el broker y deshabilitar la conexión del
  backend al broker son pasos de operación/configuración, fuera del
  repositorio.
- El modo de reporte de ubicación sigue siendo uno solo para todos los
  choferes (no configurable por chofer).
