create or replace PACKAGE BODY     INTEGRACION_CLOUD_API AS

  -- Vía relay nginx local (ver relay-rocky/README.md): esta Oracle no logra
  -- salir directo a internet (ORA-29273/ORA-24247 persistente pese a ACL
  -- correcta), así que le pega a nginx en el mismo server por loopback, y
  -- nginx hace el salto real a https://vickytruck.fly.dev. Si en algún
  -- momento se habilita salida directa, cambiar esto de vuelta a
  -- 'https://vickytruck.fly.dev/api/integracion/recorridos'.
  --
  -- OJO: 'localhost', no '127.0.0.1' — la ACL de red de Oracle matchea por
  -- el string literal del host, no son equivalentes para esa comparación
  -- aunque resuelvan a la misma IP (esto costó varias vueltas de ORA-24247
  -- "acceso de red denegado" con la ACL aparentemente bien configurada).
  c_backend_url        CONSTANT VARCHAR2(200) := 'http://localhost:8090/api/integracion/recorridos';
  c_backend_url_estado CONSTANT VARCHAR2(200) := 'http://localhost:8090/api/integracion/estado';
  c_api_key            CONSTANT VARCHAR2(100) := 'b9gFJKRPl2eYf3SWgHDtvsV-6CIXfGHC';

  -- Mascara de los timestamps que manda el backend cloud: siempre
  -- Date.prototype.toISOString() de JS, que SIEMPRE incluye milisegundos
  -- (a diferencia del 'updatedAt' que arma armar_payload más abajo, que sale
  -- de Oracle sin milisegundos) — sin el .FF3, TO_TIMESTAMP tira
  -- ORA-01821 ante el primer punto con arriboEn/descargaEn seteado.
  c_mascara_iso_utc CONSTANT VARCHAR2(40) := 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"';

  -- Arma el stack de error completo (ORA-29273 + la causa real encadenada
  -- detrás, ej. ORA-24247 de ACL, ORA-12541 de listener caído, timeout de
  -- red) usando UTL_CALL_STACK.ERROR_MSG frame por frame, en vez de
  -- DBMS_UTILITY.FORMAT_ERROR_STACK (esa ya se había descartado por tirar su
  -- propio ORA-06502 con stacks largos).
  --
  -- CONFIRMADO CONTRA ORACLE REAL (2026-08-07): la primera versión de esta
  -- función igual explotaba con ORA-06502 — armaba TODO el stack en un
  -- v_stack VARCHAR2(32000) sin chequear el largo en cada vuelta, y con la
  -- cadena de frames internos de APEX_240100.WWV_FLOW_WEB_SERVICES* (varios,
  -- largos) se pasó igual. Esta versión corta ANTES de concatenar cada frame
  -- (chequea el largo previo a agregar, no después) y limita cada frame
  -- individual a 500 caracteres — nunca puede desbordar el buffer, aunque el
  -- stack real tenga decenas de frames internos.
  FUNCTION armar_error_encadenado RETURN VARCHAR2 IS
    c_max_largo CONSTANT PLS_INTEGER := 3900; -- deja margen bajo el límite de p_respuesta (4000)
    v_stack     VARCHAR2(4000);
    v_frame     VARCHAR2(500);
  BEGIN
    FOR i IN 1 .. UTL_CALL_STACK.ERROR_DEPTH LOOP
      v_frame := SUBSTR(UTL_CALL_STACK.ERROR_MSG(i), 1, 500);
      EXIT WHEN LENGTH(v_stack) + LENGTH(v_frame) + 4 > c_max_largo;
      v_stack := v_stack || CASE WHEN v_stack IS NOT NULL THEN ' <- ' END || v_frame;
    END LOOP;
    RETURN NVL(v_stack, SQLERRM);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN SQLERRM;
  END armar_error_encadenado;

  -- Convierte la columna delimitada REMITO_IDS ("1001,1002", NULL si no hay
  -- ninguno) en un JSON array de strings ('["1001","1002"]', '[]' si NULL) —
  -- 005-chofer-estados-viaje, FR-001/FR-004a. Requiere APEX_STRING (paquete
  -- estándar de APEX, ya asumido disponible por este package vía
  -- APEX_WEB_SERVICE más abajo).
  FUNCTION armar_remito_ids(p_remito_ids IN VARCHAR2) RETURN CLOB IS
    v_json CLOB;
  BEGIN
    IF p_remito_ids IS NULL THEN
      RETURN TO_CLOB('[]');
    END IF;

    SELECT JSON_ARRAYAGG(TRIM(COLUMN_VALUE) RETURNING CLOB)
      INTO v_json
      FROM TABLE(APEX_STRING.SPLIT(p_remito_ids, ','));

    RETURN NVL(v_json, TO_CLOB('[]'));
  END armar_remito_ids;

  FUNCTION armar_payload(p_recorrido_id IN NUMBER) RETURN CLOB IS
    v_id            NUMBER;
    v_token         VARCHAR2(64);
    v_estado        VARCHAR2(40);
    v_flete_id      NUMBER;
    v_flete_nombre  VARCHAR2(200);
    v_chofer_id      NUMBER;
    v_chofer_nombre  VARCHAR2(200);
    v_puntos        CLOB;
    v_recorrido     CLOB;
    v_payload       CLOB;
  BEGIN
    SELECT r.id, r.token,'activo' estado, r.flete_id, f.nombre, R.CHOFER_ID, CH.TITLE CHOFER
      INTO v_id, v_token, v_estado, v_flete_id, v_flete_nombre, v_chofer_id, v_chofer_nombre
      FROM VIC.V_RECORRIDOS r
      LEFT JOIN DB_ENTIDADES.V_FLETES f ON f.id = r.flete_id
      LEFT JOIN DB_ENTIDADES.V_CHOFERES CH ON CH.ID = R.CHOFER_ID
     WHERE r.id = p_recorrido_id;

    SELECT JSON_ARRAYAGG(
             JSON_OBJECT(
               'id' VALUE TO_CHAR(p.id),
               'orden' VALUE p.orden,
               'estado' VALUE p.estado,
               'lat' VALUE p.latitud,
               'lon' VALUE p.longitud,
               'cliente' VALUE p.cliente,
               'direccion' VALUE p.direccion,
               'rangoHorario' VALUE p.horario,
               'notasEntrega' VALUE p.notas,
               'remitoIds' VALUE armar_remito_ids(p.remito_ids) FORMAT JSON
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
             'choferId' VALUE TO_CHAR(v_chofer_id),
             'choferNombre' VALUE v_chofer_nombre,
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
      -- Stack completo (causa real encadenada, no solo la primera línea),
      -- ver armar_error_encadenado arriba.
      p_respuesta   := armar_error_encadenado;
  END sincronizar_recorrido;

  -- Trae de GET /api/integracion/estado?recorridoId=<id> el estado actual de
  -- cada punto (estado + arriboEn/arriboLat/arriboLon +
  -- descargaEn/descargaLat/descargaLon, ver serializarEstado en
  -- backend/src/routes/integracion.js) y lo escribe sobre
  -- T_PUNTOS_ENTREGA (propia del esquema VIC, dueño de este paquete — sin
  -- privilegio cross-schema que otorgar). El cloud es la fuente de verdad de
  -- estos eventos mientras el recorrido está en curso (el chofer nunca
  -- escribe directo a Oracle en esta arquitectura, ver README.md de esta
  -- carpeta) — por eso pisa sin comparar versiones, siempre gana el último
  -- estado leído.
  --
  -- No validado tampoco: si ARRIBO_EN/DESCARGA_EN en T_PUNTOS_ENTREGA es
  -- TIMESTAMP a secas (sin zona horaria) igual que asume RECORRIDO_API
  -- (que las llena con SYSTIMESTAMP, hora local del server Oracle) mientras
  -- que acá se parsean como UTC (el cloud manda todo en UTC) — si el server
  -- Oracle no corre en UTC, los valores que entran por este camino van a
  -- quedar unas horas corridos respecto de los que entran por
  -- RECORRIDO_API. Revisar DBTIMEZONE/el timezone del server antes de
  -- confiar en esta columna para reportes.
  PROCEDURE leer_estado_puntos(
    p_recorrido_id IN  NUMBER,
    p_resultado    OUT VARCHAR2,
    p_http_status  OUT NUMBER,
    p_respuesta    OUT VARCHAR2
  ) IS
    v_response      CLOB;
    v_actualizados  PLS_INTEGER := 0;
  BEGIN
    APEX_WEB_SERVICE.g_request_headers.DELETE;
    APEX_WEB_SERVICE.g_request_headers(1).name := 'x-api-key';
    APEX_WEB_SERVICE.g_request_headers(1).value := c_api_key;

    v_response := APEX_WEB_SERVICE.MAKE_REST_REQUEST(
      p_url         => c_backend_url_estado || '?recorridoId=' || TO_CHAR(p_recorrido_id),
      p_http_method => 'GET'
    );

    p_http_status := APEX_WEB_SERVICE.g_status_code;

    IF p_http_status = 404 THEN
      p_resultado := 'NOT_FOUND';
      p_respuesta := DBMS_LOB.SUBSTR(v_response, 4000, 1);
      RETURN;
    END IF;

    IF p_http_status NOT BETWEEN 200 AND 299 THEN
      p_resultado := 'ERROR';
      p_respuesta := DBMS_LOB.SUBSTR(v_response, 4000, 1);
      RETURN;
    END IF;

    FOR rec IN (
      SELECT jt.punto_id, jt.estado, jt.arribo_en, jt.arribo_lat, jt.arribo_lon,
             jt.descarga_en, jt.descarga_lat, jt.descarga_lon
        FROM JSON_TABLE(
               v_response, '$.recorridos[0].puntos[*]'
               COLUMNS (
                 punto_id     NUMBER        PATH '$.id',
                 estado       VARCHAR2(40)  PATH '$.estado',
                 arribo_en    VARCHAR2(40)  PATH '$.arriboEn',
                 arribo_lat   NUMBER        PATH '$.arriboLat',
                 arribo_lon   NUMBER        PATH '$.arriboLon',
                 descarga_en  VARCHAR2(40)  PATH '$.descargaEn',
                 descarga_lat NUMBER        PATH '$.descargaLat',
                 descarga_lon NUMBER        PATH '$.descargaLon'
               )
             ) jt
    ) LOOP
      UPDATE T_PUNTOS_ENTREGA
         SET estado       = rec.estado,
             arribo_en    = CASE WHEN rec.arribo_en IS NOT NULL
                                  THEN TO_TIMESTAMP(rec.arribo_en, c_mascara_iso_utc) END,
             arribo_lat   = rec.arribo_lat,
             arribo_lon   = rec.arribo_lon,
             descarga_en  = CASE WHEN rec.descarga_en IS NOT NULL
                                  THEN TO_TIMESTAMP(rec.descarga_en, c_mascara_iso_utc) END,
             descarga_lat = rec.descarga_lat,
             descarga_lon = rec.descarga_lon
       WHERE id = rec.punto_id
         AND flt_viaje_id = p_recorrido_id;

      v_actualizados := v_actualizados + SQL%ROWCOUNT;
    END LOOP;

    COMMIT;
    p_resultado := 'OK';
    p_respuesta := 'puntos_actualizados: ' || v_actualizados;
  EXCEPTION
    WHEN OTHERS THEN
      ROLLBACK;
      p_resultado   := 'ERROR';
      p_http_status := NULL;
      -- Stack completo (ACL, ORA-01031 de privilegio faltante en el UPDATE,
      -- etc.), ver armar_error_encadenado arriba.
      p_respuesta   := armar_error_encadenado;
  END leer_estado_puntos;

END INTEGRACION_CLOUD_API;