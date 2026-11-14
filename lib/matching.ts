import type { Opportunity, Profile } from "./types";

export function scoreOpportunity(item: Partial<Opportunity>, profile: Partial<Profile>, query = ""): { score: number; reason: string } {
  const text = `${item.title ?? ""} ${item.summary ?? ""} ${item.source?.excerpt ?? ""}`.toLowerCase();
  const profileTerms = [profile.field, profile.degree, profile.skills, profile.interests, profile.experience, query]
    .filter(Boolean).join(" ").toLowerCase().split(/[^a-zåäö0-9+#]+/).filter((word) => word.length > 3);
  const matched = [...new Set(profileTerms.filter((word) => text.includes(word)))].slice(0, 4);
  const opportunityType = `${item.title ?? ""} ${item.type ?? ""}`.toLowerCase();
  const studentWork = /intern|trainee|thesis|student|research assistant|harjoittelu|diplomityö|gradu|opinnäytetyö/.test(opportunityType);
  const score = Math.min(96, 56 + matched.length * 7 + (studentWork ? 12 : 0));
  return { score, reason: matched.length ? `Relevant to ${matched.join(", ")}` : "Related to your stated study and opportunity interests" };
}

export function isStudentOpportunity(title: string, text: string) {
  return /intern|trainee|thesis|student|research assistant|harjoittelu|diplomityö|gradu|opinnäytetyö|lopputyö/i.test(`${title} ${text}`);
}
