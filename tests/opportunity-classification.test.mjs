import assert from "node:assert/strict";
import test from "node:test";
import {
  canShowAsActiveOpportunity,
  canShowAsUnverifiedOpportunity,
  classifyOpportunitySource,
  isUsefulRelatedInformation,
  opportunityDeduplicationKey,
} from "../lib/opportunity-classification.ts";

const internship = classifyOpportunitySource({
  title: "Summer Engineering Internship",
  url: "https://example.org/jobs/engineering-intern",
  text: "Summer Engineering Internship: Students are invited to apply now for a specific placement in our engineering laboratory. Applications are open and must be submitted through the student hiring portal.",
});

test("specific current internship posting is an active opportunity with direct evidence", () => {
  assert.equal(internship.category, "specific-opportunity");
  assert.equal(internship.availability, "Open");
  assert.ok(internship.evidenceExcerpt.includes("apply now"));
  assert.equal(canShowAsActiveOpportunity(internship), true);
});

test("thesis project explicitly inviting proposals qualifies as a specific opportunity", () => {
  const result = classifyOpportunitySource({ title: "Master's Thesis Project: Battery Diagnostics", url: "https://example.edu/thesis/battery", text: "Master's thesis project investigating battery diagnostics in the energy systems group. We invite students to propose a thesis topic and contact the supervisor to agree on a project. The work is intended for a current graduate student." });
  assert.equal(result.category, "specific-opportunity");
  assert.equal(result.applicationRoute, "propose");
  assert.equal(result.availability, "Verified");
  assert.equal(canShowAsActiveOpportunity(result), true);
  assert.equal(canShowAsUnverifiedOpportunity(result), false);
});

test("general student programs qualify without a direct portal button when no closure is stated", () => {
  const result = classifyOpportunitySource({ title: "Graduate Trainee Program", url: "https://example.org/careers/graduate-program", text: "Our graduate trainee program offers students a structured start in engineering and business. The program runs every year and applicants can reach out to the recruitment team to discuss placement options. No direct application portal or deadline is listed." });
  assert.equal(result.category, "specific-opportunity");
  assert.equal(result.availability, "Verified");
  assert.equal(result.generalProgram, true);
  assert.equal(canShowAsActiveOpportunity(result), true);
});

test("a specific role from a legitimate source stays Verified despite ambiguous availability and no portal link", () => {
  const result = classifyOpportunitySource({ title: "Engineering Intern", url: "https://example.org/jobs/engineering-intern", text: "The engineering intern will support prototype testing and collaborate with the product team. This position is intended for a currently enrolled engineering student and includes practical laboratory work. Contact details and deadlines are not listed on this page." });
  assert.equal(result.category, "specific-opportunity");
  assert.equal(result.availability, "Verified");
  assert.equal(result.applicationRoute, "none");
  assert.equal(canShowAsActiveOpportunity(result), true);
});

test("a named recurring student program with a future application window is Upcoming", () => {
  const result = classifyOpportunitySource({ title: "Student Research Fellowship Program", url: "https://example.edu/fellowships/students", text: "The annual student program offers named research fellowships for graduate students. Applications for the 2027 Student Research Fellowship application window open in February 2027. Students apply through the fellowship portal and select a listed project." });
  assert.equal(result.category, "specific-opportunity");
  assert.equal(result.availability, "Upcoming");
  assert.equal(canShowAsActiveOpportunity(result), true);
});

test("general careers pages are guidance rather than opportunities", () => {
  const result = classifyOpportunitySource({ title: "Careers at Example", url: "https://example.com/careers", text: "Explore careers at Example and learn about our application process. Our careers website explains how to apply, how interviews work, and what it is like to join our team. No specific student opening is listed here." });
  assert.equal(result.category, "application-guidance");
  assert.equal(isUsefulRelatedInformation(result), true);
  assert.equal(canShowAsActiveOpportunity(result), false);
});

test("research group topic pages without a student route are organization overviews", () => {
  const result = classifyOpportunitySource({ title: "Robotics Research Group", url: "https://example.edu/research/robotics", text: "Our research group studies robotics, computer vision, and autonomous systems. The lab's research topics include manipulation and navigation. This page introduces the group and its publications, but does not list a student opening or a proposal route." });
  assert.equal(result.category, "organization-overview");
  assert.equal(canShowAsActiveOpportunity(result), false);
});

test("staff biographies and LinkedIn personal profiles are excluded", () => {
  const staff = classifyOpportunitySource({ title: "Dr. Jane Example", url: "https://example.edu/people/jane-example", text: "Dr. Jane Example is a professor and researcher in engineering. Her biography and publications are listed on this staff profile. Contact details are provided for academic enquiries." });
  const linkedin = classifyOpportunitySource({ title: "Research Engineer Profile", url: "https://www.linkedin.com/in/person-example", text: "Experienced research engineer with a professional biography, skills, and work history. View this person's profile and connections." });
  assert.equal(staff.category, "personal-profile");
  assert.equal(linkedin.category, "personal-profile");
  assert.equal(canShowAsActiveOpportunity(staff), false);
});

test("archived repository theses are excluded", () => {
  const result = classifyOpportunitySource({ title: "Completed Master's Thesis", url: "https://repository.example.edu/archive/theses/123", text: "This archived thesis record describes completed research deposited in the university repository. The work was completed in 2022 and is available for download as a historical record." });
  assert.equal(result.category, "archived-work");
  assert.equal(result.availability, "Closed");
  assert.equal(canShowAsActiveOpportunity(result), false);
});

test("closed and expired roles stay out of the active list", () => {
  const explicitlyClosed = classifyOpportunitySource({ title: "Engineering Intern", url: "https://example.org/jobs/intern", text: "Engineering internship for students. Apply now through the hiring portal. Applications are closed and the role has been filled." });
  const expiredDeadline = classifyOpportunitySource({ title: "Engineering Intern", url: "https://example.org/jobs/intern-2025", text: "Engineering internship for students. Apply by October 15, 2025 using the student recruitment form. The role is a fixed-term student placement working with the product engineering team.", deadlineIsPast: true });
  assert.equal(explicitlyClosed.availability, "Closed");
  assert.equal(expiredDeadline.availability, "Closed");
  assert.equal(canShowAsActiveOpportunity(explicitlyClosed), false);
});

test("syndicated copies share a deduplication key", () => {
  assert.equal(opportunityDeduplicationKey("Engineering Intern at Acme | LinkedIn", "https://linkedin.com/jobs/1"), opportunityDeduplicationKey("Engineering Intern - Acme - via Indeed", "https://indeed.com/viewjob/1"));
  assert.notEqual(opportunityDeduplicationKey("Engineering Intern at Acme", "https://acme.com/careers"), opportunityDeduplicationKey("Engineering Intern at Northstar", "https://northstar.com/jobs"));
});

test("unretrievable source content is never promoted to an opportunity", () => {
  const result = classifyOpportunitySource({ title: "Engineering Internship", url: "https://example.org/jobs/engineering", text: "" });
  assert.equal(result.category, "unretrievable");
  assert.equal(canShowAsActiveOpportunity(result), false);
  assert.equal(canShowAsUnverifiedOpportunity(result), false);
});
