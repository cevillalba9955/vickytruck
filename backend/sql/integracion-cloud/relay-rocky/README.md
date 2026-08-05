# Relay nginx (Rocky) — Oracle sin salida directa a internet

Oracle (esquema `VIC`) no logra pegarle a `https://vickytruck.fly.dev`
directo: siempre `ORA-29273` / `ORA-24247`, aunque la ACL de red esté bien
configurada (host, puerto y privilegios `http`/`connect`/`resolve`
verificados contra `dba_network_acls`/`dba_network_acl_privileges`). Todo
indica una política de red restrictiva a nivel Oracle en este server, no un
problema de permisos puntual.

Este mismo server (Rocky, `rocky8-victoriacor-com-ar`) **sí** tiene salida
real a internet — Postfix ya relay-ea mail hacia `smtp.gmail.com` sin
problema. La solución: un relay nginx local. Oracle le pega por `localhost`
(mismo patrón que ya usa para mail por `localhost:25`), y nginx —un proceso
normal del sistema operativo, no sujeto a la ACL de red de Oracle— hace el
salto real a `vickytruck.fly.dev`.

```
Oracle (VIC) --localhost:8090--> nginx --https://--> vickytruck.fly.dev
```

## 1. Instalar y configurar nginx

Si no está instalado:

```bash
sudo dnf install nginx
```

Copiar [`vickytruck-relay.conf`](./vickytruck-relay.conf) a
`/etc/nginx/conf.d/vickytruck-relay.conf`, después:

```bash
sudo nginx -t                        # valida sintaxis
sudo systemctl enable --now nginx    # si nginx no estaba corriendo todavía
sudo systemctl reload nginx          # si ya estaba corriendo
```

## 2. Probar el relay desde el propio server (sin Oracle todavía)

```bash
curl -s -w '\nHTTP %{http_code}\n' http://127.0.0.1:8090/api/integracion/estado \
  -H 'x-api-key: b9gFJKRPl2eYf3SWgHDtvsV-6CIXfGHC'
```

Debería devolver `200` con el JSON de estado (o `{"recorridos":[]}` si no
hay nada cargado todavía) — igual que pegándole directo a
`https://vickytruck.fly.dev/api/integracion/estado`. Si esto falla, el
problema es de nginx/red del server, todavía no de Oracle — no tiene sentido
seguir a la ACL de Oracle hasta que este paso ande.

## 3. Habilitar la ACL de Oracle para localhost:8090

Aunque sea loopback, Oracle igual exige una ACL explícita por host+puerto
(mismo motivo por el que existe la ACL de `localhost:25` para el mail).
Conectado como `SYS`:

```sql
BEGIN
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host       => 'localhost',
    lower_port => 8090,
    upper_port => 8090,
    ace        => xs$ace_type(
      privilege_list => xs$name_list('http', 'connect', 'resolve'),
      principal_name => 'VIC',
      principal_type => xs_acl.ptype_db
    )
  );
END;
/
```

(Si tira `ORA-24244` porque `localhost` ya tiene otra ACL asignada a algún
rango de puerto que pisa a este, usar `DBMS_NETWORK_ACL_ADMIN.ADD_PRIVILEGE`
sobre el nombre de esa ACL existente en vez de `APPEND_HOST_ACE`.)

`APEX_WEB_SERVICE.MAKE_REST_REQUEST` corre como `APEX_240100` (definer
rights del paquete de APEX), así que el privilegio también hay que
otorgarlo ahí, no solo a `VIC` — mismo patrón que ya tenía la ACL de AFIP
(`arca_acl.xml`, otorgada a `APEX_240100`). Usando el nombre de ACL que
Oracle generó para el paso anterior (`SELECT acl FROM dba_network_acls
WHERE host = 'localhost' AND lower_port = 8090`):

```sql
BEGIN
  DBMS_NETWORK_ACL_ADMIN.ADD_PRIVILEGE(
    acl       => '<nombre_de_la_ACL_de_arriba>',
    principal => 'APEX_240100',
    is_grant  => TRUE,
    privilege => 'http'
  );
  DBMS_NETWORK_ACL_ADMIN.ADD_PRIVILEGE(
    acl       => '<nombre_de_la_ACL_de_arriba>',
    principal => 'APEX_240100',
    is_grant  => TRUE,
    privilege => 'connect'
  );
  COMMIT;
END;
/
```

**Importante — `localhost`, no `127.0.0.1`**: la ACL matchea por el string
literal del host. Si en algún momento de las pruebas usás
`http://127.0.0.1:8090/...`, la ACL creada para `host => 'localhost'` no
aplica y Oracle sigue tirando `ORA-24247` aunque todo lo demás esté bien
configurado — usar siempre `localhost` en la URL, coherente con la ACL.

## 4. Apuntar el paquete Oracle al relay

`c_backend_url` en [`../integracion_cloud_api.pkb.sql`](../integracion_cloud_api.pkb.sql)
ya apunta al relay local:

```sql
c_backend_url CONSTANT VARCHAR2(200) := 'http://localhost:8090/api/integracion/recorridos';
```

Repetir la prueba de siempre (`INTEGRACION_CLOUD_API.sincronizar_recorrido`)
y confirmar contra el backend real (`GET /api/central/recorridos/activos` o
Central en el navegador) que el recorrido efectivamente llegó.
