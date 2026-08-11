# Quickstart: Validación de normalización de formato horario

**Feature**: 006-normalizar-formato-horario | **Spec**: [spec.md](./spec.md)

## Prerrequisitos

- `backend/`, `frontend/`, `central/` con dependencias instaladas (`npm ci`
  en cada uno — sin dependencias nuevas, ver `plan.md` Technical Context).
- Backend corriendo local (`npm start` en `backend/`, ver
  `backend/package.json`).
- Frontend y Central en modo dev (`npm run dev` en cada uno).
- Cambios de Oracle (`backend/sql/**/*.pkb.sql`) aplicados en un entorno
  Oracle/APEX de prueba — no se pueden validar solo con los tests JS de este
  repo (ver contracts/formato-horario.md, "Impacto en Oracle").

## Escenario 1 — Formato HH24:MM:SS y hora local en la app del chofer (User Story 1)

1. Simular (o generar vía flujo real) un punto de entrega con `arriboEn`
   registrado.
2. Abrir la app del chofer (`frontend/`) y ver el detalle del punto.
3. **Verificar**: la hora de arribo se muestra como `HH:MM:SS` (dos dígitos
   cada parte), sin AM/PM, y coincide con la hora real de un reloj de
   referencia de Argentina (± unos segundos por latencia de red).
4. Repetir para `descargaEn`.
5. **Verificar** (Edge case): la ventana horaria de entrega (`rangoHorario`)
   se sigue mostrando exactamente igual que antes de esta feature — texto
   libre, sin reformatear (Clarifications, pregunta 3).

## Escenario 2 — Consistencia entre app chofer y panel Central (User Story 2)

1. Con el mismo punto de entrega del Escenario 1, abrir el panel de Central
   (`central/`) y navegar al detalle del recorrido correspondiente.
2. **Verificar**: la hora de arribo/descarga mostrada en Central es
   *idéntica*, carácter por carácter, a la mostrada en la app del chofer
   (SC-003).
3. Abrir la vista de monitoreo en vivo (`MonitorView`) y verificar que la
   columna de última ubicación ahora muestra la hora `HH:MM:SS` del último
   reporte, no solo el texto "reciente"/"no reciente".
4. Publicar manualmente un evento MQTT de ubicación (o esperar el reporte
   periódico real del chofer) y confirmar que la hora mostrada en Central
   avanza acorde a la hora real, no con un desfasaje de varias horas (SC-002,
   SC-005).

## Escenario 3 — Horarios históricos previos a esta feature (User Story 3)

1. Tomar un recorrido ya finalizado, con `arriboEn`/`descargaEn` generados
   *antes* de desplegar esta feature (formato `...Z`, UTC).
2. Consultar su detalle en Central.
3. **Verificar**: se muestra en formato `HH24:MM:SS`, igual que los datos
   nuevos — sin errores de parseo, sin mostrar el string crudo con `Z`.
4. **Verificar** (dato conocido, no bloqueante): si ese registro específico
   fue escrito antes de la corrección del bug de Oracle
   (`research.md` Decisión 3), puede diferir de la hora real ocurrida — es
   el comportamiento esperado y aceptado (FR-006, no se migra), no un defecto
   de esta feature.

## Verificación técnica del contrato (Oracle)

1. En el entorno Oracle/APEX de prueba, ejecutar `sincronizar_recorrido`
   para un recorrido y confirmar que el `updatedAt` del payload resultante
   tiene el sufijo `-03:00`, no `Z`.
2. Marcar arribo/descarga desde la app del chofer y luego ejecutar
   `leer_estado_puntos` contra ese mismo recorrido — confirmar que
   `ARRIBO_EN`/`DESCARGA_EN` en `T_PUNTOS_ENTREGA` quedan pobladas sin error
   (antes fallaría con la máscara vieja, ver contracts/formato-horario.md).
   Esta es la función marcada como "sin probar" en el historial del
   proyecto — **prueba manual obligatoria**, no se puede dar por validada
   solo con revisión de código.

## Resultado esperado

Todos los horarios de eventos puntuales visibles al usuario (asignación,
arribo, descarga, última ubicación) en formato de 24 horas con segundos y
hora local de Argentina, consistentes entre app chofer y Central, sin tocar
`rangoHorario` ni migrar datos históricos.
