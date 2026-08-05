<!--
Sync Impact Report
Version change: 2.0.0 → 3.0.0
Modified principles:
  - IV. "Oracle como Fuente Única de Verdad" → "Fuentes de Verdad por Dominio y
    Sincronización Explícita" — REDEFINICIÓN INCOMPATIBLE: se elimina la restricción de
    Oracle como único almacenamiento autoritativo para toda operación y se establece un
    modelo híbrido: Oracle local como maestro administrativo y store cloud como fuente
    autoritativa del plano operativo en vivo, sincronizados por endpoints autenticados.
Added sections: ninguna (modificación de un principio existente)
Removed sections: ninguna (se retira una restricción dentro del Principio IV, no una
  sección completa)
Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no changes needed (Constitution Check gate is derived dynamically from this file)
  - .specify/templates/spec-template.md ✅ no changes needed (generic structure, compatible)
  - .specify/templates/tasks-template.md ✅ no changes needed (generic structure, compatible)
  - .specify/templates/checklist-template.md ✅ no changes needed
  - specs/003-arquitectura-cloud-mqtt/spec.md ✅ updated
  - specs/003-arquitectura-cloud-mqtt/plan.md ✅ updated
  - specs/003-arquitectura-cloud-mqtt/research.md ✅ updated
  - specs/003-arquitectura-cloud-mqtt/tasks.md ✅ updated
  - specs/002-panel-control-central/plan.md ⚠ pending manual alignment de Principle IV
  - specs/002-panel-control-central/spec.md ⚠ pending manual alignment de FR-005/FR-016
Follow-up TODOs:
  - Definir en implementación del feature 003 la política formal de reconciliación
    entre store cloud y Oracle local para incidentes de desincronización.
-->

# VickyTruck Constitution

## Core Principles

### I. Chofer: Página Única, Móvil-Primero
La aplicación del chofer/flete DEBE ser una single-page application (SPA) web,
optimizada primero para pantallas móviles y uso con una sola mano dentro de la
cabina del vehículo. No se permite introducir navegación multi-página,
asistentes de múltiples pasos, ni pantallas secundarias: toda la operación del
chofer (ver ruta, marcar arribo, marcar descarga completa) ocurre en una única
vista. Los controles táctiles deben ser grandes, con retroalimentación
inmediata (optimista) y tolerantes a conexiones intermitentes propias de rutas
en movimiento.
Rationale: el chofer opera en movimiento, con atención dividida y conectividad
variable; una única vista minimiza errores de navegación y tiempo de
distracción.

### II. Ruta Acotada y Ordenada (Máximo 10 Puntos)
Toda ruta/recorrido asignado a un flete contiene una lista ORDENADA de puntos
de entrega, con un máximo estricto de 10 puntos por recorrido. Cada punto
DEBE incluir coordenadas de latitud/longitud válidas. El orden de la lista es
autoritativo y solo puede modificarse desde la Central; el chofer no puede
reordenar ni editar los puntos, solo reportar eventos de estado sobre ellos
(arribo, descarga completa).
Rationale: acotar a 10 puntos mantiene la interfaz simple y evita listas que
degraden la usabilidad móvil; el orden autoritativo evita ambigüedad sobre qué
entrega corresponde ejecutar.

### III. Central Compatible con Embebido en Oracle APEX y con Acceso Directo (NON-NEGOTIABLE)
La aplicación de Central es una web app de escritorio que DEBE funcionar
tanto embebida como iframe/URL dentro de una página Oracle APEX existente,
como accedida directamente por su propia URL (fuera de cualquier frame).
Toda pantalla de Central DEBE funcionar correctamente dentro de un
`<iframe>` (sin asumir que es la ventana de nivel superior) y DEBE evitar
mecanismos incompatibles con el embebido (bloqueo de cookies de terceros,
`X-Frame-Options`/CSP restrictivos sin coordinación previa, popups
bloqueados). El acceso directo (fuera de un iframe) es un modo de uso
válido y soportado: Central NO DEBE bloquear, degradar ni limitar su
funcionalidad solo por detectar que no está embebida. Cualquier cambio que
rompa el embebido en APEX o el acceso directo se considera una regresión
crítica.
Rationale: la integración con APEX sigue siendo un canal de acceso
relevante, pero ya no es el único soportado; exigir el embebido como
condición para operar limitaba casos de uso legítimos (acceso
administrativo directo, pruebas manuales, entornos sin APEX disponible)
sin aportar valor de seguridad real, ya que la identidad del operador no
depende de estar dentro de un frame.

### IV. Fuentes de Verdad por Dominio y Sincronización Explícita
El sistema adopta un modelo híbrido con fuente autoritativa por dominio:
Oracle local es el sistema maestro para datos administrativos y de precarga
(recorridos base, catálogos y procesos internos), mientras el store
operacional cloud es la fuente autoritativa para la ejecución en vivo
(asignaciones activas, estado operativo y telemetría reciente). Ningún
componente DEBE asumir consistencia implícita entre ambos planos: toda
sincronización DEBE ser explícita, autenticada, auditable y trazable mediante
endpoints/contratos de integración definidos.
Rationale: en despliegue híbrido on-prem/cloud, forzar un único origen físico
de datos degrada disponibilidad y latencia; separar la autoridad por dominio,
con sincronización explícita, mantiene consistencia operativa sin acoplar red
cloud con Oracle local.

### V. Trazabilidad de Estado y Ubicación en Tiempo (Casi) Real
Cada evento relevante del chofer —arribo a destino, descarga completada— y
cada actualización de ubicación DEBE quedar registrado con marca de tiempo y
propagarse a Central con la menor latencia posible. Central DEBE poder
monitorear, para cada reparto activo, el estado actual y la última ubicación
conocida del flete sin necesidad de recargar manualmente toda la página.
Rationale: el valor central del sistema es la visibilidad operativa en vivo
de las entregas en curso; datos obsoletos anulan ese valor.

### VI. Mensajería Interna Confiable
El servicio de mensajería interna entre Central y choferes es un canal de
comunicación propio del sistema (no dependiente de SMS/email/WhatsApp
externos). Los mensajes DEBEN quedar asociados a un flete/recorrido, con
marca de tiempo y estado de entrega/lectura. La pérdida silenciosa de
mensajes no es aceptable: ante fallas de envío el sistema DEBE indicarlo
visiblemente al emisor.
Rationale: en operación logística, un mensaje "perdido" sin aviso puede
traducirse en una entrega fallida o mal coordinada.

### VII. Simplicidad y Datos Mínimos Necesarios
Se prefiere la solución más simple que cumpla los principios anteriores.
No se introduce infraestructura, capas de abstracción, ni almacenamiento de
datos personales/de ubicación adicionales a los estrictamente necesarios
para operar la ruta activa. Los datos de ubicación del chofer se recolectan
únicamente mientras tiene un recorrido activo asignado.
Rationale: menor superficie de código y de datos sensibles implica menor
costo de mantenimiento y menor riesgo de privacidad/seguridad.

## Restricciones Técnicas y de Integración

- **Persistencia híbrida**: Oracle local es obligatorio como maestro
  administrativo y de precarga; el plano cloud DEBE contar con un store
  operacional propio y autoritativo para la ejecución diaria. La integración
  entre ambos planos DEBE hacerse por contratos HTTPS autenticados; no se
  asume conectividad directa cloud→Oracle.
- **Integración APEX (opcional, no exclusiva)**: la Central se sirve
  mediante una URL propia que puede embeberse dentro de una página Oracle
  APEX (soportando paso de contexto, p. ej. usuario/sesión, compatible con
  el mecanismo de autenticación de la página contenedora) o accederse
  directamente sin ese contexto. Ninguno de los dos modos de acceso es
  requisito para que funcione el otro.
- **Geolocalización**: la app del chofer usa geolocalización del navegador
  (o dispositivo); DEBE solicitar permiso explícito y manejar con claridad
  el caso de permiso denegado o señal GPS ausente.
- **Conectividad intermitente**: las acciones del chofer (marcar arribo,
  marcar descarga) DEBEN reintentarse o encolarse ante pérdida temporal de
  red, sin bloquear la interfaz.
- **Responsive por rol**: el frontend del chofer se diseña mobile-first; el
  frontend de Central se diseña para uso de escritorio (embebido en un
  frame o accedido directamente), no mobile-first.
- **Framework backend**: todo backend HTTP del proyecto (Chofer, Central y
  cualquier servicio que se agregue) DEBE construirse sobre Express.js. No se
  introducen frameworks adicionales (NestJS, Fastify, etc.) sin enmendar esta
  constitución; tampoco se implementan servidores HTTP a mano sobre `node:http`
  para evitar divergencia de convenciones (manejo de rutas, middleware, errores)
  entre features y equipos.

## Flujo de Desarrollo y Puertas de Calidad

- Toda funcionalidad nueva se especifica (`/speckit-specify`) y planifica
  (`/speckit-plan`) antes de implementarse; el plan DEBE pasar la
  verificación de "Constitution Check" contra este documento.
  

- Cambios que afecten el embebido en APEX, el acceso directo de Central
  (Principio III) o el límite de 10 puntos por recorrido (Principio II)
  requieren pruebas manuales o automatizadas explícitas antes de mergear.
- Cambios en el modelo de datos Oracle local o en el store operacional cloud
  (recorridos, asignaciones, estados, telemetría, mensajería) requieren
  revisión explícita de compatibilidad y del contrato de sincronización entre
  ambos planos.

## Governance

Esta constitución prevalece sobre cualquier otra práctica o convención
informal del proyecto. Toda propuesta de cambio (plan, PR, revisión de
código) DEBE verificar cumplimiento de los principios aquí definidos; toda
complejidad que viole el Principio VII (Simplicidad) DEBE justificarse
explícitamente en la sección "Complexity Tracking" del plan correspondiente.

**Procedimiento de enmienda**: cualquier cambio a este documento se propone
como PR/commit que documente el motivo del cambio, y se versiona según
semver:
- MAJOR: eliminación o redefinición incompatible de un principio existente.
- MINOR: incorporación de un nuevo principio o sección, o expansión material
  de una guía existente.
- PATCH: aclaraciones de redacción, correcciones no semánticas.

**Revisión de cumplimiento**: cada `/speckit-plan` debe repasar la sección
"Constitution Check" antes de la Fase 0 y volver a repasarla tras la Fase 1
de diseño.

**Version**: 3.0.0 | **Ratified**: 2026-08-03 | **Last Amended**: 2026-08-05
