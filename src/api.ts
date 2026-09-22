import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { type Job } from '@/data/mock';
import type { ResumeFields } from '@/pdf/resume';
import { colors } from '@/theme/tokens';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export type JobPosting = {
  source: 'linkedin' | 'naukri' | 'instahyre' | 'cutshort' | 'wellfound' | 'telegram';
  external_id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean | null;
  url: string;
  description: string;
  skills: string[];
  experience_min: number | null;
  experience_max: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  posted_at: string | null;
  channel: string | null;
};

export type FeatureScores = {
  skills: number;
  experience: number;
  location: number;
  salary: number;
  freshness: number;
};

export type MatchResult = {
  job: JobPosting;
  features: FeatureScores;
  score: number;
  suggested_band: 'strong_match' | 'great_fit' | 'promising' | 'weak';
  matched_skills: string[];
  missing_skills: string[];
};

export type ScoutResponse = {
  total: number;
  per_source: { source: string; count: number }[];
  jobs: JobPosting[];
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!resp.ok) throw new Error(`API ${path} failed (${resp.status})`);
  return resp.json() as Promise<T>;
}

export type MatchPrefs = {
  locations?: string[];
  expected_salary_min?: number | null;
  expected_salary_max?: number | null;
  salary_currency?: string;
  remote_ok?: boolean;
};

function prefsFromResume(resume?: ResumeFields | null): MatchPrefs {
  return {
    locations: resume?.location ? [resume.location] : [],
    expected_salary_min: resume?.expectedSalaryMin ?? null,
    expected_salary_max: resume?.expectedSalaryMax ?? null,
    salary_currency: resume?.salaryCurrency ?? 'INR',
  };
}

export function fetchMatches(limit = 50, prefs?: MatchPrefs): Promise<MatchResult[]> {
  return api<MatchResult[]>('/match', {
    method: 'POST',
    body: JSON.stringify({ limit, preferences: prefs ?? {} }),
  });
}

export function runScout(keywords: string, location = ''): Promise<ScoutResponse> {
  return api<ScoutResponse>('/scout/run', {
    method: 'POST',
    body: JSON.stringify({ keywords, location, limit_per_source: 15 }),
  });
}

const SOURCE_META: Record<string, { name: string; badge: string; icon?: string; color: string; round?: boolean }> = {
  linkedin: { name: 'LinkedIn', badge: 'in', color: '#0a66c2' },
  naukri: { name: 'Naukri', badge: 'N', color: '#4a90e2' },
  telegram: { name: 'Telegram', badge: '', icon: 'send', color: '#229ed9', round: true },
  wellfound: { name: 'Wellfound', badge: 'W', color: '#161616' },
  instahyre: { name: 'Instahyre', badge: 'IH', color: '#e0e0e0' },
  cutshort: { name: 'Cutshort', badge: 'C', color: '#4f46e5' },
};

const COMPANY_COLORS = ['#0f62fe', '#7c3aed', '#0e7490', '#b45309', '#047857', '#be185d', '#4338ca'];

function companyColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COMPANY_COLORS[h % COMPANY_COLORS.length];
}

export const BAND_LABELS: Record<string, string> = {
  strong_match: 'Strong match',
  great_fit: 'Great fit',
  promising: 'Promising position',
  weak: 'Worth a look',
};

function ago(iso: string | null): string {
  if (!iso) return 'recently';
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

function salary(posting: JobPosting): string {
  const { salary_min: min, salary_max: max, salary_currency: cur } = posting;
  if (min == null && max == null) return 'Salary not disclosed';
  const fmt = (n: number) =>
    cur === 'INR' ? `${Math.round(n / 100000)}L` : `${Math.round(n / 1000)}k`;
  const sym = cur === 'INR' ? '₹' : cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '';
  if (min && max) return `${sym} ${fmt(min)} – ${fmt(max)}${cur === 'INR' ? ' PA' : ''}`;
  return `${sym} ${fmt(min ?? max ?? 0)}+${cur === 'INR' ? ' PA' : ''}`;
}

function location(posting: JobPosting): string {
  const loc = posting.location || 'Unspecified';
  return posting.remote ? `${loc} (Remote)` : loc;
}

export function toDisplayJob(result: MatchResult): Job {
  const { job } = result;
  const meta = SOURCE_META[job.source] ?? { name: job.source, badge: '?', color: colors.slate400 };
  const skills = job.skills.length ? job.skills : result.matched_skills;
  return {
    id: `${job.source}:${job.external_id || job.url || job.title}`,
    source: meta,
    ago: ago(job.posted_at),
    title: job.title || 'Untitled role',
    company: {
      name: job.company || 'Unknown',
      letter: (job.company || '?')[0].toUpperCase(),
      color: companyColor(job.company || '?'),
    },
    match: Math.round(result.score * 100),
    location: location(job),
    salary: salary(job),
    type: 'Full-time',
    analysisTag: BAND_LABELS[result.suggested_band] ?? 'Match',
    analysis: '',
    skillGap: result.missing_skills.length ? `${result.missing_skills.length} skill gap` : undefined,
    skills: skills.slice(0, 4),
    extraSkills: Math.max(0, skills.length - 4) || undefined,
    applyStyle: 'dark',
    url: job.url,
    matchData: {
      band: result.suggested_band,
      score: result.score,
      features: result.features,
      matchedSkills: result.matched_skills,
      missingSkills: result.missing_skills,
      title: job.title,
      company: job.company,
      sourceId: job.source,
      salaryMin: job.salary_min,
      salaryMax: job.salary_max,
      salaryCurrency: job.salary_currency,
      remote: job.remote,
    },
  };
}

export function useJobs(resume?: ResumeFields | null) {
  const keywords = resume?.title ?? 'software engineer';
  const prefs = prefsFromResume(resume);
  const location = resume?.location ?? '';
  return useQuery<Job[]>({
    queryKey: ['jobs', 'matched', keywords, location, prefs.expected_salary_min, prefs.expected_salary_max],
    queryFn: async () => {
      let results = await fetchMatches(30, prefs);
      if (!results.length) {

        await runScout(keywords, location);
        results = await fetchMatches(30, prefs);
      }
      return results.map(toDisplayJob);
    },

    staleTime: 60_000,
    retry: 1,
  });
}

export function useScoutRefresh(resume?: ResumeFields | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (location?: string) =>
      runScout(resume?.title ?? 'software engineer', location ?? resume?.location ?? ''),
    onSuccess: () => client.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

export type QuestionKind = 'unknown' | 'post' | 'peer';

export type SharedQuestionThread = {
  id: string;
  author: string;
  ago: string;
  title: string;
  description: string | null;
  kind: QuestionKind;
  tags: string[];
  skills: string[];
  replies: number;

  discussants: number;
  mine: boolean;
  answers: { id: string; author: string; body: string; likes: number; ago: string }[];
};

export async function shareUnknownQuestions(payload: {
  profileId: string | null;
  author: string;
  questions: { question: string; topic: string | null; skills: string[] }[];
}): Promise<void> {
  await api('/discussions/share', { method: 'POST', body: JSON.stringify(payload) });
}

export function useThreads(
  category: string,
  profileId?: string | null,
  author?: string | null,
) {
  return useQuery<SharedQuestionThread[]>({
    queryKey: ['threads', category, profileId, author],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (profileId) params.set('profile_id', profileId);
      if (author) params.set('author', author);
      const qs = params.toString();
      const { threads } = await api<{ threads: SharedQuestionThread[] }>(
        `/discussions${qs ? `?${qs}` : ''}`,
      );
      if (category === 'For you') return threads;
      const c = category.toLowerCase();
      return threads.filter((t) =>
        [...t.tags, ...t.skills].some((s) => s.toLowerCase().includes(c)),
      );
    },
    staleTime: 15_000,
  });
}

export function usePostDiscussion(profileId: string | null | undefined, author: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      question: string;
      description?: string;
      topic?: string;
      skills?: string[];
    }) =>
      api<{ id: string }>('/discussions', {
        method: 'POST',
        body: JSON.stringify({ profileId, author, ...payload }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['threads'] });
      void client.invalidateQueries({ queryKey: ['myQuestions'] });
    },
  });
}

export function usePostAnswer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      questionId,
      author,
      body,
    }: {
      questionId: string;
      author: string;
      body: string;
    }) =>
      api(`/discussions/${questionId}/answers`, {
        method: 'POST',
        body: JSON.stringify({ author, body }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['threads'] });
      void client.invalidateQueries({ queryKey: ['myQuestions'] });
    },
  });
}

export function useMyQuestions(
  profileId: string | null | undefined,
  author?: string | null,
) {
  return useQuery<SharedQuestionThread[]>({
    queryKey: ['myQuestions', profileId, author],
    enabled: !!(profileId || author),
    queryFn: () => {
      const params = new URLSearchParams();
      if (profileId) params.set('profile_id', profileId);
      if (author) params.set('author', author);
      return api<{ questions: SharedQuestionThread[] }>(
        `/activity/questions?${params.toString()}`,
      ).then((r) => r.questions);
    },
  });
}

export type IngestSource = 'upload' | 'link' | 'drive';

export type IngestPayload = {
  source: IngestSource;
  fileName: string;
  fileSize?: number;
  fields: ResumeFields;
  rawText?: string;
};

export async function ingestResumeProfile(payload: IngestPayload): Promise<{ id: string }> {
  const resp = await fetch(`${API_URL}/profiles/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`Profile ingest failed (${resp.status})`);
  return resp.json() as Promise<{ id: string }>;
}

export function patchProfileFields(
  profileId: string,
  patch: Partial<
    Pick<ResumeFields, 'location' | 'expectedSalaryMin' | 'expectedSalaryMax' | 'salaryCurrency'>
  >,
): Promise<unknown> {
  return api(`/profiles/${profileId}/fields`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function patchLatestProfile(
  patch: Parameters<typeof patchProfileFields>[1],
): Promise<void> {
  try {
    const profiles = await api<{ id: string }[]>('/profiles');
    if (profiles[0]) await patchProfileFields(profiles[0].id, patch);
  } catch {

  }
}

export async function fetchResumeViaBackend(url: string): Promise<ArrayBuffer> {
  const resp = await fetch(`${API_URL}/resume/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!resp.ok) {
    const detail = await resp.json().catch(() => null);
    throw new Error(detail?.error?.message ?? `Download failed (${resp.status})`);
  }
  return resp.arrayBuffer();
}
