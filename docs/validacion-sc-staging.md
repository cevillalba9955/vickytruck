# Validacion de Success Criteria en Staging (Spec 003)

Estado: Pendiente de ejecución en ambiente de staging.

## SC-001

- Objetivo: sincronización Oracle/APEX -> cloud >= 99.5%.
- Estado: pendiente (requiere ejecución en staging).
- Evidencia esperada:
	- Ventana analizada (24h):
	- Total intentos:
	- Éxitos:
	- % éxito:

## SC-002

- Objetivo: ubicación en Central <= 2 s p95.
- Estado: pendiente (requiere telemetría en staging).
- Evidencia esperada:
	- p50:
	- p95:
	- p99:

## SC-003

- Objetivo: consulta de estado <= 1 s p95.
- Estado: pendiente (requiere benchmark en staging).
- Evidencia esperada:
	- p50:
	- p95:
	- p99:

## SC-004

- Objetivo: reconexión MQTT Central <= 15 s.
- Estado: pendiente (requiere prueba de corte/reconexión).
- Evidencia esperada:
	- Tiempo reconexión promedio:
	- Peor caso observado:

## SC-005

- Objetivo: no pérdida de mensajes confirmados en pruebas de reconexión.
- Estado: pendiente (requiere pruebas controladas de reconexión).
- Evidencia esperada:
	- Mensajes confirmados por broker:
	- Mensajes persistidos backend:
	- Diferencia:

## Nota

Esta validación requiere un entorno de staging operativo con broker MQTT y telemetría habilitada.
