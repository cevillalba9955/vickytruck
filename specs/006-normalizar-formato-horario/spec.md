# Feature Specification: Normalización del formato horario

**Feature Branch**: `006-normalizar-formato-horario`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "normalizar formato horario , debe utilizarse formato HH24:MM:SS con zona horaria local."

## Clarifications

### Session 2026-08-11

- Q: FR-005 y FR-007 exigen corregir la zona horaria en origen y mostrar horarios consistentes entre app chofer, Central y backend. ¿Esto implica cambiar el formato del contrato de datos interno (API/MQTT/Oracle), o mantenerlo en UTC y convertir solo en pantalla? → A: El contrato interno también pasa a expresarse en hora local con offset (ej. `-03:00`) en todos los sistemas (app chofer, Central, backend, Oracle, eventos MQTT), reemplazando el uso de UTC como formato de intercambio interno.
- Q: Para registros históricos de Oracle afectados por el bug de zona horaria conocido (`SYSTIMESTAMP` sin zona declarada), el instante tal como quedó guardado puede estar corrido respecto de lo que realmente ocurrió. ¿Esta feature debe corregir/migrar esos instantes históricos, o solo garantizar que los registros nuevos sean correctos? → A: No se corrigen instantes históricos ya almacenados; solo se garantiza que los registros nuevos (desde que se aplique esta corrección) sean exactos. Los históricos se muestran con el nuevo formato pero pueden conservar el desfasaje ya conocido.
- Q: Si la ventana horaria de entrega (`rangoHorario`) llega en un formato no interpretable, ¿qué debe ver el chofer en lugar del rango? → A (corregido): `rangoHorario` es un campo de texto libre (string) provisto tal cual por Oracle; el chofer lo ve textualmente, sin que el sistema lo reinterprete, valide ni reformatee. Queda fuera del alcance de la normalización HH24:MM:SS.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El chofer ve la hora real de cada evento de su recorrido (Priority: P1)

Un chofer abre la app y consulta la hora de arribo y descarga registrada en cada punto de entrega. Necesita que esa hora coincida con la hora real de su reloj/celular (hora de Argentina), sin ambigüedad de AM/PM ni desfasajes por zona horaria, y con un formato consistente en toda la pantalla.

**Why this priority**: Es la fuente de la confusión operativa actual: los horarios se generan y almacenan con criterios distintos (UTC en JS, hora local sin declarar en Oracle), por lo que lo que el chofer ve puede no coincidir con la hora real, afectando la confianza en la app durante la operación diaria.

**Independent Test**: Puede probarse abriendo la app del chofer, comparando cada horario mostrado (arribo, descarga) contra la hora real de un reloj de referencia en Argentina, y verificando que todos usan el mismo formato de 24 horas.

**Acceptance Scenarios**:

1. **Given** un punto de entrega con hora de arribo registrada, **When** el chofer visualiza el detalle del punto, **Then** la hora se muestra en formato de 24 horas con horas, minutos y segundos con dos dígitos cada uno (ej. "14:05:09"), reflejando la hora local de Argentina.
2. **Given** un evento registrado cerca de la medianoche, **When** el chofer visualiza la hora del evento, **Then** la hora se muestra como "00:00:00"–"23:59:59" (nunca "24:00:00" ni notación de 12 horas con AM/PM).
3. **Given** la ventana horaria de entrega de un cliente (`rangoHorario`, texto libre provisto por Oracle), **When** el chofer la visualiza, **Then** se muestra el texto tal como fue recibido, sin que el sistema lo reformatee, valide ni reinterprete.

---

### User Story 2 - El operador de Central audita horarios consistentes entre viajes (Priority: P1)

Un operador de Central revisa el panel de seguimiento y necesita comparar horarios de distintos viajes y choferes (asignación, arribo, descarga, última actualización de ubicación) para detectar demoras o anomalías. Si cada pantalla o reporte muestra el horario con un criterio distinto, la comparación se vuelve poco confiable.

**Why this priority**: Central toma decisiones operativas (reasignar, escalar demoras) en base a estos horarios; una lectura incorrecta o inconsistente puede llevar a decisiones erróneas.

**Independent Test**: Puede probarse abriendo el panel de Central para varios viajes en simultáneo y verificando que todos los horarios (asignación, arribo, descarga, última actualización) se muestran con el mismo formato y corresponden a la hora real local en la que ocurrió cada evento.

**Acceptance Scenarios**:

1. **Given** varios recorridos con eventos ocurridos en distintos momentos del día, **When** el operador los visualiza en el panel de Central, **Then** todos los horarios se muestran en formato de 24 horas con segundos y hora local, sin mezclar estilos.
2. **Given** un evento cuyo instante fue registrado originalmente en UTC (por ejemplo, desde el backend o MQTT), **When** se muestra en el panel de Central, **Then** el horario visible corresponde a la conversión correcta a hora local de Argentina, no a la hora UTC sin convertir.

---

### User Story 3 - Los horarios históricos ya registrados se muestran correctamente tras la normalización (Priority: P2)

Un operador o chofer consulta el historial de un viaje ya finalizado (arribo, descarga, cierre) registrado antes de aplicar esta normalización. Necesita que esos horarios también se muestren con el nuevo formato y la hora local correcta, sin que el cambio altere el instante real que fue registrado.

**Why this priority**: Sin esto, la normalización solo cubriría datos nuevos y dejaría inconsistencias visibles en el historial, que es justamente donde hoy existen los desfasajes conocidos (columnas Oracle sin zona horaria declarada).

**Independent Test**: Puede probarse consultando viajes cerrados previos a la implementación y verificando que sus horarios se muestran en el nuevo formato y siguen representando el mismo instante real que cuando se registraron.

**Acceptance Scenarios**:

1. **Given** un punto de entrega con arribo registrado antes del cambio, **When** se consulta su detalle luego de aplicada la normalización, **Then** la hora se muestra en formato HH24:MM:SS en hora local, representando el mismo instante real originalmente registrado.

---

### Edge Cases

- ¿Qué sucede si el reloj del servidor Oracle no está configurado en la zona horaria esperada? El horario mostrado al usuario debe seguir reflejando la hora local real (Argentina), no la hora cruda del servidor sin convertir.
- ¿Qué sucede con la ventana horaria de entrega (`rangoHorario`)? Es un campo de texto libre provisto por Oracle, fuera del alcance de esta normalización: se muestra tal cual llega, sin que el sistema lo valide, reformatee ni reinterprete.
- ¿Qué sucede con eventos registrados exactamente a medianoche o mediodía? Deben mostrarse como "00:00:00" y "12:00:00" respectivamente, sin notación de 12 horas.
- ¿Qué sucede si dos sistemas (app chofer y Central) muestran el mismo evento? Ambos deben mostrar exactamente el mismo horario, en el mismo formato.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE mostrar todo horario de eventos puntuales visibles al usuario (asignación de recorrido, arribo a punto de entrega, descarga, última actualización de ubicación) en formato de 24 horas con horas, minutos y segundos de dos dígitos cada uno (HH24:MM:SS), por ejemplo "08:05:09", nunca en formato de 12 horas con AM/PM.
- **FR-002**: El sistema DEBE mostrar todo horario al usuario convertido a la zona horaria local de operación (Argentina, UTC-3), independientemente de en qué zona horaria haya sido originalmente registrado o transmitido internamente el instante correspondiente.
- **FR-003**: El sistema DEBE aplicar el mismo formato de hora de 24 horas y ceros a la izquierda de forma consistente en todas las pantallas donde se muestre un horario (app chofer y panel de Central), de modo que el mismo evento se lea igual en ambos lugares.
- **FR-004**: La ventana horaria de entrega de un cliente (`rangoHorario`) es un campo de texto libre (string) provisto tal cual por Oracle; el sistema DEBE mostrarlo textualmente, sin validarlo, reformatearlo ni reinterpretarlo. Queda fuera del alcance del formato HH24:MM:SS que aplica a los demás horarios de la app (FR-001 a FR-003).
- **FR-005**: El sistema DEBE confirmar y corregir, si corresponde, la zona horaria real utilizada al registrar horarios en el origen de datos (servidor de base de datos), de forma que la hora local mostrada al usuario sea exacta y no arrastre un desfasaje no detectado.
- **FR-006**: Al aplicar el nuevo formato de visualización, el sistema DEBE preservar el instante tal como fue originalmente registrado de cada horario histórico ya existente; la normalización solo cambia cómo se calcula y se muestra la hora, no el instante almacenado. Esto aplica incluso a registros potencialmente afectados por el bug de zona horaria conocido en Oracle: esos instantes históricos NO se corrigen ni migran como parte de esta feature, solo se garantiza exactitud para los registros nuevos generados después de aplicada la corrección de origen (FR-005).
- **FR-007**: El sistema DEBE intercambiar los horarios entre la app del chofer, el panel de Central, el backend y Oracle (incluyendo los eventos de ubicación transmitidos en tiempo real) expresados en hora local de Argentina con su offset explícito (ej. `-03:00`), reemplazando el uso de UTC como formato de intercambio interno, de modo que todas las partes compartan e interpreten el mismo instante sin ambigüedad y sin depender de una conversión adicional en cada capa.

### Key Entities *(include if feature involves data)*

- **Evento de horario de Recorrido**: instantes de asignación y última actualización de un recorrido/viaje.
- **Evento de horario de Punto de Entrega**: instantes de arribo y descarga en cada parada del recorrido, y ventana horaria (rango) de entrega esperada por el cliente.
- **Evento de ubicación (GPS/seguimiento en vivo)**: instante en que se registró cada posición del chofer durante el recorrido.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los horarios de eventos puntuales (asignación, arribo, descarga, última actualización de ubicación) visibles para choferes y operadores de Central se presentan en formato de 24 horas con segundos (HH24:MM:SS), sin ninguna pantalla remanente en formato de 12 horas o sin segundos. (No incluye `rangoHorario`, que es texto libre fuera de alcance.)
- **SC-002**: La hora mostrada en la app coincide con la hora real del huso horario local (Argentina) con exactitud al segundo, verificado comparando eventos conocidos contra un reloj de referencia.
- **SC-003**: Un mismo evento (por ejemplo, un arribo) se muestra con el horario idéntico tanto en la app del chofer como en el panel de Central, en el 100% de los casos verificados.
- **SC-004**: Los horarios de viajes históricos, registrados antes del cambio, se visualizan correctamente en el nuevo formato sin alterar el instante tal como fue registrado (no se corrigen retroactivamente los posibles desfasajes ya conocidos en datos históricos), verificado sobre una muestra de viajes cerrados previos.
- **SC-005**: Cero reportes operativos de confusión o desfasaje horario (por ejemplo, horarios que parecen adelantados o atrasados varias horas) durante el primer mes posterior al despliegue.

## Assumptions

- La zona horaria local de operación es Argentina (UTC-3, sin horario de verano), ya que la operación descripta en el proyecto (choferes, Central, Oracle) es local a Argentina.
- El formato HH24:MM:SS solicitado aplica a la porción de hora de los horarios mostrados al usuario; el formato de la fecha (día/mes/año) que acompaña a cada horario no forma parte del alcance de esta normalización y sigue la convención ya existente en cada pantalla.
- La normalización de formato incluye tanto lo que se muestra en pantalla (app chofer y panel de Central) como los horarios que viajan entre los sistemas del backend (API, eventos MQTT de ubicación, Oracle), reemplazando el uso interno de UTC por hora local de Argentina con offset explícito, de modo que el problema de fondo —falta de una zona horaria consistente entre el origen de datos y lo que ve el usuario— quede resuelto y no solo maquillado en la última capa visual.
- Los horarios ya almacenados (arribos, descargas, actualizaciones pasadas) no se migran ni se les cambia el instante registrado; solo cambia cómo se calculan y presentan al mostrarlos.
- La ventana horaria de entrega (`rangoHorario`) es un campo de texto libre (string) provisto por Oracle, no un horario estructurado; queda fuera del alcance de esta normalización y se muestra tal cual llega, sin validación ni reformateo.
