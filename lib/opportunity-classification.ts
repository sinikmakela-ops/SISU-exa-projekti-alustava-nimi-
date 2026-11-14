import type { Opportunity } from "@/lib/types";

export type SourceCategory = "specific-opportunity" | "application-guidance" | "organization-overview" | "personal-profile" | "archived-work" | "irrelevant" | "unretrievable";
export type Availability = "Open" | "Upcoming" | "Verified" | "Closed" | "Unverified";
export type SourceClassification = {
  category: SourceCategory;
  availability: Availability | null;
  reason: string;
  evidenceExcerpt: string | null;
  applicationRoute: "apply" | "propose" | "contact" | "none";
  generalProgram?: boolean;
};

const profilePage = /\b(linkedin\.com\/in\/|people|personnel|our people|staff directory|researcher profile|staff profile|faculty profile|biography|bio|dr\.|professor)\b/i;
const archivePage = /\b(archive|archived|thesis repository|institutional repository|repository|dissertations|completed thesis|past project|project archive|historical)\b/i;
const guidancePage = /\b(careers|career opportunities|how to apply|application process|internship opportunities|jobs and careers|join our team|open positions)\b/i;
const rolePage = /\b(intern(ship)?|trainee(ship)?|summer student|student assistant|student (?:intern(ship)?|position|role|job|worker|researcher|program(me)?|opportunity|fellowship)|research assistant|thesis (project|topic|position|worker)|thesis worker|diplomity[oö](?:ntekijä)?|gradutoimeksianto|doctoral position|fellowship for students|scholarship for students|harjoittel(?:u|ija|upaikka)|kesäty[oö](?:ntekijä)?|junior|entry[- ]level)\b/i;
const generalStudentProgram = /\b(?:(?:student|graduate|trainee|thesis|early[- ]career)\s+(?:trainee\s+)?program(?:me)?|program(?:me)?\s+for\s+(?:students|graduates|trainees)|graduate (?:trainee|development) program)\b/i;
const routeApply = /\b(apply now|apply by|submit (?:an? )?application|applications? (?:are )?open|application (?:window|period)|accepting applications|now accepting|application deadline|send your application|apply through|applications close|hakuaika|hae (?:nyt|ennen)|haku päättyy)\b/i;
const routePropose = /\b(propose (?:a )?(?:thesis|project|topic)|thesis proposals? (?:are )?(?:welcome|invited|accepted)|students? (?:can|may|are invited to) propose|we welcome thesis|opinnäyte.{0,30}(?:ehdot|aihe)|diplomityö.{0,30}(?:aihe|ehdot))\b/i;
const routeContact = /\b(contact (?:the )?(?:supervisor|principal investigator|team|research group)|email (?:the )?(?:supervisor|team|contact)|get in touch (?:with|to) (?:the )?(?:supervisor|team)|contact person)\b/i;
const explicitClosed = /\b(closed|filled|expired|no longer accepting|applications? (?:are )?not (?:being )?accepted|position has been filled|haku päättynyt|haku on päättynyt)\b/i;
const futureOpening = /\b(?:applications?|application window|recruitment|haku) (?:will )?(?:open|opens|start|starts|begin|begins|reopen|reopens)\s+(?:on\s+)?(?:in\s+)?(?:[A-Z][a-z]+\s+)?(?:\d{1,2},?\s+)?(?:20\d{2}|January|February|March|April|May|June|July|August|September|October|November|December|Q[1-4])|\b(?:opens?|reopens?)\s+(?:again\s+)?(?:in\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/i;
const explicitOpen = /\b(accepting applications|applications? (?:are )?(?:now )?open|apply now|submit your application now|haku on auki|haku on käynnissä|hakuaika on käynnissä|hae nyt)\b/i;
const sentenceEnd = /(?<=[.!?])\s+|\n+/;
const genericOpportunityTitle = /^(?:careers?|internships?(?:\s+and\s+traineeships?)?|internship opportunities|student opportunities|thesis opportunities|research opportunities|open positions|join our team|graduate jobs?)$/i;

function usefulEvidence(text: string): string | null {
  const sentences = text.split(sentenceEnd).map((sentence) => sentence.trim()).filter(Boolean);
  return sentences.find((sentence) => rolePage.test(sentence) && (routeApply.test(sentence) || routePropose.test(sentence) || routeContact.test(sentence)))
    ?? sentences.find((sentence) => (routeApply.test(sentence) || routePropose.test(sentence)) && rolePage.test(text))
    ?? sentences.find((sentence) => rolePage.test(sentence))
    ?? null;
}

export function classifyOpportunitySource(input: { title: string; url: string; text: string; deadlineIsPast?: boolean }): SourceClassification {
  const { title, url } = input;
  const text = input.text.replace(/\s+/g, " ").trim();
  if (profilePage.test(`${url} ${title}`)) return { category: "personal-profile", availability: null, reason: "This source is a person or staff profile, not an opportunity posting.", evidenceExcerpt: null, applicationRoute: "none" };
  if (archivePage.test(`${url} ${title}`)) return { category: "archived-work", availability: "Closed", reason: "This source is an archive or repository record, not a current student opportunity.", evidenceExcerpt: null, applicationRoute: "none" };
  if (text.length < 120) return { category: "unretrievable", availability: null, reason: "The source did not provide enough page content to verify a specific opportunity.", evidenceExcerpt: null, applicationRoute: "none" };
  const combined = `${title}\n${url}\n${text}`;
  if (archivePage.test(`${url} ${title} ${text.slice(0, 800)}`)) return { category: "archived-work", availability: "Closed", reason: "This source describes archived or completed work rather than an available student opportunity.", evidenceExcerpt: null, applicationRoute: "none" };
  const generalProgram = generalStudentProgram.test(`${title} ${text}`);
  const hasNamedRole = rolePage.test(title) || /\b(student|intern|trainee|thesis|diplomity[oö]|assistant)\b/i.test(title) || generalProgram;
  const juniorWithoutStudentContext = /\b(junior|entry[- ]level)\b/i.test(`${title} ${text}`) && !/\b(student|graduate|trainee|intern|thesis|undergraduate|enrolled)\b/i.test(`${title} ${text}`);
  const specificRoleTitle = rolePage.test(title) && title.trim().split(/\s+/).length >= 2 && !genericOpportunityTitle.test(title.trim()) && !juniorWithoutStudentContext;
  const evidenceExcerpt = usefulEvidence(text) ?? (specificRoleTitle ? text.split(sentenceEnd).map((sentence) => sentence.trim()).find(Boolean) ?? null : null);
  const route = routeApply.test(text) ? "apply" : routePropose.test(text) ? "propose" : routeContact.test(text) ? "contact" : "none";
  const specific = Boolean(hasNamedRole && evidenceExcerpt && !juniorWithoutStudentContext && (route !== "none" || generalProgram || specificRoleTitle));
  if (specific) {
    if (input.deadlineIsPast || explicitClosed.test(text)) return { category: "specific-opportunity", availability: "Closed", reason: "A specific student opportunity is described, but its source says it is closed or its deadline has passed.", evidenceExcerpt: evidenceExcerpt!.slice(0, 420), applicationRoute: route, generalProgram };
    if (futureOpening.test(text)) return { category: "specific-opportunity", availability: "Upcoming", reason: "The source describes a specific student opportunity and gives a future application opening window.", evidenceExcerpt: evidenceExcerpt!.slice(0, 420), applicationRoute: route, generalProgram };
    if (explicitOpen.test(text)) return { category: "specific-opportunity", availability: "Open", reason: "The source explicitly says applications are being accepted.", evidenceExcerpt: evidenceExcerpt!.slice(0, 420), applicationRoute: route, generalProgram };
    return { category: "specific-opportunity", availability: "Verified", reason: "A specific student role or program is on this source, and no closed or expired status was found. Availability wording and deadline are not listed.", evidenceExcerpt: evidenceExcerpt!.slice(0, 420), applicationRoute: route, generalProgram };
  }
  if (guidancePage.test(`${title} ${url} ${text.slice(0, 1000)}`)) return { category: "application-guidance", availability: null, reason: "This page explains careers or applications but does not identify a specific student opening.", evidenceExcerpt: text.slice(0, 360), applicationRoute: "none" };
  if (/\b(research group|laboratory|lab group|research areas|our research|research topics|research team)\b/i.test(combined)) return { category: "organization-overview", availability: null, reason: "This page describes an organization or research area without a specific student opening or proposal route.", evidenceExcerpt: text.slice(0, 360), applicationRoute: "none" };
  if (profilePage.test(combined)) return { category: "personal-profile", availability: null, reason: "This source appears to be a personal or researcher profile, not an opportunity posting.", evidenceExcerpt: null, applicationRoute: "none" };
  return { category: "irrelevant", availability: null, reason: "The source does not substantiate a specific student opportunity or useful application guidance.", evidenceExcerpt: null, applicationRoute: "none" };
}

export type RelatedInformation = { id: string; title: string; url: string; excerpt: string; category: SourceCategory; reason: string };

export function canShowAsActiveOpportunity(classification: SourceClassification): boolean {
  return classification.category === "specific-opportunity" && (classification.availability === "Open" || classification.availability === "Upcoming" || classification.availability === "Verified");
}

export function canShowAsUnverifiedOpportunity(classification: SourceClassification): boolean {
  return classification.category === "specific-opportunity" && classification.availability === "Unverified" && Boolean(classification.evidenceExcerpt);
}

export function isUsefulRelatedInformation(classification: SourceClassification): boolean {
  return classification.category === "application-guidance";
}

export function opportunityDeduplicationKey(title: string, url: string): string {
  const cleanTitle = title.replace(/\s*(?:\||[-–—])\s*(?:via\s+)?(?:LinkedIn|Indeed|Glassdoor|Job board)\s*$/i, "").trim();
  const atOrganization = cleanTitle.match(/\b(?:at|@)\s+(.+)$/i)?.[1]?.trim();
  const parts = cleanTitle.split(/\s*[-–—|]\s*/);
  const titleOrganization = parts.length === 2 && parts[1].split(/\s+/).length <= 5 ? parts[1] : "";
  const organization = atOrganization || titleOrganization;
  const roleTitle = atOrganization ? cleanTitle.replace(/\b(?:at|@)\s+.+$/i, "").trim() : titleOrganization ? parts[0] : cleanTitle;
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { /* Keep URL fallback below. */ }
  const jobBoards = /(^|\.)(linkedin\.com|indeed\.com|glassdoor\.[a-z.]+|stepstone\.[a-z.]+|jobs\.com)$/i.test(host);
  const orgKey = organization ? organization : jobBoards ? url.toLowerCase().replace(/\/$/, "") : host;
  return `${roleTitle.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${orgKey.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim()}`;
}

export function opportunityAvailabilityStatus(availability: Availability): Opportunity["status"] {
  if (availability === "Open") return "Verified open";
  if (availability === "Upcoming") return "Possibly open";
  if (availability === "Closed") return "Closed";
  if (availability === "Verified") return "Verified";
  return "Unknown";
}
