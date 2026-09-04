'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Auth server actions. They return a translation KEY on failure so the client
 * can render it in the active locale; on success they redirect to /dashboard.
 *
 * No secret ever reaches the browser: these run on the server and use the same
 * public anon key, with the session written to an http-only cookie.
 */

export type AuthResult = { errorKey: string } | undefined;

function mapError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) return 'auth.emailInUse';
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

  if (password !== confirm) return { errorKey: 'auth.passwordMismatch' };
  if (password.length < 6) return { errorKey: 'auth.weakPassword' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || null, preferred_language: language } },
  });
  if (error) return { errorKey: mapError(error.message) };

  redirect('/dashboard');
}

export async function signIn(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { errorKey: mapError(error.message) };

  redirect('/dashboard');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
