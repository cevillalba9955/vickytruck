# Flujo Git del Proyecto

## Objetivo

Definir una convención simple y explícita para el trabajo diario con ramas.

## Rama principal operativa

- La rama principal operativa del proyecto es main-cloud.
- Todo nuevo desarrollo debe partir desde main-cloud.
- Las integraciones de features se realizan hacia main-cloud.

## Ramas de feature

- Formato recomendado: NNN-descripcion-corta.
- Ejemplos:
  - 003-arquitectura-cloud-mqtt
  - 004-chofer-cloud-broker
- Cada rama de feature debe enfocarse en un cambio funcional único o una unidad de trabajo coherente.

## Flujo recomendado

1. Actualizar rama principal operativa local.
2. Crear rama de feature desde main-cloud.
3. Implementar y commitear cambios en la rama de feature.
4. Abrir PR hacia main-cloud.
5. Hacer merge en main-cloud luego de revisión.

## Reglas de integración

- No abrir PRs de features directamente contra master.
- master queda como rama histórica o de referencia, no como destino operativo por defecto.
- Si en el futuro cambia la rama principal operativa, este documento debe actualizarse en el mismo PR del cambio.

## Comandos útiles

```bash
git checkout main-cloud
git pull
git checkout -b 005-nueva-feature
```
