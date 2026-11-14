import type { Opportunity, Profile } from "@/lib/types";

export type SearchConstraints = { locations: string[]; excludeDegree: boolean; excludeTravel: boolean; excludeSenior: boolean };
export type LocationInfo = { canonical: string | null; certainty: "verified" | "inferred" | "unknown"; snippet: string | null; label: string };
export type DeadlineEvidence = { value: string; normalizedDate: string | null; precision: "day" | "month" | "range" | "cycle"; evidenceExcerpt: string; isPast: boolean };
export type MatchScoreBreakdown = { base: number; topicSkill: number; studentRole: number; location: number; openStatus: number; missingLocation: number; missingDeadline: number; constraintConflict: number; clampAdjustment: number };
export type OpportunityRoleMode = "internship" | "thesis" | "both";

const places: Record<string, string[]> = { Gothenburg: ["gothenburg", "göteborg"], Nairobi: ["nairobi"], Stockholm: ["stockholm"], Tampere: ["tampere"], Helsinki: ["helsinki"], Espoo: ["espoo"], Oulu: ["oulu"], Turku: ["turku"], Jyväskylä: ["jyväskylä", "jyvaskyla"], Vaasa: ["vaasa"], Lappeenranta: ["lappeenranta"], Kuopio: ["kuopio"], Toronto: ["toronto"], Vancouver: ["vancouver"], Finland: ["finland", "suomi"], Canada: ["canada"], Sweden: ["sweden", "swedish", "ruotsi", "svenska"], Germany: ["germany", "deutschland"], Europe: ["europe", "eurooppa"], Remote: ["remote", "remotely", "etätyö"], Mars: ["mars"], Moon: ["moon", "lunar"], "Space station": ["space station", "iss"], Atlantis: ["atlantis"] };
const today = () => new Date().toISOString().slice(0, 10);
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function parseSearchConstraints(query: string, profile: Partial<Profile> = {}): SearchConstraints {
  const q = normalize(query), p = normalize(profile.locations ?? "");
  const found = Object.entries(places).filter(([, aliases]) => aliases.some((x) => new RegExp(`\\b${x}\\b`, "i").test(q))).map(([name]) => name);
  const locations = found.length ? found : Object.entries(places).filter(([, aliases]) => aliases.some((x) => new RegExp(`\\b${x}\\b`, "i").test(p))).map(([name]) => name);
  const explicitPlace = q.match(/\b(?:in|on|within|near)\s+([a-z][a-z\s-]{1,40}?)(?=\s+(?:starting|beginning|from|for|with|that|which|and|or|internship|thesis|job|role)\b|[,?.!]|$)/i)?.[1]?.trim();
  const normalizedPlace = explicitPlace && Object.entries(places).find(([, aliases]) => aliases.some((alias) => normalize(alias) === explicitPlace));
  if (!locations.length && normalizedPlace) locations.push(normalizedPlace[0]);
  const genericPlacePhrase = new Set(["ai", "robotics", "engineering", "business", "thesis", "internship", "internships", "opportunities", "opportunity", "sustainability", "mechanical", "computer science", "data science", "research", "students"]);
  if (!locations.length && explicitPlace && explicitPlace.length <= 32 && explicitPlace.split(/\s+/).length <= 3 && !genericPlacePhrase.has(explicitPlace)) locations.push(explicitPlace.replace(/\b\w/g, (letter) => letter.toUpperCase()));
  return { locations, excludeDegree: /\b(?:no|without|excluding|not requiring)\b[^.!?]{0,50}\bdegree\b/.test(q) || /\bdegree\s+not\s+required\b/.test(q), excludeTravel: /\b(no|without|excluding)\s+travel\b/.test(q), excludeSenior: /\b(not|no|without)\s+senior\b/.test(q) };
}

export function extractLocationInfo(text: string, url = ""): LocationInfo {
  const n = normalize(text);
  const cities = new Set(["Gothenburg", "Nairobi", "Stockholm", "Tampere", "Helsinki", "Espoo", "Oulu", "Turku", "Jyväskylä", "Vaasa", "Lappeenranta", "Kuopio", "Toronto", "Vancouver"]);
  const explicit = Object.entries(places).flatMap(([name, aliases]) => ["Mars", "Moon", "Space station", "Atlantis"].includes(name) ? [] : aliases.flatMap((alias) => { const i = n.search(new RegExp(`\\b${normalize(alias)}\\b`, "i")); return i < 0 ? [] : [{ name, alias, index: i, priority: name === "Remote" ? 2 : cities.has(name) ? 0 : name === "Europe" ? 3 : 1 }]; })).sort((a, b) => a.priority - b.priority || a.index - b.index);
  if (explicit.length) { const { name, alias, index } = explicit[0]; return { canonical: name, certainty: "verified", snippet: text.slice(Math.max(0, index - 35), Math.min(text.length, index + alias.length + 70)).trim(), label: `Location: ${name} (verified in source)` }; }
  try { const host = new URL(url).hostname.toLowerCase(); if (host.endsWith(".fi")) return { canonical: "Finland", certainty: "inferred", snippet: host, label: "Likely Finland (from domain; confirm on source)" }; if (host.endsWith(".ca")) return { canonical: "Canada", certainty: "inferred", snippet: host, label: "Likely Canada (from domain; confirm on source)" }; } catch { /* invalid source URL */ }
  return { canonical: null, certainty: "unknown", snippet: null, label: "Location not stated in excerpt" };
}

export function locationConstraintMatch(info: LocationInfo, constraints: SearchConstraints, evidenceText = ""): "match" | "mismatch" | "unknown" {
  if (!constraints.locations.length) return "unknown";
  const evidence = normalize(info.snippet ?? "");
  for (const requested of constraints.locations) { const aliases = places[requested] ?? [normalize(requested)]; if (aliases.some((alias) => new RegExp(`\\b${normalize(alias)}\\b`, "i").test(evidence))) return "match"; }
  if (!info.canonical) {
    const allEvidence = normalize(evidenceText);
    if (constraints.locations.some((requested) => (places[requested] ?? [normalize(requested)]).some((alias) => new RegExp(`\\b${normalize(alias)}\\b`, "i").test(allEvidence)))) return "match";
    return "mismatch";
  }
  if (constraints.locations.includes(info.canonical)) return "match";
  const countryByCity: Record<string, string> = { Gothenburg: "Sweden", Stockholm: "Sweden", Tampere: "Finland", Helsinki: "Finland", Espoo: "Finland", Oulu: "Finland", Turku: "Finland", "Jyväskylä": "Finland", Vaasa: "Finland", Lappeenranta: "Finland", Kuopio: "Finland", Toronto: "Canada", Vancouver: "Canada" };
  if (constraints.locations.includes(countryByCity[info.canonical] ?? "")) return "match";
  if (constraints.locations.includes("Europe") && ["Finland", "Sweden", "Germany"].includes(countryByCity[info.canonical] ?? info.canonical)) return "match";
  return "mismatch";
}

export function extractDeadlineEvidence(text: string, referenceDate = today()): DeadlineEvidence | null {
  const monthNames = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|tammikuuta|helmikuuta|maaliskuuta|huhtikuuta|toukokuuta|kesäkuuta|heinäkuuta|elokuuta|syyskuuta|lokakuuta|marraskuuta|joulukuuta";
  const re = new RegExp(`\\b(?:20\\d{2}-\\d{1,2}-\\d{1,2}|\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\d{1,2}\\s+(?:${monthNames})\\s+20\\d{2}|(?:${monthNames})\\s+\\d{1,2},?\\s+20\\d{2}|(?:${monthNames})\\s+20\\d{2})\\b`, "gi");
  const cues = /deadline|apply by|application|closing|close|haku|hae ennen|viimeistään|päättyy|hakuaika/ig;
  for (const cue of text.matchAll(cues)) {
    const start = cue.index ?? 0, window = text.slice(start, start + 220), m = re.exec(window); re.lastIndex = 0;
    if (!m) continue;
    const token = m[0]; let iso = "", precision: "day" | "month" = "day";
    const n = token.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/), fi = token.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (n) iso = `${n[1]}-${n[2].padStart(2,"0")}-${n[3].padStart(2,"0")}`;
    else if (fi) iso = `${fi[3].length===2?"20":""}${fi[3]}-${fi[2].padStart(2,"0")}-${fi[1].padStart(2,"0")}`;
    else { const yearMonth=token.match(/^([a-zäö]+)\s+(20\d{2})$/i); const d = yearMonth ? NaN : Date.parse(token); if (Number.isFinite(d)) iso = new Date(d).toISOString().slice(0,10); else { const ym=token.match(/(20\d{2})/); const mi=token.match(new RegExp(monthNames,"i"))?.[0]; const months=["january","february","march","april","may","june","july","august","september","october","november","december","jan","feb","mar","apr","jun","jul","aug","sep","sept","oct","nov","dec","tammikuuta","helmikuuta","maaliskuuta","huhtikuuta","toukokuuta","kesäkuuta","heinäkuuta","elokuuta","syyskuuta","lokakuuta","marraskuuta","joulukuuta"].indexOf(normalize(mi??"")); if(ym&&months>=0){ iso=`${ym[1]}-${String((months%12)+1).padStart(2,"0")}`; precision="month"; } } }
    if (iso) return { value: token, normalizedDate: iso, precision, evidenceExcerpt: text.slice(Math.max(0,start-70),Math.min(text.length,start+Math.max(160,window.indexOf(token)+token.length+30))).trim(), isPast: iso < (precision === "month" ? referenceDate.slice(0,7) : referenceDate) };
  }
  return null;
}

export function extractDeadline(text: string, highlights: string[] = [], referenceDate = today()): DeadlineEvidence | null {
  const sources = [...highlights, text].filter(Boolean);
  const cue = /deadline|apply by|application|closing|close|haku|hae ennen|viimeistään|päättyy|hakuaika|application period|reopens?|opens?/ig;
  const date = /\b(?:20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+20\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2},?\s+20\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2})\b/gi;
  const monthNames = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
  const range = new RegExp(`\\b(${monthNames})\\s+\\d{1,2}\\s*[–—-]\\s*(?:(${monthNames})\\s*)?(\\d{1,2})(?:,?\\s*(20\\d{2}))?\\b`, "i");
  const numericRange = /\b\d{1,2}\.?\s*[–—-]\s*(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/i;
  const monthOnly = new RegExp(`\\b(?:reopens?|opens?)\\s+(?:again\\s+)?(?:in\\s+)?(${monthNames})(?:\\s+(20\\d{2}))?\\b`, "i");
  const fromRange = (source: string, excerpt: string): DeadlineEvidence | null => {
    const numeric = excerpt.match(numericRange);
    if (numeric) { const token = `${numeric[1]}.${numeric[2]}.${numeric[3]}`; const evidence = extractDeadlineEvidence(`Deadline ${token}`, referenceDate); return evidence ? { ...evidence, value: token, evidenceExcerpt: excerpt.trim() } : null; }
    const match = excerpt.match(range);
    if (!match) return null;
    const endMonth = match[2] ?? match[1], endDay = match[3], year = match[4];
    if (!year) return { value: `${endMonth} ${endDay} (year not stated)`, normalizedDate: null, precision: "range", evidenceExcerpt: excerpt.trim(), isPast: false };
    const token = `${endMonth} ${endDay}, ${year}`, evidence = extractDeadlineEvidence(`Deadline ${token}`, referenceDate);
    return evidence ? { ...evidence, value: token, evidenceExcerpt: excerpt.trim() } : null;
  };
  for (const source of sources) {
    const reopen = source.match(monthOnly);
    if (reopen) { const year = reopen[2] ? ` ${reopen[2]}` : ""; const label = `${reopen[1][0].toUpperCase()}${reopen[1].slice(1)}${year} (month only — exact day not stated)`; return { value: label, normalizedDate: null, precision: "cycle", evidenceExcerpt: source.slice(Math.max(0, (reopen.index ?? 0) - 40), (reopen.index ?? 0) + reopen[0].length + 40).trim(), isPast: false }; }
    for (const match of source.matchAll(cue)) {
      const start = match.index ?? 0, snippet = source.slice(start, start + 240), found = snippet.match(date)?.[0];
      const ranged = fromRange(source, snippet); if (ranged) return ranged;
      date.lastIndex = 0;
      if (found) { const result = extractDeadlineEvidence(`${snippet.slice(0, snippet.indexOf(found))}${found}`, referenceDate); if (result) return { ...result, evidenceExcerpt: snippet.slice(0, Math.max(120, snippet.indexOf(found) + found.length)).trim() }; }
    }
  }
  for (const source of sources) {
    const ranged = fromRange(source, source); if (ranged) return ranged;
    const found = source.match(date)?.[0]; date.lastIndex = 0;
    if (found) { const result = extractDeadlineEvidence(`Application date: ${found}`, referenceDate); if (result) return { ...result, evidenceExcerpt: source.slice(Math.max(0, source.indexOf(found) - 80), source.indexOf(found) + found.length + 80).trim() }; }
  }
  return null;
}

export function extractProgramCycle(text: string, referenceDate = today()): { value: string; isPast: boolean } | null {
  const m = text.match(/\b(summer|spring|autumn|fall|winter|kesä|kevät|syksy|talvi)\s+(20\d{2})\b/i); if (!m) return null;
  const season = m[1], year = Number(m[2]), currentYear = Number(referenceDate.slice(0,4));
  return { value: m[0], isPast: year < currentYear || (year === currentYear && /summer|spring|kesä|kevät/i.test(season) && referenceDate.slice(5,7) >= "09") };
}

export function extractAcademicCycle(text: string, referenceDate = today()): { value: string; isPast: boolean } | null {
  const match = text.match(/\b(20\d{2})\s*[–—/-]\s*(20\d{2}|\d{2})(?:\s+(?:academic year|academic cycle|intake|cohort))?\b/i);
  if (!match) return null;
  const startYear = Number(match[1]), endYear = match[2].length === 2 ? Math.floor(startYear / 100) * 100 + Number(match[2]) : Number(match[2]);
  return { value: match[0].trim(), isPast: endYear < Number(referenceDate.slice(0, 4)) };
}

export function classifyOpportunity(title: string, text: string): { eligible: boolean; type: string } {
  const value = `${title} ${text}`.toLowerCase();
  if (/senior|principal|director|permanent full[- ]time/.test(value) && !/intern|thesis|trainee|research assistant/.test(title.toLowerCase())) return { eligible: false, type: "Unrelated role" };
  if (/master'?s thesis|bachelor'?s thesis|thesis worker|diplomity|thesis|gradutoimeksianto|gradu\b/.test(title.toLowerCase())) return { eligible: true, type: "Master's Thesis / Diplomityö" };
  if (/intern|harjoittel|trainee/.test(title.toLowerCase())) return { eligible: true, type: "Internship / Harjoittelu" };
  if (/master'?s thesis|bachelor'?s thesis|thesis worker|diplomity|thesis (?:position|work|project)|gradutoimeksianto|gradu\b/.test(value)) return { eligible: true, type: "Master's Thesis / Diplomityö" };
  if (/intern|harjoittel|trainee/.test(value)) return { eligible: true, type: "Internship / Harjoittelu" };
  if (/research assistant/.test(value)) return { eligible: true, type: "Research Assistant" };
  return { eligible: false, type: "Unrelated role" };
}
export function isStudentOpportunity(title: string, text: string) { return classifyOpportunity(title, text).eligible; }
export function isAllowedRoleMode(title: string, text: string, mode: OpportunityRoleMode = "internship") {
  if (mode === "both") return true;
  const type = classifyOpportunity(title, text).type;
  return mode === "thesis" ? type === "Master's Thesis / Diplomityö" : type !== "Master's Thesis / Diplomityö";
}

export function explainOpportunityMatch(item: Partial<Opportunity>, profile: Partial<Profile>, query = "") {
  const text = `${item.title ?? ""} ${item.summary ?? ""} ${item.source?.excerpt ?? ""}`.toLowerCase();
  const skills = (profile.skills ?? "").split(/[,;\n]/).map((x) => x.trim()).filter((x) => x.length > 2);
  const matchedSkills = skills.filter((skill) => text.includes(skill.toLowerCase()));
  const topics = [profile.field, profile.interests, ...query.split(/[,;\s]+/)].filter((x): x is string => Boolean(x && x.length > 3)).filter((x) => text.includes(x.toLowerCase())).slice(0,8);
  const constraints = parseSearchConstraints(query, profile), locationInfo = extractLocationInfo(`${item.title ?? ""} ${item.source?.excerpt ?? ""}`, item.source?.url);
  const locationMatch = locationConstraintMatch(locationInfo, constraints, text);
  const conflict = constraints.excludeDegree && /(?:bachelor'?s|master'?s|completed)?\s*degree(?:\s+in\s+[^.;,]{2,60})?\s+(?:is\s+)?required|completed degree|must have (?:a )?(?:bachelor'?s|master'?s) degree|degree required/i.test(text) || constraints.excludeTravel && /travel required|must be willing to travel/i.test(text) || constraints.excludeSenior && /senior|principal|director/i.test(item.title ?? "");
  const breakdown: MatchScoreBreakdown = { base: 40, topicSkill: Math.min(25, topics.length * 4 + matchedSkills.length * 5), studentRole: /thesis|internship|trainee|research assistant/i.test(item.type ?? "") ? 15 : 0, location: locationMatch === "match" && locationInfo.certainty === "verified" ? 10 : 0, openStatus: item.status === "Verified open" ? 5 : 0, missingLocation: locationMatch === "unknown" || locationMatch === "mismatch" ? -10 : 0, missingDeadline: !item.deadline ? -5 : 0, constraintConflict: conflict ? -30 : 0, clampAdjustment: 0 };
  const rawScore = breakdown.base + breakdown.topicSkill + breakdown.studentRole + breakdown.location + breakdown.openStatus + breakdown.missingLocation + breakdown.missingDeadline + breakdown.constraintConflict;
  const score = Math.max(35, Math.min(92, rawScore));
  breakdown.clampAdjustment = score - rawScore;
  const missingInfo = [!item.deadline ? "deadline unverified" : "", locationMatch === "unknown" ? "location not verified" : "", item.status === "Unknown" ? "application status unknown" : ""].filter(Boolean);
  return { score, scoreBreakdown: breakdown, matchedSkills, matchedTopics: topics, locationMatch, locationInfo, eligibilityStatus: conflict ? "Constraint check: Degree requirement conflict" : "No detected conflict", missingInfo, reason: `${topics.length ? "Topic evidence" : "Limited topic evidence"}${matchedSkills.length ? `; ${matchedSkills.length} skill overlap${matchedSkills.length>1?"s":""}`:""}; ${locationInfo.label}` };
}
export function scoreOpportunity(item: Partial<Opportunity>, profile: Partial<Profile>, query = "") { return explainOpportunityMatch(item, profile, query).score; }
