# Runbook de emergencia: migrar a un proyecto nuevo de Supabase

Este documento existe para no tener que improvisar bajo presión si
Supabase vuelve a bloquear el proyecto por cuota (como pasó el 21 de
octubre de 2026) y no hay presupuesto para subir de plan. Ya lo hicimos
una vez en vivo — esto deja los pasos escritos para la próxima.

**Cuándo usar esto:** el dashboard de Supabase muestra "Services
restricted" / login falla con `exceed_egress_quota` (u otra violación de
cuota) y no se puede o no se quiere pagar para reactivarlo ya mismo.

## 0. Lo que ya sabemos que funciona

- **El SQL Editor del proyecto sigue funcionando aunque el proyecto esté
  restringido** (confirmado en vivo) — Supabase lo dice explícito: "You
  continue to have full access to your database through the dashboard
  while other services are restricted." Eso significa que SÍ se puede
  sacar la data del proyecto viejo aunque el login de la app esté caído.
- **La cuota es por ORGANIZACIÓN, no por proyecto** — crear un proyecto
  nuevo dentro de la misma organización restringida NO sirve, nace
  bloqueado también. Hay que crear una **organización nueva**.
- El plan Free permite 2 proyectos por organización, así que crear una
  organización nueva + un proyecto nuevo adentro no cuesta nada.

## 1. Crear la organización y el proyecto nuevos

1. En el dashboard de Supabase, clic en el nombre de la organización
   actual (arriba a la izquierda) → **"New organization"**.
2. Nómbrala (ej. "Hotel Jorge Chavez 2") → plan **Free**.
3. Dentro de esa organización nueva, **"New project"** → nómbralo,
   elige una contraseña de base de datos (apúntala en un lugar seguro),
   misma región que el proyecto viejo si se puede (South America / São
   Paulo) → plan **Free**.
4. Espera 1-2 min a que termine de aprovisionarse.

## 2. Aplicar el schema al proyecto nuevo

`sql/schema.sql` en este repo es la fuente de verdad, mantenida al día
(incluye todas las migraciones aplicadas hasta ahora). En el **SQL
Editor del proyecto NUEVO**, pega el contenido completo de
`sql/schema.sql` y ejecútalo una sola vez. Esto crea las ~28 tablas, RLS,
funciones e índices desde cero, sin datos.

## 3. Migrar la data real (solo el schema `public`)

**Importante:** NO se migran los schemas `auth`, `storage`, `realtime`,
etc. — esos los administra Supabase internamente y el proyecto nuevo ya
los trae listos y vacíos. Solo se copia `public` (las tablas del
negocio: hoteles, habitaciones, reservas, huéspedes, movimientos_cuenta,
etc.).

Esto requiere `pg_dump`/`psql` (herramientas de línea de comandos de
Postgres) instaladas en una computadora con acceso a internet normal
(no funciona desde este entorno de Claude Code — el proxy de salida no
permite conexiones directas a Postgres de terceros).

1. Sacar las connection strings de **ambos** proyectos: en cada uno,
   Settings → Database → "Connection string" (formato URI, conexión
   directa, no el pooler).
2. En una terminal, con `pg_dump` instalado:

   ```bash
   pg_dump "CONNECTION_STRING_DEL_PROYECTO_VIEJO" \
     --schema=public --no-owner --no-acl --data-only \
     -f backup_data.sql

   psql "CONNECTION_STRING_DEL_PROYECTO_NUEVO" -f backup_data.sql
   ```

   `--data-only` porque el schema ya se creó en el paso 2 con
   `schema.sql` — esto solo copia las filas.
3. Si algún INSERT falla por una foreign key o un trigger (ej. las
   columnas `tiene_foto1`/`tiene_foto2`, que son `GENERATED`, no
   aceptan que se les inserte un valor a mano), revisar el mensaje de
   error puntual — son casos aislados, no se recomienda ignorar los
   errores en bloque.

## 4. Recrear el acceso del personal (usuarios de login)

Las cuentas de acceso (`auth.users`, que maneja Supabase Auth) **no se
copian** con el paso anterior (solo se copió `public`). Hay que
recrearlas a mano, una por una:

1. En el **proyecto viejo**, correr en el SQL Editor:

   ```sql
   select p.id, p.nombre, p.usuario, u.email
   from personal p
   join auth.users u on u.id = p.auth_user_id
   where p.activo = true;
   ```

   Esto da la lista de quién necesita cuenta nueva y con qué correo.

2. En el **proyecto nuevo**, Authentication → Users → "Add user", uno
   por cada fila de la lista de arriba, mismo correo, contraseña
   temporal (que cada quien cambie al entrar).
3. Por cada usuario creado, copiar su nuevo `id` (UUID) y correr en el
   SQL Editor del proyecto nuevo:

   ```sql
   update personal set auth_user_id = 'NUEVO_UUID_DE_AUTH_USERS'
   where usuario = 'USUARIO_DE_ESA_PERSONA';
   ```

## 5. Apuntar el sistema al proyecto nuevo

Dos lugares, ambos necesitan **las credenciales del proyecto nuevo**
(Settings → API del proyecto nuevo: Project URL, `anon` key, `service_role`
key):

- **Render** (backend) → Environment → actualizar:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  → guardar (Render redespliega solo).
- **Vercel** (frontend) → Settings → Environment Variables → actualizar:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  → hay que forzar un redeploy (Vercel no redespliega solo al cambiar
  una env var).

## 6. Verificar antes de dar la migración por terminada

- [ ] Login funciona con una cuenta recreada.
- [ ] Habitaciones carga con la data real (números de habitación, tipos,
      estados correctos).
- [ ] Se puede hacer un check-in de prueba y se ve reflejado.
- [ ] Caja carga el saldo correcto de la última sesión migrada.
- [ ] Reservas/Cotizaciones muestran historial real, no vacío.

## 7. Después de confirmar que todo funciona

- Cambiar la contraseña de la base de datos del **proyecto viejo**
  (Settings → Database → "Reset database password") — se compartió en
  la connection string durante la migración, no debe quedar vigente.
- El proyecto viejo se puede dejar pausado o eliminar más adelante, sin
  apuro (no genera costo en el plan Free).
