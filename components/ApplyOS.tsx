"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createOutreachDraft, sanitizeBackgroundText } from "@/lib/outreach";
import type { ChecklistItem, InvestigationData, Opportunity, Profile, SimilarOpportunity } from "@/lib/types";

const scenarios = [
  ["Suomi · Tampere · tuotantotalous", "Opiskelen tuotantotaloutta Tampereen yliopistossa. Etsi minulle sopivia palkallisia harjoittelu- ja diplomityöpaikkoja."],
  ["AI + robotics · thesis", "I'm looking for a master's thesis in AI or robotics, ideally in Finland or Europe."],
  ["Sustainability · business thesis", "I'm a business master's student interested in sustainability. Find thesis opportunities in Finland."],
  ["Mechanical engineering · Europe", "I'm studying mechanical engineering and looking for an internship in Europe."]
];
const empty: Profile = { name: "Sini", degree: "", field: "", university: "", level: "Master's student", graduation: "", skills: "", interests: "", locations: "Finland", preference: "Hybrid or remote", languages: "Finnish, English", experience: "", cvText: "", roleMode: "auto", availability: "" };
const manualDocumentOptions = ["CV", "Academic Transcript / Opintosuoritusote", "Portfolio / GitHub", "Motivation Letter"];
const checklistDefaults: ChecklistItem[] = [
  { id: "cv", label: "CV", status: "Needs review" }, { id: "transcript", label: "Academic transcript", status: "Needs confirmation" },
  { id: "letter", label: "Motivation letter", status: "Needs confirmation" }, { id: "channel", label: "Application channel", status: "Needs confirmation" },
  { id: "deadline", label: "Deadline", status: "Needs confirmation" }
];

function persist(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Local storage may be unavailable. */ } }
function formatSafeTimestamp(value?: string | null) { const d = value ? new Date(value) : new Date(); return Number.isNaN(d.getTime()) ? "Just now" : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }
function safeHttpsUrl(value?: string | null, fallback?: string | null): string | null {
  for (const candidate of [value, fallback]) {
    if (!candidate || candidate === "#" || /^(undefined|null)$/i.test(candidate.trim())) continue;
    try { const url = new URL(candidate); if (["https:", "http:"].includes(url.protocol) && url.hostname && !url.username && !url.password) { url.protocol = "https:"; return url.toString(); } } catch { /* Reject malformed and relative URLs. */ }
  }
  return null;
}
export default function ApplyOS() {
  const [profile, setProfile] = useState<Profile>(empty);
  const [apps, setApps] = useState<Opportunity[]>([]);
  const [results, setResults] = useState<Opportunity[]>([]);
  const [constraintExplanation, setConstraintExplanation] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState<{ queries: string[]; sources: number; fetched?: number; studentRoles?: number; constraintMatches?: number; excludedByConstraints?: number; duplicatesMerged?: number; sourceDomains?: string[]; roleMode?: string; researchedAt: string; freshnessStart?: string | null; failedQueries?: Array<{ query: string; error: string }>; filteredOutExpired?: number; returned?: number } | null>(null);
  const [screen, setScreen] = useState<"discover" | "profile" | "apps">("discover");
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [busy, setBusy] = useState(false);
  const [researching, setResearching] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [cvName, setCvName] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [similarById, setSimilarById] = useState<Record<string, { loading: boolean; results: SimilarOpportunity[]; error: string }>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const p = localStorage.getItem("applyos.profile"), a = localStorage.getItem("applyos.applications");
      if (p) setProfile({ ...empty, ...JSON.parse(p) });
      if (a) setApps(JSON.parse(a));
      setCvName(localStorage.getItem("applyos.cvName") || "");
    } catch { /* Start with a clean local profile. */ }
  }, []);
  useEffect(() => { persist("applyos.profile", profile); }, [profile]);
  useEffect(() => { persist("applyos.applications", apps); }, [apps]);
  useEffect(() => { if (message) { const t = setTimeout(() => setMessage(""), 2800); return () => clearTimeout(t); } }, [message]);

  const saved = useMemo(() => new Set(apps.map((x) => x.id)), [apps]);

  async function search(value: string, roleModeOverride?: Profile["roleMode"]) {
    const q = value.trim();
    if (!q || busy) return;
    setQuery(q); setError(""); setConstraintExplanation(null); setBusy(true); setResults([]); setActivity(null); setHasSearched(true); setScreen("discover"); setSelected(null);
    try {
      const searchProfile = roleModeOverride ? { ...profile, roleMode: roleModeOverride } : profile;
      const res = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, profile: searchProfile }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not search right now.");
      setResults(data.opportunities || []); setConstraintExplanation(data.constraintSummary || data.constraintExplanation || null); setActivity(data.activity || null);
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed."); }
    finally { setBusy(false); }
  }

  async function investigate(item: Opportunity) {
    setResearching(true); setError("");
    try {
      const res = await fetch("/api/investigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: item.source.url, title: item.title, company: item.company, summary: item.summary, type: item.type, profile: { ...profile, degree: sanitizeBackgroundText(profile.degree), field: sanitizeBackgroundText(profile.field), skills: sanitizeBackgroundText(profile.skills), interests: sanitizeBackgroundText(profile.interests), experience: sanitizeBackgroundText(profile.experience), cvText: sanitizeBackgroundText(profile.cvText), documents: item.manualDocuments ?? [] } }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed.");
      const generatedDraft = data.outreachDraft || createOutreachDraft(profile, item, data as InvestigationData);
      const investigation = { ...data, outreachDraft: generatedDraft, outreachDraftVersion: 2 } as InvestigationData;
      const checklist = (data.checklist || []).map((x: { label: string; status: ChecklistItem["status"] }, i: number) => ({ ...x, id: item.id + "-" + i }));
      setSummary(data.summary || "");
      setDraftMessage(generatedDraft);
      setSelected((current) => current ? { ...current, checklist, investigation, outreachDraft: generatedDraft, outreachDraftVersion: 2 } : current);
      setApps((current) => current.map((x) => x.id === item.id ? { ...x, checklist, investigation, outreachDraft: generatedDraft, outreachDraftVersion: 2 } : x));
    } catch (e) { setError(e instanceof Error ? e.message : "Research failed."); }
    finally { setResearching(false); }
  }

  async function findSimilar(item: Opportunity) {
    setSimilarById((current) => ({ ...current, [item.id]: { loading: true, results: current[item.id]?.results ?? [], error: "" } }));
    try {
      const response = await fetch("/api/similar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: item.source.url }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Exa could not find related sources.");
      const results = (Array.isArray(data.results) ? data.results : []).filter((result: { url?: unknown }) => typeof result.url === "string")
        .map((result: { title?: string; url: string; highlights?: string[]; text?: string }) => ({
          title: result.title || new URL(result.url).hostname,
          url: result.url,
          highlights: Array.isArray(result.highlights) ? result.highlights.filter((value) => typeof value === "string") : [],
          text: result.text,
        }));
      setSimilarById((current) => ({ ...current, [item.id]: { loading: false, results, error: "" } }));
    } catch (cause) {
      setSimilarById((current) => ({ ...current, [item.id]: { loading: false, results: [], error: cause instanceof Error ? cause.message : "Related source search failed." } }));
    }
  }

  function openOpportunity(item: Opportunity) {
    const storedDraft = item.outreachDraftVersion === 2 ? item.outreachDraft : item.investigation?.outreachDraftVersion === 2 ? item.investigation.outreachDraft : undefined;
    setSelected(item); setSummary(""); setDraftMessage(storedDraft ?? (item.investigation ? createOutreachDraft(profile, item, item.investigation) : ""));
  }
  function resetDraft() { if (selected) updateDraft(createOutreachDraft(profile, selected, selected.investigation)); }
  async function copyDraft() {
    try { await navigator.clipboard.writeText(draftMessage); setMessage("Draft copied to clipboard"); }
    catch { setError("Clipboard access is unavailable. Select and copy the draft text manually."); }
  }

  function toggleSave(item: Opportunity) {
    if (saved.has(item.id)) { setApps((current) => current.filter((x) => x.id !== item.id)); setMessage("Removed from your applications"); }
    else { setApps((current) => [{ ...item, stage: "Discovered", checklist: item.checklist || checklistDefaults }, ...current]); setMessage("Saved to My applications"); }
  }

  function setChecklist(id: string, key: string, status: ChecklistItem["status"]) {
    const update = (x: Opportunity) => x.id !== id ? x : { ...x, checklist: (x.checklist || []).map((c) => c.id === key ? { ...c, status } : c) };
    setApps((current) => current.map(update)); setSelected((current) => current ? update(current) : current);
  }

  function toggleManualDocument(id: string, document: string) {
    const update = (item: Opportunity) => {
      if (item.id !== id) return item;
      const current = item.manualDocuments ?? [];
      const manualDocuments = current.includes(document) ? current.filter((value) => value !== document) : [...current, document];
      return { ...item, manualDocuments };
    };
    setApps((current) => current.map(update));
    setSelected((current) => current ? update(current) : current);
  }

  function updateDraft(value: string) {
    setDraftMessage(value);
    setSelected((current) => current ? { ...current, outreachDraft: value, outreachDraftVersion: 2, investigation: current.investigation ? { ...current.investigation, outreachDraft: value, outreachDraftVersion: 2 } : current.investigation } : current);
    setApps((current) => current.map((item) => selected && item.id === selected.id ? { ...item, outreachDraft: value, outreachDraftVersion: 2, investigation: item.investigation ? { ...item.investigation, outreachDraft: value, outreachDraftVersion: 2 } : item.investigation } : item));
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setError(""); setCvName(file.name); localStorage.setItem("applyos.cvName", file.name);
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pages: string[] = [];
      for (let n = 1; n <= Math.min(pdf.numPages, 12); n++) {
        const page = await pdf.getPage(n); const content = await page.getTextContent();
        pages.push(content.items.map((x) => "str" in x ? x.str : "").join(" "));
      }
      const text = pages.join("\n").slice(0, 24000);
      if (!text.trim()) throw new Error("No selectable text found. Paste your CV text below.");
      setProfile((p) => ({ ...p, cvText: text })); setMessage("CV text extracted locally and saved on this device");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read the PDF. Paste your CV text below."); }
    event.target.value = "";
  }

  const firstName = profile.name.trim().split(/\s+/)[0] || "there";
  return <main className={"shell" + (hasSearched ? " searched" : "")}>
    <aside className={"sidebar" + (navOpen ? " shown" : "")}>
      <div className="brand"><span className="brand-icon">✳</span><b>apply<span>os</span></b></div>
      <div className="nav-label">YOUR WORKSPACE</div>
      <nav>
        <button className={screen === "discover" ? "nav active" : "nav"} onClick={() => { setScreen("discover"); setNavOpen(false); }}><span>▦</span>Discover</button>
        <button className={screen === "apps" ? "nav active" : "nav"} onClick={() => { setScreen("apps"); setNavOpen(false); }}><span>▱</span>My applications{apps.length > 0 && <i>{apps.length}</i>}</button>
        <button className={screen === "profile" ? "nav active" : "nav"} onClick={() => { setScreen("profile"); setNavOpen(false); }}><span>♙</span>Student profile</button>
      </nav>
      <div className="side-bottom"><div className="exa-card"><span>✳</span><div><b>Powered by Exa</b><small>Live web intelligence</small></div><i/></div><button className="mini-profile" onClick={() => setScreen("profile")}><span>{firstName[0]?.toUpperCase()}</span><div><b>{profile.name}</b><small>{profile.field || "Add your study field"}</small></div><strong>···</strong></button></div>
    </aside>
    <section className="main">
      {navOpen && <button className="mobile-scrim" onClick={() => setNavOpen(false)} aria-label="Close navigation"/>}
      <header className="topbar"><button className="mobile-menu" onClick={() => setNavOpen(true)} aria-label="Open navigation">☰</button><div className="crumb">Workspace <span>/</span> <b>{screen === "discover" ? "Discover" : screen === "apps" ? "My applications" : "Student profile"}</b></div><div className="privacy-status"><i/> Your profile is private <button onClick={() => setScreen("profile")}>{firstName[0]?.toUpperCase()}</button></div></header>
      <div className="content">
        {screen === "profile" ? <section className="profile-view">
          <div className="page-head"><div><label>YOUR PRIVATE PROFILE</label><h1>Student profile</h1><p>Build your profile once. APPLYOS uses it to personalize every search.</p></div><button className="primary" onClick={() => { setScreen("discover"); setMessage("Profile saved on this device"); }}>Save profile ✓</button></div>
          <div className="profile-layout"><div>
            <section className="panel"><div className="panel-head"><span className="panel-symbol purple">♙</span><div><h3>About you</h3><p>Only broad search criteria leave your browser.</p></div></div><div className="fields">
              <Field label="Your name" value={profile.name} update={(v) => setProfile((p) => ({ ...p, name: v }))} placeholder="First and last name"/>
              <Field label="University" value={profile.university} update={(v) => setProfile((p) => ({ ...p, university: v }))} placeholder="e.g. Tampere University"/>
              <Field label="Degree" value={profile.degree} update={(v) => setProfile((p) => ({ ...p, degree: v }))} placeholder="e.g. MSc, BSc"/>
              <Field label="Field of study" value={profile.field} update={(v) => setProfile((p) => ({ ...p, field: v }))} placeholder="e.g. Industrial engineering"/>
              <label className="field"><span>Academic level</span><select value={profile.level} onChange={(e) => setProfile((p) => ({ ...p, level: e.target.value }))}><option>Bachelor's student</option><option>Master's student</option><option>Doctoral student</option><option>Recent graduate</option><option>Other</option></select></label>
              <Field label="Expected graduation" value={profile.graduation} update={(v) => setProfile((p) => ({ ...p, graduation: v }))} placeholder="e.g. June 2027"/>
              <Field label="Availability / start date" value={profile.availability ?? ""} update={(v) => setProfile((p) => ({ ...p, availability: v }))} placeholder="e.g. Available from May 2027"/>
              <Field wide label="Skills" value={profile.skills} update={(v) => setProfile((p) => ({ ...p, skills: v }))} placeholder="Python, research, data analysis"/>
              <Field wide label="Research & industry interests" value={profile.interests} update={(v) => setProfile((p) => ({ ...p, interests: v }))} placeholder="What would you love to work on?"/>
              <Field wide label="Experience & projects" value={profile.experience} update={(v) => setProfile((p) => ({ ...p, experience: v }))} placeholder="Relevant roles, research, projects"/>
              <Field wide label="Preferred locations" value={profile.locations} update={(v) => setProfile((p) => ({ ...p, locations: v }))} placeholder="Finland, Helsinki, remote"/>
              <label className="field"><span>Opportunity type</span><select value={profile.roleMode ?? "auto"} onChange={(e) => setProfile((p) => ({ ...p, roleMode: e.target.value as Profile["roleMode"] }))}><option value="auto">Infer from my search</option><option value="internship">Internship / Trainee only</option><option value="thesis">Master's / Bachelor's Thesis only</option><option value="both">Both</option></select></label>
              <label className="field"><span>Work preference</span><select value={profile.preference} onChange={(e) => setProfile((p) => ({ ...p, preference: e.target.value }))}><option>Hybrid or remote</option><option>Remote</option><option>Hybrid</option><option>On-site</option><option>Any</option></select></label>
              <Field label="Languages" value={profile.languages} update={(v) => setProfile((p) => ({ ...p, languages: v }))} placeholder="Finnish, English"/>
            </div></section>
            <section className="panel"><div className="panel-head"><span className="panel-symbol green">▤</span><div><h3>Your CV, on your device</h3><p>PDF text is extracted in your browser. The original file is never uploaded.</p></div></div>
              <button className="upload" onClick={() => inputRef.current?.click()}><span>＋</span><div><b>{cvName || "Upload a CV as PDF"}</b><small>{cvName ? "Saved locally · upload a new version" : "Select a PDF, up to 10 MB"}</small></div><em>Choose file</em></button>
              <label className="field wide cv-field"><span>Or paste CV text <small>— saved locally on this device</small></span><textarea rows={5} value={profile.cvText} onChange={(e) => setProfile((p) => ({ ...p, cvText: e.target.value }))} placeholder="Paste relevant CV text here…"/></label>
              {error && <div className="inline-error">{error}</div>}<div className="local-note">⌑ Your CV text stays in this browser and is never sent to Exa or OpenAI.</div>
            </section>
          </div><aside className="side-panels"><div className="profile-score"><div className="score">{[profile.field, profile.university, profile.skills, profile.interests].filter(Boolean).length * 25}<small>%</small></div><h3>Your profile is taking shape</h3><p>Add your background and skills to get closer matches.</p>{["Study details", "Skills & interests", "Experience", "CV text"].map((t, i) => <div className="todo" key={t}><i>{[profile.field && profile.university, profile.skills || profile.interests, profile.experience, profile.cvText][i] ? "✓" : "+"}</i>{t}</div>)}</div><div className="privacy-card"><span>⌑</span><b>Private by default</b><p>Your profile, parsed CV, checklist and saved applications stay in this browser. Only broad, non-identifying criteria go to Exa.</p></div></aside></div>
        </section> : screen === "apps" ? <section className="apps-view">
          <div className="page-head"><div><label>YOUR NEXT STEPS, ORGANIZED</label><h1>My applications <span className="count">{apps.length}</span></h1><p>Keep your research and preparation moving forward.</p></div><button className="primary" onClick={() => setScreen("discover")}>Find opportunities →</button></div>
          {!apps.length ? <div className="empty"><div>▱</div><h2>A good opportunity is worth keeping.</h2><p>Save a result from Discover and it’ll appear here with its evidence, requirements and next steps.</p><button className="primary" onClick={() => setScreen("discover")}>Explore opportunities →</button></div> : <div className="saved-list">{apps.map((item) => <button className="saved-item" key={item.id} onClick={() => openOpportunity(item)}><span className="company-mark">{item.company.slice(0, 2).toUpperCase()}</span><span className="saved-copy"><small>{item.stage || "Discovered"}</small><b>{item.title}</b><span>{item.company} · {item.location}</span></span><span className="saved-progress">{(item.checklist || []).filter((x) => x.status === "Ready" || x.status === "Completed").length}/{(item.checklist || []).length || 5} ready</span><span className="saved-arrow">→</span></button>)}</div>}
        </section> : <>
          <div className="welcome"><div><label>● &nbsp; YOUR OPPORTUNITY DESK</label><h1>Good morning, {firstName}<span>✳</span></h1><p>One profile. Every opportunity. <b>Zero research.</b></p></div><span className="welcome-note">✦ &nbsp; Your next move, made clearer</span></div>
          <section className="hero"><div className="hero-icon">✳</div><h2>What are you looking for?</h2><p>Tell us what’s next. We’ll find the opportunities and the details that matter.</p>
            <div className="scenario-row"><span>TRY AN EXAMPLE QUERY</span>{scenarios.map((scenario, i) => <button key={scenario[0]} className={"scenario scenario-" + i} disabled={busy} onClick={() => { const roleMode = /thesis|diplomityö|gradu/i.test(scenario[1]) ? "thesis" : "internship"; setProfile((current) => ({ ...current, roleMode })); setQuery(scenario[1]); void search(scenario[1], roleMode); }}><i>{["あ", "✳", "◉", "⌁"][i]}</i>Try Example Query · {scenario[0]} <b>↗</b></button>)}</div>
            <form className="search-form" onSubmit={(e) => { e.preventDefault(); void search(query); }}><span className="magnify">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Or describe your own opportunity search..." aria-label="Describe your opportunity search"/><select aria-label="Filter by opportunity type" value={profile.roleMode ?? "auto"} onChange={(e) => setProfile((p) => ({ ...p, roleMode: e.target.value as Profile["roleMode"] }))}><option value="auto">Infer type</option><option value="internship">Internships only</option><option value="thesis">Thesis roles only</option><option value="both">Both types</option></select><button disabled={!query.trim() || busy}>{busy ? "◌ Searching" : <>Find opportunities <span>→</span></>}</button></form>
          </section>
          {error && <div className="error-banner"><b>Research paused</b><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
          {busy ? <div className="loading"><div className="loader">✳</div><label>LIVE RESEARCH IN PROGRESS</label><h2>Searching the web for your next move</h2><p>APPLYOS is checking real sources and reading original pages.</p><div className="load-steps"><span>✓ Planning your search</span><span>◌ Searching with Exa</span><span>Reading original sources</span><span>Ranking your matches</span></div></div> : results.length ? <section className="results">
            <div className="result-head"><div><label>YOUR RESEARCH, READY</label><h2>{results.length} opportunities to explore</h2><p>Sorted by how closely each source fits your search.</p></div><span className="live-chip"><i/> LIVE EXA SEARCH</span></div>
            {activity && <details className="activity"><summary><b>✳ Research activity</b><span>Exa searched {activity.sources} sources across {activity.queries.length} focused queries · {formatSafeTimestamp(activity.researchedAt)}</span><em>See queries +</em></summary>{activity.freshnessStart && <p className="freshness-note">Recent opportunity search window starts {formatSafeTimestamp(activity.freshnessStart)} · thesis search remains broad.</p>}<ul>{activity.queries.map((q) => <li key={q}>{q}</li>)}</ul>{activity.failedQueries?.length ? <div className="partial-warning"><b>Some searches did not finish.</b>{activity.failedQueries.map((item) => <p key={item.query}>{item.error} <small>Query: {item.query}</small></p>)}</div> : null}</details>}
            {constraintExplanation && <div className="partial-warning">{constraintExplanation}</div>}
            {activity && results.length > 1 && (activity.filteredOutExpired ?? 0) > 0 && <p className="filtered-count">Filtered out {activity.filteredOutExpired} expired listings.</p>}
            {activity && results.length <= 1 && (activity.filteredOutExpired ?? 0) > 0 && <p className="filtered-count">Filtered out {activity.filteredOutExpired} expired listings.</p>}
            {activity && results.length <= 1 && <CoverageCard activity={activity} resultCount={results.length}/>}
            <div className="result-list">{results.map((item, i) => <OpportunityCard key={item.id} item={item} saved={saved.has(item.id)} similar={similarById[item.id]} index={i} onSave={() => toggleSave(item)} onOpen={() => openOpportunity(item)} onSimilar={() => void findSimilar(item)}/>)}</div>
            <p className="disclaimer">ⓘ Opportunity availability can change. Always confirm status and requirements with the organization.</p>
          </section> : <section className="starter"><div className="section-head"><div><label>YOUR STARTING POINT</label><h2>A little context goes a long way.</h2></div><span>A more complete profile means closer matches.</span></div><div className="starter-grid"><button className="starter-card" onClick={() => setScreen("profile")}><i className="purple">♙</i><span><b>Build your profile</b><small>{profile.field || "Add your studies, skills and interests"}</small></span><strong>→</strong><div className="progress"><i style={{ width: [profile.field, profile.skills, profile.university, profile.interests].filter(Boolean).length * 25 + "%" }}/></div></button><button className="starter-card" onClick={() => setScreen("apps")}><i className="green">▱</i><span><b>Save your first opportunity</b><small>{apps.length ? apps.length + " saved in your workspace" : "Keep interesting roles in one place"}</small></span><strong>→</strong><div className="progress"><i style={{ width: apps.length ? "100%" : "0%" }}/></div></button></div><div className="privacy-message"><b>⌑ &nbsp; Your profile stays yours.</b><span>Personal details stay on this device. Only broad, non-identifying search criteria go to Exa.</span></div></section>}
        </>}
        {screen === "discover" && hasSearched && !busy && !results.length && <><EmptyResults query={query} error={error} explanation={constraintExplanation} onRetry={() => void search(query)} onBroader={(value) => void search(value)}/>{activity && (activity.filteredOutExpired ?? 0) > 0 && <p className="filtered-count">Filtered out {activity.filteredOutExpired} expired listings.</p>}{activity && <CoverageCard activity={activity} resultCount={0}/>}</>}
      </div>
      <footer><b>✳ APPLYOS</b><span>· Your next opportunity starts here</span><span className="footer-right">Built for students, with care <b>♥</b></span></footer>
    </section>
    {selected && <Drawer item={selected} saved={saved.has(selected.id)} researching={researching} summary={summary} error={error} similar={similarById[selected.id]} draftMessage={draftMessage} onDraftChange={updateDraft} onDraftReset={resetDraft} onDraftCopy={() => void copyDraft()} onClose={() => { setSelected(null); setError(""); }} onSave={() => toggleSave(selected)} onInvestigate={() => void investigate(selected)} onChecklist={(key, status) => setChecklist(selected.id, key, status)} onSimilar={() => void findSimilar(selected)} onManualDocument={(document) => toggleManualDocument(selected.id, document)}/>}
    {message && <div className="toast">✓ &nbsp; {message}</div>}
    <input ref={inputRef} hidden type="file" accept=".pdf,application/pdf" onChange={upload}/>
  </main>;
}

function Field({ label, value, update, placeholder, wide }: { label: string; value: string; update: (v: string) => void; placeholder: string; wide?: boolean }) {
  return <label className={"field" + (wide ? " wide" : "")}><span>{label}</span><input value={value} onChange={(e) => update(e.target.value)} placeholder={placeholder}/></label>;
}

function SimilarPanel({ state }: { state?: { loading: boolean; results: SimilarOpportunity[]; error: string } }) {
  if (!state) return null;
  return <div className="similar-panel">
    <div className="similar-heading"><b>Related organizations & labs</b><span>Found with Exa Find Similar</span></div>
    {state.loading && <p className="similar-message">Searching Exa for related organizations…</p>}
    {state.error && <p className="similar-error">{state.error}</p>}
    {!state.loading && !state.error && !state.results.length && <p className="similar-message">No related sources were returned for this page.</p>}
    {Boolean(state.results.length) && <div className="similar-results">{state.results.map((result) => <article key={result.url}>
      {safeHttpsUrl(result.url) && <a href={safeHttpsUrl(result.url) ?? undefined} target="_blank" rel="noopener noreferrer">{result.title} <span>↗</span></a>}
      {result.highlights.length ? result.highlights.slice(0, 2).map((highlight, index) => <blockquote key={index}>“{highlight}”</blockquote>) : <p className="similar-excerpt">{result.text?.slice(0, 360) || "Exa returned this related source without a text highlight."}</p>}
    </article>)}</div>}
  </div>;
}

function EmptyResults({ query, error, explanation, onRetry, onBroader }: { query: string; error: string; explanation?: string | null; onRetry: () => void; onBroader: (query: string) => void }) {
  return <section className="empty-results">
    <div className="empty-results-icon">{error ? "!" : "⌕"}</div>
    <div className="empty-results-copy"><label>{error ? "SEARCH NEEDS ANOTHER TRY" : "NO MATCHES IN THIS SEARCH"}</label><h2>{error ? "We couldn’t complete that search." : "No student opportunities surfaced for this query."}</h2>
      <p>{error || explanation || "Try a broader field, remove a location or date constraint, or search using a neighboring role title. APPLYOS only shows opportunities returned by live sources."}</p>
      {!error && <div className="broader-tips"><span>Try:</span><button onClick={() => onBroader(query + " internship OR thesis")}>internships or thesis roles</button><button onClick={() => onBroader(query + " Finland OR Europe")}>a wider location</button><button onClick={() => onBroader("student research assistant " + query)}>student research roles</button></div>}
      {error && <button className="primary" onClick={onRetry}>Retry search <span>→</span></button>}
    </div>
  </section>;
}

function CoverageCard({ activity, resultCount }: { activity: { queries: string[]; sources: number; fetched?: number; studentRoles?: number; constraintMatches?: number; excludedByConstraints?: number; duplicatesMerged?: number; sourceDomains?: string[]; roleMode?: string; filteredOutExpired?: number; failedQueries?: Array<{ query: string; error: string }> }; resultCount: number }) {
  return <section className="coverage-card"><div><small>SEARCH SCOPE & COVERAGE</small><b>{resultCount === 0 ? "No active matching roles surfaced." : `${resultCount} active opportunities surfaced.`}</b><p>Exa returned {activity.fetched ?? activity.sources} distinct source URLs across {activity.queries.length} complementary queries. {activity.studentRoles ?? 0} looked like student roles; {activity.excludedByConstraints ?? 0} were removed by hard constraints; {activity.filteredOutExpired ?? 0} closed or expired results are hidden. Type filter: {activity.roleMode ?? "inferred from query"}. Search coverage describes returned sources, not the full job market.</p></div><details><summary>Live source domains, queries & filtering</summary><p>{activity.duplicatesMerged ?? 0} duplicate URLs merged. {activity.constraintMatches ?? 0} sources passed constraints.</p>{activity.sourceDomains?.length ? <ul>{activity.sourceDomains.map((domain) => <li key={domain}>{domain}</li>)}</ul> : <p>No source domains were returned.</p>}<ul>{activity.queries.map((query) => <li key={query}>{query}</li>)}</ul>{activity.failedQueries?.map((failure) => <p key={failure.query}>A query failed: {failure.error}</p>)}</details></section>;
}

function OpportunityCard({ item, saved, index, similar, onSave, onOpen, onSimilar }: {
  item: Opportunity;
  saved: boolean;
  index: number;
  similar?: { loading: boolean; results: SimilarOpportunity[]; error: string };
  onSave: () => void;
  onOpen: () => void;
  onSimilar: () => void;
}) {
  const isOpen = item.status === "Verified open" || item.status === "Possibly open";
  const published = item.publishedDate && !Number.isNaN(Date.parse(item.publishedDate)) ? new Date(item.publishedDate).toLocaleDateString() : "Publication date unknown";
  return <article className="opportunity" style={{ animationDelay: index * 60 + "ms" }}>
    <div className="opportunity-head"><span className={"company-mark mark-" + (index % 4)}>{item.company.slice(0, 2).toUpperCase()}</span><div className="company-info"><div><b>{item.company}</b><span className="source-found">◉ Source found</span></div><h3>{item.title}<i>{item.type}</i></h3></div><button className={saved ? "bookmark saved" : "bookmark"} onClick={onSave} aria-label={saved ? "Remove saved opportunity" : "Save opportunity"}>{saved ? "♥" : "♡"}</button></div>
    <div className="opportunity-badges"><span className="role-badge">{item.type}</span><span className="published-badge">◷ Published · {published}</span></div>
    <p className="opportunity-summary">{item.summary}</p><div className="facts"><span>⌖ &nbsp;{item.locationLabel || item.location}{item.locationSnippet ? ` · “${item.locationSnippet}”` : ""}</span><span>◷ &nbsp;{item.deadline ? "Deadline " + item.deadline : item.programCycle ? "Program cycle · " + item.programCycle : "Deadline not verified"}</span><span className={isOpen ? "status open" : "status"}><i/>{item.applicationStatus || item.status}</span></div>
    <div className="match"><span><i style={{ width: item.match + "%" }}/></span><b>{item.match}% match</b><em>· {item.matchReason}</em></div>
    {item.eligibilityStatus?.startsWith("Constraint check:") && <span className="constraint-badge">{item.eligibilityStatus}</span>}
    {item.scoreBreakdown && <div className="score-breakdown" aria-label="Match score breakdown">{Object.entries({ Base: item.scoreBreakdown.base, "Topic / skills": item.scoreBreakdown.topicSkill, "Student role": item.scoreBreakdown.studentRole, Location: item.scoreBreakdown.location, "Open status": item.scoreBreakdown.openStatus, "Missing location": item.scoreBreakdown.missingLocation, "Missing deadline": item.scoreBreakdown.missingDeadline, "Constraint conflict": item.scoreBreakdown.constraintConflict, "Score clamp": item.scoreBreakdown.clampAdjustment }).filter(([, points]) => points !== 0).map(([label, points]) => <span key={label}>{label} {Number(points) > 0 ? "+" : ""}{points}</span>)}</div>}
    <details className="match-details"><summary>Why this match? <b>+</b></summary><div><span><b>Matched skills</b>{item.matchedSkills?.length ? item.matchedSkills.map((skill) => <i key={skill}>{skill}</i>) : <small>No specific skill overlap found</small>}</span><span><b>Location</b><small className={"location-" + (item.locationMatch || "unknown")}>{item.locationMatch || "unknown"}</small></span><span><b>Still to verify</b><small>{item.missingInfo?.length ? item.missingInfo.join(" · ") : "No key information flagged"}</small></span></div></details>
    <div className="quote"><span>“</span><p>{item.source.excerpt || "Source page found by Exa. Open this result to read the evidence and investigate requirements."}</p></div>
    <div className="opportunity-bottom">{safeHttpsUrl(item.source.url) && <a href={safeHttpsUrl(item.source.url) ?? undefined} rel="noopener noreferrer" target="_blank">↗ &nbsp;View source <small>↗</small></a>}<button className="similar-trigger" onClick={onSimilar}>Find similar (Exa) <b>⌕</b></button><button onClick={onOpen}>Research opportunity <b>→</b></button></div>
    <SimilarPanel state={similar}/>
  </article>;
}

function Citation({ sourceUrl, evidenceExcerpt, fallbackUrl }: { sourceUrl: string | null; evidenceExcerpt: string | null; fallbackUrl?: string | null }) {
  const href = safeHttpsUrl(sourceUrl, fallbackUrl);
  if (!href) return evidenceExcerpt ? <div className="citation"><blockquote>“{evidenceExcerpt}”</blockquote></div> : null;
  return <div className="citation"><a href={href} target="_blank" rel="noopener noreferrer">Source ↗</a>{evidenceExcerpt && <blockquote>“{evidenceExcerpt}”</blockquote>}</div>;
}

function Drawer({ item, saved, researching, summary, error, similar, draftMessage, onDraftChange, onDraftReset, onDraftCopy, onClose, onSave, onInvestigate, onChecklist, onSimilar, onManualDocument }: {
  item: Opportunity;
  saved: boolean;
  researching: boolean;
  summary: string;
  error: string;
  similar?: { loading: boolean; results: SimilarOpportunity[]; error: string };
  draftMessage: string;
  onDraftChange: (value: string) => void;
  onDraftReset: () => void;
  onDraftCopy: () => void;
  onClose: () => void;
  onSave: () => void;
  onInvestigate: () => void;
  onChecklist: (id: string, status: ChecklistItem["status"]) => void;
  onSimilar: () => void;
  onManualDocument: (document: string) => void;
}) {
  const items = item.checklist || checklistDefaults.map((x) => ({ ...x, id: item.id + "-" + x.id }));
  const ready = items.filter((x) => x.status === "Ready" || x.status === "Completed").length;
  const investigation = item.investigation;
  const manualDocuments = item.manualDocuments ?? [];
  const sources = investigation?.sources ?? [];
  return <div className="drawer-layer"><button className="scrim" onClick={onClose} aria-label="Close workspace"/><aside className="drawer"><header><button onClick={onClose}>← &nbsp;Back to opportunities</button><button onClick={onClose}>×</button></header><div className="drawer-body">
    <label>● &nbsp; APPLICATION WORKSPACE</label><div className="drawer-company"><span className="company-mark mark-2">{item.company.slice(0, 2).toUpperCase()}</span><b>{item.company}</b><i>{item.type}</i></div><h1>{item.title}</h1><div className="drawer-facts"><span>⌖ {item.location}</span><span className={(item.status === "Verified open" || item.status === "Possibly open") ? "status open" : "status"}><i/>{investigation?.status ?? item.status}</span></div><p className="drawer-summary">{item.summary}</p>
    <button className="primary investigate" onClick={onInvestigate} disabled={researching}>{researching ? "◌ Reading source pages…" : "✳ &nbsp; Investigate application  →"}</button><button className="save-wide" onClick={onSave}>{saved ? "♥ Saved to applications" : "♡ Save opportunity"}</button>
    <button className="similar-workspace-trigger" onClick={onSimilar} disabled={similar?.loading}>{similar?.loading ? "◌ Searching related organizations…" : "⌕ &nbsp; Find similar (Exa)"}</button>
    <SimilarPanel state={similar}/>

    <section className="drawer-section"><div className="drawer-section-head"><div><small>RESEARCH NOTES</small><h3>Application details</h3></div><span>{investigation ? "Multi-source research" : "Evidence-led"}</span></div>
      <p className="research-note">{investigation?.summary || summary || "Investigate this opportunity to read its original page and search the employer’s application instructions."}</p>
      <div className="research-facts">
        <Fact label="Deadline" value={investigation?.deadline || "Not verified"} sourceUrl={investigation?.deadlineEvidence?.sourceUrl ?? null} evidenceExcerpt={investigation?.deadlineEvidence?.evidenceExcerpt ?? null} fallbackUrl={item.source.url}/>
        <Fact label="Application method" value={investigation?.applicationMethod?.type === "unknown" ? "Needs confirmation" : [investigation?.applicationMethod?.type, investigation?.applicationMethod?.details].filter(Boolean).join(" · ")} sourceUrl={investigation?.applicationMethod?.sourceUrl ?? null} evidenceExcerpt={investigation?.applicationMethod?.evidenceExcerpt ?? null} fallbackUrl={item.source.url}/>
        <Fact label="Contact" value={investigation?.contactPerson ? [investigation.contactPerson.name, investigation.contactPerson.role].filter(Boolean).join(" · ") : "No public contact verified"} sourceUrl={investigation?.contactPerson?.sourceUrl ?? null} evidenceExcerpt={investigation?.contactPerson?.evidenceExcerpt ?? null} fallbackUrl={item.source.url}/>
      </div>
      {investigation?.failures?.length ? <div className="source-warning"><b>Some source checks were incomplete</b><ul>{investigation.failures.map((failure, index) => <li key={index}>{failure}</li>)}</ul>Available source evidence is still shown below.</div> : null}
      {investigation?.applicationSteps?.length ? <div className="application-steps"><b>Application steps from sources</b><ol>{investigation.applicationSteps.map((step) => <li key={step.order}><span>{step.step}</span><Citation sourceUrl={step.sourceUrl} evidenceExcerpt={step.evidenceExcerpt} fallbackUrl={item.source.url}/></li>)}</ol></div> : null}
      <div className="source-list"><b>Researched sources</b>{sources.length ? sources.map((source) => { const href = safeHttpsUrl(source.url, item.source.url); return <div key={source.url}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{source.title} ↗</a> : <span>{source.title}</span>}{source.publishedDate && <small>Published {formatSafeTimestamp(source.publishedDate)}</small>}</div>; }) : <div className="source-box"><p>{item.source.excerpt || "No source excerpt is available yet."}</p>{safeHttpsUrl(item.source.url) && <a href={safeHttpsUrl(item.source.url) ?? undefined} target="_blank" rel="noopener noreferrer">{item.source.title} ↗</a>}</div>}</div>
    </section>

    <section className="drawer-section practical-section"><div className="drawer-section-head"><div><small>ROLE TERMS & PRACTICAL REQUIREMENTS</small><h3>What the announcement says</h3></div><span>{investigation?.practicalFacts?.length ?? 0} source facts</span></div>
      {investigation?.practicalFacts?.length ? <div className="verified-requirements">{investigation.practicalFacts.map((fact, index) => <article key={fact.sourceUrl + fact.category + index}><div className="requirement-title"><b>{fact.label}</b></div><p className="practical-value">{fact.value}</p><Citation sourceUrl={fact.sourceUrl} evidenceExcerpt={fact.evidenceExcerpt} fallbackUrl={item.source.url}/></article>)}</div> : <p className="research-note">No practical terms were verified in the returned excerpts. Location, duration, compensation, work arrangement, documents and eligibility may need confirmation.</p>}
    </section>

    <section className="drawer-section contact-section"><div className="drawer-section-head"><div><small>DIRECT CONTACT & OUTREACH</small><h3>Reach the organization</h3></div><span>{investigation?.contactPerson ? "Source discovered" : "No named contact verified"}</span></div>
      {investigation?.contactPerson ? <><div className="contact-card"><b>{investigation.contactPerson.name}</b>{investigation.contactPerson.role && <span>{investigation.contactPerson.role}</span>}{investigation.contactPerson.email && <a href={`mailto:${investigation.contactPerson.email}`}>{investigation.contactPerson.email}</a>}<Citation sourceUrl={investigation.contactPerson.sourceUrl} evidenceExcerpt={investigation.contactPerson.evidenceExcerpt} fallbackUrl={item.source.url}/></div><p className="research-note">Contact details are shown only when present in the retrieved source quote. Use the draft below as a starting point.</p></> : <p className="research-note">No real person or direct email was verified. The employer’s application pages remain the best source for next steps.</p>}
    </section>

    <section className="drawer-section draft-section"><div className="drawer-section-head"><div><small>PRE-APPLICATION / OUTREACH MESSAGE</small><h3>Draft for your review</h3></div><span>Never sent automatically</span></div>
      {investigation ? <><p className="manual-explainer">Review and edit this profile-based draft before using it. No message is sent by APPLYOS.</p><textarea className="outreach-draft" value={draftMessage} onChange={(event) => onDraftChange(event.target.value)} aria-label="Editable pre-application message draft"/><div className="draft-actions"><button onClick={onDraftCopy}>Copy Message</button><button onClick={onDraftReset}>Reset Draft</button></div></> : <p className="research-note">Investigate this opportunity to prepare a draft grounded in your profile and verified source facts.</p>}
    </section>

    <section className="drawer-section verified-section"><div className="drawer-section-head"><div><small>SOURCE-VERIFIED REQUIREMENTS</small><h3>What the sources ask for</h3></div><span>{investigation?.verifiedRequirements.length ?? 0} verified</span></div>
      {investigation?.verifiedRequirements.length ? <div className="verified-requirements">{investigation.verifiedRequirements.map((requirement, index) => <article key={requirement.sourceUrl + index}><div className="requirement-title"><b>{requirement.requirement}</b><span className="requirement-ready">{requirement.readiness}</span></div>{requirement.documentType && <small>Document · {requirement.documentType}</small>}<Citation sourceUrl={requirement.sourceUrl} evidenceExcerpt={requirement.evidenceExcerpt} fallbackUrl={item.source.url}/></article>)}</div> : <p className="research-note">No requirement was verified from the returned source excerpts yet. Treat missing details as needs confirmation.</p>}
      {investigation?.sourceChecklist.filter((entry) => entry.verification === "Needs confirmation").length ? <div className="confirmation-list"><b>Needs confirmation</b>{investigation.sourceChecklist.filter((entry) => entry.verification === "Needs confirmation").map((entry) => <p key={entry.id}>{entry.label}</p>)}</div> : null}
    </section>

    <section className="drawer-section manual-section"><div className="drawer-section-head"><div><small>MANUAL STUDENT STATUS</small><h3>Your document checklist</h3></div><span>Saved on this device</span></div><p className="manual-explainer">These are your own progress toggles. They are separate from source-verified requirements and do not submit documents.</p>
      <div className="manual-documents">{manualDocumentOptions.map((document) => <label key={document}><input type="checkbox" checked={manualDocuments.includes(document)} onChange={() => onManualDocument(document)}/><span className="manual-check">{manualDocuments.includes(document) ? "✓" : ""}</span><b>{document}</b><small>{manualDocuments.includes(document) ? "Marked ready by you" : "Mark as ready"}</small></label>)}</div>
    </section>

    <section className="drawer-section"><div className="drawer-section-head"><div><small>APPLICATION PREPARATION</small><h3>Manual checklist status</h3></div><strong className="readiness">{ready}<small>/{items.length}</small></strong></div><div className="checklist">{items.map((x) => <label key={x.id}><span className={x.status === "Ready" || x.status === "Completed" ? "checked" : ""}>{x.status === "Ready" || x.status === "Completed" ? "✓" : ""}</span><b>{x.label}</b><select value={x.status} onChange={(e) => onChecklist(x.id, e.target.value as ChecklistItem["status"])}><option>Ready</option><option>Missing</option><option>Needs review</option><option>Needs confirmation</option><option>Completed</option></select></label>)}</div></section>
    <section className="drawer-section next-step"><small>A QUESTION TO CONFIRM</small><p>Is this opportunity still accepting applications, and which supporting documents are required?</p><span>Draft only · no message is sent by APPLYOS</span></section>{error && <div className="inline-error">{error}</div>}
  </div></aside></div>;
}

function Fact({ label, value, sourceUrl, evidenceExcerpt, fallbackUrl }: { label: string; value: string; sourceUrl: string | null; evidenceExcerpt: string | null; fallbackUrl?: string | null }) {
  return <div className="research-fact"><small>{label}</small><b>{value}</b><Citation sourceUrl={sourceUrl} evidenceExcerpt={evidenceExcerpt} fallbackUrl={fallbackUrl}/></div>;
}
