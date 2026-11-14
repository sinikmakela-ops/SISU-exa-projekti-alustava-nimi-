import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyOpportunity,
  explainOpportunityMatch,
  extractDeadline,
  extractLocationInfo,
  inferOpportunityRoleMode,
  locationConstraintMatch,
  parseSearchConstraints,
} from "../lib/matching.ts";
import { createOutreachDraft, sanitizeBackgroundText } from "../lib/outreach.ts";

test("query intent selects thesis search without a hard-coded internship filter", () => {
  assert.equal(inferOpportunityRoleMode("Find an AI master's thesis"), "thesis");
  assert.equal(inferOpportunityRoleMode("Find an engineering internship"), "internship");
  assert.equal(inferOpportunityRoleMode("engineering opportunity"), "both");
  assert.equal(inferOpportunityRoleMode("Find thesis roles", "internship"), "internship");
});

test("hard location requests reject unrelated Earth sources and impossible locations", () => {
  const mars = parseSearchConstraints("internship on Mars");
  assert.deepEqual(mars.locations, ["Mars"]);
  assert.equal(locationConstraintMatch(extractLocationInfo("Marine internship, Gothenburg, Sweden", "https://example.se/job"), mars, "Marine internship, Gothenburg, Sweden"), "mismatch");
  const canada = parseSearchConstraints("internship in Canada");
  assert.equal(locationConstraintMatch(extractLocationInfo("Toronto, Canada internship", "https://example.ca/job"), canada), "match");
  const finland = parseSearchConstraints("internship in Finland");
  assert.equal(locationConstraintMatch(extractLocationInfo("Head office: Sweden. Role available in Finland.", "https://example.se/job"), finland, "Head office: Sweden. Role available in Finland."), "match");
});

test("negative eligibility constraints are parsed and degree conflicts reduce scores", () => {
  assert.equal(parseSearchConstraints("internship without degree").excludeDegree, true);
  const result = explainOpportunityMatch({ title: "Robotics Intern", type: "Internship / Harjoittelu", summary: "Bachelor's degree required", status: "Unknown", source: { title: "Role", url: "https://example.com", excerpt: "Bachelor's degree required" } }, {}, "internship without degree");
  assert.equal(result.eligibilityStatus, "Constraint check: Degree requirement conflict");
  assert.ok(result.score <= 40);
});

test("deadline extraction uses both highlights and source text and marks past dates", () => {
  assert.equal(extractDeadline("", ["Applications close November 6, 2026"], "2026-11-14")?.isPast, true);
  assert.equal(extractDeadline("Haku päättyy 31.1.2027", [], "2026-11-14")?.normalizedDate, "2027-01-31");
  assert.equal(extractDeadline("Apply by 2027-01-31", [], "2026-11-14")?.normalizedDate, "2027-01-31");
});

test("month-only deadlines preserve precision without guessing a day", () => {
  const result = extractDeadline("Applications close January 2027", [], "2026-11-14");
  assert.equal(result?.precision, "month");
  assert.equal(result?.normalizedDate, "2027-01");
});

test("source location prioritizes explicit place mentions and only infers from supported domains", () => {
  assert.equal(extractLocationInfo("Engineering internship in Tampere, Finland", "https://example.fi/jobs").canonical, "Tampere");
  assert.equal(extractLocationInfo("Student role", "https://example.ca/jobs").certainty, "inferred");
  assert.equal(extractLocationInfo("Student role", "https://example.com/jobs").certainty, "unknown");
});

test("role classification excludes unrelated senior permanent jobs", () => {
  assert.equal(classifyOpportunity("Senior Director, permanent full-time", "").eligible, false);
  assert.equal(classifyOpportunity("Research Assistant", "University lab role").type, "Research Assistant");
  assert.equal(classifyOpportunity("Master's Thesis Worker", "").type, "Master's Thesis / Diplomityö");
});

test("match scores are calibrated and explain their component values", () => {
  const result = explainOpportunityMatch({ title: "AI Engineering Intern", type: "Internship / Harjoittelu", summary: "Python and robotics in Tampere", deadline: "2027-01-31", status: "Verified open", source: { title: "Role", url: "https://example.fi", excerpt: "Python robotics Tampere" } }, { skills: "Python", field: "AI" }, "AI internship in Tampere");
  assert.ok(result.score >= 35 && result.score <= 92);
  assert.equal(result.score, result.scoreBreakdown.base + result.scoreBreakdown.topicSkill + result.scoreBreakdown.studentRole + result.scoreBreakdown.location + result.scoreBreakdown.openStatus + result.scoreBreakdown.missingLocation + result.scoreBreakdown.missingDeadline + result.scoreBreakdown.constraintConflict + result.scoreBreakdown.clampAdjustment);
});

test("opportunity status distinguishes explicit closed language from opening dates", () => {
  assert.equal(extractDeadline("Deadline November 6, 2026", [], "2026-11-14")?.isPast, true);
  assert.equal(extractDeadline("Applications open in May 2027", [], "2026-11-14")?.precision, "cycle");
});

test("the synthesized outreach draft removes CV dates, contact data, and raw line copying", () => {
  const rawCvLine = "Waiter at Scandic, 6/2023-present";
  const clean = sanitizeBackgroundText(`${rawCvLine}\nEmail: sini@example.com\n+358 40 123 4567`);
  assert.ok(!clean.includes("sini@example.com"));
  assert.ok(!clean.includes("2023"));
  const draft = createOutreachDraft({ name: "Sini", field: "Industrial Engineering", university: "Tampere University", skills: "Python, analytical problem solving", experience: rawCvLine }, { title: "Engineering Intern, Lab", company: "ICEYE", summary: "Hands-on engineering and testing in Espoo", type: "Internship / Harjoittelu", source: { title: "Role", url: "https://iceye.com/jobs", excerpt: "" } });
  assert.ok(!draft.includes(rawCvLine));
  assert.ok(!draft.includes("sini@example.com"));
  assert.ok(draft.includes("engineering problem-solving"));
});
