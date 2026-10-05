import { supabase } from './supabase';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Las búsquedas/altas de huésped (lib/huespedes.ts) van directo contra
// Supabase desde el frontend, no contra este backend -- el error que lanzan
// es un PostgrestError (ej. violación de la unique (hotel_id, tipo_doc,
// nro_doc) de huespedes al reusar un documento provisional repetido), que
// es un objeto plano con `message` pero NO es instanceof Error. Un catch
// que solo revisa `instanceof ApiError`/`instanceof Error` lo deja pasar de
// largo y termina mostrando el fallback genérico, escondiendo el motivo
// real (ej. "ya existe un huésped con ese documento en este hotel"). Esta
// función cubre los tres casos (ApiError, Error, objeto plano con
// `message`) para que ese mensaje real siempre llegue a pantalla.
export function mensajeDeError(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

async function llamar(path: string, options: RequestInit, token: string | undefined): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// El backend (Render, plan gratuito) se duerme tras un rato sin uso y tarda
// unos segundos en responder a la primera petición -- antes, esa primera
// llamada fallaba a nivel de red (fetch ni llega a recibir respuesta, lanza
// una excepción en vez de devolver un status) y se mostraba como "Error al
// cargar" sin más, aunque el backend solo necesitaba unos segundos para
// despertar. Solo reintenta fallos de RED: una respuesta HTTP de error
// (4xx/5xx) sí llega a `llamar()` con éxito y se maneja más abajo como
// ApiError, sin pasar por acá.
async function llamarConReintento(path: string, options: RequestInit, token: string | undefined): Promise<Response> {
  try {
    return await llamar(path, options, token);
  } catch {
    await esperar(3000);
    return llamar(path, options, token);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  let res = await llamarConReintento(path, options, data.session?.access_token);

  // Un 401 acá no siempre significa que la sesión murió de verdad: si la
  // pestaña estuvo inactiva/dormida (laptop suspendida, celular en
  // background) más del tiempo de vida del access token (1h por defecto en
  // Supabase), el temporizador interno de auto-refresh de supabase-js pudo
  // no llegar a dispararse a tiempo -- pero el refresh_token en sí sigue
  // siendo válido. Antes esto cerraba la sesión al toque; ahora se intenta
  // refrescar una vez y reintentar la misma llamada antes de rendirse.
  if (res.status === 401) {
    const { data: refrescada, error } = await supabase.auth.refreshSession();
    if (!error && refrescada.session) {
      res = await llamar(path, options, refrescada.session.access_token);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Si tras refrescar sigue en 401, ahí sí la sesión (o el refresh_token)
    // ya no sirve -- cerramos la sesión local para que ProtectedRoute mande
    // a /login en vez de dejar a la persona viendo un error críptico sin
    // salida clara.
    if (res.status === 401) {
      supabase.auth.signOut();
    }
    // El ValidationPipe global de Nest devuelve `message` como un ARRAY de
    // strings cuando falla más de una regla (uno por campo/regla) -- sin
    // esto, ese array terminaba mostrándose crudo (unido por comas, en
    // inglés) en vez de un mensaje legible que diga qué falta corregir.
    const mensaje = Array.isArray(body.message)
      ? body.message.join(' ')
      : (body.message ?? `Error ${res.status}`);
    throw new ApiError(res.status, mensaje);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
