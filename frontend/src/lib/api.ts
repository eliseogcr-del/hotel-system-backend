import { supabase } from './supabase';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  let res = await llamar(path, options, data.session?.access_token);

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
