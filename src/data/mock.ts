

export type Connector = {
  id: string;
  name: string;

  icon?: string;
  badge?: string;
  color: string;
  textOnColor?: string;
};

export const CONNECTORS: Connector[] = [
  { id: 'linkedin', name: 'LinkedIn', badge: 'in', color: '#0a66c2' },
  { id: 'naukri', name: 'Naukri', icon: 'info', color: '#4a90e2' },
  { id: 'telegram', name: 'Telegram', icon: 'send', color: '#229ed9' },
  { id: 'wellfound', name: 'Wellfound', badge: 'W:', color: '#161616' },
  { id: 'instahyre', name: 'Instahyre', icon: 'person-search', color: '#e0e0e0', textOnColor: '#525252' },
  { id: 'cutshort', name: 'Cutshort', icon: 'bolt', color: '#4f46e5' },
];

export type TimelineOption = {
  id: string;
  label: string;
  detail: string;
  icon: string;
};

export const TIMELINE_OPTIONS: TimelineOption[] = [
  { id: 'asap', label: 'ASAP', detail: 'Immediate availability', icon: 'bolt' },
  { id: '30days', label: 'Within 30 days', detail: 'Standard notice period', icon: 'calendar' },
  { id: '2-3mo', label: '2–3 months', detail: 'Flexible transition', icon: 'schedule' },
  { id: 'exploring', label: 'Just exploring', detail: 'Passive market scan', icon: 'spa' },
];

export type Job = {
  id: string;
  source: { name: string; badge: string; icon?: string; color: string; round?: boolean };
  ago: string;
  title: string;
  company: { name: string; letter: string; color: string; textColor?: string; italic?: boolean; round?: boolean };
  match: number;
  location: string;
  salary: string;
  type: string;
  analysisTag: string;
  analysis: string;
  skillGap?: string;
  skills: string[];
  extraSkills?: number;
  applyStyle: 'dark' | 'brand';

  url?: string;

  matchData?: {
    band: string;
    score: number;
    features: { skills: number; experience: number; location: number; salary: number; freshness: number };
    matchedSkills: string[];
    missingSkills: string[];
    title: string;
    company: string;

    sourceId?: string;
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryCurrency?: string | null;
    remote?: boolean | null;
  };
};

export const JOBS: Job[] = [
  {
    id: 'j1',
    source: { name: 'LinkedIn', badge: 'in', color: '#0a66c2' },
    ago: '2h ago',
    title: 'Senior Frontend Engineer',
    company: { name: 'Swiggy', letter: 'S', color: '#fc8019', round: true },
    match: 94,
    location: 'Bengaluru (Hybrid)',
    salary: '₹ 28 – 40 LPA',
    type: 'Full-time',
    analysisTag: 'Strong match',
    analysis: 'you have 4/5 core skills, and relevant product experience at a similar scale.',
    skills: ['React', 'TypeScript', 'Next.js', 'System Design'],
    extraSkills: 2,
    applyStyle: 'dark',
  },
  {
    id: 'j2',
    source: { name: 'Telegram', badge: '', icon: 'send', color: '#229ed9', round: true },
    ago: '5h ago',
    title: 'Product Engineer',
    company: { name: 'Razorpay', letter: 'R', color: '#0c2340', textColor: '#60a5fa', italic: true },
    match: 88,
    location: 'Bengaluru',
    salary: '₹ 24 – 32 LPA',
    type: 'Full-time',
    analysisTag: 'Great fit',
    analysis: 'your product and engineering skills align well. Consider strengthening backend fundamentals.',
    skillGap: '1 skill gap',
    skills: ['Product', 'Node.js', 'PostgreSQL', 'APIs'],
    extraSkills: 2,
    applyStyle: 'brand',
  },
  {
    id: 'j3',
    source: { name: 'Wellfound', badge: 'W', color: '#161616' },
    ago: '1d ago',
    title: 'Product Designer',
    company: { name: 'GetMyParking', letter: 'P', color: '#f8fafc', textColor: '#0f172a' },
    match: 82,
    location: 'Bengaluru (On-site)',
    salary: '₹ 18 – 26 LPA',
    type: 'Full-time',
    analysisTag: 'Experience match',
    analysis: 'you have relevant experience in consumer products.',
    skills: ['Figma', 'User Research', 'Product Design', 'Design Systems'],
    applyStyle: 'dark',
  },
];

export type ThreadReply = {
  id: string;
  author: string;
  handle: string;
  initials: string;
  avatarColor: string;
  ago: string;
  body: string;
  likes: number;
};

export type Thread = {
  id: string;
  author: string;
  handle: string;
  initials: string;
  avatarColors: [string, string];
  ago: string;
  title: string;
  preview: string;
  tags: string[];
  extraTags?: number;
  replies: number;
  likes: number;
  replyStyle: 'dark' | 'light';
  topReplies?: ThreadReply[];
};

export const DISCUSSION_CATEGORIES = ['For you', 'Frontend', 'Product', 'Data', 'HR', 'System Design'];

export const THREADS: Thread[] = [
  {
    id: 't1',
    author: 'Priya S.',
    handle: '@priya_s',
    initials: 'PS',
    avatarColors: ['#f59e0b', '#fb7185'],
    ago: '2h ago',
    title: 'How would you answer: Tell me about a time you handled conflicting stakeholder feedback?',
    preview:
      'I have a product manager and a design lead with totally different priorities. How do you frame your answer to show leadership...',
    tags: ['Product Management', 'Behavioral', 'Stakeholders'],
    extraTags: 1,
    replies: 28,
    likes: 112,
    replyStyle: 'dark',
  },
  {
    id: 't2',
    author: 'Arjun Mehta',
    handle: '@arjunm',
    initials: 'AM',
    avatarColors: ['#0f62fe', '#6366f1'],
    ago: '5h ago',
    title: 'What React performance questions were you asked in your last round?',
    preview:
      'Going through interviews for senior frontend roles and curious what React performance or optimization questions people are seeing...',
    tags: ['React', 'Frontend', 'Performance', 'Interview Experience'],
    replies: 43,
    likes: 198,
    replyStyle: 'light',
    topReplies: [
      {
        id: 'r1',
        author: 'Neha K.',
        handle: '@nehak',
        initials: 'NK',
        avatarColor: '#059669',
        ago: '4h ago',
        body: 'I was asked about useMemo vs useCallback tradeoffs with real examples. Also got a question on how to fix a re-render loop.',
        likes: 24,
      },
      {
        id: 'r2',
        author: 'Rohit P.',
        handle: '@rohitp',
        initials: 'RP',
        avatarColor: '#0e7490',
        ago: '3h ago',
        body: 'Same here! They also asked me to optimize a component with a large list (10k items). Virtualization, memoization and keys.',
        likes: 18,
      },
      {
        id: 'r3',
        author: 'Tina L.',
        handle: '@tinal',
        initials: 'TL',
        avatarColor: '#7c3aed',
        ago: '1h ago',
        body: "Don't forget about React 18 features like concurrent rendering. That came up for me too.",
        likes: 11,
      },
    ],
  },
  {
    id: 't3',
    author: 'Karan Shah',
    handle: '@karans',
    initials: 'KS',
    avatarColors: ['#0d9488', '#0e7490'],
    ago: '1d ago',
    title: 'What system design prompts show up for 3–5 YOE product engineers?',
    preview:
      'Preparing for interviews and looking for real examples of system design questions (and how you approached them).',
    tags: ['System Design', 'Product Engineering', 'Scalability'],
    extraTags: 1,
    replies: 31,
    likes: 142,
    replyStyle: 'dark',
  },
];
