

export type ResumeFields = {
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  location: string | null;
  yearsExperience: number | null;
  skills: string[];
  links: string[];
  education: string | null;
  expectedSalaryMin: number | null;
  expectedSalaryMax: number | null;
  salaryCurrency: string;
};

export type ParsedResume = { text: string; fields: ResumeFields };

const SKILL_DICT = [
  'react', 'react native', 'typescript', 'javascript', 'node.js', 'nodejs', 'next.js',
  'python', 'django', 'fastapi', 'flask', 'sql', 'postgresql', 'postgres', 'mysql',
  'mongodb', 'redis', 'kafka', 'docker', 'kubernetes', 'aws', 'gcp', 'azure',
  'graphql', 'rest', 'api design', 'system design', 'figma', 'sketch', 'user research',
  'product design', 'design systems', 'prototyping', 'html', 'css', 'tailwind',
  'go', 'golang', 'rust', 'java', 'kotlin', 'swift', 'c++', 'c#', '.net', 'php',
  'machine learning', 'ml', 'llm', 'data analysis', 'pandas', 'tensorflow', 'pytorch',
  'ci/cd', 'testing', 'jest', 'cypress', 'playwright', 'git', 'agile', 'scrum',
  'product management', 'stakeholder management', 'a/b testing', 'analytics',
];

const TITLE_WORDS =
  /(engineer|developer|designer|manager|scientist|analyst|architect|consultant|lead|director|intern|recruiter|specialist|head of|vp of)/i;

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const URL_RE = /(https?:\/\/[^\s)>\]]+|(?:github|linkedin|behance|dribbble)\.com\/[^\s)>\]]+)/gi;
const YEARS_RE = /(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/gi;
const EDU_WORDS = /(bachelor|master|phd|mba|\bb\.?tech\b|\bm\.?tech\b|\bb\.?\s?e\.?\b|university|college|institute)/i;
const BULLET_RE = /^[•·◦▪*-]\s*/;

const LOCATION_LABEL_RE = /^(?:location|address|residence|city)\s*[:|–—-]\s*(.+)$/i;
const BASED_IN_RE = /\b(?:based|located|living|residing)\s+in\s+([\p{L}][\p{L} .'-]{1,40})/iu;
const EXPECTED_SALARY_RE =
  /expected\s+(?:ctc|salary|compensation)\s*[:\-]?\s*(₹|rs\.?|inr|\$|usd|€|eur)?\s*([\d.]+)\s*(lpa|lakhs?|l|k|crores?)?/i;

const CITIES = [
  'bengaluru', 'bangalore', 'new delhi', 'delhi ncr', 'delhi', 'mumbai',
  'greater noida', 'noida', 'gurugram', 'gurgaon', 'hyderabad', 'secunderabad', 'pune',
  'chennai', 'kolkata', 'ahmedabad', 'jaipur', 'kochi', 'cochin', 'indore',
  'chandigarh', 'mohali', 'coimbatore', 'thiruvananthapuram', 'trivandrum',
  'lucknow', 'bhubaneswar', 'nagpur', 'vadodara', 'visakhapatnam', 'mysuru',
  'mysore', 'surat', 'bhopal', 'patna', 'guwahati',
  'london', 'berlin', 'munich', 'amsterdam', 'paris', 'dublin', 'warsaw',
  'lisbon', 'barcelona', 'madrid', 'stockholm', 'zurich', 'singapore', 'dubai',
  'abu dhabi', 'new york', 'san francisco', 'seattle', 'austin', 'boston',
  'chicago', 'los angeles', 'toronto', 'vancouver', 'montreal', 'sydney',
  'melbourne', 'tokyo', 'kyiv', 'kiev', 'lviv', 'tallinn', 'riga', 'vilnius',
  'moscow', 'saint petersburg', 'st. petersburg', 'novosibirsk', 'yekaterinburg',
  'kazan', 'nizhny novgorod', 'minsk', 'almaty', 'astana', 'tbilisi', 'yerevan',
  'remote',
];
const CITY_RE = new RegExp(`\\b(${CITIES.join('|')})\\b`, 'i');
const COUNTRIES_RE =
  /\b(india|germany|uk|united kingdom|usa|united states|canada|australia|singapore|uae|netherlands|france|ireland|ukraine|poland|japan|spain|portugal|sweden|switzerland|estonia|latvia|lithuania|russia|russian federation|belarus|kazakhstan|georgia|armenia|azerbaijan)\b/i;

function extractLocation(lines: string[]): string | null {

  for (const l of lines.slice(0, 15)) {
    const m = l.match(LOCATION_LABEL_RE);
    if (m && m[1].trim().length <= 60) return m[1].trim();
  }

  const all = lines.join(' ');
  const based = all.match(BASED_IN_RE)?.[1]?.trim();
  if (based && based.length <= 40 && !TITLE_WORDS.test(based)) return based;


  for (const l of lines.slice(0, 15)) {
    const m = l.match(CITY_RE);
    if (m) {
      const tail = l
        .slice(l.indexOf(m[0]) + m[0].length)
        .match(/^,\s*([\p{L}][\p{L} .'-]{1,30})/u)?.[1];
      return tail && COUNTRIES_RE.test(tail) ? `${m[0]}, ${tail}` : m[0];
    }
  }
  return null;
}

function extractExpectedSalary(compact: string): {
  min: number | null;
  max: number | null;
  currency: string;
} {
  const m = compact.match(EXPECTED_SALARY_RE);
  if (!m) return { min: null, max: null, currency: 'INR' };
  const n = Number(m[2]);
  if (!Number.isFinite(n) || n <= 0) return { min: null, max: null, currency: 'INR' };
  const unit = (m[3] ?? '').toLowerCase();
  const sym = (m[1] ?? '').toLowerCase();
  const currency =
    sym === '$' || sym === 'usd' ? 'USD' : sym === '€' || sym === 'eur' ? 'EUR' : 'INR';
  let amount = n;
  if (unit === 'k') amount = n * 1_000;
  else if (unit === 'l' || unit === 'lpa' || unit.startsWith('lakh')) amount = n * 100_000;
  else if (unit.startsWith('crore')) amount = n * 10_000_000;
  else if (n < 500 && currency === 'INR') amount = n * 100_000;
  return { min: amount, max: null, currency };
}

export function extractFields(text: string): ResumeFields {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const compact = lines.join(' ');

  const email = compact.match(EMAIL_RE)?.[0] ?? null;
  const phone = compact.match(PHONE_RE)?.[0]?.trim() ?? null;
  const links = [...new Set(compact.match(URL_RE) ?? [])].slice(0, 10);

  const lower = compact.toLowerCase();
  const skills = SKILL_DICT.filter((s) =>
    new RegExp(`\\b${s.replace(/[.*+]/g, '\\$&')}\\b`, 'i').test(lower),
  );

  let years: number | null = null;
  for (const m of compact.matchAll(YEARS_RE)) {
    const n = Number(m[1]);
    if (n > 0 && n <= 45 && (years === null || n > years)) years = n;
  }



  const now = new Date().getFullYear();
  let earliest: number | null = null;
  for (const m of compact.matchAll(/\b(19[7-9]\d|20\d{2})\b/g)) {
    const y = Number(m[1]);
    if (y >= 1970 && y <= now && (earliest === null || y < earliest)) earliest = y;
  }
  const derived = earliest !== null ? Math.min(45, now - earliest) : null;
  if (derived !== null && (years === null || derived > years)) years = derived;


  const name =
    lines.find(
      (l) =>
        l.length <= 40 &&
        !EMAIL_RE.test(l) &&
        !PHONE_RE.test(l) &&
        !/https?:\/\//i.test(l) &&
        !TITLE_WORDS.test(l) &&
        /^[\p{L} .'-]+$/u.test(l),
    ) ?? null;

  const title =
    lines.find((l) => TITLE_WORDS.test(l) && l.length <= 60 && !BULLET_RE.test(l)) ?? null;

  const education =
    lines.find((l, i) => i > 0 && EDU_WORDS.test(l) && l.length <= 120) ?? null;

  const location = extractLocation(lines);
  const salary = extractExpectedSalary(compact);

  return {
    name,
    email,
    phone,
    title,
    location,
    yearsExperience: years,
    skills,
    links,
    education,
    expectedSalaryMin: salary.min,
    expectedSalaryMax: salary.max,
    salaryCurrency: salary.currency,
  };
}

{
  const g = globalThis as {
    structuredClone?: ((v: unknown, o?: unknown) => unknown) & { __pdfjsWrap?: boolean };
  };
  if (typeof g.structuredClone === 'function' && !g.structuredClone.__pdfjsWrap) {
    const orig = g.structuredClone;
    const wrapped = (v: unknown, o?: unknown) => orig(v, o ?? undefined);
    wrapped.__pdfjsWrap = true;
    g.structuredClone = wrapped;
  }
}

async function extractText(bytes: ArrayBuffer): Promise<string> {


  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');



  const g = globalThis as { pdfjsWorker?: unknown };
  if (!g.pdfjsWorker) {
    g.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
  }
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: false,
  });
  const doc = await task.promise;
  try {
    const parts: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let line = '';
      for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
        line += item.str ?? '';
        if (item.hasEOL) {
          parts.push(line);
          line = '';
        } else {
          line += ' ';
        }
      }
      if (line.trim()) parts.push(line);
    }
    return parts.join('\n');
  } finally {
    await task.destroy();
  }
}

export async function parseResume(bytes: ArrayBuffer): Promise<ParsedResume> {
  const text = await extractText(bytes);
  if (!text.trim()) throw new Error('No readable text found in this PDF');
  return { text, fields: extractFields(text) };
}
