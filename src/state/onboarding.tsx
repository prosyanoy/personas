import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

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

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
