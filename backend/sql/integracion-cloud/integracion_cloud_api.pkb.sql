-- Package BODY: INTEGRACION_CLOUD_API
--
-- Arma el payload de POST /api/integracion/recorridos (ver contrato en
-- specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md) leyendo
-- las vistas ya validadas contra este esquema real (mismas que usa
-- RECORRIDO_API, ver recorrido_api.pkb.sql):
--   VIC.V_RECORRIDOS(ID, TOKEN, ESTADO, FLETE_ID)
--   VIC.V_PUNTOS_ENTREGA(ID, RECORRIDO_ID, ORDEN, LATITUD, LONGITUD, ESTADO)
--   VIC.V_FLETES(ID, NOMBRE)
--
-- IMPORTANTE (primera versión — sincronización manual, ver README.md de esta
-- carpeta): c_api_key queda hardcodeada acá como constante. Antes de atar esto a un
-- trigger o job automático hay que moverla al credential store de APEX
-- (APEX_CREDENTIAL.CREATE_CREDENTIAL) en vez de dejarla en el código fuente.
-- Mismo valor que INTEGRACION_API_KEY en backend/.env y en los secrets de
-- Fly — rotar en algún momento antes de operar en serio.
--
-- No validado todavía: si esta instancia Oracle (on-prem, IP privada) tiene
-- salida a internet hacia el backend, y si el wallet TLS por default de
-- APEX_WEB_SERVICE valida el certificado sin configuración adicional. Si
-- sincronizar_recorrido explota acá, p_respuesta/la excepción va a decir el
-- motivo real.
--
-- Se crea en el esquema VICKYTRUCK (el usuario que conecta el backend), no en
-- VIC: VICKYTRUCK no tiene privilegio CREATE en el esquema VIC (ORA-01031),
-- solo SELECT sobre sus vistas (igual que ya usa el backend Node). Las
-- referencias VIC.V_* de abajo quedan igual, son cross-schema de solo lectura.

CREATE OR REPLACE PACKAGE BODY INTEGRACION_CLOUD_API AS

  c_backend_url CONSTANT VARCHAR2(200) := 'https://vickytruck.fly.dev/api/integracion/recorridos';
  c_api_key     CONSTANT VARCHAR2(100) := 'b9gFJKRPl2eYf3SWgHDtvsV-6CIXfGHC';

  FUNCTION armar_payload(p_recorrido_id IN NUMBER) RETURN CLOB IS
    v_id            NUMBER;
    v_token         VARCHAR2(64);
    v_estado        VARCHAR2(40);
    v_flete_id      NUMBER;
    v_flete_nombre  VARCHAR2(200);
    v_puntos        CLOB;
    v_recorrido     CLOB;
    v_payload       CLOB;
  BEGIN
    SELECT r.id, r.token, r.estado, r.flete_id, f.nombre
      INTO v_id, v_token, v_estado, v_flete_id, v_flete_nombre
      FROM VIC.V_RECORRIDOS r
      LEFT JOIN VIC.V_FLETES f ON f.id = r.flete_id
     WHERE r.id = p_recorrido_id;

    SELECT JSON_ARRAYAGG(
             JSON_OBJECT(
               'id' VALUE TO_CHAR(p.id),
               'orden' VALUE p.orden,
               'estado' VALUE p.estado,
               'lat' VALUE p.latitud,
               'lon' VALUE p.longitud
               ABSENT ON NULL
             )
             ORDER BY p.orden
             RETURNING CLOB
           )
      INTO v_puntos
      FROM VIC.V_PUNTOS_ENTREGA p
     WHERE p.recorrido_id = p_recorrido_id;

    -- JSON_OBJECT(...RETURNING CLOB) como expresión PL/SQL directa
    -- (v_x := JSON_OBJECT(...)) da ORA-40442 "tipo no válido para el retorno
    -- JSON" en esta versión de Oracle. El mismo RETURNING CLOB sí funciona
    -- dentro de un SELECT (igual que JSON_ARRAYAGG arriba) — por eso todo va
    -- por SELECT ... INTO ... FROM DUAL en vez de asignación directa.
    SELECT JSON_OBJECT(
             'id' VALUE TO_CHAR(v_id),
             'token' VALUE v_token,
             'fleteId' VALUE TO_CHAR(v_flete_id),
             'fleteNombre' VALUE v_flete_nombre,
             'estado' VALUE v_estado,
             'puntos' VALUE NVL(v_puntos, TO_CLOB('[]')) FORMAT JSON,
             'updatedAt' VALUE TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
             ABSENT ON NULL
             RETURNING CLOB
           )
      INTO v_recorrido
      FROM DUAL;

    SELECT JSON_OBJECT(
             'source' VALUE 'oracle-apex',
             'recorridos' VALUE JSON_ARRAY(v_recorrido FORMAT JSON RETURNING CLOB)
             RETURNING CLOB
           )
      INTO v_payload
      FROM DUAL;

    RETURN v_payload;
  END armar_payload;

  PROCEDURE sincronizar_recorrido(
    p_recorrido_id IN  NUMBER,
    p_resultado    OUT VARCHAR2,
    p_http_status  OUT NUMBER,
    p_respuesta    OUT VARCHAR2
  ) IS
    v_payload  CLOB;
    v_response CLOB;
  BEGIN
    v_payload := armar_payload(p_recorrido_id);

    APEX_WEB_SERVICE.g_request_headers.DELETE;
    APEX_WEB_SERVICE.g_request_headers(1).name := 'Content-Type';
    APEX_WEB_SERVICE.g_request_headers(1).value := 'application/json';
    APEX_WEB_SERVICE.g_request_headers(2).name := 'x-api-key';
    APEX_WEB_SERVICE.g_request_headers(2).value := c_api_key;

    v_response := APEX_WEB_SERVICE.MAKE_REST_REQUEST(
      p_url         => c_backend_url,
      p_http_method => 'POST',
      p_body        => v_payload
    );

    p_http_status := APEX_WEB_SERVICE.g_status_code;
    p_respuesta   := DBMS_LOB.SUBSTR(v_response, 4000, 1);
    p_resultado   := CASE WHEN p_http_status BETWEEN 200 AND 299 THEN 'OK' ELSE 'ERROR' END;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      p_resultado   := 'ERROR';
      p_http_status := NULL;
      p_respuesta   := 'recorrido_no_encontrado: ' || p_recorrido_id;
    WHEN OTHERS THEN
      p_resultado   := 'ERROR';
      p_http_status := NULL;
      -- SQLERRM solo trae la primera línea del stack ("ORA-29273: fallo de
      -- la solicitud HTTP" sin la causa real encadenada abajo, ej. ACL de
      -- red o wallet). FORMAT_ERROR_STACK trae el stack completo, pero con
      -- errores muy encadenados (APEX_WEB_SERVICE + UTL_HTTP + ACL) puede
      -- superar el VARCHAR2(4000) del caller y volar todo con ORA-06502 —
      -- se trunca acá para que la falla original no se pierda.
      p_respuesta   := SUBSTR(DBMS_UTILITY.FORMAT_ERROR_STACK, 1, 4000);
  END sincronizar_recorrido;

END INTEGRACION_CLOUD_API;
/
