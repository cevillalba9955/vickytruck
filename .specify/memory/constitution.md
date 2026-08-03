<!--
Sync Impact Report
Version change: 1.0.0 → 1.1.0
Modified principles: none renamed; VII (Simplicidad y Datos Mínimos Necesarios) is now
  read alongside the new Express constraint below (no redefinition, just a concrete
  framework pick within the existing simplicity bar).
Added sections:
  - Restricciones Técnicas y de Integración: nuevo ítem "Framework backend" (Express.js
    obligatorio para todo backend HTTP del proyecto)
Removed sections: none
Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no changes needed (Constitution Check gate is derived dynamically from this file)
  - .specify/templates/spec-template.md ✅ no changes needed (generic structure, compatible)
  - .specify/templates/tasks-template.md ✅ no changes needed (generic structure, compatible)
  - .specify/templates/checklist-template.md ✅ no changes needed
  - specs/001-chofer-recorrido/plan.md ⚠ pending manual update (Technical Context /
    Constitution Check referenced "node:http nativo, sin framework"; debe pasar a Express)
  - specs/001-chofer-recorrido/research.md ⚠ pending manual update (Decision §2 debe
    reflejar Express como constraint de constitución, no como elección de research)
  - specs/001-chofer-recorrido/tasks.md ⚠ pending manual update (T002, T008 mencionan
    "sin framework" / falta dependencia express)
Follow-up TODOs: none
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

### III. Central Embebible en Oracle APEX (NON-NEGOTIABLE)
La aplicación de Central es una web app de escritorio diseñada para
funcionar embebida como iframe/URL dentro de una página Oracle APEX
existente. Toda pantalla de Central DEBE funcionar correctamente dentro de un
`<iframe>` (sin asumir que es la ventana de nivel superior), DEBE evitar
mecanismos incompatibles con embebido (bloqueo de cookies de terceros,
`X-Frame-Options`/CSP restrictivos sin coordinación previa, popups
bloqueados) y DEBE degradar de forma segura si se abre fuera del frame de
APEX. Cualquier cambio que rompa el embebido en APEX se considera una
regresión crítica.
Rationale: la integración con APEX es un requisito de despliegue no
negociable; romperla invalida el canal principal de acceso de la Central.

### IV. Oracle como Fuente Única de Verdad
La base de datos Oracle es la fuente autoritativa de recorridos
precargados, asignaciones flete-recorrido, estados de entrega y ubicaciones
reportadas. Ninguna funcionalidad DEBE mantener una copia divergente y
persistente de estos datos fuera de Oracle. La asignación de un recorrido
precargado a un flete determinado se realiza desde Central y se persiste de
inmediato en Oracle antes de considerarse efectiva.
Rationale: Central y el chofer deben ver siempre el mismo estado; múltiples
fuentes de verdad producen inconsistencias entre lo que ve la Central y lo
que reporta el chofer.

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

- **Base de datos**: Oracle es el motor de persistencia obligatorio para
  recorridos, asignaciones, estados y ubicaciones; cualquier caché local es
  efímera y no autoritativa.
- **Integración APEX**: la Central se sirve mediante una URL embebible; debe
  soportar paso de contexto (p. ej. usuario/sesión) compatible con el
  mecanismo de autenticación de la página APEX contenedora.
- **Geolocalización**: la app del chofer usa geolocalización del navegador
  (o dispositivo); DEBE solicitar permiso explícito y manejar con claridad
  el caso de permiso denegado o señal GPS ausente.
- **Conectividad intermitente**: las acciones del chofer (marcar arribo,
  marcar descarga) DEBEN reintentarse o encolarse ante pérdida temporal de
  red, sin bloquear la interfaz.
- **Responsive por rol**: el frontend del chofer se diseña mobile-first; el
  frontend de Central se diseña para uso de escritorio dentro de un frame
  embebido, no mobile-first.
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
  

- Cambios que afecten el embebido en APEX (Principio III) o el límite de 10
  puntos por recorrido (Principio II) requieren pruebas manuales o
  automatizadas explícitas antes de mergear.
- Cambios en el modelo de datos Oracle (tablas de recorridos, asignaciones,
  estados, mensajería) requieren revisión explícita de compatibilidad con
  datos ya precargados en producción.

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

**Version**: 1.1.0 | **Ratified**: 2026-08-03 | **Last Amended**: 2026-08-03
