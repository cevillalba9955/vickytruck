# Sync Oracle -> Cloud (`INTEGRACION_CLOUD_API`)

Arma el payload de un recorrido (con sus puntos de entrega) y lo empuja al
backend cloud vía `POST /api/integracion/recorridos`. Ver el contrato exacto
del payload en [`specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md`](../../../specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md).

Primera versión: sincronización **manual**, un recorrido por vez — sin
trigger ni job automático todavía. Sirve para validar que el POST en sí
funciona end-to-end contra el backend real (`https://vickytruck.fly.dev`)
antes de decidir cómo se dispara solo.

> **Estado real (esta sesión): funcionando, vía relay nginx local** —
> Oracle no logró salir directo a internet hacia `vickytruck.fly.dev` (ACL
> con `http`/`connect`/`resolve` sobre el host/puerto correcto, sin éxito).
> La solución es un **relay nginx local** en el mismo server Rocky — ver
> [`relay-rocky/README.md`](./relay-rocky/README.md). `c_backend_url` del
> package apunta al relay (`http://localhost:8090/...`).
>
> **Ojo con `localhost` vs `127.0.0.1`**: la ACL de red de Oracle matchea
> por el string literal del host — no son equivalentes para esa
> comparación aunque resuelvan a la misma IP. La ACL para el relay se creó
> para `localhost`, así que la URL también tiene que decir `localhost`
> (no la IP), o Oracle sigue tirando `ORA-24247` aunque la ACL "esté bien".

## Sobre el esquema dueño (VIC vs VICKYTRUCK)

El usuario `VICKYTRUCK` (el que conecta el backend) no tiene privilegio
`CREATE` en el esquema `VIC` (da `ORA-01031: privilegios insuficientes`),
solo `SELECT` sobre sus vistas — igual que ya usa el backend Node hoy. El
paquete lee `VIC.V_RECORRIDOS`, `VIC.V_PUNTOS_ENTREGA` y `VIC.V_FLETES` de
forma cross-schema (mismas vistas ya validadas en `recorrido_api.pkb.sql`).

**Importa para la ACL de red (más abajo)**: con PL/SQL de "definer rights"
(el default, y no se cambió acá), el paquete ejecuta la llamada HTTP con los
privilegios de **quien lo creó**, no de quien lo invoca. Si lo desplegaste
conectado como `VIC`, la ACL tiene que estar otorgada a `VIC`; si lo
desplegaste como `VICKYTRUCK`, a `VICKYTRUCK`. Para confirmar cuál es en tu
caso:

```sql
SELECT owner FROM all_objects WHERE object_name = 'INTEGRACION_CLOUD_API' AND object_type = 'PACKAGE';
```

## Deploy

Con SQL*Plus o SQLcl, conectado como `VICKYTRUCK` (mismo usuario del
backend):

```bash
sqlplus vickytruck/<password>@<host>:<port>/<service>
```

```sql
@integracion_cloud_api.pks.sql
@integracion_cloud_api.pkb.sql
```

Revisar que ambos compilen sin errores (`SHOW ERRORS` si algo falla).

## Probar

```sql
SET SERVEROUTPUT ON

DECLARE
  v_resultado    VARCHAR2(20);
  v_http_status  NUMBER;
  v_respuesta    VARCHAR2(4000);
BEGIN
  INTEGRACION_CLOUD_API.sincronizar_recorrido(
    p_recorrido_id => 3716,  -- reemplazar por un ID de recorrido real
    p_resultado    => v_resultado,
    p_http_status  => v_http_status,
    p_respuesta    => v_respuesta
  );
  DBMS_OUTPUT.PUT_LINE('resultado: ' || v_resultado);
  DBMS_OUTPUT.PUT_LINE('http_status: ' || v_http_status);
  DBMS_OUTPUT.PUT_LINE('respuesta: ' || v_respuesta);
END;
/
```

- `resultado = 'OK'` (`http_status` 200) → confirmar en
  `https://vickytruck.fly.dev/api/central/recorridos/activos` (o en
  `https://vickytruck-central.cevillalba.workers.dev`) que el recorrido
  aparece con el nombre de flete correcto.
- `resultado = 'ERROR'` → `v_respuesta` trae el motivo (stack completo vía
  `DBMS_UTILITY.FORMAT_ERROR_STACK`, no solo la primera línea). Los más
  probables, de más a menos común:
  - **`ORA-29273: fallo de la solicitud HTTP` con `ORA-24247: acceso de red
    denegado por la lista de control de acceso (ACL)` encadenado** → el
    esquema dueño del paquete (ver query de arriba) no tiene ACL de red
    habilitada para salir por HTTPS hacia `vickytruck.fly.dev` (desde Oracle
    12c, toda llamada saliente de `UTL_HTTP`/`APEX_WEB_SERVICE` necesita una
    Access Control List explícita, aunque la red/firewall del sistema
    operativo sí permita la conexión). Se soluciona una sola vez, conectado
    como `SYS` (o un usuario con privilegio sobre `DBMS_NETWORK_ACL_ADMIN` —
    ni `VIC` ni `VICKYTRUCK` pueden otorgárselo a sí mismos). **Ajustar
    `principal_name` al esquema dueño real** (confirmado con la query de
    arriba — en la prueba de esta sesión fue `VIC`):
    ```sql
    BEGIN
      DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
        host       => 'vickytruck.fly.dev',
        lower_port => 443,
        upper_port => 443,
        ace        => xs$ace_type(
          privilege_list => xs$name_list('http'),
          principal_name => 'VIC',  -- o 'VICKYTRUCK', según a quién dio ORA-24247
          principal_type => xs_acl.ptype_db
        )
      );
    END;
    /
    ```
    Después de correr esto, volver a probar `sincronizar_recorrido` sin
    cambiar nada más.
  - **Error de red/DNS/timeout** (si el error es de conexión, no de ACL):
    esta Oracle on-prem no tiene salida a internet hacia
    `vickytruck.fly.dev` — hay que revisar el firewall/proxy de salida de
    esa red.
  - **Error de SSL/wallet** (`ORA-29024` u similar): `APEX_WEB_SERVICE` no
    puede validar el certificado TLS del backend — normalmente hace falta
    configurar el wallet por default de la instancia APEX (`Instance
    Administration > Manage Instance > Security > Wallet`) o pasar
    `p_wallet_path`/`p_wallet_pwd` explícitos en la llamada a
    `MAKE_REST_REQUEST`.
  - `unauthorized` (401 del backend) → la API key hardcodeada en
    `c_api_key` no coincide con la configurada en el backend
    (`INTEGRACION_API_KEY`).

## Pendiente antes de automatizar

`c_api_key` está hardcodeada como constante en el package body — está bien
para esta primera versión manual, pero antes de atar esto a un trigger o a
un job programado conviene moverla al credential store de APEX
(`APEX_CREDENTIAL.CREATE_CREDENTIAL`) en vez de dejarla en el código fuente.
