export const CONTENT_OPTIONS = { highlights: true, text: { maxCharacters: 2400 } } as const;

export async function exaRequest(path: "/search" | "/contents" | "/findSimilar", body: unknown) {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("Exa is not configured. Add EXA_API_KEY to your server environment to run live research.");
  const response = await fetch(`https://api.exa.ai${path}`, {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const message = response.status === 401 ? "Exa rejected the API key." : response.status === 429 ? "Exa rate limit reached. Please try again shortly." : `Exa returned ${response.status}.`;
    throw new Error(detail ? `${message} ${detail.slice(0, 240)}` : message);
  }
  return response.json();
}

export function getContentOptions() { return CONTENT_OPTIONS; }
