export type Profile = {
  name: string; degree: string; field: string; university: string; level: string;
  graduation: string; skills: string; interests: string; locations: string;
  preference: string; languages: string; experience: string; cvText: string;
};

export type Opportunity = {
  id: string; title: string; company: string; type: string; location: string;
  summary: string; deadline: string | null; status: "Possibly open" | "Unknown" | "Closed";
  match: number; matchReason: string; requirements: string[]; source: { title: string; url: string; excerpt: string };
  publishedDate?: string; saved?: boolean; stage?: string; checklist?: ChecklistItem[];
};

export type ChecklistItem = { id: string; label: string; status: "Ready" | "Missing" | "Needs review" | "Needs confirmation" | "Completed" };
