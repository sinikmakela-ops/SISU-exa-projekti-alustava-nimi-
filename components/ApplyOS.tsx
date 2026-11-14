"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChecklistItem, Opportunity, Profile } from "@/lib/types";

const scenarios = [
  ["AI research · Finland", "I'm studying computer science in Finland and looking for an AI research internship or master's thesis opportunity."],
  ["Sustainability · thesis", "I'm a business master's student interested in sustainability and consulting. Find thesis opportunities in Finland."],
  ["Engineering · Europe", "I'm studying mechanical engineering and want a paid internship in Europe."],
  ["Suomeksi", "Opiskelen tuotantotaloutta Tampereen yliopistossa. Etsi minulle sopivia palkallisia harjoittelu- ja diplomityöpaikkoja."]
];
const empty: Profile = { name: "Sini", degree: "", field: "", university: "", level: "Master's student", graduation: "", skills: "", interests: "", locations: "Finland", preference: "Hybrid or remote", languages: "Finnish, English", experience: "", cvText: "" };
const checklistDefaults: ChecklistItem[] = [
  { id: "cv", label: "CV", status: "Needs review" }, { id: "transcript", label: "Academic transcript", status: "Needs confirmation" },
  { id: "letter", label: "Motivation letter", status: "Needs confirmation" }, { id: "channel", label: "Application channel", status: "Needs confirmation" },
  { id: "deadline", label: "Deadline", status: "Needs confirmation" }
];

function persist(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Local storage may be unavailable. */ } }

export default function ApplyOS() {
  const [profile, setProfile] = useState<Profile>(empty);
  const [apps, setApps] = useState<Opportunity[]>([]);
  const [results, setResults] = useState<Opportunity[]>([]);
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState<{ queries: string[]; sources: number; researchedAt: string } | null>(null);
  const [screen, setScreen] = useState<"discover" | "profile" | "apps">("discover");
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [busy, setBusy] = useState(false);
  const [researching, setResearching] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [cvName, setCvName] = useState("");
  const [navOpen, setNavOpen] = useState(false);
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

  async function search(value: string) {
    const q = value.trim();
    if (!q || busy) return;
    setQuery(q); setError(""); setBusy(true); setResults([]); setScreen("discover"); setSelected(null);
    try {
      const res = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, profile }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not search right now.");
      setResults(data.opportunities || []); setActivity(data.activity || null);
      if (!data.opportunities?.length) setMessage("No student opportunities found. Try a broader search.");
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed."); }
    finally { setBusy(false); }
  }

  async function investigate(item: Opportunity) {
    setResearching(true); setError("");
    try {
      const res = await fetch("/api/investigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: item.source.url, title: item.title, profile: { skills: profile.skills, cvText: profile.cvText } }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed.");
      const checklist = (data.checklist || []).map((x: { label: string; status: ChecklistItem["status"] }, i: number) => ({ ...x, id: item.id + "-" + i }));
      setSummary(data.summary || "");
      setSelected((current) => current ? { ...current, checklist, source: data.source || current.source } : current);
      setApps((current) => current.map((x) => x.id === item.id ? { ...x, checklist, source: data.source || x.source } : x));
    } catch (e) { setError(e instanceof Error ? e.message : "Research failed."); }
    finally { setResearching(false); }
  }

  function toggleSave(item: Opportunity) {
    if (saved.has(item.id)) { setApps((current) => current.filter((x) => x.id !== item.id)); setMessage("Removed from your applications"); }
    else { setApps((current) => [{ ...item, stage: "Discovered", checklist: item.checklist || checklistDefaults }, ...current]); setMessage("Saved to My applications"); }
  }

  function setChecklist(id: string, key: string, status: ChecklistItem["status"]) {
    const update = (x: Opportunity) => x.id !== id ? x : { ...x, checklist: (x.checklist || []).map((c) => c.id === key ? { ...c, status } : c) };
    setApps((current) => current.map(update)); setSelected((current) => current ? update(current) : current);
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
  return <main className="shell">
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
              <Field wide label="Skills" value={profile.skills} update={(v) => setProfile((p) => ({ ...p, skills: v }))} placeholder="Python, research, data analysis"/>
              <Field wide label="Research & industry interests" value={profile.interests} update={(v) => setProfile((p) => ({ ...p, interests: v }))} placeholder="What would you love to work on?"/>
              <Field wide label="Experience & projects" value={profile.experience} update={(v) => setProfile((p) => ({ ...p, experience: v }))} placeholder="Relevant roles, research, projects"/>
              <Field wide label="Preferred locations" value={profile.locations} update={(v) => setProfile((p) => ({ ...p, locations: v }))} placeholder="Finland, Helsinki, remote"/>
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
          {!apps.length ? <div className="empty"><div>▱</div><h2>A good opportunity is worth keeping.</h2><p>Save a result from Discover and it’ll appear here with its evidence, requirements and next steps.</p><button className="primary" onClick={() => setScreen("discover")}>Explore opportunities →</button></div> : <div className="saved-list">{apps.map((item) => <button className="saved-item" key={item.id} onClick={() => { setSelected(item); setSummary(""); }}><span className="company-mark">{item.company.slice(0, 2).toUpperCase()}</span><span className="saved-copy"><small>{item.stage || "Discovered"}</small><b>{item.title}</b><span>{item.company} · {item.location}</span></span><span className="saved-progress">{(item.checklist || []).filter((x) => x.status === "Ready" || x.status === "Completed").length}/{(item.checklist || []).length || 5} ready</span><span className="saved-arrow">→</span></button>)}</div>}
        </section> : <>
          <div className="welcome"><div><label>● &nbsp; YOUR OPPORTUNITY DESK</label><h1>Good morning, {firstName}<span>✳</span></h1><p>One profile. Every opportunity. <b>Zero research.</b></p></div><span className="welcome-note">✦ &nbsp; Your next move, made clearer</span></div>
          <section className="hero"><div className="hero-icon">✳</div><h2>What are you looking for?</h2><p>Tell us what’s next. We’ll find the opportunities and the details that matter.</p>
            <form className="search-form" onSubmit={(e) => { e.preventDefault(); void search(query); }}><span className="magnify">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. A paid data science internship in Finland for spring 2027..." aria-label="Describe your opportunity search"/><button disabled={!query.trim() || busy}>{busy ? "◌ Searching" : <>Find opportunities <span>→</span></>}</button></form>
            <div className="scenario-row"><span>TRY A SCENARIO</span>{scenarios.map((scenario, i) => <button key={scenario[0]} className={"scenario scenario-" + i} disabled={busy} onClick={() => { setQuery(scenario[1]); void search(scenario[1]); }}><i>{["✳", "◉", "⌁", "あ"][i]}</i>{scenario[0]} <b>↗</b></button>)}</div>
          </section>
          {error && <div className="error-banner"><b>Research paused</b><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
          {busy ? <div className="loading"><div className="loader">✳</div><label>LIVE RESEARCH IN PROGRESS</label><h2>Searching the web for your next move</h2><p>APPLYOS is checking real sources and reading original pages.</p><div className="load-steps"><span>✓ Planning your search</span><span>◌ Searching with Exa</span><span>Reading original sources</span><span>Ranking your matches</span></div></div> : results.length ? <section className="results">
            <div className="result-head"><div><label>YOUR RESEARCH, READY</label><h2>{results.length} opportunities to explore</h2><p>Sorted by how closely each source fits your search.</p></div><span className="live-chip"><i/> LIVE EXA SEARCH</span></div>
            {activity && <details className="activity"><summary><b>✳ Research activity</b><span>Exa searched {activity.sources} sources across {activity.queries.length} focused queries · {new Date(activity.researchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><em>See queries +</em></summary><ul>{activity.queries.map((q) => <li key={q}>{q}</li>)}</ul></details>}
            <div className="result-list">{results.map((item, i) => <OpportunityCard key={item.id} item={item} saved={saved.has(item.id)} index={i} onSave={() => toggleSave(item)} onOpen={() => { setSelected(item); setSummary(""); }}/>)}</div>
            <p className="disclaimer">ⓘ Opportunity availability can change. Always confirm status and requirements with the organization.</p>
          </section> : <section className="starter"><div className="section-head"><div><label>YOUR STARTING POINT</label><h2>A little context goes a long way.</h2></div><span>A more complete profile means closer matches.</span></div><div className="starter-grid"><button className="starter-card" onClick={() => setScreen("profile")}><i className="purple">♙</i><span><b>Build your profile</b><small>{profile.field || "Add your studies, skills and interests"}</small></span><strong>→</strong><div className="progress"><i style={{ width: [profile.field, profile.skills, profile.university, profile.interests].filter(Boolean).length * 25 + "%" }}/></div></button><button className="starter-card" onClick={() => setScreen("apps")}><i className="green">▱</i><span><b>Save your first opportunity</b><small>{apps.length ? apps.length + " saved in your workspace" : "Keep interesting roles in one place"}</small></span><strong>→</strong><div className="progress"><i style={{ width: apps.length ? "100%" : "0%" }}/></div></button></div><div className="privacy-message"><b>⌑ &nbsp; Your profile stays yours.</b><span>Personal details stay on this device. Only broad, non-identifying search criteria go to Exa.</span></div></section>}
        </>}
      </div>
      <footer><b>✳ APPLYOS</b><span>· Your next opportunity starts here</span><span className="footer-right">Built for students, with care <b>♥</b></span></footer>
    </section>
    {selected && <Drawer item={selected} saved={saved.has(selected.id)} researching={researching} summary={summary} error={error} onClose={() => { setSelected(null); setError(""); }} onSave={() => toggleSave(selected)} onInvestigate={() => void investigate(selected)} onChecklist={(key, status) => setChecklist(selected.id, key, status)}/>}
    {message && <div className="toast">✓ &nbsp; {message}</div>}
    <input ref={inputRef} hidden type="file" accept=".pdf,application/pdf" onChange={upload}/>
  </main>;
}

function Field({ label, value, update, placeholder, wide }: { label: string; value: string; update: (v: string) => void; placeholder: string; wide?: boolean }) {
  return <label className={"field" + (wide ? " wide" : "")}><span>{label}</span><input value={value} onChange={(e) => update(e.target.value)} placeholder={placeholder}/></label>;
}

function OpportunityCard({ item, saved, index, onSave, onOpen }: { item: Opportunity; saved: boolean; index: number; onSave: () => void; onOpen: () => void }) {
  return <article className="opportunity" style={{ animationDelay: index * 60 + "ms" }}>
    <div className="opportunity-head"><span className={"company-mark mark-" + (index % 4)}>{item.company.slice(0, 2).toUpperCase()}</span><div className="company-info"><div><b>{item.company}</b><span className="source-found">◉ Source found</span></div><h3>{item.title}<i>{item.type}</i></h3></div><button className={saved ? "bookmark saved" : "bookmark"} onClick={onSave} aria-label={saved ? "Remove saved opportunity" : "Save opportunity"}>{saved ? "♥" : "♡"}</button></div>
    <p className="opportunity-summary">{item.summary}</p><div className="facts"><span>⌖ &nbsp;{item.location}</span><span>◷ &nbsp;{item.deadline ? "Deadline " + item.deadline : "Deadline not specified"}</span><span className={item.status === "Possibly open" ? "status open" : "status"}><i/>{item.status}</span></div>
    <div className="match"><span><i style={{ width: item.match + "%" }}/></span><b>{item.match}% match</b><em>· {item.matchReason}</em></div>
    <div className="quote"><span>“</span><p>{item.source.excerpt || "Source page found by Exa. Open this result to read the evidence and investigate requirements."}</p></div>
    <div className="opportunity-bottom"><a href={item.source.url} rel="noreferrer" target="_blank">↗ &nbsp;View source <small>↗</small></a><button onClick={onOpen}>Research opportunity <b>→</b></button></div>
  </article>;
}

function Drawer({ item, saved, researching, summary, error, onClose, onSave, onInvestigate, onChecklist }: { item: Opportunity; saved: boolean; researching: boolean; summary: string; error: string; onClose: () => void; onSave: () => void; onInvestigate: () => void; onChecklist: (id: string, status: ChecklistItem["status"]) => void }) {
  const items = item.checklist || checklistDefaults.map((x) => ({ ...x, id: item.id + "-" + x.id }));
  const ready = items.filter((x) => x.status === "Ready" || x.status === "Completed").length;
  return <div className="drawer-layer"><button className="scrim" onClick={onClose} aria-label="Close workspace"/><aside className="drawer"><header><button onClick={onClose}>← &nbsp;Back to opportunities</button><button onClick={onClose}>×</button></header><div className="drawer-body">
    <label>● &nbsp; APPLICATION WORKSPACE</label><div className="drawer-company"><span className="company-mark mark-2">{item.company.slice(0, 2).toUpperCase()}</span><b>{item.company}</b><i>{item.type}</i></div><h1>{item.title}</h1><div className="drawer-facts"><span>⌖ {item.location}</span><span className="status"><i/>{item.status}</span></div><p className="drawer-summary">{item.summary}</p>
    <button className="primary investigate" onClick={onInvestigate} disabled={researching}>{researching ? "◌ Reading original source…" : "✳ &nbsp; Investigate application  →"}</button><button className="save-wide" onClick={onSave}>{saved ? "♥ Saved to applications" : "♡ Save opportunity"}</button>
    <section className="drawer-section"><div className="drawer-section-head"><div><small>RESEARCH NOTES</small><h3>What we know so far</h3></div><span>Evidence-led</span></div><p className="research-note">{summary || "Investigate this opportunity to read the original page and look for requirements, deadlines and application instructions."}</p><div className="source-box"><b><i/> ORIGINAL SOURCE</b><p>{item.source.excerpt || "Open the source to see the published announcement."}</p><a href={item.source.url} target="_blank" rel="noreferrer">{item.source.title} ↗</a></div></section>
    <section className="drawer-section"><div className="drawer-section-head"><div><small>YOUR READINESS</small><h3>Application checklist</h3></div><strong className="readiness">{ready}<small>/{items.length}</small></strong></div><div className="checklist">{items.map((x) => <label key={x.id}><span className={x.status === "Ready" || x.status === "Completed" ? "checked" : ""}>{x.status === "Ready" || x.status === "Completed" ? "✓" : ""}</span><b>{x.label}</b><select value={x.status} onChange={(e) => onChecklist(x.id, e.target.value as ChecklistItem["status"])}><option>Ready</option><option>Missing</option><option>Needs review</option><option>Needs confirmation</option><option>Completed</option></select></label>)}</div></section>
    <section className="drawer-section next-step"><small>A QUESTION TO CONFIRM</small><p>Is this opportunity still accepting applications, and which supporting documents are required?</p><span>Draft only · no message is sent by APPLYOS</span></section>{error && <div className="inline-error">{error}</div>}
  </div></aside></div>;
}
