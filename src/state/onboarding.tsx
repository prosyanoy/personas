import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { authRequest } from '@/auth';
import { useAuth } from '@/state/auth';

import type { ResumeFields } from '@/pdf/resume';

export type OnboardingState = {
  connectors: string[];
  connectorsAt: Date | null;
  toggleConnector: (id: string) => void;
  completeConnectors: () => void;
  resumeFile: { name: string; size: number } | null;
  resumeAt: Date | null;
  resumeFields: ResumeFields | null;

  profileId: string | null;
  setProfileId: (id: string | null) => void;
  setResume: (file: { name: string; size: number }, fields: ResumeFields) => void;
  updateResumeFields: (patch: Partial<ResumeFields>) => void;
  timeline: string;
  setTimeline: (id: string) => void;

  stage: number;
  setStage: (n: number) => void;

  digitalProfile: {
    topics: string[];
    questions: string[];

    known: number[];
    readiness: number;
  } | null;
  setDigitalProfile: (
    p: { topics: string[]; questions: string[]; known: number[]; readiness: number },
  ) => void;
};

const OnboardingContext = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [hydrating, setHydrating] = useState(!!user);
  const [restoreError, setRestoreError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [connectors, setConnectors] = useState<string[]>([
    'linkedin',
    'telegram',
    'wellfound',
    'cutshort',
  ]);
  const [connectorsAt, setConnectorsAt] = useState<Date | null>(null);
  const [resumeFile, setResumeFile] = useState<{ name: string; size: number } | null>(null);
  const [resumeAt, setResumeAt] = useState<Date | null>(null);
  const [resumeFields, setResumeFields] = useState<ResumeFields | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<string>('asap');
  const [stage, setStage] = useState(0);
  const [digitalProfile, setDigitalProfile] = useState<OnboardingState['digitalProfile']>(null);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    setHydrating(true);
    setRestoreError(false);
    void authRequest<{ id: string; fileName: string; fields: ResumeFields; createdAt: string }[]>('/profiles')
      .then((profiles) => {
        if (!active || !profiles[0]) return;
        const profile = profiles[0];
        setProfileId(profile.id);
        setResumeFields(profile.fields);
        setResumeFile({ name: profile.fileName, size: 0 });
        setResumeAt(new Date(profile.createdAt));
      })
      .catch(() => { if (active) setRestoreError(true); })
      .finally(() => { if (active) setHydrating(false); });
    return () => { active = false; };
  }, [user?.id, retry]);

  const toggleConnector = useCallback((id: string) => {
    setConnectors((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }, []);

  const completeConnectors = useCallback(() => setConnectorsAt(new Date()), []);

  const setResume = useCallback(
    (file: { name: string; size: number }, fields: ResumeFields) => {
      setResumeFile(file);
      setResumeFields(fields);
      setResumeAt(new Date());
    },
    [],
  );

  const updateResumeFields = useCallback((patch: Partial<ResumeFields>) => {
    setResumeFields((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = useMemo(
    () => ({
      connectors,
      connectorsAt,
      toggleConnector,
      completeConnectors,
      resumeFile,
      resumeAt,
      resumeFields,
      profileId,
      setProfileId,
      setResume,
      updateResumeFields,
      timeline,
      setTimeline,
      stage,
      setStage,
      digitalProfile,
      setDigitalProfile,
    }),
    [connectors, connectorsAt, toggleConnector, completeConnectors, resumeFile, resumeAt, resumeFields, profileId, setResume, updateResumeFields, timeline, stage, digitalProfile],
  );

  if (hydrating || restoreError) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      {hydrating ? <ActivityIndicator /> : <>
        <Text>Could not restore your profile.</Text>
        <Pressable accessibilityRole="button" onPress={() => setRetry((n) => n + 1)} style={{ padding: 16 }}><Text>Retry</Text></Pressable>
      </>}
    </View>
  );
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
