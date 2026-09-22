

import { complete } from '@/llm/model';
import type { ResumeFields } from '@/pdf/resume';

function cleanLines(out: string): string[] {
  return out
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((l) => l.length >= 2 && l.length <= 80 && !/[<>]/.test(l));
}

function candidateLine(fields: ResumeFields | null | undefined): string {
  if (!fields) return 'a software professional';
  const bits = [fields.title, fields.yearsExperience ? `${fields.yearsExperience} years` : null]
    .filter(Boolean)
    .join(', ');
  return bits || 'a software professional';
}

export async function suggestTopics(fields: ResumeFields | null | undefined): Promise<string[] | null> {
  const skills = (fields?.skills ?? []).slice(0, 12).join(', ') || 'general software engineering';
  const prompt =
    '<start_of_turn>user\n' +
    `You are an interview coach. Candidate: ${candidateLine(fields)}. ` +
    `Skills: ${skills}. ` +
    `List the 8 best interview topics for this candidate — concrete areas an interviewer ` +
    `would probe, one per line, each 1-3 words, no numbering, no bullets, no punctuation.<end_of_turn>\n` +
    '<start_of_turn>model\n';
  const out = await complete(prompt, 96);
  if (!out) return null;
  const topics = [
    ...new Set(
      cleanLines(out)
        .map((t) => t.replace(/\.$/, ''))
        .filter((t) => !/behavioral|behavioural|soft\s*skills/i.test(t)),
    ),
  ].slice(0, 8);
  return topics.length >= 3 ? topics : null;
}

export async function generateQuestions(
  topics: string[],
  fields: ResumeFields | null | undefined,
): Promise<string[] | null> {
  if (!topics.length) return null;
  const skills = (fields?.skills ?? []).slice(0, 12).join(', ');
  const prompt =
    '<start_of_turn>user\n' +
    `You are a senior interviewer running a real technical interview. ` +
    `Candidate: ${candidateLine(fields)}. Skills: ${skills || 'general'}. ` +
    `Chosen topics: ${topics.join(', ')}. ` +
    `Write exactly 10 interview questions this specific candidate should face. ` +
    `Each question must be concrete and probing — reference real scenarios, specific APIs ` +
    `or mechanisms, failure modes, performance trade-offs, or debugging situations inside ` +
    `the chosen topics and the candidate's own skills. ` +
    `Do NOT write generic questions like "tell me about X" or "what are pitfalls of Y". ` +
    `Vary the format: some conceptual, some scenario/design, some "what would you do if". ` +
    `Number them 1-10, one question per line, nothing else.<end_of_turn>\n` +
    '<start_of_turn>model\n';
  const out = await complete(prompt, 512);
  if (!out) return null;
  const questions = cleanLines(out).filter((l) => l.length >= 8).slice(0, 10);
  return questions.length >= 5 ? questions : null;
}

const TOPIC_MAP: Record<string, string> = {
  'react native': 'React Native', react: 'React', typescript: 'TypeScript',
  javascript: 'JavaScript', 'node.js': 'Node.js', nodejs: 'Node.js', 'next.js': 'Next.js',
  python: 'Python', django: 'Django', fastapi: 'FastAPI', flask: 'Flask', sql: 'SQL',
  postgresql: 'PostgreSQL', postgres: 'PostgreSQL', mysql: 'MySQL', mongodb: 'MongoDB',
  redis: 'Redis', kafka: 'Kafka', docker: 'Docker', kubernetes: 'Kubernetes', aws: 'AWS',
  gcp: 'GCP', azure: 'Azure', graphql: 'GraphQL', 'system design': 'System Design',
  figma: 'Figma', 'machine learning': 'Machine Learning', ml: 'Machine Learning',
  llm: 'LLMs', 'data analysis': 'Data Analysis', pandas: 'Pandas', go: 'Go', golang: 'Go',
  rust: 'Rust', java: 'Java', kotlin: 'Kotlin', swift: 'Swift', 'c++': 'C++', 'c#': 'C#',
};

export function fallbackTopics(fields: ResumeFields | null | undefined): string[] {
  const topics = (fields?.skills ?? [])
    .map((s) => TOPIC_MAP[s.toLowerCase()])
    .filter((t): t is string => !!t);
  const out = [...new Set(topics)].slice(0, 6);
  out.push('Problem Solving');
  return out.slice(0, 8);
}

const QUESTION_BANK: Record<string, string[]> = {
  Python: [
    `How does the GIL affect a CPU-bound service, and when do you pick multiprocessing over asyncio?`,
    `A FastAPI endpoint is blocking the event loop — how do you diagnose and fix it?`,
    `When do generators help memory-wise, and where do they bite you?`,
    `How do you structure retries with exponential backoff around an unreliable HTTP dependency?`,
  ],
  Kotlin: [
    `How does structured concurrency keep a leaked coroutine from outliving its scope?`,
    `When do you choose Flow over a suspending function returning a List?`,
    `How do you stop a mutable SharedFlow from becoming an unbounded buffer?`,
    `What does 'inline' + reified actually buy you, and what's the cost?`,
  ],
  Java: [
    `How do you hunt a memory leak in a long-lived JVM service — heap dump or allocation profiling first?`,
    `When does parallelStream hurt throughput instead of helping?`,
    `ReentrantLock vs synchronized — when does the explicit lock pay off?`,
  ],
  React: [
    `Two async useEffects resolve out of order and race — how do you sequence them correctly?`,
    `When does useMemo actually cost more than it saves?`,
    `How do you keep a virtualized list smooth when row heights are dynamic?`,
    `What breaks when you lift state into context that updates every keystroke?`,
  ],
  TypeScript: [
    `How do you type a function whose return shape depends on a literal argument?`,
    `When does 'any' silently re-enter through a third-party type declaration?`,
    `Discriminated unions vs enums for API states — which survives refactors better?`,
  ],
  'React Native': [
    `A screen janks only on Android release builds — where do you look first?`,
    `How do you keep a FlatList at 60fps while images decode and state churns?`,
    `Bridge vs JSI — what actually changes for a native module you call per-frame?`,
  ],
  'Node.js': [
    `An event loop lag spike hits your API p99 — how do you find the blocking call?`,
    `When does a worker_threads pool beat clustering for CPU-heavy requests?`,
    `How do you bound memory when streaming a 10 GB file through a transform pipeline?`,
  ],
  FastAPI: [
    `How do you share a DB connection pool safely across async request handlers?`,
    `A background task must outlive the request — BackgroundTasks, Celery, or a queue?`,
    `How do you enforce dependency-injected auth without paying for it on public routes?`,
  ],
  PostgreSQL: [
    `A query plan flipped after an autovacuum — how do you pin it back?`,
    `When does an index-only scan stop being index-only?`,
    `How do you design pagination that doesn't degrade at page 10,000?`,
    `Row locks vs advisory locks for a job queue — where does each break?`,
  ],
  SQL: [
    `How do you find and fix an N+1 hiding behind an ORM relationship?`,
    `When does a CTE hurt more than a temp table?`,
    `How would you model a slowly-changing dimension for audit history?`,
  ],
  Docker: [
    `Your image is 1.8 GB — walk me through slimming it without breaking the runtime.`,
    `When does a multi-stage build hurt caching instead of helping?`,
    `How do you keep secrets out of layers when the build needs them?`,
  ],
  Kubernetes: [
    `Pods keep OOMKilling after deploys — requests/limits or VPA, and why?`,
    `How do you design a rollout that survives a mid-deploy crash loop?`,
  ],
  AWS: [
    `SQS + Lambda is duplicating messages — where do you add idempotency?`,
    `When does DynamoDB's partition design silently throttle you?`,
  ],
  Redis: [
    `Cache stampede after a hot key expires — what's your defense?`,
    `When is a Redis lock a liability rather than a guarantee?`,
  ],
  Kafka: [
    `A consumer group is stuck lagging — how do you decide between more partitions and faster processing?`,
    `How do you guarantee ordering when one partition key floods the topic?`,
  ],
  'System Design': [
    `Design a rate limiter for a public API gateway — token bucket vs sliding window, and where does state live?`,
    `How do you make a payment webhook handler idempotent across retries and redeliveries?`,
    `CAP in practice: what do you sacrifice for a high-write feed — consistency or availability?`,
    `Where do you put caching in a read-heavy service, and how do you invalidate it?`,
  ],
  GraphQL: [
    `How do you stop a nested query from turning into an N+1 storm on the resolver layer?`,
    `Persisted queries vs depth limiting — which protects the API better?`,
  ],
  'Problem Solving': [
    `Estimate the storage for a URL shortener at 100M writes/day — walk me through it.`,
    `How do you design deduplication for a stream of 50K events/sec?`,
  ],
  'Machine Learning': [
    `A model regresses only on a niche slice of traffic — how do you detect and fix it?`,
    `When does fine-tuning lose to retrieval-augmented generation?`,
  ],
  'Data Analysis': [
    `A metric moves 3% after a release — how do you isolate signal from seasonality?`,
    `When does a p95 hide more than it tells, and what do you look at instead?`,
  ],
};

const GENERIC_TEMPLATES = [
  (t: string) =>
    `You inherit a production ${t} system with no docs and flaky behavior — what's your first week look like?`,
  (t: string) =>
    `A ${t} change you shipped degrades under real load — walk me through rolling back safely.`,
  (t: string) =>
    `Where does ${t} break down at scale, and what's the design workaround?`,
  (t: string) =>
    `How would you test a critical ${t} path that depends on an unreliable third party?`,
  (t: string) =>
    `What's a subtle ${t} bug you've debugged — how did you isolate it?`,
  (t: string) =>
    `Design the ${t} piece of a system that must survive a full-region outage.`,
  (t: string) =>
    `When is ${t} the wrong tool — what do you reach for instead, and why?`,
  (t: string) =>
    `How do you onboard a mid-level engineer into a codebase's hairiest ${t} corner?`,
  (t: string) =>
    `Your ${t} component passes tests but fails under production traffic — what's missing?`,
  (t: string) =>
    `How do you version and migrate a ${t} interface that other teams already depend on?`,
  (t: string) =>
    `Metrics say ${t} latency doubled after the last deploy — how do you bisect it?`,
  (t: string) =>
    `What invariants must hold in your ${t} code, and how do you enforce them in review?`,
];

export function fallbackQuestions(topics: string[]): string[] {
  const qs: string[] = [];
  const seen = new Set<string>();
  const push = (q: string) => {
    if (!seen.has(q) && qs.length < 10) {
      seen.add(q);
      qs.push(q);
    }
  };


  const bankFor = (t: string): string[] => {
    if (QUESTION_BANK[t]) return QUESTION_BANK[t];
    const low = t.toLowerCase();
    const key = Object.keys(QUESTION_BANK).find(
      (k) => low.includes(k.toLowerCase()) || k.toLowerCase().includes(low),
    );
    return key ? QUESTION_BANK[key] : [];
  };
  for (const t of topics) for (const q of bankFor(t)) push(q);

  let round = 0;
  while (qs.length < 10 && round < GENERIC_TEMPLATES.length * 3) {
    for (const t of topics) push(GENERIC_TEMPLATES[round % GENERIC_TEMPLATES.length](t));
    round += 1;
  }
  return qs;
}
