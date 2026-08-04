-- Package BODY: CENTRAL_API
--
-- IMPORTANTE: a diferencia de RECORRIDO_API (ya validado end-to-end contra
-- la instancia real, ver research.md §7 de 001-chofer-recorrido), este
-- package todavía NO fue validado contra el esquema real: los nombres de
-- tabla/columna de abajo son el supuesto documentado en
-- specs/002-panel-control-central/research.md §5-§6 y deben confirmarse (y
-- ajustarse si hace falta) con el dueño del esquema Oracle antes de
-- desplegar, siguiendo el mismo proceso que ya se hizo para
-- T_PUNTOS_ENTREGA/FLT_VIAJE_ID.

CREATE OR REPLACE PACKAGE BODY VIC.CENTRAL_API AS

  c_tabla_recorridos CONSTANT VARCHAR2(61) := 'T_RECORRIDOS';

  FUNCTION nuevo_token RETURN VARCHAR2 IS
  BEGIN
    RETURN 'tok-' || LOWER(RAWTOHEX(SYS_GUID()));
  END nuevo_token;

  PROCEDURE asignar_recorrido(
    p_recorrido_id IN  NUMBER,
    p_flete_id     IN  NUMBER,
    p_resultado    OUT VARCHAR2,
    p_token        OUT VARCHAR2,
    p_asignado_en  OUT TIMESTAMP
  ) IS
    v_token   VARCHAR2(64) := nuevo_token();
    v_filas   PLS_INTEGER;
    v_existe  PLS_INTEGER;
  BEGIN
    -- UPDATE atómico: solo aplica si el recorrido existe, no tiene flete
    -- asignado (FLETE_ID IS NULL) y el flete destino no tiene ya otro
    -- recorrido "activo" — el NOT EXISTS evalúa dentro de la misma
    -- sentencia, evitando la carrera entre "chequear" y "escribir" (FR-015).
    EXECUTE IMMEDIATE
      'UPDATE ' || c_tabla_recorridos || ' r' ||
      ' SET r.flete_id = :1, r.token = :2, r.asignado_en = SYSTIMESTAMP, r.estado = ''activo''' ||
      ' WHERE r.id = :3' ||
      '   AND r.flete_id IS NULL' ||
      '   AND NOT EXISTS (' ||
      '     SELECT 1 FROM ' || c_tabla_recorridos || ' r2' ||
      '     WHERE r2.flete_id = :4 AND r2.estado = ''activo''' ||
      '   )'
      USING p_flete_id, v_token, p_recorrido_id, p_flete_id;

    v_filas := SQL%ROWCOUNT;

    IF v_filas = 1 THEN
      COMMIT;
      p_resultado := 'OK';
      p_token := v_token;
      EXECUTE IMMEDIATE
        'SELECT asignado_en FROM ' || c_tabla_recorridos || ' WHERE id = :1'
        INTO p_asignado_en
        USING p_recorrido_id;
      RETURN;
    END IF;

    -- No se aplicó: distinguir la causa (en orden de prioridad del contrato
    -- HTTP: no encontrado > ya asignado > flete ocupado).
    BEGIN
      EXECUTE IMMEDIATE
        'SELECT COUNT(*) FROM ' || c_tabla_recorridos || ' WHERE id = :1 AND flete_id IS NOT NULL'
        INTO v_existe
        USING p_recorrido_id;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        v_existe := 0;
    END;

    IF v_existe > 0 THEN
      p_resultado := 'YA_ASIGNADO';
      RETURN;
    END IF;

    EXECUTE IMMEDIATE
      'SELECT COUNT(*) FROM ' || c_tabla_recorridos || ' WHERE id = :1'
      INTO v_existe
      USING p_recorrido_id;

    IF v_existe = 0 THEN
      p_resultado := 'NOT_FOUND';
    ELSE
      p_resultado := 'FLETE_OCUPADO';
    END IF;
  END asignar_recorrido;

  PROCEDURE reasignar_recorrido(
    p_recorrido_id IN  NUMBER,
    p_flete_id     IN  NUMBER,
    p_resultado    OUT VARCHAR2,
    p_token        OUT VARCHAR2,
    p_asignado_en  OUT TIMESTAMP
  ) IS
    v_token  VARCHAR2(64) := nuevo_token();
    v_filas  PLS_INTEGER;
    v_activo PLS_INTEGER;
  BEGIN
    -- Igual que asignar_recorrido, pero exige que el recorrido YA esté
    -- "activo" (con un flete previo) y excluye al propio recorrido de la
    -- comprobación de "flete ocupado" (Historia 4, FR-009).
    EXECUTE IMMEDIATE
      'UPDATE ' || c_tabla_recorridos || ' r' ||
      ' SET r.flete_id = :1, r.token = :2, r.asignado_en = SYSTIMESTAMP' ||
      ' WHERE r.id = :3' ||
      '   AND r.estado = ''activo''' ||
      '   AND NOT EXISTS (' ||
      '     SELECT 1 FROM ' || c_tabla_recorridos || ' r2' ||
      '     WHERE r2.flete_id = :4 AND r2.estado = ''activo'' AND r2.id != :5' ||
      '   )'
      USING p_flete_id, v_token, p_recorrido_id, p_flete_id, p_recorrido_id;

    v_filas := SQL%ROWCOUNT;

    IF v_filas = 1 THEN
      COMMIT;
      p_resultado := 'OK';
      p_token := v_token;
      EXECUTE IMMEDIATE
        'SELECT asignado_en FROM ' || c_tabla_recorridos || ' WHERE id = :1'
        INTO p_asignado_en
        USING p_recorrido_id;
      RETURN;
    END IF;

    BEGIN
      EXECUTE IMMEDIATE
        'SELECT COUNT(*) FROM ' || c_tabla_recorridos || ' WHERE id = :1 AND estado = ''activo'''
        INTO v_activo
        USING p_recorrido_id;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        v_activo := 0;
    END;

    IF v_activo = 0 THEN
      p_resultado := 'NOT_FOUND';
    ELSE
      p_resultado := 'FLETE_OCUPADO';
    END IF;
  END reasignar_recorrido;

END CENTRAL_API;
/
