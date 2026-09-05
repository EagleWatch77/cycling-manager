'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ensureStarterRider } from '@/lib/rider/repository';

/**
 * Auth server actions.
 *
 * On failure they return a translation KEY plus a tone, so the client renders
 * it in the active locale with the right styling. On a clean success they
 * redirect to /dashboard. Sign-up has a third path: when the project requires
 * email confirmation, there is no session yet, so instead of redirecting we
 * return a neutral "check your inbox" notice.
 *
 * No secret reaches the browser: these run on the server with the public anon
 * key, and the session lives in an http-only cookie.
 */

export type AuthResult = { messageKey: string; tone: 'error' | 'info' } | undefined;

function mapError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) return 'auth.emailInUse';
  if (m.includes('email not confirmed') || m.includes('not confirmed')) return 'auth.emailNotConfirmed';
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'auth.invalidCredentials';
  if (m.includes('weak password') || (m.includes('password') && m.includes('6'))) return 'auth.weakPassword';
  return 'auth.errorGeneric';
}

export async function signUp(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');
  const displayName = String(formData.get('displayName') ?? '').trim();
  const language = String(formData.get('language') ?? 'sk');

  if (password !== confirm) return { messageKey: 'auth.passwordMismatch', tone: 'error' };
  if (password.length < 6) return { messageKey: 'auth.weakPassword', tone: 'error' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || null, preferred_language: language } },
  });
  if (error) return { messageKey: mapError(error.message), tone: 'error' };

  // With email confirmation ON, sign-up creates a user but NO session. Tell the
  // player to check their inbox instead of bouncing them to a locked dashboard.
  if (!data.session) return { messageKey: 'auth.checkEmail', tone: 'info' };

  // Session exists (confirmation off): give the new player their starter rider.
  await ensureStarterRider();
  redirect('/dashboard');
}

export async function signIn(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { messageKey: mapError(error.message), tone: 'error' };

  // First successful login after email confirmation also seeds the rider.
  await ensureStarterRider();
  redirect('/dashboard');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
