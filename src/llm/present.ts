

import { useEffect, useState } from 'react';

import type { Job } from '@/data/mock';
import { complete, llmReady, useLlmState } from '@/llm/model';

export const BAND_LABEL: Record<string, string> = {
  strong_match: 'Strong match',
  great_fit: 'Great fit',
  promising: 'Promising position',
  weak: 'Worth a look',
};

export const FEATURE_KEYS = ['skills', 'experience', 'location', 'salary', 'freshness'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  skills: 'Skills',
  experience: 'Experience',
  location: 'Location',
  salary: 'Salary',
  freshness: 'Freshness',
};

const FEATURE_NAMES: Record<string, string> = {
  skills: 'skill coverage',
  experience: 'seniority fit',
  location: 'location fit',
  salary: 'compensation fit',
  freshness: 'posting freshness',
};

export function templateRationale(match: NonNullable<Job['matchData']>): string {
  const ranked = Object.entries(match.features).sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const parts: string[] = [];

  if (match.matchedSkills.length) {
    const total = match.matchedSkills.length + match.missingSkills.length;
    parts.push(
      total > 0
        ? `you cover ${match.matchedSkills.length}/${total} required skills`
        : `your skills (${match.matchedSkills.slice(0, 3).join(', ')}) line up`,
    );
  } else {
    parts.push(`strongest signal is ${FEATURE_NAMES[best[0]] ?? best[0]}`);
  }
  if (match.missingSkills.length) {
    parts.push(`worth brushing up on ${match.missingSkills.slice(0, 2).join(', ')}`);
  } else if (worst[1] < 0.6) {
    parts.push(`weakest signal is ${FEATURE_NAMES[worst[0]] ?? worst[0]}`);
  }
  return parts.join('; ') + '.';
}

function prompt(match: NonNullable<Job['matchData']>): string {
  const feats = Object.entries(match.features)
    .map(([k, v]) => `${k}=${v.toFixed(2)}`)
    .join(' ');
  return (
    '<start_of_turn>user\n' +
    `You are a job-match explainer inside an HR scouting app. ` +
    `Job: "${match.title}" at ${match.company}. ` +
    `Feature scores (0-1): ${feats}. ` +
    `Matched skills: ${match.matchedSkills.join(', ') || 'none'}. ` +
    `Missing skills: ${match.missingSkills.join(', ') || 'none'}. ` +
    `Band: ${BAND_LABEL[match.band] ?? match.band}. ` +
    `Write ONE short sentence (max 20 words) starting with "you", explaining why this job fits the candidate. ` +
    `No emoji, no markdown, no prefix.<end_of_turn>\n` +
    '<start_of_turn>model\n'
  );
}

const cache = new Map<string, string>();

export function templateFeatureNotes(job: Job): Record<FeatureKey, string> {
  const m = job.matchData;
  const f = m?.features ?? { skills: 0, experience: 0, location: 0, salary: 0, freshness: 0 };
  const matched = m?.matchedSkills ?? [];
  const missing = m?.missingSkills ?? [];

  return {
    skills: missing.length
      ? `you cover ${matched.length}/${matched.length + missing.length} required skills — brush up on ${missing
          .slice(0, 2)
          .join(', ')}`
      : matched.length
        ? `your skills (${matched.slice(0, 3).join(', ')}) cover what they ask for`
        : 'the posting lists no concrete skill requirements',
    experience:
      f.experience >= 0.75
        ? 'your seniority lines up with the level this role targets'
        : f.experience >= 0.45
          ? 'close to the seniority they expect — emphasise scope and impact'
          : 'below the seniority they target — show outsized impact to compensate',
    location:
      f.location >= 0.7
        ? `${job.location} sits inside your target area`
        : f.location >= 0.4
          ? `${job.location} — workable, but check relocation or hybrid terms`
          : `${job.location} is outside your preferred locations — ask about remote`,
    salary:
      job.salary === 'Salary not disclosed'
        ? 'no salary disclosed — raise your expectation early in the process'
        : f.salary >= 0.6
          ? `${job.salary} meets your compensation target`
          : `${job.salary} may sit below your target — negotiate or check bands`,
    freshness:
      f.freshness >= 0.6
        ? `posted ${job.ago} — apply soon while the posting is fresh`
        : `posted ${job.ago} — an older posting; confirm it is still open`,
  };
}

function detailPrompt(job: Job): string {
  const m = job.matchData;
  if (!m) return '';
  const feats = FEATURE_KEYS.map((k) => `${k}=${m.features[k].toFixed(2)}`).join(' ');
  return (
    '<start_of_turn>user\n' +
    `You are a career coach inside a job-match app. ` +
    `Job: "${m.title}" at ${m.company}, located ${job.location}, pay ${job.salary}, posted ${job.ago}. ` +
    `Match scores (0-1): ${feats}. ` +
    `Candidate matched skills: ${m.matchedSkills.join(', ') || 'none'}; ` +
    `missing skills: ${m.missingSkills.join(', ') || 'none'}. ` +
    `Write exactly 5 lines, one concrete actionable suggestion per line for the candidate, ` +
    `each line starting with the key and a colon in this order: ` +
    `skills:, experience:, location:, salary:, freshness:. ` +
    `Max 18 words per line, plain text, no emoji.<end_of_turn>\n` +
    '<start_of_turn>model\n'
  );
}

function parseFeatureNotes(out: string): Partial<Record<FeatureKey, string>> {
  const notes: Partial<Record<FeatureKey, string>> = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(skills|experience|location|salary|freshness)\s*[:.-]\s*(.+)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase() as FeatureKey;
    const text = m[2].trim();
    if (text && !notes[key]) notes[key] = text;
  }
  return notes;
}

const detailCache = new Map<string, Partial<Record<FeatureKey, string>>>();

const EMPTY_NOTES: Record<FeatureKey, string> = {
  skills: '',
  experience: '',
  location: '',
  salary: '',
  freshness: '',
};

export function useFeatureNotes(job: Job | null): Record<FeatureKey, string> {
  const { status } = useLlmState();
  const [notes, setNotes] = useState<Record<FeatureKey, string>>(() =>
    job ? templateFeatureNotes(job) : EMPTY_NOTES,
  );

  useEffect(() => {
    setNotes(job ? templateFeatureNotes(job) : EMPTY_NOTES);
    if (!job?.matchData || status !== 'ready' || !llmReady()) return;
    const key = `detail:${job.id}`;
    const cached = detailCache.get(key);
    if (cached) {
      setNotes((prev) => ({ ...prev, ...cached }));
      return;
    }
    let alive = true;
    void complete(detailPrompt(job)).then((out) => {
      if (!alive || !out) return;
      const parsed = parseFeatureNotes(out);
      if (!Object.keys(parsed).length) return;
      detailCache.set(key, parsed);
      setNotes((prev) => ({ ...prev, ...parsed }));
    });
    return () => {
      alive = false;
    };

  }, [job?.id, status]);

  return notes;
}

export function useRationale(job: Job): string {
  const { status } = useLlmState();
  const [text, setText] = useState<string>(() =>
    job.matchData ? templateRationale(job.matchData) : job.analysis,
  );

  useEffect(() => {
    if (!job.matchData || status !== 'ready' || !llmReady()) return;
    const key = job.id;
    const cached = cache.get(key);
    if (cached) {
      setText(cached);
      return;
    }
    let alive = true;
    void complete(prompt(job.matchData)).then((out) => {
      if (!alive || !out) return;
      const clean = out.split('\n')[0].trim();
      if (!clean) return;
      cache.set(key, clean);
      setText(clean);
    });
    return () => {
      alive = false;
    };

  }, [job.id, status]);

  return text;
}
