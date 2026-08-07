# Sistema de Gestión Hotelera — Backend

Backend multi-hotel (Hotel Jorge Chávez es el primer cliente). NestJS + TypeScript + Supabase (Postgres + Auth + RLS).

## Estructura

```
sql/schema.sql              -> Ejecutar en el SQL Editor de Supabase (crea las 25 tablas + RLS)
src/common/supabase/        -> Cliente de Supabase (por-request y service-role)
src/common/guards/          -> AuthGuard (valida sesión) + RolesGuard (valida rol por hotel)
src/habitaciones/           -> Dashboard de habitaciones + motor de disponibilidad
```

## Cómo funciona la seguridad (importante)

1. El frontend hace login contra Supabase Auth y obtiene un `access_token`.
2. Cada request al backend lleva `Authorization: Bearer <access_token>`.
3. `AuthGuard` valida ese token contra Supabase, carga la fila de `personal`
   correspondiente y sus asignaciones (`personal_hotel`: en qué hoteles
   trabaja y con qué rol).
4. `RolesGuard` verifica, endpoint por endpoint, que el usuario tenga el
   rol requerido **en el hotel de la URL** (`/hoteles/:hotelId/...`).
5. Los servicios usan `supabase.getClientForRequest(user.accessToken)` —
   es decir, la consulta a la base la hace el propio usuario, no un usuario
   "admin" del backend. Row Level Security en la base es la última línea
   de defensa: aunque el código tuviera un bug, la base nunca devuelve
   datos de un hotel al que el usuario no está asignado.

## Primeros pasos

1. Crear un proyecto en supabase.com.
2. Pegar `sql/schema.sql` en el SQL Editor y ejecutarlo.
3. Copiar `.env.example` a `.env` y completar con las credenciales del
   proyecto (Settings -> API).
4. `npm install`
5. `npm run start:dev`

## Módulo implementado en esta primera entrega

**Habitaciones + motor de disponibilidad**
- `GET /hoteles/:hotelId/habitaciones` — dashboard con el semáforo de
  estados y la próxima reserva de cada habitación (para el badge que
  pidió el cliente).
- `POST /hoteles/:hotelId/habitaciones/disponibilidad` — valida si un
  rango de fechas se puede reservar/alquilar. Bloquea duro si:
  - Hay solapamiento con otra reserva confirmada.
  - No queda margen de limpieza suficiente (según `tiempo_limpieza_min`
    del tipo de habitación) antes o después de otra reserva.

## Siguiente iteración sugerida

- `ReservasModule` (crear reserva + N habitaciones, aplicar tarifas,
  descuento_total, cotización -> reserva editable).
- `EstadiasModule` (check-in/out, libro de `movimientos_cuenta`).
- `CajaModule` (apertura/cierre de turno, herencia de saldo, liquidación).
- `TareasHkModule` (cola de limpieza/mantenimiento con prioridad).
- `ImportacionesCanalModule` (parser de correos Booking/Airbnb).
