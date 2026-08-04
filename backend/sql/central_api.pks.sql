-- Package SPEC: CENTRAL_API
-- Contrato de escritura para el backend de Central (feature
-- 002-panel-control-central). Análogo a VIC.RECORRIDO_API
-- (backend/sql/recorrido_api.pks.sql) de la feature 001-chofer-recorrido:
-- las vistas de lectura (V_RECORRIDOS, V_FLETES) no son actualizables, así
-- que toda escritura de asignación/reasignación pasa por acá.
--
-- Nombres de tabla/columna asumidos (ver research.md §5 y §6 de
-- 002-panel-control-central) — A CONFIRMAR contra la instancia real, igual
-- que ya pasó con T_PUNTOS_ENTREGA/FLT_VIAJE_ID en 001-chofer-recorrido:
--   - tabla base de recorridos: T_RECORRIDOS (detrás de V_RECORRIDOS), con
--     columnas nuevas para esta feature: FLETE_ID (nullable), ASIGNADO_EN.
--   - tabla/vista de fletes: V_FLETES (solo lectura para este package).
--
-- Semántica de p_resultado:
--   'OK'             Asignación/reasignación aplicada; p_token/p_asignado_en
--                     reflejan el nuevo estado.
--   'NOT_FOUND'      El recorrido no existe (asignar_recorrido) o no existe
--                     / no está "activo" (reasignar_recorrido).
--   'YA_ASIGNADO'    (solo asignar_recorrido) El recorrido ya tiene un flete
--                     activo asignado; usar reasignar_recorrido en su lugar.
--   'FLETE_OCUPADO'  El flete destino ya tiene otro recorrido "activo"
--                     asignado en este momento.
--
-- El package resuelve el check-and-set de forma atómica (misma sentencia
-- UPDATE que valida y aplica la condición) para que dos asignaciones
-- simultáneas sobre el mismo recorrido no puedan dejarlo en un estado
-- ambiguo (FR-015).

CREATE OR REPLACE PACKAGE VIC.CENTRAL_API AS

  PROCEDURE asignar_recorrido(
    p_recorrido_id IN  NUMBER,
    p_flete_id     IN  NUMBER,
    p_resultado    OUT VARCHAR2,
    p_token        OUT VARCHAR2,
    p_asignado_en  OUT TIMESTAMP
  );

  PROCEDURE reasignar_recorrido(
    p_recorrido_id IN  NUMBER,
    p_flete_id     IN  NUMBER,
    p_resultado    OUT VARCHAR2,
    p_token        OUT VARCHAR2,
    p_asignado_en  OUT TIMESTAMP
  );

END CENTRAL_API;
/
