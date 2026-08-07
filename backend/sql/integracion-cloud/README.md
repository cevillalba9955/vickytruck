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

## Sobre el esquema dueño (VIC — VICKYTRUCK ya no se usa)

El paquete se crea en el esquema `VIC` (`CREATE OR REPLACE PACKAGE VIC.INTEGRACION_CLOUD_API`).
El usuario `VICKYTRUCK` (que en la primera versión de esta arquitectura
conectaba el backend directo a Oracle) **se eliminó** al pasar al backend
cloud (spec 003) — ese backend ya no tiene ningún acceso a Oracle, así que
no hacía falta mantenerlo. `VIC` ya tiene los privilegios que hacían falta
antes vía GRANT cross-schema (lee sus propias vistas `V_RECORRIDOS`/
`V_PUNTOS_ENTREGA`/`V_FLETES` y escribe sobre su propia tabla
`T_PUNTOS_ENTREGA` sin necesidad de ningún GRANT adicional).

**Importa para la ACL de red (más abajo)**: con PL/SQL de "definer rights"
(el default, y no se cambió acá), el paquete ejecuta la llamada HTTP con los
privilegios de **quien lo creó** — hoy siempre `VIC`. Confirmado el
2026-08-07: la ACL para `localhost:8090` (el relay, ver abajo) está
habilitada tanto para `VIC` como para `APEX_240100`. Para volver a chequear
el owner real si el paquete se vuelve a recompilar bajo otro usuario:

```sql
SELECT owner FROM all_objects WHERE object_name = 'INTEGRACION_CLOUD_API' AND object_type = 'PACKAGE';
```

## Deploy

Con SQL*Plus o SQLcl, conectado como `VIC` (o el usuario dueño del esquema):

```bash
sqlplus vic/<password>@<host>:<port>/<service>
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
- `resultado = 'ERROR'` → `v_respuesta` trae el stack de error completo
  (todas las causas encadenadas, vía `armar_error_encadenado` /
  `UTL_CALL_STACK.ERROR_MSG` — no solo la primera línea de `SQLERRM` como en
  versiones anteriores de este package). Los más probables, de más a menos
  común:
  - **`ORA-29273: fallo de la solicitud HTTP` con `ORA-24247: acceso de red
    denegado por la lista de control de acceso (ACL)` encadenado** → el
    esquema dueño del paquete (`VIC`, ver query de arriba) no tiene ACL de
    red habilitada para el host/puerto al que apunta `c_backend_url`
    (desde Oracle 12c, toda llamada saliente de `UTL_HTTP`/`APEX_WEB_SERVICE`
    necesita una Access Control List explícita, aunque la red/firewall del
    sistema operativo sí permita la conexión). **Ya confirmado el
    2026-08-07 que `VIC` tiene ACL habilitada para `localhost:8090`** — si
    este error reaparece después de esa fecha, sospechar de un cambio en la
    ACL o del owner real del paquete, no asumir que falta desde cero. Para
    otorgarla desde cero (conectado como `SYS`, o alguien con privilegio
    sobre `DBMS_NETWORK_ACL_ADMIN`):
    ```sql
    BEGIN
      DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
        host       => 'localhost',
        lower_port => 8090,
        upper_port => 8090,
        ace        => xs$ace_type(
          privilege_list => xs$name_list('http'),
          principal_name => 'VIC',
          principal_type => xs_acl.ptype_db
        )
      );
    END;
    /
    ```
  - **`ORA-12541: TNS:no hay ningún listener`** (visto en la prueba del
    2026-08-07, recorrido 3719) → no hay nada escuchando en `localhost:8090`.
    El relay nginx local (`relay-rocky/`) no está levantado, se cayó, o
    escucha en otro puerto/interfaz. En el server Rocky:
    ```bash
    sudo systemctl status nginx
    curl -s -w '\nHTTP %{http_code}\n' http://127.0.0.1:8090/api/integracion/estado \
      -H 'x-api-key: b9gFJKRPl2eYf3SWgHDtvsV-6CIXfGHC'
    ```
    (paso 2 de [`relay-rocky/README.md`](./relay-rocky/README.md) — si el
    `curl` local ya falla, el problema es de nginx/red del server, ni
    siquiera hace falta volver a tocar Oracle todavía).
  - **Error de SSL/wallet** (`ORA-29024` u similar): solo aplica si en algún
    momento se vuelve a apuntar directo a `https://vickytruck.fly.dev` en vez
    del relay HTTP local — `APEX_WEB_SERVICE` necesitaría el wallet por
    default de la instancia APEX (`Instance Administration > Manage Instance
    > Security > Wallet`) o `p_wallet_path`/`p_wallet_pwd` explícitos.
  - `unauthorized` (401 del backend) → la API key hardcodeada en
    `c_api_key` no coincide con la configurada en el backend
    (`INTEGRACION_API_KEY`).

## Pendiente del lado Oracle para 005-chofer-estados-viaje

El backend cloud ya implementa su mitad del contrato para la nueva feature
(ver `specs/005-chofer-estados-viaje/contracts/sincronizacion-oracle-central.md`
y `research.md`, Decisiones 4-5); del lado Oracle/APEX falta:

1. ~~`armar_payload`/`sincronizar_recorrido` debe empezar a enviar, por
   punto, `cliente`/`direccion`/`rangoHorario`/`notasEntrega`/`remitoIds`~~
   — **hecho** (2026-08-07). Columnas reales confirmadas en
   `VIC.V_PUNTOS_ENTREGA`: `CLIENTE`, `DIRECCION`, `HORARIO` (texto ya
   formateado, ej. "09:00-12:00"), `NOTAS`, `REMITO_IDS` (ids numéricos
   separados por coma, ej. "1001,1002", `NULL` si no hay ninguno).
   `armar_remito_ids()` (nuevo, en `integracion_cloud_api.pkb.sql`) explota
   `REMITO_IDS` a un JSON array de strings vía `APEX_STRING.SPLIT` — nunca
   se manda la columna delimitada cruda. **No probado todavía contra Oracle
   real** (a diferencia del resto del package, que sí tiene validación
   confirmada) — antes de dar esto por cerrado, correr `sincronizar_recorrido`
   contra un recorrido de prueba con remitos y confirmar en
   `GET /api/central/recorridos/:id` que `remitoIds` llega como array.
2. **`leer_estado_puntos` debe empezar a leer también `orden`** de
   `GET /api/integracion/estado` (ya lo expone, ver
   `contracts/sincronizacion-oracle-central.md` § 2) y persistirlo en
   `V_PUNTOS_ENTREGA`/su tabla base **antes** del próximo
   `sincronizar_recorrido` de ese recorrido — si no se hace esto, un
   reordenamiento del chofer vía `IR PRIMERO` puede perderse en el primer
   push posterior a que `sincronizar` original ya viera Oracle (research.md,
   Decisión 4: el cloud protege el `orden` del chofer solo hasta que
   `GET /estado` lo sirve una vez; después de eso, un push con el orden
   viejo sí lo pisa).
3. Sin este trabajo, `IR PRIMERO` sigue funcionando de cara al chofer
   (persiste en el cloud, que es la fuente autoritativa del plano
   operativo en vivo — Principio IV), pero Oracle quedaría con una
   copia de `orden` desactualizada hasta que alguien la corrija a mano o se
   implemente este punto.

## Pendiente antes de automatizar

`c_api_key` está hardcodeada como constante en el package body — está bien
para esta primera versión manual, pero antes de atar esto a un trigger o a
un job programado conviene moverla al credential store de APEX
(`APEX_CREDENTIAL.CREATE_CREDENTIAL`) en vez de dejarla en el código fuente.

`armar_payload` manda `estado: 'activo'` hardcodeado (no `V_RECORRIDOS.ESTADO`
real) — decisión intencional (2026-08-07) para poder reactivar un recorrido
de prueba re-sincronizándolo aunque ya haya quedado `finalizado`. Efecto
colateral: este push nunca mueve un recorrido a "historial" en Central
(`listarHistorial()` filtra por `estado='finalizado'`). Revisar si hace
falta volver a leer el estado real antes de operar en serio (ver comentario
en `armar_payload`, `integracion_cloud_api.pkb.sql`).

## Dirección inversa: leer estado (Cloud -> Oracle)

`leer_estado_puntos(p_recorrido_id)` hace el camino inverso a
`sincronizar_recorrido`: llama a `GET /api/integracion/estado?recorridoId=<id>`
y escribe sobre `T_PUNTOS_ENTREGA` (propia del esquema `VIC`, dueño del
paquete — sin GRANT cross-schema que otorgar) el `estado` de cada punto y la
ubicación/fechahora que capturó el celular del chofer al marcar arribo y
descarga (`ARRIBO_EN`/`ARRIBO_LAT`/`ARRIBO_LON`,
`DESCARGA_EN`/`DESCARGA_LAT`/`DESCARGA_LON` — mismas columnas que ya usa
`RECORRIDO_API`, ver `backend/sql/recorrido_api.pkb.sql`).

**No validado todavía**: si `ARRIBO_EN`/`DESCARGA_EN` es `TIMESTAMP` sin zona
horaria (como asume `RECORRIDO_API`, que las llena con `SYSTIMESTAMP` — hora
local del server Oracle), mientras que acá se parsean como UTC (el cloud
manda todo en UTC vía `Date.toISOString()`). Si el server Oracle no corre en
UTC, los valores escritos por este camino van a quedar corridos respecto de
los que en algún momento escriba `RECORRIDO_API` directo. Confirmar
`DBTIMEZONE`/el timezone del server antes de usar estas columnas para
reportes o auditoría.

### Probar

```sql
SET SERVEROUTPUT ON

DECLARE
  v_resultado    VARCHAR2(20);
  v_http_status  NUMBER;
  v_respuesta    VARCHAR2(4000);
BEGIN
  INTEGRACION_CLOUD_API.leer_estado_puntos(
    p_recorrido_id => 3716,  -- mismo ID que se usó al pushear con sincronizar_recorrido
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

- `resultado = 'OK'` → `v_respuesta` dice cuántos puntos se actualizaron
  (`puntos_actualizados: N`). Confirmar con
  `SELECT id, estado, arribo_en, arribo_lat, arribo_lon, descarga_en, descarga_lat, descarga_lon FROM VIC.T_PUNTOS_ENTREGA WHERE flt_viaje_id = 3716;`
- `resultado = 'NOT_FOUND'` → no hay ningún recorrido con ese ID en el store
  cloud (nunca se pusheó, o el ID no coincide).
- `resultado = 'ERROR'` → mismos motivos posibles que `sincronizar_recorrido`
  (ACL, wallet, `unauthorized`). `v_respuesta` trae el stack completo (ver
  `armar_error_encadenado` en la sección de arriba).
