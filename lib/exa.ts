export const EXA_TIMEOUT_MS = 12_000;
export const CONTENT_OPTIONS = { highlights: true, text: { maxCharacters: 2400 } } as const;

export type ExaPage = {
  id?: string;
  title?: string;
  url?: string;
  publishedDate?: string;
  text?: string;
  highlights?: string[];
  summary?: string;
};

export type OpportunitySearchQuery = { query: string; startPublishedDate?: string };

/** Build complementary live discovery searches from the user's intent and student context. */
export function buildOpportunitySearchQueries(
  prompt: string,
  profile: { field?: string; skills?: string; degree?: string; level?: string; roleMode?: string } = {},
  now = new Date(),
): OpportunitySearchQuery[] {
  const clean = (value: string | undefined, max = 160) => (value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
  const intent = clean(prompt, 320);
  const field = clean(profile.field, 100);
  const skills = clean(profile.skills, 160).split(/[,;|]/).map((value) => value.trim()).filter((value) => value.length > 1).slice(0, 5);
  const degree = clean([profile.degree, profile.level].filter(Boolean).join(" "), 90);
  const fieldNorm = field.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const expansions: Array<[RegExp, string[]]> = [
    [/business|kauppatiete|management|finance|marketing|econom/i, ["business trainee", "kauppatieteet harjoittelu", "finance trainee", "consulting trainee", "marketing trainee", "management trainee", "kesätyö kaupallinen"]],
    [/engineer|tekniik|engineering|mechanical|industrial|tuotantotalous/i, ["engineering internship", "tekniikan harjoittelu", "summer trainee engineering", "thesis worker", "diplomityö"]],
    [/computer|software|information technology|\bit\b|data science|artificial intelligence|\bai\b/i, ["software internship", "IT harjoittelu", "data science trainee", "AI thesis worker", "technology summer trainee"]],
    [/law|legal|oikeustie/i, ["legal trainee", "oikeustieteen harjoittelu", "law internship", "compliance trainee"]],
    [/life science|biology|biotech|biomedical|biochem|medicine|health/i, ["life sciences internship", "biotekniikka harjoittelu", "research assistant student", "biomedical thesis worker"]],
  ];
  const synonyms = expansions.find(([pattern]) => pattern.test(`${fieldNorm} ${intent.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}`))?.[1] ?? [];
  const fieldFocus = [field, ...synonyms.slice(0, 4)].filter(Boolean).join(" OR ");
  const skillFocus = skills.join(" OR ");
  const scope = /\b(helsinki|tampere|espoo|oulu|turku|jyv[aä]skyl[aä]|vaasa|kuopio|lappeenranta|toronto|vancouver|canada|sweden|germany|europe|remote)\b/i.test(intent) ? "" : "Finland Suomi Koko Suomi";
  const role = profile.roleMode === "internship" ? "internship trainee harjoittelu kesätyö student" : profile.roleMode === "thesis" ? "thesis worker diplomityö gradutoimeksianto research assistant" : "student opportunity internship trainee thesis worker diplomityö harjoittelu";
  const recent = publishedWithinDays(90, now);
  const queries = [
    `${intent} ${fieldFocus} ${role} ${scope}`,
    `${intent} ${fieldFocus} student internship trainee ${scope}`,
    `${intent} ${fieldFocus} harjoittelu kesätyö thesis ${scope}`,
    `${intent} ${skillFocus} ${degree} student role ${scope}`,
    `${fieldFocus} ${skillFocus} ${role} open positions ${scope}`,
    `${intent} student internship trainee site:ashbyhq.com OR site:greenhouse.io OR site:lever.co OR site:workday.com OR site:myworkdayjobs.com OR site:teamtailor.com OR site:jobylon.com`,
    `${intent} ${fieldFocus} harjoittelu kesätyö site:duunitori.fi OR site:oikotie.fi OR site:jobly.fi OR site:aarresaari.net OR site:jobteaser.com`,
    `${intent} ${fieldFocus} student thesis internship site:valtiolle.fi OR site:kuntarekry.fi OR site:linkedin.com/jobs OR site:academicpositions.com OR site:euraxess.ec.europa.eu`,
    `${intent} ${fieldFocus} company careers student trainee ${scope}`,
    `${intent} ${degree} ${fieldFocus} summer student research assistant ${scope}`,
  ].map((query) => query.replace(/\s+/g, " ").trim());
  return [...new Set(queries)].map((query, index) => ({ query, ...(index < 3 ? { startPublishedDate: recent } : {}) }));
}

export type OpportunityResearchSources = {
  organizationDomain: string;
  instructionQuery: string;
  contactQuery: string;
  primaryPages: ExaPage[];
  instructionResults: ExaPage[];
  contactResults: ExaPage[];
  failures: string[];
};

export async function exaRequest<T = unknown>(
  path: "/search" | "/contents" | "/findSimilar",
  body: unknown,
  timeoutMs = EXA_TIMEOUT_MS,
): Promise<T> {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("Exa is not configured. Add EXA_API_KEY to your server environment to run live research.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.exa.ai" + path, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const message =
        response.status === 401 ? "Exa rejected the API key." :
        response.status === 429 ? "Exa rate limit reached. Please try again shortly." :
        "Exa returned " + response.status + ".";
      throw new Error(detail ? message + " " + detail.slice(0, 240) : message);
    }
    return await response.json() as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Exa request timed out after " + (timeoutMs / 1000) + " seconds.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function publishedWithinDays(days = 90, now = new Date()): string {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days);
  return start.toISOString();
}

export async function investigateOpportunitySources(primaryUrl: string): Promise<OpportunityResearchSources> {
  const parsed = new URL(primaryUrl);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Only public HTTP(S) pages can be researched.");
  const organizationDomain = parsed.hostname.replace(/^www\./i, "");
  if (!organizationDomain) throw new Error("The selected source URL has no organization domain.");
  const instructionQuery = "site:" + organizationDomain + " (application OR deadline OR thesis OR harjoittelu OR contact)";
  const contactQuery = `site:${organizationDomain} (supervisor OR recruiter OR "talent acquisition" OR "head of" OR "R&D" OR contact OR email)`;

  const [primary, instructions, contacts] = await Promise.allSettled([
    exaRequest<{ results?: ExaPage[] }>("/contents", { urls: [primaryUrl], ...CONTENT_OPTIONS }),
    exaRequest<{ results?: ExaPage[] }>("/search", {
      query: instructionQuery,
      type: "auto",
      numResults: 5,
      contents: CONTENT_OPTIONS,
    }),
    exaRequest<{ results?: ExaPage[] }>("/search", {
      query: contactQuery,
      type: "auto",
      numResults: 5,
      contents: CONTENT_OPTIONS,
    }),
  ]);

  const primaryPages = primary.status === "fulfilled" ? primary.value.results ?? [] : [];
  const instructionResults = instructions.status === "fulfilled" ? instructions.value.results ?? [] : [];
  const contactResults = contacts.status === "fulfilled" ? contacts.value.results ?? [] : [];
  const failures = [
    ...(primary.status === "rejected" ? ["Primary page: " + errorMessage(primary.reason)] : []),
    ...(instructions.status === "rejected" ? ["Application-instructions search: " + errorMessage(instructions.reason)] : []),
    ...(contacts.status === "rejected" ? ["Contact discovery search: " + errorMessage(contacts.reason)] : []),
  ];

  return { organizationDomain, instructionQuery, contactQuery, primaryPages, instructionResults, contactResults, failures };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Exa error.";
}

export function getContentOptions() { return CONTENT_OPTIONS; }
