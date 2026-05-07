import Link from "next/link";
import { BookOpen, Layers } from "lucide-react";

const SECTIONS = [
  {
    title: "Why Pitstop exists",
    content: (
      <div className="space-y-2 text-sm text-stone-600 leading-relaxed">
        <p>Pitstop exists to give the team <strong>clarity and shared visibility</strong> — not to generate reports or bureaucracy. The goal is that every team member knows what they are doing, why it matters, and what comes next.</p>
        <ul className="space-y-1 mt-3">
          {[
            "Over-planning does damage too. Use the tool lightly.",
            "History of how we have done something is crucial — record it here, not in memory.",
            "Pacing and rhythm matter. Speed is cadence, not sprint.",
            "Maps give context and focus. Decisions are not to escalate — they are to record.",
          ].map((p, i) => (
            <li key={i} className="flex gap-2"><span className="text-stone-300 flex-shrink-0">—</span>{p}</li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    title: "The hierarchy",
    content: (
      <div className="space-y-4">
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 font-mono text-xs text-stone-500 leading-relaxed">
          Program<br />
          {"  └── Goals"}<br />
          {"        └── Pitstops"}<br />
          {"              └── Checklists"}<br />
          {"                    ← Activities run alongside all of this"}
        </div>
        <div className="space-y-3">
          {[
            { term: "Program", color: "bg-violet-100 text-violet-700", def: "A funding stream, geographic programme, or strategic initiative. Groups related goals together.", example: "North Zone Livelihoods Programme" },
            { term: "Goal", color: "bg-sky-100 text-sky-700", def: "An end in itself. Meaningful on its own, not just a step. Has an owner, target date, and status.", example: "Enroll 200 children in after-school centres by June" },
            { term: "Pitstop", color: "bg-emerald-100 text-emerald-700", def: "A means to an end. A milestone or deliverable within a goal — not a task, but a meaningful checkpoint.", example: "Baseline assessment of 5 clusters complete" },
            { term: "Checklist", color: "bg-amber-100 text-amber-700", def: "Self-assessed milestones within a pitstop. Your SOP — practical steps someone else could follow.", example: "Visit cluster / Meet coordinator / Submit report" },
            { term: "Activity", color: "bg-rose-100 text-rose-700", def: "A scheduled meeting, field visit, or event linked to one or more pitstops. Appears on the team calendar.", example: "Community mobilisation visit — Peenya West" },
          ].map(({ term, color, def, example }) => (
            <div key={term} className="flex gap-3">
              <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full h-fit mt-0.5 ${color}`}>{term}</span>
              <div className="text-sm text-stone-600 leading-relaxed">
                {def}
                <span className="block text-xs text-stone-400 italic mt-0.5">e.g. {example}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "Getting started",
    content: (
      <div className="space-y-5">
        {[
          {
            step: "1", title: "Create a Goal", href: "/dashboard",
            items: [
              'Write a title that is an outcome, not an action. "Creche enrolment reaches 150" is better than "Do creche work".',
              "Assign an owner — the person accountable, not necessarily doing all the work.",
              "Set a target date.",
              "Tag it to a Program, Zone, and Cluster. This drives the map and geo-filtered views.",
            ],
          },
          {
            step: "2", title: "Break it into Pitstops", href: null,
            items: [
              'Each pitstop should represent a real deliverable — something you can point to and say "this is done."',
              "Set a start date and target date. These appear on the Gantt chart and timeline.",
              "Assign an owner. The pitstop owner is responsible for this specific piece.",
              "Choose a type: Meeting, Workshop, Visit, Training, Report, Review, or Other.",
              "Good sequencing matters — the route map on the goal page shows the flow visually.",
            ],
          },
          {
            step: "3", title: "Add a Checklist", href: null,
            items: [
              "Add checklist items for the practical steps inside each pitstop.",
              "These are your SOP — specific enough that someone else could follow them.",
              "Checklist progress feeds into the AI assistant's analysis.",
            ],
          },
          {
            step: "4", title: "Schedule Activities", href: "/activities",
            items: [
              "When a pitstop requires a field visit, meeting, or team event, create an Activity.",
              "Link it to the relevant pitstop(s) and add attendees from the team.",
              "Use the Subscribe button on the Activities page to sync to Outlook or Google Calendar.",
            ],
          },
        ].map(({ step, title, href, items }) => (
          <div key={step} className="flex gap-4">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">{step}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-semibold text-stone-800">{title}</p>
                {href && <Link href={href} className="text-[11px] text-sky-500 hover:underline">→ Go there</Link>}
              </div>
              <ul className="space-y-1">
                {items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-stone-600"><span className="text-stone-300 flex-shrink-0 mt-0.5">•</span>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Day-to-day use",
    content: (
      <div className="space-y-4 text-sm text-stone-600 leading-relaxed">
        <div>
          <p className="font-semibold text-stone-800 mb-1">Field Notes <Link href="/standup" className="text-sky-500 text-xs hover:underline ml-1">→ /standup</Link></p>
          <p>Log your daily update: what you did yesterday, what you're doing today, any blockers. This is not a report — it's a signal to the team. The AI reads these.</p>
        </div>
        <div>
          <p className="font-semibold text-stone-800 mb-1">Updating Pitstop status</p>
          <p>Move pitstops to <strong>In Progress</strong> when you start, and <strong>Done</strong> when finished. Don't leave them in Upcoming when work has started. Use <strong>Flagged</strong> to surface blockers early.</p>
          <div className="flex items-center gap-2 mt-2 text-xs">
            {["Upcoming", "→", "In Progress", "→", "Done"].map((s, i) => (
              <span key={i} className={s === "→" ? "text-stone-300" : "px-2 py-0.5 rounded-full font-medium " + (s === "Done" ? "bg-emerald-100 text-emerald-700" : s === "In Progress" ? "bg-sky-100 text-sky-700" : "bg-stone-100 text-stone-500")}>{s}</span>
            ))}
          </div>
        </div>
        <div>
          <p className="font-semibold text-stone-800 mb-1">Fortnightly Review <Link href="/review" className="text-sky-500 text-xs hover:underline ml-1">→ /review</Link></p>
          <p>Every two weeks — a structured look at committed vs. delivered. Not a blame exercise, but a signal of what is realistic and what needs attention.</p>
        </div>
      </div>
    ),
  },
  {
    title: "Planning tools",
    content: (
      <div className="grid sm:grid-cols-2 gap-3">
        {[
          { name: "Gantt Chart", href: "/gantt", desc: "Visual timeline of all goals and pitstops. Use it to spot overloading." },
          { name: "Timeline", href: "/timeline", desc: "Vertical scroll of pitstops by date. Good for 'what's happening this week'." },
          { name: "Planner", href: "/planner", desc: "Personal weekly planning. Organise your own work for the week ahead." },
          { name: "Quarters", href: "/quarters", desc: "Assign goals to planning quarters for cycle-based planning." },
        ].map(({ name, href, desc }) => (
          <Link key={href} href={href} className="block p-3 rounded-xl border border-stone-200 hover:border-sky-300 hover:bg-sky-50 transition-colors">
            <p className="text-sm font-semibold text-stone-800">{name}</p>
            <p className="text-xs text-stone-500 mt-0.5">{desc}</p>
          </Link>
        ))}
      </div>
    ),
  },
  {
    title: "Making sense of the work",
    content: (
      <div className="space-y-3">
        {[
          { name: "Themes", href: "/themes", desc: "Tag pitstops with cross-cutting themes (Livelihoods, Health, Child Protection). See all work on a topic across goals." },
          { name: "Geography & Map", href: "/map", desc: "Tag goals and pitstops to Zones and Clusters. The Programme Map shows settlements, centres, and creches as a live map." },
          { name: "Risks", href: "/risks", desc: "Log threats to a goal with likelihood and impact. Don't wait until it happens." },
          { name: "Decisions", href: "/decisions", desc: "Record key decisions linked to goals. The purpose is not to escalate — it is to have a record of why." },
          { name: "Metrics", href: "/dashboard", desc: "Add quantitative KPIs to goals (e.g. Households reached: 500). Add data points over time." },
        ].map(({ name, href, desc }) => (
          <div key={name} className="flex gap-3 items-start">
            <Link href={href} className="flex-shrink-0 text-xs font-semibold text-sky-600 hover:underline w-24">{name}</Link>
            <p className="text-sm text-stone-600">{desc}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "The AI assistant",
    content: (
      <div className="space-y-3 text-sm text-stone-600 leading-relaxed">
        <p>Click <strong>Pitstop AI</strong> in the sidebar (desktop) or the ✦ button (mobile). The assistant has access to all goals, pitstops, checklists, themes, risks, decisions, activities, field notes, metrics, and geography in real time.</p>
        <ul className="space-y-1">
          {[
            "Analyse overall progress and flag what's at risk",
            "Identify overdue pitstops across the team",
            "Summarise workload per team member",
            "Suggest a realistic schedule for the year",
            "Recommend meetings and field visits based on pitstop status",
            "Suggest improvements to goal breakdowns",
          ].map((item, i) => (
            <li key={i} className="flex gap-2"><span className="text-sky-400 flex-shrink-0">✦</span>{item}</li>
          ))}
        </ul>
        <p className="text-xs text-stone-400 italic">The assistant knows all app features and will direct you to the right module. Ask it anything specific.</p>
      </div>
    ),
  },
  {
    title: "Quick reference",
    content: (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="text-left py-2 pr-6 text-xs font-semibold text-stone-500 uppercase tracking-wide">Situation</th>
              <th className="text-left py-2 text-xs font-semibold text-stone-500 uppercase tracking-wide">What to do</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {[
              ["New goal", "Goals → New Goal → set owner, date, geography, programme"],
              ["New pitstop", "Inside goal → Add Pitstop → set dates, owner, type"],
              ["Update progress", "Open pitstop → move status → tick checklist items"],
              ["Log a blocker", "Set pitstop status to Flagged, add a note"],
              ["Schedule a visit", "Activities → New → link to pitstop, add attendees"],
              ["Daily update", "Field Notes → log yesterday / today / blockers"],
              ["See the big picture", "Gantt or Timeline"],
              ["Something went wrong", "Risks → log it"],
              ["A decision was made", "Decisions → record it"],
              ["Ask a question", "Pitstop AI → ask anything"],
            ].map(([situation, action]) => (
              <tr key={situation}>
                <td className="py-2 pr-6 text-stone-700 font-medium whitespace-nowrap">{situation}</td>
                <td className="py-2 text-stone-500">{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },
];

export default function HelpPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-20 sm:pb-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center">
          <BookOpen className="w-4.5 h-4.5 text-sky-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Team Manual</h1>
          <p className="text-xs text-stone-400">How to use Pitstop</p>
        </div>
      </div>

      <Link
        href="/help/templates"
        className="flex items-center gap-3 p-4 rounded-xl border border-stone-200 hover:border-sky-300 hover:bg-sky-50 transition-colors mb-8 group"
      >
        <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
          <Layers className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-800 group-hover:text-sky-700">Programme Playbooks</p>
          <p className="text-xs text-stone-400 mt-0.5">Goal templates — what they create, their checklists, and when to use them</p>
        </div>
        <BookOpen className="w-4 h-4 text-stone-300 group-hover:text-sky-400 flex-shrink-0" />
      </Link>

      <div className="space-y-8">
        {SECTIONS.map(({ title, content }) => (
          <section key={title}>
            <h2 className="text-sm font-bold text-stone-900 uppercase tracking-widest mb-4 pb-2 border-b border-stone-100">{title}</h2>
            {content}
          </section>
        ))}
      </div>

      <p className="mt-12 text-xs text-stone-300 text-center">Pitstop — built for Urban Program, Bangalore 2026</p>
    </div>
  );
}
