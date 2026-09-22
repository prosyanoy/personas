

import { stream } from '@tanstack/ai-client';
import type { ModelMessage, StreamChunk, UIMessage } from '@tanstack/ai/client';

import { complete, llmReady } from '@/llm/model';
import type { ResumeFields } from '@/pdf/resume';

type AnyMessage = UIMessage | ModelMessage;

function messageText(m: AnyMessage): string {
  if ('parts' in m) {
    return m.parts
      .filter((p): p is { type: 'text'; content: string } => p.type === 'text')
      .map((p) => p.content)
      .join(' ');
  }
  const c = m.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .filter((p): p is { type: 'text'; content: string } => p.type === 'text')
      .map((p) => p.content)
      .join(' ');
  }
  return '';
}

const APP_FACTS = [
  'Jobs come from live scrapers: LinkedIn, Naukri, Instahyre, Cutshort, Wellfound and Telegram.',
  'Pull down on the job list to re-scout all sources; it takes about 20-40 seconds.',
  'Every job is scored on 5 features: skills, experience, location, salary, posting freshness.',
  'The match % is the average of those five scores; tap a card for the per-feature breakdown.',
  'Match explanations are written on-device by Gemma-4, a ~3.4GB model downloaded once.',
  'Your resume and this chat never leave the device — only extracted fields sync to the backend.',
  'The filters icon toggles which job sources appear; the salary chip hides roles under a threshold.',
];

const FAQ: [RegExp, string][] = [
  [
    /download|model|gemma|llm|ai|how.*(big|large)|gb/i,
    'Match explanations and this chat run on Gemma-4, a ~3.4 GB model stored entirely on your device. It downloads once over Wi-Fi after you parse a resume — nothing you type ever leaves the phone.',
  ],
  [
    /source|linkedin|telegram|wellfound|cutshort|naukri|instahyre|where.*(job|vacanc)/i,
    'Personas scouts six sources live: LinkedIn, Naukri, Instahyre, Cutshort, Wellfound and Telegram job channels. Pull to refresh runs all of them; the filters icon lets you hide any source.',
  ],
  [
    /refresh|update|scrape|new job|stale|reload/i,
    'Pull down on the job board — that re-runs every scraper, stores the fresh postings and re-scores them against your profile. It usually takes 20-40 seconds.',
  ],
  [
    /score|match|percent|%|band|breakdown|star/i,
    'The match % averages five scores: skills, experience, location, salary and freshness. Tap any job card to see each score with a suggestion per category.',
  ],
  [
    /privacy|data|share|upload|leave|safe|secure/i,
    'Your PDF is parsed on-device — the raw file never uploads. Only extracted fields (skills, location, salary expectation) sync to the backend for matching. Explanations and this chat are fully on-device.',
  ],
  [
    /salary|pay|compensation|lpa|ctc/i,
    'Set your expected compensation during onboarding or from the salary chip on the job board — postings below the threshold are filtered out, while the backend uses it to score salary fit.',
  ],
  [
    /location|city|remote|relocate|where/i,
    'Your location comes from your resume (or the onboarding question if it was missing). Change it any time from the location chip on the job board — the scouts then search that geography.',
  ],
  [
    /apply|cv|submit|application/i,
    'Tap APPLY on a card (or Apply inside the detail sheet) — it opens the original posting on its source site, where you apply directly.',
  ],
  [
    /^(hi|hello|hey|yo)\b/i,
    'Hi! I can explain how matching works, where jobs come from, or how your data is handled. What would you like to know?',
  ],
];

function lastUserText(messages: AnyMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const text = messageText(m).trim();
    if (text) return text;
  }
  return '';
}

function scriptedAnswer(question: string): string {
  for (const [re, answer] of FAQ) if (re.test(question)) return answer;
  return 'I can help with how matching works, the job sources, the salary and location filters, or what happens to your data. Ask me about any of those.';
}

function gemmaPrompt(messages: AnyMessage[], profile?: ResumeFields | null): string {
  const facts = APP_FACTS.map((f) => `- ${f}`).join('\n');
  const candidate = profile?.name
    ? `Candidate: ${profile.name}${profile.location ? `, based in ${profile.location}` : ''}${
        profile.expectedSalaryMin ? `, expecting ₹${Math.round(profile.expectedSalaryMin / 100_000)}L+` : ''
      }.`
    : '';
  const history = messages
    .slice(-6)
    .map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      text: messageText(m),
    }))
    .filter((t) => t.text.trim());

  const instructions =
    `You are the built-in support agent of Personas, a private job-scout app. ` +
    `Facts about the app:\n${facts}\n${candidate}\n` +
    `Answer the user's next message helpfully in at most 60 words. Plain text, no emoji, no markdown.`;

  const turns = history
    .map((t, i) => {
      const text = i === 0 && t.role === 'user' ? `${instructions}\n\n${t.text}` : t.text;
      return `<start_of_turn>${t.role}\n${text}<end_of_turn>\n`;
    })
    .join('');
  return turns + '<start_of_turn>model\n';
}

function* chunkText(text: string): Generator<string> {
  const words = text.split(/(\s+)/);
  for (const w of words) if (w) yield w;
}

export function makeSupportConnection(getProfile: () => ResumeFields | null | undefined) {
  return stream(async function* (
    messages: AnyMessage[],
    _data,
    abortSignal,
  ): AsyncIterable<StreamChunk> {
    const messageId = `support-${Date.now()}`;
    yield {
      type: 'TEXT_MESSAGE_START',
      messageId,
      role: 'assistant',
    } as StreamChunk;

    let text: string | null = null;
    if (llmReady() && !abortSignal?.aborted) {
      text = await complete(gemmaPrompt(messages, getProfile()), 160);
    }
    if (!text) text = scriptedAnswer(lastUserText(messages));

    for (const delta of chunkText(text)) {
      if (abortSignal?.aborted) break;
      yield { type: 'TEXT_MESSAGE_CONTENT', messageId, delta } as StreamChunk;
    }
    yield { type: 'TEXT_MESSAGE_END', messageId } as StreamChunk;
  });
}
