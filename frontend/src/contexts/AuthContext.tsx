import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Al volver de otra pestaña/app, Supabase intenta refrescar el token
    // solo (GoTrueClient escucha visibilitychange) y dispara este callback
    // de nuevo -- a veces con un hueco momentáneo de sesión null antes de
    // que llegue la refrescada, aunque el usuario nunca cerró sesión de
    // verdad. Tratar ese null como logout real mandaba a toda la app a
    // /login y de vuelta, lo que remontaba cada página desde cero y borraba
    // cualquier formulario a medio llenar (ver Reservas.tsx). Solo se
    // considera logout real el evento explícito 'SIGNED_OUT'; cualquier
    // otro evento con sesión null se ignora y se mantiene la sesión actual.
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        return;
      }
      if (newSession) {
        setSession(newSession);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
