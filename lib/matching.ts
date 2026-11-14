import type { Opportunity, Profile } from "./types";

export type OpportunityClass =
  | "Master's Thesis / Diplomatyö"
  | "Internship / Harjoittelu"
  | "Research Assistant"
  | "Exclude";

const studentTitlePattern = /\b(intern(ship)?|trainee(ship)?|thesis|diplomityö|gradutoimeksianto|master'?s thesis|research assistant|student research(er|er assistant)?|tutkimusavustaja|harjoittelu|harjoittelija|lopputyö|opinnäytetyö)\b/i;
const seniorPattern = /\b(senior|lead|principal|director|manager|head of|staff engineer|chief)\b/i;

export function classifyOpportunity(title: string, text = ""): { type: OpportunityClass; eligible: boolean; reason: string } {
  const titleText = title.trim();
  const explicitStudentRole = studentTitlePattern.test(titleText);
  const supportingText = /\b(student position|for students|student opportunity|students only|thesis position|internship position)\b|harjoittelupaikka|diplomityöpaikka/i.test(text);
  if (seniorPattern.test(titleText) && !/\b(student intern|student research assistant)\b/i.test(titleText)) {
    return { type: "Exclude", eligible: false, reason: "Senior or permanent role title is not explicitly a student opportunity." };
  }
  if (/thesis|diplomityö|gradutoimeksianto|master'?s thesis|lopputyö|opinnäytetyö/i.test(titleText) || /thesis position|diplomityöpaikka/i.test(text)) {
    return { type: "Master's Thesis / Diplomatyö", eligible: true, reason: "The title or source explicitly identifies thesis work." };
  }
  if (/research assistant|student researcher|tutkimusavustaja/i.test(titleText)) {
    return { type: "Research Assistant", eligible: true, reason: "The position title identifies a research-assistant role." };
  }
  if (/intern|trainee|harjoittelu|harjoittelija/i.test(titleText)) {
    return { type: "Internship / Harjoittelu", eligible: true, reason: "The position title identifies an internship or traineeship." };
  }
  if (explicitStudentRole || supportingText) {
    return { type: "Research Assistant", eligible: true, reason: "The source describes a student-specific opportunity." };
  }
  return { type: "Exclude", eligible: false, reason: "No explicit student, internship, research-assistant, or thesis evidence was found." };
}

export function isStudentOpportunity(title: string, text: string) {
  return classifyOpportunity(title, text).eligible;
}

export function explainOpportunityMatch(
  item: Partial<Opportunity>,
  profile: Partial<Profile>,
  query = "",
): { score: number; reason: string; matchedSkills: string[]; locationMatch: "match" | "mismatch" | "unknown"; missingInfo: string[] } {
  const evidence = (item.title || "") + " " + (item.summary || "") + " " + (item.source?.excerpt || "");
  const haystack = evidence.toLowerCase();
  const matchedSkills = [...new Set((profile.skills || "")
    .split(/[,;\n|]+/)
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 1 && haystack.includes(skill.toLowerCase())))].slice(0, 8);

  const preferredLocations = (profile.locations || "").split(/[,;\n|]+/).map((value) => value.trim().toLowerCase()).filter(Boolean);
  const locationText = (item.location || "").toLowerCase() + " " + evidence.toLowerCase();
  const hasLocationEvidence = Boolean(item.location && !/not specified|unknown|verify location/i.test(item.location));
  const locationMatch: "match" | "mismatch" | "unknown" = !preferredLocations.length || !hasLocationEvidence
    ? "unknown"
    : preferredLocations.some((place) => locationText.includes(place)) ? "match" : "mismatch";

  const missingInfo = [
    ...(item.deadline ? [] : ["Application deadline"]),
    ...(!hasLocationEvidence ? ["Work location"] : []),
    ...(item.status === "Unknown" ? ["Current opening status"] : []),
    ...(!/apply|application|email|submit|hakemus|haku/i.test(evidence) ? ["Application channel"] : []),
  ];
  const queryTerms = query.toLowerCase().split(/[^a-zåäö0-9+#]+/).filter((word) => word.length > 3);
  const matchedQueryTerms = [...new Set(queryTerms.filter((word) => haystack.includes(word)))].slice(0, 4);
  const studentRole = classifyOpportunity(item.title || "", evidence).eligible;
  const score = Math.min(98, 45 + matchedSkills.length * 8 + (locationMatch === "match" ? 12 : 0) + (studentRole ? 12 : 0) + matchedQueryTerms.length * 2);
  const reasons = [
    ...(matchedSkills.length ? ["skills: " + matchedSkills.join(", ")] : []),
    ...(locationMatch === "match" ? ["preferred location"] : []),
    ...(studentRole ? ["student opportunity type"] : []),
    ...(matchedQueryTerms.length ? ["query: " + matchedQueryTerms.join(", ")] : []),
  ];
  return {
    score,
    reason: reasons.length ? "Match based on " + reasons.join("; ") : "Limited profile overlap; confirm fit with the source.",
    matchedSkills,
    locationMatch,
    missingInfo,
  };
}

export function scoreOpportunity(item: Partial<Opportunity>, profile: Partial<Profile>, query = ""): { score: number; reason: string } {
  const { score, reason } = explainOpportunityMatch(item, profile, query);
  return { score, reason };
}
