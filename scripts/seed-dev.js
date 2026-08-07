// Seed de datos de desarrollo para poder probar la API en vivo.
// Usa el cliente de servicio (salta RLS a propósito: es un script de
// servidor sin usuario logueado, igual que documenta SupabaseService).
// Seguro de re-correr: no duplica filas si ya existen (busca antes de
// insertar, salvo la tabla `tarifas`, que es histórica por diseño y no
// tiene una fila "vigente" única que sobrescribir).
require('dotenv').config();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey || url.includes('placeholder')) {
  console.error('Falta configurar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'eliseogcr@gmail.com';

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function upsertPorFiltro(tabla, filtro, datos) {
  const { data: existente, error: buscarError } = await supabase
    .from(tabla)
    .select('id')
    .match(filtro)
    .maybeSingle();
  if (buscarError) throw buscarError;

  if (existente) return existente.id;

  const { data: creado, error: insertarError } = await supabase
    .from(tabla)
    .insert(datos)
    .select('id')
    .single();
  if (insertarError) throw insertarError;
  return creado.id;
}

async function main() {
  console.log('Sembrando datos de desarrollo...\n');

  const hotelId = await upsertPorFiltro(
    'hoteles',
    { nombre: 'Hotel Jorge Chávez' },
    { nombre: 'Hotel Jorge Chávez', cantidad_pisos: 6, moneda_default: 'PEN' },
  );
  console.log(`Hotel: ${hotelId}`);

  const turnosDef = [
    { nombre: 'Mañana', hora_inicio: '07:00', hora_fin: '15:00' },
    { nombre: 'Tarde', hora_inicio: '15:00', hora_fin: '21:00' },
    { nombre: 'Noche', hora_inicio: '21:00', hora_fin: '07:00' },
  ];
  for (const t of turnosDef) {
    const id = await upsertPorFiltro(
      'turnos',
      { hotel_id: hotelId, nombre: t.nombre },
      { hotel_id: hotelId, ...t },
    );
    console.log(`Turno ${t.nombre}: ${id}`);
  }

  // Valores de tarifa son PLACEHOLDER (PEN) — reemplazar con los reales del
  // cliente antes de producción. tiempo_limpieza_min sí son los reales que
  // ya menciona CLAUDE.md (40min matrimonial, 2h cuádruple).
  const tiposDef = [
    { nombre: 'Matrimonial', aforo_max: 2, tiempo_limpieza_min: 40, tarifa: { minimo: 30, normal: 80, booking: 90, airbnb: 85 } },
    { nombre: 'Doble', aforo_max: 2, tiempo_limpieza_min: 45, tarifa: { minimo: 35, normal: 90, booking: 100, airbnb: 95 } },
    { nombre: 'Triple', aforo_max: 3, tiempo_limpieza_min: 60, tarifa: { minimo: 45, normal: 120, booking: 130, airbnb: 125 } },
    { nombre: 'Cuádruple', aforo_max: 4, tiempo_limpieza_min: 120, tarifa: { minimo: 60, normal: 150, booking: 165, airbnb: 160 } },
  ];

  const tipoIds = [];
  for (const t of tiposDef) {
    const tipoId = await upsertPorFiltro(
      'tipos_habitacion',
      { hotel_id: hotelId, nombre: t.nombre },
      { hotel_id: hotelId, nombre: t.nombre, aforo_max: t.aforo_max, tiempo_limpieza_min: t.tiempo_limpieza_min },
    );
    tipoIds.push(tipoId);
    console.log(`Tipo de habitación ${t.nombre}: ${tipoId}`);

    const { data: tarifaExistente, error: tarifaBuscarError } = await supabase
      .from('tarifas')
      .select('id')
      .eq('tipo_hab_id', tipoId)
      .maybeSingle();
    if (tarifaBuscarError) throw tarifaBuscarError;

    if (!tarifaExistente) {
      const { error: tarifaError } = await supabase.from('tarifas').insert({
        hotel_id: hotelId,
        tipo_hab_id: tipoId,
        ...t.tarifa,
      });
      if (tarifaError) throw tarifaError;
      console.log(`  Tarifa placeholder creada para ${t.nombre} (editar antes de producción)`);
    }
  }

  // 25 habitaciones repartidas en 6 pisos, tipos en round-robin (datos de
  // prueba; la numeración/distribución real se define en la migración,
  // ver CLAUDE.md sección 5).
  for (let i = 1; i <= 25; i++) {
    const numero = 100 + i;
    const piso = ((i - 1) % 6) + 1;
    const tipoId = tipoIds[(i - 1) % tipoIds.length];
    await upsertPorFiltro(
      'habitaciones',
      { hotel_id: hotelId, hab_numero: numero },
      { hotel_id: hotelId, hab_numero: numero, piso, tipo_id: tipoId, estado: 'disponible' },
    );
  }
  console.log('25 habitaciones creadas (o ya existentes)');

  await upsertPorFiltro(
    'cocheras',
    { hotel_id: hotelId, numero: 'C1' },
    { hotel_id: hotelId, numero: 'C1', tamano: 'grande', tipo_vehiculo_permitido: 'camioneta' },
  );
  await upsertPorFiltro(
    'cocheras',
    { hotel_id: hotelId, numero: 'C2' },
    { hotel_id: hotelId, numero: 'C2', tamano: 'chica', tipo_vehiculo_permitido: 'auto' },
  );
  console.log('2 cocheras creadas (o ya existentes)');

  // Usuario admin de prueba: se crea en Supabase Auth con contraseña
  // aleatoria (se imprime al final) y confirmado sin enviar correo, más su
  // fila en personal/personal_hotel con rol admin en este hotel.
  const { data: usuariosExistentes, error: listarUsuariosError } =
    await supabase.auth.admin.listUsers();
  if (listarUsuariosError) throw listarUsuariosError;

  let authUser = usuariosExistentes.users.find((u) => u.email === ADMIN_EMAIL);
  let passwordGenerada = null;

  if (!authUser) {
    passwordGenerada = crypto.randomBytes(9).toString('base64url');
    const { data: creado, error: crearUsuarioError } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: passwordGenerada,
      email_confirm: true,
    });
    if (crearUsuarioError) throw crearUsuarioError;
    authUser = creado.user;
    console.log(`Usuario de Auth creado: ${ADMIN_EMAIL}`);
  } else {
    console.log(`Usuario de Auth ya existía: ${ADMIN_EMAIL}`);
  }

  const personalId = await upsertPorFiltro(
    'personal',
    { auth_user_id: authUser.id },
    { auth_user_id: authUser.id, nombre: 'Administrador de Prueba', usuario: 'admin.hotel', activo: true },
  );
  console.log(`Personal: ${personalId}`);

  await upsertPorFiltro(
    'personal_hotel',
    { personal_id: personalId, hotel_id: hotelId, rol: 'admin' },
    { personal_id: personalId, hotel_id: hotelId, rol: 'admin', activo: true },
  );
  console.log('Asignación personal_hotel (admin) lista');

  console.log('\nListo. Datos para probar la API:');
  console.log(`  hotelId: ${hotelId}`);
  console.log(`  login:   ${ADMIN_EMAIL}`);
  if (passwordGenerada) {
    console.log(`  password: ${passwordGenerada}  (guárdala, no se vuelve a mostrar)`);
  } else {
    console.log('  password: la que se generó la primera vez que corriste este script');
  }
}

main().catch((err) => {
  console.error('\nError al sembrar datos:', err);
  process.exit(1);
});
