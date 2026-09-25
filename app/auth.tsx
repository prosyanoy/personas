import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requestEmailCode, type CodeChallenge } from '@/auth';
import { Glyph } from '@/components/Glyph';
import { PrimaryButton } from '@/components/onboarding';
import { useAuth } from '@/state/auth';
import { colors, font, radius, spacing } from '@/theme/tokens';

export default function AuthScreen() {
  const { verify } = useAuth();
  const [mode, setMode] = useState<'registration' | 'login'>('registration');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<CodeChallenge | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && (mode === 'login' || !!name.trim());

  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  const send = async () => {
    if (!valid || busy || wait) return;
    setBusy(true);
    setError(null);
    try {
      const next = await requestEmailCode({ email: email.trim().toLowerCase(), name: name.trim(), purpose: mode });
      setChallenge(next);
      setCode('');
      setNow(Date.now());
      setResendAt(Date.now() + next.resendAfter * 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your code.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!challenge || code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verify(challenge.challengeId, code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not verify your code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.mark}><Glyph name="flame" size={32} color={colors.brand} /></View>
          <Text style={styles.brand}>Personas</Text>
          <Text style={styles.title}>{challenge ? 'Check your email' : mode === 'registration' ? 'Create your account' : 'Welcome back'}</Text>
          <Text style={styles.body}>{challenge
            ? `Enter the six-digit code sent to ${email.trim()}. It expires in 10 minutes.`
            : 'Your next role starts here. Sign in with a one-time email code—no password needed.'}</Text>
          {challenge ? (
            <>
              <TextInput accessibilityLabel="Six-digit verification code" style={[styles.input, styles.code]}
                value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode"
                maxLength={6} autoFocus editable={!busy} placeholder="000000" onSubmitEditing={() => void submit()} />
              <PrimaryButton label={busy ? 'Checking…' : 'Verify and continue'} disabled={busy || code.length !== 6} onPress={() => void submit()} />
              <Pressable accessibilityRole="button" disabled={busy || wait > 0} onPress={() => void send()} style={styles.link}>
                <Text style={styles.linkText}>{wait ? `Resend code in ${wait}s` : 'Send a new code'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setChallenge(null); setError(null); setResendAt(0); }} style={styles.link}>
                <Text style={styles.linkText}>Change email or sign-in method</Text>
              </Pressable>
              {mode === 'login' ? <Text style={styles.body}>No email? Check spam, or register if you have not created an account yet.</Text> : null}
            </>
          ) : (
            <>
              {mode === 'registration' ? <>
                <Text style={styles.label}>Your name</Text>
                <TextInput accessibilityLabel="Your name" style={styles.input} value={name} onChangeText={setName}
                  autoComplete="name" textContentType="name" maxLength={120} editable={!busy} placeholder="Full name" />
              </> : null}
              <Text style={styles.label}>Email</Text>
              <TextInput accessibilityLabel="Email" style={styles.input} value={email} onChangeText={setEmail}
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email"
                textContentType="emailAddress" maxLength={254} editable={!busy} placeholder="name@example.com"
                onSubmitEditing={() => void send()} />
              <PrimaryButton label={busy ? 'Sending…' : 'Send verification code'} disabled={!valid || busy} onPress={() => void send()} />
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setMode(mode === 'login' ? 'registration' : 'login'); setError(null); }} style={styles.link}>
                <Text style={styles.linkText}>{mode === 'registration' ? 'Already have an account? Sign in' : 'New here? Create an account'}</Text>
              </Pressable>
            </>
          )}
          {busy ? <ActivityIndicator color={colors.brand} /> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Text style={styles.note}>Only your sign-in email is sent through Brevo. Your resume is not included.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { flexGrow: 1, justifyContent: 'center', alignSelf: 'center', width: '100%', maxWidth: 480, padding: spacing.xl, gap: 14 },
  mark: { alignSelf: 'center', padding: 16, backgroundColor: colors.brand50, borderRadius: radius.xl },
  brand: { fontFamily: font.display, fontSize: 28, color: colors.ink, textAlign: 'center' },
  title: { fontFamily: font.bodyBold, fontSize: 22, color: colors.ink, textAlign: 'center', marginTop: 12 },
  body: { fontFamily: font.body, fontSize: 14, lineHeight: 21, color: colors.slate500, textAlign: 'center' },
  label: { fontFamily: font.bodySemi, fontSize: 13, color: colors.ink },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.slate200, borderRadius: radius.lg, padding: 14, fontFamily: font.body, fontSize: 16, color: colors.ink, backgroundColor: colors.card },
  code: { fontSize: 28, letterSpacing: 10, textAlign: 'center' },
  link: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  linkText: { fontFamily: font.bodySemi, fontSize: 13, color: colors.brand },
  error: { color: colors.error, fontFamily: font.body, textAlign: 'center', fontSize: 13 },
  note: { color: colors.slate500, fontFamily: font.body, textAlign: 'center', fontSize: 11, lineHeight: 17 },
});
