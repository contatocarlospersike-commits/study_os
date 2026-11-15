import { useState } from 'react';
import { Brain, Lock, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function AuthGate() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const client = supabase;
  if (!client) return null;

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const { error: authErr } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (authErr) setError(authErr.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: signInErr } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) setError(signInErr.message);
      } else {
        const { error: signUpErr } = await client.auth.signUp({
          email,
          password,
        });
        if (signUpErr) {
          setError(signUpErr.message);
        } else {
          setInfo('Conta criada! Verifique seu e-mail para confirmar (ou entre se já estiver ativo).');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell flex items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-zinc-800 bg-zinc-900/80 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-400">
            <Brain className="h-7 w-7" />
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-50">Study OS</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Entre para acessar seus estudos, revisões e webhooks isolados na sua conta.
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={handleGoogleLogin}
          className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-xl bg-zinc-100 px-4 text-sm font-semibold text-zinc-950 hover:bg-white disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
            />
          </svg>
          Continuar com Google
        </button>

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-zinc-800" />
          <span className="mx-3 shrink text-xs uppercase text-zinc-500">ou com e-mail</span>
          <div className="flex-grow border-t border-zinc-800" />
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-3">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-zinc-500" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="min-h-[46px] w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-10 pr-3 text-sm text-zinc-100"
            />
          </div>

          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-zinc-500" />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha (mín. 6 caracteres)"
              className="min-h-[46px] w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-10 pr-3 text-sm text-zinc-100"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="min-h-[46px] w-full rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar Conta'}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-400">
          {mode === 'login' ? 'Não tem conta ainda?' : 'Já tem uma conta?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError('');
              setInfo('');
            }}
            className="font-semibold text-cyan-400 hover:text-cyan-300"
          >
            {mode === 'login' ? 'Criar conta' : 'Fazer login'}
          </button>
        </p>
      </div>
    </div>
  );
}
