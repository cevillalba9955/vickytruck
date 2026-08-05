-- Package SPEC: INTEGRACION_CLOUD_API
-- Empuja un recorrido (y sus puntos de entrega) desde Oracle/APEX local hacia
-- el backend cloud, vía POST /api/integracion/recorridos — ver
-- specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md para el
-- contrato exacto del payload.
--
-- Primera versión: sincronización manual, un recorrido por vez. No está
-- atada a ningún trigger/job — se llama a mano (o desde un botón/proceso de
-- APEX) mientras se valida que el POST funciona end-to-end. Automatizar el
-- disparo (trigger sobre T_RECORRIDOS/T_PUNTOS_ENTREGA, job programado, etc.)
-- queda para una iteración posterior.
--
-- Se crea en el esquema VICKYTRUCK (el usuario que conecta el backend), no en
-- VIC: VICKYTRUCK no tiene privilegio CREATE en el esquema VIC (ORA-01031),
-- solo SELECT sobre sus vistas (igual que ya usa el backend Node). Si en el
-- futuro conviene que viva en VIC, hace falta el GRANT correspondiente.

CREATE OR REPLACE PACKAGE INTEGRACION_CLOUD_API AS

  PROCEDURE sincronizar_recorrido(
    p_recorrido_id IN  NUMBER,
    p_resultado    OUT VARCHAR2,  -- 'OK' | 'ERROR'
    p_http_status  OUT NUMBER,
    p_respuesta    OUT VARCHAR2   -- body de la respuesta del backend (debug)
  );

END INTEGRACION_CLOUD_API;
/
