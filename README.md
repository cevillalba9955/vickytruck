# VickyTruck

Plataforma de operación logística con tres piezas principales:

- App de chofer para ejecución de recorridos y reporte operativo.
- Panel Central para monitoreo, asignación y seguimiento.
- Backend de integración y dominio para recorridos, estado y sincronización.

La arquitectura actual incluye un modelo híbrido on-prem y cloud documentado en [docs/arquitectura-cloud.puml](docs/arquitectura-cloud.puml).

## Estructura del repositorio

- [backend](backend): API y acceso a datos.
- [frontend](frontend): aplicación web del chofer.
- [central](central): panel web de control central.
- [docs](docs): diagramas y guías de arquitectura.
- [specs](specs): especificaciones, planes y tareas por feature (Spec Kit).
- [.specify/memory/constitution.md](.specify/memory/constitution.md): constitución del proyecto.

## Flujo de ramas

La rama principal operativa es main-cloud.

La convención detallada de Git está en [docs/flujo-git.md](docs/flujo-git.md).

Resumen rápido:

1. Partir siempre desde main-cloud.
2. Crear rama de feature con prefijo numérico.
3. Abrir PR de feature hacia main-cloud.

## Documentación clave

- Arquitectura general: [docs/arquitectura.puml](docs/arquitectura.puml)
- Arquitectura cloud: [docs/arquitectura-cloud.puml](docs/arquitectura-cloud.puml)
- Endpoints backend: [docs/endpoints.md](docs/endpoints.md)
- Feature cloud y MQTT: [specs/003-arquitectura-cloud-mqtt/spec.md](specs/003-arquitectura-cloud-mqtt/spec.md)

## Desarrollo local

Requisitos:

- Node.js 20 o superior
- npm

Pasos sugeridos:

1. Instalar dependencias por módulo:
   - cd backend y npm install
   - cd frontend y npm install
   - cd central y npm install
2. Levantar backend y frontends en terminales separadas.
3. Verificar endpoints y vistas según escenarios en [specs/003-arquitectura-cloud-mqtt/quickstart.md](specs/003-arquitectura-cloud-mqtt/quickstart.md).

## Estado de especificaciones

Las features activas se gestionan con artefactos en la carpeta [specs](specs), incluyendo:

- spec
- plan
- research
- tasks
- contracts
- checklists

Para governance y reglas de diseño, usar como referencia principal [ .specify/memory/constitution.md](.specify/memory/constitution.md).