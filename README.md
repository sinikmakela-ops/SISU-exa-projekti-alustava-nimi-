# APPLYOS

**One profile. Every opportunity. Zero research.**

APPLYOS is a student opportunity research MVP. Students describe the work they want, search live public web pages with Exa, inspect source evidence, and investigate application requirements from an opportunity workspace.

## Run locally

1. Install Node.js 20 or later and npm.
2. Install dependencies with npm install.
3. Copy .env.example to .env.local and add an Exa API key. OPENAI_API_KEY is optional.
4. Start with npm run dev, then visit http://localhost:3000.
5. Create a production build with npm run build.

For live searches, EXA_API_KEY is required. When configured, OPENAI_API_KEY enables gpt-4o-mini JSON extraction; without it, deterministic source-backed normalization and readiness defaults keep Exa search usable. Never put either secret in a NEXT_PUBLIC_ variable.

## Deployment

Deploy to Vercel with the Next.js preset. Add EXA_API_KEY and optionally OPENAI_API_KEY to the Vercel project’s server environment variables. The application stores student profile fields, parsed CV text, saved applications, and checklist state in the visitor’s browser localStorage; it does not require a database.

The API key must be configured in Vercel for live research. API routes return an explicit error when the Exa key is missing; APPLYOS does not invent opportunities.

## Privacy and data flow

- Profile details, pasted CV text, parsed PDF text, checklists, and saved opportunities are stored in browser localStorage.
- PDF text extraction runs in the browser with PDF.js. The original PDF is not uploaded.
- Exa receives a search query made from the student’s request and broad study or skill criteria. Personally identifying profile fields and CV text are excluded.
- OpenAI receives Exa result excerpts for normalization and, during application research, the source text and a short skills string. It never receives the stored CV text.
- No application is sent, and no application is marked as submitted.
- .env* is ignored by Git; .env.example is deliberately whitelisted as a safe template.

## Research flow

- POST /api/search makes two live Exa Search requests and includes contents: { highlights: true, text: { maxCharacters: 2400 } }. Results are deduplicated, filtered for student roles, ranked against the profile, and returned with source URLs and excerpts.
- POST /api/investigate reads a selected original page using Exa Contents and prepares a checklist. Claims without source evidence remain unknown or need confirmation.
- POST /api/similar exposes Exa Find Similar for related-source exploration.
- OpenAI extraction uses gpt-4o-mini when configured and falls back to deterministic normalization otherwise.

The app labels availability conservatively. A result is Unknown unless the source supports a stronger status. Always verify details with the source organization.

## Project structure

- app/ — Next.js App Router UI and serverless API handlers
- components/ApplyOS.tsx — client-side search, profile, saved applications, and opportunity workspace
- lib/exa.ts — server-only Exa REST helper and shared content options
- lib/matching.ts — deterministic relevance scoring and student-role filtering

## Scope notes

This MVP supports a manual, editable student profile, PDF CV text extraction, source-backed live search, opportunity saving, and source investigation. Application materials are not generated or emailed. Application channel, deadline, contacts, and document requirements are not claimed unless present in retrieved evidence.
