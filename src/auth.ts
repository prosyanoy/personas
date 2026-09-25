import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
const SESSION_KEY = 'personas.session.v1';
let token: string | null = null;
let onExpired: (() => void) | null = null;

export type AuthUser = { id: string; email: string; name: string; onboardingCompleted: boolean };
export type CodeChallenge = { challengeId: string; expiresIn: number; resendAfter: number };
export type CodeRequest = { email: string; name?: string; purpose: 'registration' | 'login' };

export function listenForExpiry(listener: () => void) {
  onExpired = listener;
  return () => { onExpired = null; };
}

export async function restoreToken() {
  token = Platform.OS === 'web'
    ? sessionStorage.getItem(SESSION_KEY)
    : await SecureStore.getItemAsync(SESSION_KEY);
  return token;
}

export async function storeToken(value: string | null) {
  if (Platform.OS === 'web') {
    if (value) sessionStorage.setItem(SESSION_KEY, value);
    else sessionStorage.removeItem(SESSION_KEY);
  } else if (value) {
    await SecureStore.setItemAsync(SESSION_KEY, value);
  } else {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }
  token = value;
}

export class AuthRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function authFetch(path: string, init?: RequestInit, authenticated = true) {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  const usedToken = token;
  if (authenticated && usedToken) headers.set('Authorization', `Bearer ${usedToken}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401 && authenticated && usedToken === token) {
    token = null;
    onExpired?.();
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new AuthRequestError(error?.error?.message ?? (response.status === 422
      ? 'Please check your details and try again.'
      : `Request failed (${response.status}). Please try again.`), response.status);
  }
  return response;
}

export async function authRequest<T>(path: string, body?: unknown, authenticated = true): Promise<T> {
  const response = await authFetch(path, body === undefined ? undefined : {
    method: 'POST', body: JSON.stringify(body),
  }, authenticated);
  return response.json() as Promise<T>;
}

export function requestEmailCode(body: CodeRequest) {
  return authRequest<CodeChallenge>('/auth/request-code', body, false);
}
