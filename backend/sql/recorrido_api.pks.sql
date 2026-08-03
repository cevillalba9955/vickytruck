-- Package SPEC: RECORRIDO_API
-- Contrato de escritura para el backend de la app del chofer
-- (feature 001-chofer-recorrido). Acordado con el backend Node el 2026-08-03.
--
-- Las LECTURAS del backend siguen yendo por las vistas V_RECORRIDOS /
-- V_PUNTOS_ENTREGA (ya funcionando). Este package es la ÚNICA vía de
-- escritura sobre los puntos de entrega: las vistas generadas no son
-- actualizables, así que toda transición de estado pasa por acá.
--
-- Semántica de p_resultado (ver research.md §6 de la feature, sobre
-- idempotencia ante reintentos offline del chofer):
--   'OK'            Transición aplicada AHORA, o repetición idempotente de una
--                    transición ya aplicada antes (mismo punto, mismo evento).
--                    p_estado / p_evento_en reflejan el estado actual del punto.
--   'INVALID_TOKEN'  No existe un recorrido activo con ese token.
--   'NOT_FOUND'      El token es válido pero el punto no pertenece a ese
--                    recorrido (o no existe).
--   'CONFLICT'       El punto existe pero está en un estado que no admite la
--                    transición pedida (ej. descarga sin arribo previo, o
--                    arribo sobre un punto ya completado). p_estado devuelve
--                    el estado real actual para que el backend resincronice.
--
-- El package debe resolver token -> recorrido y validar que punto_id
-- pertenece a ese recorrido de forma atómica (misma transacción que el
-- UPDATE), para evitar carreras entre validar y escribir.

CREATE OR REPLACE PACKAGE VIC.RECORRIDO_API AS

  PROCEDURE marcar_arribo(
    p_token      IN  VARCHAR2,
    p_punto_id   IN  NUMBER,
    p_lat        IN  NUMBER DEFAULT NULL,
    p_lon        IN  NUMBER DEFAULT NULL,
    p_resultado  OUT VARCHAR2,
    p_estado     OUT VARCHAR2,
    p_evento_en  OUT TIMESTAMP
  );

  PROCEDURE marcar_descarga(
    p_token      IN  VARCHAR2,
    p_punto_id   IN  NUMBER,
    p_lat        IN  NUMBER DEFAULT NULL,
    p_lon        IN  NUMBER DEFAULT NULL,
    p_resultado  OUT VARCHAR2,
    p_estado     OUT VARCHAR2,
    p_evento_en  OUT TIMESTAMP
  );

END RECORRIDO_API;
/
