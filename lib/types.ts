export type Profile = {
  name: string; degree: string; field: string; university: string; level: string;
  graduation: string; skills: string; interests: string; locations: string;
  preference: string; languages: string; experience: string; cvText: string;
};

export type ResearchSource = { title: string; url: string; publishedDate?: string | null; excerpt: string };
export type FactCitation = { sourceUrl: string; evidenceExcerpt: string };
export type InvestigationData = {
  source?: { title?: string; url: string; excerpt: string };
  sources: ResearchSource[];
  organizationDomain?: string;
  instructionQuery?: string;
  summary: string;
  status?: "Verified open" | "Possibly open" | "Unknown" | "Closed";
  deadline: string | null;
  deadlineEvidence: FactCitation | null;
  applicationMethod: { type: "email" | "portal" | "other" | "unknown"; details: string | null; sourceUrl: string | null; evidenceExcerpt: string | null };
  contactPerson: { name: string; role: string | null; sourceUrl: string; evidenceExcerpt: string } | null;
  applicationSteps: Array<{ order: number; step: string; sourceUrl: string; evidenceExcerpt: string }>;
  verifiedRequirements: VerifiedRequirement[];
  sourceChecklist: SourceChecklistItem[];
  checklist: ChecklistItem[];
  requirements: string[];
  failures: string[];
  researchedAt: string;
  usedOpenAI: boolean;
};

export type SimilarOpportunity = { title: string; url: string; highlights: string[]; text?: string };

export type Opportunity = {
  id: string; title: string; company: string; type: string; location: string;
  summary: string; deadline: string | null; status: "Verified open" | "Possibly open" | "Unknown" | "Closed";
  match: number; matchReason: string; requirements: string[]; source: { title: string; url: string; excerpt: string };
  matchedSkills?: string[];
  locationMatch?: "match" | "mismatch" | "unknown";
  locationLabel?: string;
  locationSnippet?: string | null;
  matchedTopics?: string[];
  scoreBreakdown?: { base: number; topicSkill: number; studentRole: number; location: number; openStatus: number; missingLocation: number; missingDeadline: number; constraintConflict: number; clampAdjustment: number };
  eligibilityStatus?: string;
  applicationStatus?: "Verified open" | "Possibly open" | "Unknown" | "Closed";
  closedEvidence?: string | null;
  programCycle?: string | null;
  constraintMismatches?: string[];
  missingInfo?: string[];
  manualDocuments?: string[];
  investigation?: InvestigationData;
  publishedDate?: string; saved?: boolean; stage?: string; checklist?: ChecklistItem[];
};

export type ChecklistItem = { id: string; label: string; status: "Ready" | "Missing" | "Needs review" | "Needs confirmation" | "Completed" };

export type VerifiedRequirement = {
  requirement: string;
  evidenceExcerpt: string;
  sourceUrl: string;
  documentType: string | null;
  readiness: "Ready" | "Missing" | "Needs review" | "Needs confirmation";
};

export type SourceChecklistItem = {
  id: string;
  label: string;
  verification: "Verified" | "Needs confirmation";
  readiness: "Ready" | "Missing" | "Needs review" | "Needs confirmation";
  evidenceExcerpt: string | null;
  sourceUrl: string | null;
};
