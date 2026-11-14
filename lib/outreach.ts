import type { InvestigationData, Opportunity, Profile } from "@/lib/types";

const sectionHeader = /^(?:contact(?: information)?|personal details|profile|professional summary|summary|objective|education|work experience|professional experience|experience|employment history|skills|technical skills|projects|leadership|volunteering|references|certifications|publications)\s*:?[\s]*$/i;
const datePattern = /\b(?:\d{1,2}[./-]\d{1,2}[./-](?:19|20)?\d{2}|\d{1,2}[./-](?:19|20)\d{2}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:\d{1,2}(?:,?\s+(?:19|20)\d{2})?|(?:19|20)\d{2})(?:\s*[-–—/]\s*(?:(?:19|20)?\d{2}|present|current))?|(?:19|20)\d{2}(?:\s*[-–—/]\s*(?:(?:19|20)?\d{2}|present|current))?|\b(?:present|current)\b)\b/gi;

/** Remove personal contact data, dates, addresses and section labels before any CV text is used for synthesis. */
export function sanitizeBackgroundText(value: string): string {
  return value
    .split(/\r?\n/)
    .filter((line) => !sectionHeader.test(line.trim()))
    .filter((line) => !/\b(?:email|e-mail|phone|mobile|address|street|road|avenue|postcode|postal code)\s*:/i.test(line))
    .map((line) => line
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ")
      .replace(/(?:https?:\/\/|www\.)\S+/gi, " ")
      .replace(/\+?\d[\d\s().-]{7,}\d/g, " ")
      .replace(/\b\d{4,5}\s+[A-Z][\w.-]+\s+(?:street|st\.?|road|rd\.?|avenue|ave\.?|katu|tie)\b/gi, " ")
      .replace(datePattern, " ")
      .replace(/^\s*(?:[-*•▪]|\d+[.)])\s*/, "")
      .replace(/\s+/g, " ")
      .trim())
    .filter((line) => line.length > 2 && !sectionHeader.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
}

function includesAny(text: string, pattern: RegExp) { return pattern.test(text); }

function roleFocus(item: Pick<Opportunity, "title" | "type" | "summary">, facts: InvestigationData["practicalFacts"]): string {
  const context = `${item.title} ${item.type} ${item.summary} ${(facts ?? []).map((fact) => `${fact.category} ${fact.value}`).join(" ")}`.toLowerCase();
  if (/engineering|hardware|systems|lab|laboratory|test/.test(context)) return "engineering problem-solving, careful testing and practical technical work";
  if (/software|developer|programming|python|data|machine learning|\bai\b|robotics/.test(context)) return "analytical problem-solving and building or evaluating technical solutions";
  if (/research|thesis|scientific|laboratory|research assistant/.test(context)) return "structured research, careful analysis and clear communication of findings";
  if (/sustainab|climate|environment|energy/.test(context)) return "analytical work on sustainability and environmental challenges";
  if (/business|finance|marketing|consult|customer|commercial/.test(context)) return "analytical thinking, clear communication and practical business problem-solving";
  return "the role’s practical problem-solving and collaborative work";
}

/** Build natural, role-specific prose from user facts and verified opportunity metadata; never includes source or CV lines verbatim. */
export function createOutreachDraft(profile: Partial<Profile>, item: Pick<Opportunity, "title" | "company" | "summary" | "type" | "source">, investigation?: Pick<InvestigationData, "practicalFacts" | "contactPerson">): string {
  const cleanCv = sanitizeBackgroundText(profile.cvText ?? "").toLowerCase();
  const cleanExperience = sanitizeBackgroundText(profile.experience ?? "").toLowerCase();
  const background = `${cleanCv} ${cleanExperience}`;
  const field = sanitizeBackgroundText(profile.field ?? "");
  const university = sanitizeBackgroundText(profile.university ?? "");
  const level = (profile.level ?? "student").trim().toLowerCase();
  const skills = sanitizeBackgroundText(profile.skills ?? "").split(/[,;\n|]+/).map((skill) => skill.trim()).filter((skill) => skill.length > 1 && !/[\r\n@]/.test(skill)).slice(0, 4);
  const target = roleFocus(item, investigation?.practicalFacts);
  const safeTitle = item.title.replace(/https?:\/\/\S+|\b(?:jobs\.)?(?:ashbyhq\.com|lever\.co|greenhouse\.io|myworkdayjobs\.com|smartrecruiters\.com)\b/gi, "").replace(/\s+/g, " ").trim().replace(/\s+at\s*$/i, "") || "this opportunity";
  const blockedCompany = /ashbyhq|greenhouse|workday|lever\.co|smartrecruiters/i.test(item.company) || /^[\w.-]+\.[a-z]{2,}$/i.test(item.company) || /ashbyhq|greenhouse|workday|lever\.co|smartrecruiters/i.test(item.source.url);
  const safeCompany = blockedCompany ? "your organization" : item.company;
  const evidenceSentences: string[] = [];
  if (includesAny(background, /\b(team|collaborat|customer|service|hospitality|waiter|restaurant|retail|care|volunteer|club|instructor|coach|communicat|stakeholder)\w*/)) evidenceSentences.push("Working with people in busy and collaborative settings has strengthened my communication, teamwork and reliability.");
  if (includesAny(background, /\b(lead|organis|initiative|founded|created|coordinat|instructor|coach|club|volunteer|project owner)\w*/)) evidenceSentences.push("Taking responsibility in group and project settings has also developed my initiative and follow-through.");
  if (includesAny(background, /\b(deadline|fast[- ]paced|shift|operation|responsib|reliable|pressure|service)\w*/)) evidenceSentences.push("These experiences have taught me to stay dependable and composed while managing competing priorities.");
  const study = [level, field ? `in ${field}` : "", university ? `at ${university}` : ""].filter(Boolean).join(" ");
  const educationSentence = field || university
    ? `As a ${study} student, I have developed a strong foundation that I am keen to apply to ${target}.`
    : `I am keen to apply a thoughtful, analytical approach to ${target}.`;
  const context = `${item.title} ${item.type} ${item.summary}`.toLowerCase();
  const relevantSkillPattern = /engineering|hardware|systems|lab|test|software|developer|programming|python|data|machine learning|\bai\b|robotics/.test(context)
    ? /engineer|python|program|code|data|analys|matlab|cad|test|design|robot|electr|mechan|team|communicat/i
    : /sustainab|climate|environment|energy/.test(context)
      ? /sustainab|climate|environment|energy|analys|research|data|communicat|team/i
      : /business|finance|marketing|consult|customer|commercial/.test(context)
        ? /business|finance|market|customer|communicat|team|analys|project|lead/i
        : /research|thesis|scientific/.test(context)
          ? /research|analys|data|python|statistic|writing|team/i
          : /.+/i;
  const relevantSkills = skills.filter((skill) => relevantSkillPattern.test(skill)).slice(0, 3);
  const skillsSentence = relevantSkills.length ? `My strengths in ${relevantSkills.join(", ")} align well with this focus.` : skills.length ? `I would bring strengths in ${skills.slice(0, 3).join(", ")} alongside a strong willingness to learn.` : "I would bring curiosity, care and a willingness to learn to this work.";
  const backgroundSentence = evidenceSentences.length ? evidenceSentences.slice(0, 2).join(" ") : "I am motivated to contribute thoughtfully and learn quickly in a new team.";
  const verifiedContext = (investigation?.practicalFacts ?? []).some((fact) => ["location", "duration", "startWindow", "workMode"].includes(fact.category))
    ? "I have reviewed the practical details shared for the opportunity and am especially interested in how the team applies this work in practice."
    : "I would welcome the chance to learn more about the team’s priorities and how I could contribute.";
  const availability = (profile.availability ?? "").trim();
  const contactName = investigation?.contactPerson?.name && investigation.contactPerson.name !== "Publicly listed contact" ? investigation.contactPerson.name : "Hiring team";
  const applicantName = (profile.name ?? "").trim() || "[Your name]";
  return [
    `Subject: Interest in ${safeTitle}`,
    "",
    `Dear ${contactName},`,
    "",
    `I am writing to express my interest in the ${safeTitle} opportunity at ${safeCompany}. ${educationSentence} ${skillsSentence}`,
    `${backgroundSentence} ${verifiedContext}`,
    availability ? `My availability is ${availability}, and I would be glad to discuss how it fits the role.` : "I would be glad to discuss timing and how my background could fit the role.",
    "",
    "Could you please let me know the best next step to apply or discuss the opportunity?",
    "",
    `Kind regards,\n${applicantName}`,
  ].join("\n");
}
