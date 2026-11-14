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

export type OpportunityResearchSources = {
  organizationDomain: string;
  instructionQuery: string;
  primaryPages: ExaPage[];
  instructionResults: ExaPage[];
  failures: string[];
};

export async function exaRequest<T = unknown>(
  path: "/search" | "/contents" | "/findSimilar",
  body: unknown,
): Promise<T> {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("Exa is not configured. Add EXA_API_KEY to your server environment to run live research.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXA_TIMEOUT_MS);
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
    if (controller.signal.aborted) throw new Error("Exa request timed out after " + (EXA_TIMEOUT_MS / 1000) + " seconds.");
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

  const [primary, instructions] = await Promise.allSettled([
    exaRequest<{ results?: ExaPage[] }>("/contents", { urls: [primaryUrl], ...CONTENT_OPTIONS }),
    exaRequest<{ results?: ExaPage[] }>("/search", {
      query: instructionQuery,
      type: "auto",
      numResults: 5,
      contents: CONTENT_OPTIONS,
    }),
  ]);

  const primaryPages = primary.status === "fulfilled" ? primary.value.results ?? [] : [];
  const instructionResults = instructions.status === "fulfilled" ? instructions.value.results ?? [] : [];
  const failures = [
    ...(primary.status === "rejected" ? ["Primary page: " + errorMessage(primary.reason)] : []),
    ...(instructions.status === "rejected" ? ["Application-instructions search: " + errorMessage(instructions.reason)] : []),
  ];

  return { organizationDomain, instructionQuery, primaryPages, instructionResults, failures };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Exa error.";
}

export function getContentOptions() { return CONTENT_OPTIONS; }
