-- Package BODY: RECORRIDO_API — validado end-to-end contra Oracle real
-- (2026-08-03, ver research.md §7 de la feature 001-chofer-recorrido).
--
-- Nombres reales confirmados en este entorno:
--   - c_tabla_recorridos: V_RECORRIDOS (vista; se lee el token/id desde acá)
--   - c_tabla_puntos:     T_PUNTOS_ENTREGA (tabla base real detrás de
--                         V_PUNTOS_ENTREGA, que no es actualizable)
--   - la columna que vincula un punto con su recorrido en T_PUNTOS_ENTREGA se
--     llama FLT_VIAJE_ID (no RECORRIDO_ID como asumía la plantilla original)
--
-- Requiere GRANT EXECUTE ON VIC.RECORRIDO_API al usuario que conecta desde el
-- backend Node, y que ese backend califique el nombre con el esquema
-- (ORACLE_PACKAGE_RECORRIDO_API=VIC.RECORRIDO_API) — sin el prefijo, Oracle no
-- resuelve el paquete aunque el GRANT ya esté otorgado (PLS-00201).

CREATE OR REPLACE PACKAGE BODY VIC.RECORRIDO_API AS

  c_tabla_recorridos CONSTANT VARCHAR2(61) := 'V_RECORRIDOS';
  c_tabla_puntos     CONSTANT VARCHAR2(61) := 'T_PUNTOS_ENTREGA';

  PROCEDURE transicionar(
    p_token          IN  VARCHAR2,
    p_punto_id       IN  NUMBER,
    p_lat            IN  NUMBER,
    p_lon            IN  NUMBER,
    p_estado_origen  IN  VARCHAR2,
    p_estado_destino IN  VARCHAR2,
    p_col_timestamp  IN  VARCHAR2,   -- 'ARRIBO_EN' | 'DESCARGA_EN'
    p_col_lat        IN  VARCHAR2,   -- 'ARRIBO_LAT' | 'DESCARGA_LAT'
    p_col_lon        IN  VARCHAR2,   -- 'ARRIBO_LON' | 'DESCARGA_LON'
    p_resultado      OUT VARCHAR2,
    p_estado         OUT VARCHAR2,
    p_evento_en      OUT TIMESTAMP
  ) IS
    v_recorrido_id NUMBER;
    v_filas        PLS_INTEGER;
  BEGIN
    BEGIN
      EXECUTE IMMEDIATE
        'SELECT id FROM ' || c_tabla_recorridos || ' WHERE token = :1'
        INTO v_recorrido_id
        USING p_token;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_resultado := 'INVALID_TOKEN';
        RETURN;
    END;

    -- Transición atómica: solo aplica si el punto está en estado_origen.
    EXECUTE IMMEDIATE
      'UPDATE ' || c_tabla_puntos ||
      ' SET estado = :1, ' || p_col_timestamp || ' = SYSTIMESTAMP, ' ||
      p_col_lat || ' = :2, ' || p_col_lon || ' = :3' ||
      ' WHERE id = :4 AND flt_viaje_id = :5 AND estado = :6'
      USING p_estado_destino, p_lat, p_lon, p_punto_id, v_recorrido_id, p_estado_origen;

    v_filas := SQL%ROWCOUNT;

    IF v_filas = 1 THEN
      COMMIT;
      p_resultado := 'OK';
      EXECUTE IMMEDIATE
        'SELECT estado, ' || p_col_timestamp || ' FROM ' || c_tabla_puntos ||
        ' WHERE id = :1'
        INTO p_estado, p_evento_en
        USING p_punto_id;
      RETURN;
    END IF;

    -- No se aplicó: puede ser que el punto no exista/no sea de este
    -- recorrido, que ya esté en el estado idempotente, o un conflicto real.
    BEGIN
      EXECUTE IMMEDIATE
        'SELECT estado, ' || p_col_timestamp || ' FROM ' || c_tabla_puntos ||
        ' WHERE id = :1 AND flt_viaje_id = :2'
        INTO p_estado, p_evento_en
        USING p_punto_id, v_recorrido_id;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        p_resultado := 'NOT_FOUND';
        RETURN;
    END;

    IF p_estado = p_estado_destino THEN
      p_resultado := 'OK'; -- repetición idempotente (research.md §6)
    ELSE
      p_resultado := 'CONFLICT';
    END IF;
  END transicionar;

  PROCEDURE marcar_arribo(
    p_token      IN  VARCHAR2,
    p_punto_id   IN  NUMBER,
    p_lat        IN  NUMBER DEFAULT NULL,
    p_lon        IN  NUMBER DEFAULT NULL,
    p_resultado  OUT VARCHAR2,
    p_estado     OUT VARCHAR2,
    p_evento_en  OUT TIMESTAMP
  ) IS
  BEGIN
    transicionar(
      p_token, p_punto_id, p_lat, p_lon,
      p_estado_origen => 'pendiente', p_estado_destino => 'arribado',
      p_col_timestamp => 'ARRIBO_EN', p_col_lat => 'ARRIBO_LAT', p_col_lon => 'ARRIBO_LON',
      p_resultado => p_resultado, p_estado => p_estado, p_evento_en => p_evento_en
    );
  END marcar_arribo;

  PROCEDURE marcar_descarga(
    p_token      IN  VARCHAR2,
    p_punto_id   IN  NUMBER,
    p_lat        IN  NUMBER DEFAULT NULL,
    p_lon        IN  NUMBER DEFAULT NULL,
    p_resultado  OUT VARCHAR2,
    p_estado     OUT VARCHAR2,
    p_evento_en  OUT TIMESTAMP
  ) IS
  BEGIN
    transicionar(
      p_token, p_punto_id, p_lat, p_lon,
      p_estado_origen => 'arribado', p_estado_destino => 'completado',
      p_col_timestamp => 'DESCARGA_EN', p_col_lat => 'DESCARGA_LAT', p_col_lon => 'DESCARGA_LON',
      p_resultado => p_resultado, p_estado => p_estado, p_evento_en => p_evento_en
    );
  END marcar_descarga;

END RECORRIDO_API;
/
