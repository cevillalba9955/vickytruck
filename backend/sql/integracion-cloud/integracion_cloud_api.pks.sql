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
-- Se crea en el esquema VIC. El usuario VICKYTRUCK (que en la primera
-- versión conectaba el backend directo a Oracle) ya no se usa — se eliminó
-- al pasar a la arquitectura cloud (spec 003), donde el backend no tiene
-- ningún acceso a Oracle. VIC ya tiene los privilegios (y la ACL de red)
-- que este paquete necesita sobre sus propias vistas/tablas, así que no hace
-- falta ningún GRANT cross-schema.

CREATE OR REPLACE PACKAGE VIC.INTEGRACION_CLOUD_API AS

  PROCEDURE sincronizar_recorrido(
    p_recorrido_id IN  NUMBER,
    p_resultado    OUT VARCHAR2,  -- 'OK' | 'ERROR'
    p_http_status  OUT NUMBER,
    p_respuesta    OUT VARCHAR2   -- body de la respuesta del backend (debug)
  );

  -- Dirección inversa: trae de vuelta el estado de los puntos de entrega que
  -- el chofer marcó en el backend cloud (arribo/descarga, con la ubicación
  -- GPS y fechahora de cada evento — GET /api/integracion/estado, ver
  -- specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md) y lo
  -- escribe sobre T_PUNTOS_ENTREGA.
  PROCEDURE leer_estado_puntos(
    p_recorrido_id IN  NUMBER,
    p_resultado    OUT VARCHAR2,  -- 'OK' | 'NOT_FOUND' | 'ERROR'
    p_http_status  OUT NUMBER,
    p_respuesta    OUT VARCHAR2   -- 'puntos_actualizados: N', o el motivo si ERROR/NOT_FOUND
  );

END INTEGRACION_CLOUD_API;
/
