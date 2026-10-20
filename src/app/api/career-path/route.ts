// app/api/career-path/route.ts
// Guided Career Roadmap Builder: AI-generated structured roadmap, enriched
// with real platform mentors and events, saved per user.
import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { dbConnect } from "@/lib/mongodb";
import { getAuthUserId } from "@/lib/auth";
import CareerPath from "@/models/CareerPath";
import Mentor2 from "@/models/Mentor2";
import Mentee from "@/models/Mentee";
import Event from "@/models/Event";

export const dynamic = "force-dynamic";

// ---------- helpers ----------

function textOf(...parts: any[]): string {
  return parts
    .flat()
    .filter(Boolean)
    .map(String)
    .join(" ")
    .toLowerCase();
}

/** Keyword-overlap score between a set of keywords and a blob of mentor text. */
function scoreKeywords(keywords: string[], haystack: string): number {
  let score = 0;
  for (const kw of keywords) {
    const k = kw.toLowerCase().trim();
    if (k.length > 2 && haystack.includes(k)) score += 1;
  }
  return score;
}

// ----- smarter matching: token overlap + role→domain mapping + cross-phase dedup -----

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "with", "your",
  "my", "is", "are", "be", "as", "at", "by", "it", "this", "that", "from",
  "will", "can", "you", "we", "i", "me", "us",
]);

function tokenize(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// Maps words that appear in AI-generated phase skills to the categorical
// labels mentors actually use in their profiles (technicalSkills/interests).
const ROLE_DOMAINS: [string, string[]][] = [
  ["data", ["data science", "data analysis", "analytics", "machine learning", "artificial intelligence"]],
  ["statistic", ["data science", "data analysis", "analytics"]],
  ["analytics", ["data analysis", "data science", "analytics"]],
  ["machine learning", ["machine learning", "artificial intelligence", "data science"]],
  ["ai", ["artificial intelligence", "machine learning", "data science"]],
  ["ml", ["machine learning", "artificial intelligence", "data science"]],
  ["neural", ["artificial intelligence", "machine learning"]],
  ["deep", ["artificial intelligence", "machine learning"]],
  ["frontend", ["frontend", "ui ux", "ux/ui", "full-stack"]],
  ["react", ["frontend", "full-stack"]],
  ["backend", ["backend", "full-stack"]],
  ["full stack", ["full-stack", "backend", "frontend"]],
  ["fullstack", ["full-stack", "backend", "frontend"]],
  ["devops", ["devops", "cloud computing", "cybersecurity"]],
  ["cloud", ["cloud computing", "devops"]],
  ["deploy", ["devops", "cloud computing", "backend"]],
  ["docker", ["devops", "cloud computing"]],
  ["cyber", ["cybersecurity", "cloud computing"]],
  ["security", ["cybersecurity", "cloud computing"]],
  ["product", ["product management", "project management"]],
  ["project", ["project management", "product management"]],
  ["design", ["ui ux", "ux/ui", "frontend"]],
  ["ui", ["ui ux", "ux/ui"]],
  ["ux", ["ui ux", "ux/ui"]],
  ["qa", ["qa & testing", "project management"]],
  ["testing", ["qa & testing"]],
  ["software", ["full-stack", "frontend", "backend"]],
  ["web", ["full-stack", "frontend", "backend"]],
  ["blockchain", ["blockchain"]],
  ["mobile", ["mobile development"]],
  ["game", ["mobile development", "frontend", "backend"]],
  ["marketing", ["digital marketing", "content & copywriting", "sales & business development"]],
  ["seo", ["digital marketing"]],
  ["social media", ["digital marketing", "content & copywriting"]],
  ["content", ["content & copywriting", "digital marketing"]],
  ["copywrit", ["content & copywriting"]],
  ["writing", ["content & copywriting"]],
  ["blog", ["content & copywriting"]],
  ["brand", ["digital marketing", "content & copywriting"]],
  ["finance", ["finance & accounting", "business analysis"]],
  ["accounting", ["finance & accounting"]],
  ["invest", ["finance & accounting"]],
  ["excel", ["business analysis", "finance & accounting"]],
  ["spreadsheet", ["business analysis", "finance & accounting"]],
  ["human resource", ["human resources"]],
  ["recruit", ["human resources"]],
  ["hiring", ["human resources"]],
  ["people", ["human resources"]],
  ["talent", ["human resources"]],
  ["sales", ["sales & business development"]],
  ["business", ["business analysis", "sales & business development", "operations & strategy"]],
  ["operation", ["operations & strategy", "project management"]],
  ["management", ["project management", "operations & strategy", "human resources"]],
  ["graphic", ["graphic design", "ui ux"]],
];

function roleDomains(text: string): string[] {
  const t = text.toLowerCase();
  const out = new Set<string>();
  for (const [key, domains] of ROLE_DOMAINS) {
    if (t.includes(key)) domains.forEach((d) => out.add(d));
  }
  return Array.from(out);
}

/** Granular token overlap + categorical domain affinity for one phase. */
function phaseMentorScore(keywordsText: string, mentorCats: string, mentorHay: string): number {
  const kwTokens = new Set(tokenize(keywordsText));
  const mentorTokens = new Set(tokenize(mentorHay));
  let overlap = 0;
  for (const t of kwTokens) if (mentorTokens.has(t)) overlap += 1;

  let domainHits = 0;
  for (const d of roleDomains(keywordsText)) {
    if (mentorCats.includes(d)) domainHits += 1;
  }
  return overlap + domainHits * 2;
}

function serializeMentor(m: any) {
  return {
    _id: String(m._id),
    fullName: m.fullName ?? "Mentor",
    currentRole: m.currentRole ?? "",
    company: m.company ?? "",
    profilePhoto: m.profilePhoto ?? "",
  };
}

/**
 * Score mentors per phase, then assign with cross-phase dedup so the same
 * mentor doesn't appear on every step. Unassigned mentors are always
 * preferred; already-used ones only fill gaps when nothing fresh matches.
 */
function matchMentorsForPhases(targetRole: string, phases: any[], mentors: any[], perPhase = 2) {
  const used = new Set<string>();

  for (const phase of phases) {
    const keywordsText = [targetRole, ...(phase.skills ?? [])].join(" ");

    const scored = mentors
      .map((m) => {
        const cats = textOf(m.technicalSkills, m.areasOfInterest, m.currentRole);
        const hay = textOf(
          m.technicalSkills,
          m.areasOfInterest,
          m.currentRole,
          m.company,
          m.mentoringGoals,
          m.personalBio
        );
        return { mentor: m, score: phaseMentorScore(keywordsText, cats, hay) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const fresh = scored.filter((x) => !used.has(String(x.mentor._id)));
    const reused = scored.filter((x) => used.has(String(x.mentor._id)));
    const pool = [...fresh, ...reused].slice(0, perPhase);

    pool.forEach((x) => used.add(String(x.mentor._id)));
    phase.mentors = pool.map((x) => serializeMentor(x.mentor));
  }
}

function matchEvents(keywords: string[], events: any[], limit = 3) {
  const scored = events
    .map((e) => {
      const hay = textOf(e.title, e.description, e.category);
      return { event: e, score: scoreKeywords(keywords, hay) };
    })
    .sort((a, b) => b.score - a.score);
  const chosen = (scored.filter((x) => x.score > 0).length
    ? scored.filter((x) => x.score > 0)
    : scored
  ).slice(0, limit);
  return chosen.map(({ event: e }) => ({
    _id: String(e._id),
    title: e.title,
    date: e.date,
    time: e.time,
    category: e.category ?? "Event",
    location: e.location ?? "",
  }));
}

/** Coerce whatever the model returned into the exact shape the UI expects. */
function sanitizeRoadmap(raw: any) {
  const phasesRaw = Array.isArray(raw?.phases) ? raw.phases : [];
  const phases = phasesRaw.slice(0, 6).map((p: any, i: number) => ({
    title: String(p?.title ?? `Phase ${i + 1}`),
    duration: String(p?.duration ?? ""),
    goal: String(p?.goal ?? ""),
    skills: Array.isArray(p?.skills) ? p.skills.map(String).slice(0, 10) : [],
    resources: (Array.isArray(p?.resources) ? p.resources : [])
      .slice(0, 5)
      .map((r: any) => ({
        name: String(r?.name ?? "Resource"),
        type: r?.type === "paid" ? "paid" : "free",
        url: typeof r?.url === "string" ? r.url : "",
      })),
    project: String(p?.project ?? ""),
    milestone: String(p?.milestone ?? ""),
    mentors: [] as any[],
  }));
  return {
    summary: String(raw?.summary ?? ""),
    skillGaps: Array.isArray(raw?.skillGaps) ? raw.skillGaps.map(String).slice(0, 12) : [],
    phases,
    roles: Array.isArray(raw?.roles) ? raw.roles.map(String).slice(0, 8) : [],
    interviewFocus: Array.isArray(raw?.interviewFocus)
      ? raw.interviewFocus.map(String).slice(0, 10)
      : [],
    events: [] as any[],
  };
}

async function generateWithGroq(userAnswers: any, menteeContext: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    const err: any = new Error(
      "GROQ_API_KEY is not configured on the server. Add it to backend .env.local and restart."
    );
    err.status = 503;
    throw err;
  }
  const groq = new Groq({ apiKey });

  const system = `You are MentorHer's career roadmap generator for women in tech.
Given the user's answers, produce ONE JSON object only (no markdown, no prose outside JSON) with exactly this schema:
{
  "summary": "2-3 sentence personalized summary of the plan",
  "skillGaps": ["skills the user lacks for the target role"],
  "phases": [
    {
      "title": "short phase name",
      "duration": "e.g. 4-6 weeks",
      "goal": "one-sentence goal of this phase",
      "skills": ["skill", "..."],
      "resources": [{ "name": "resource name", "type": "free" | "paid", "url": "https://..." }],
      "project": "one concrete project idea for this phase",
      "milestone": "how they know this phase is done"
    }
  ],
  "roles": ["real job titles this path leads to"],
  "interviewFocus": ["topics to prepare for interviews"]
}
Rules: 3-5 phases ordered beginner to job-ready; prefer FREE resources with real URLs (official docs, freeCodeCamp, CS50, Kaggle, YouTube channels, MDN, roadmap.sh etc.); tailor depth to the user's hours/week and current skills; never invent fake mentors or events; be encouraging and specific, not generic.`;

  const user = `Target role: ${userAnswers.targetRole}
Current status: ${userAnswers.currentStatus}
Education: ${userAnswers.education}
Current skills: ${(userAnswers.skills ?? []).join(", ") || "none listed"}
Available time: ${userAnswers.hoursPerWeek} per week
Challenges/concerns: ${userAnswers.challenges || "none"}
${menteeContext ? `Mentee profile context: ${menteeContext}` : ""}`;

  const completion = await groq.chat.completions.create({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    model: "openai/gpt-oss-120b",
    temperature: 0.4,
    max_tokens: 3072,
    response_format: { type: "json_object" },
  });

  const text = completion.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text);
}

// ---------- routes ----------

/** GET /api/career-path — the signed-in user's saved roadmap (or null). */
export async function GET(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    await dbConnect();
    const doc = await CareerPath.findOne({ userId }).lean();
    return NextResponse.json({ success: true, roadmap: doc ?? null });
  } catch (error: any) {
    console.error("Error in GET /api/career-path:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/career-path — generate a roadmap from the wizard answers,
 * enrich it with real mentors/events, and save it (upsert).
 */
export async function POST(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const body = await req.json();
    const targetRole = String(body?.targetRole ?? "").trim();
    const currentStatus = String(body?.currentStatus ?? "").trim();
    const education = String(body?.education ?? "").trim();
    const hoursPerWeek = String(body?.hoursPerWeek ?? "").trim();
    const challenges = String(body?.challenges ?? "").trim();
    const skills: string[] = Array.isArray(body?.skills)
      ? body.skills.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 30)
      : [];

    if (!targetRole || !currentStatus || !hoursPerWeek) {
      return NextResponse.json(
        { success: false, error: "targetRole, currentStatus and hoursPerWeek are required." },
        { status: 400 }
      );
    }

    // Optional mentee profile context for a more personal plan
    let menteeContext = "";
    try {
      const mentee: any = await Mentee.findOne({ userId })
        .select("careerGoals mentorshipGoals technicalBackground technicalSkills challenges education currentStatus")
        .lean();
      if (mentee) {
        menteeContext = [
          mentee.currentStatus,
          mentee.education,
          mentee.technicalBackground,
          mentee.careerGoals,
          mentee.mentorshipGoals,
          Array.isArray(mentee.technicalSkills) ? mentee.technicalSkills.join(", ") : "",
          mentee.challenges,
        ]
          .filter(Boolean)
          .join(" | ");
      }
    } catch {
      /* profile is optional */
    }

    let raw: any;
    try {
      raw = await generateWithGroq(
        { targetRole, currentStatus, education, hoursPerWeek, challenges, skills },
        menteeContext
      );
    } catch (err: any) {
      if (err?.status === 503) {
        return NextResponse.json({ success: false, error: err.message }, { status: 503 });
      }
      console.error("Groq generation failed:", err);
      return NextResponse.json(
        { success: false, error: "AI generation failed. Please try again." },
        { status: 502 }
      );
    }

    const roadmap = sanitizeRoadmap(raw);

    // Enrich: real mentors per phase + real upcoming events
    const mentors = await Mentor2.find({})
      .select("fullName currentRole company profilePhoto technicalSkills areasOfInterest mentoringGoals personalBio")
      .lean();
    const events = await Event.find({}).sort({ createdAt: -1 }).limit(20).lean();

    const globalKeywords = [targetRole, ...skills];
    matchMentorsForPhases(targetRole, roadmap.phases, mentors as any[], 2);
    roadmap.events = matchEvents(
      globalKeywords.concat(roadmap.phases.flatMap((p: any) => p.skills)),
      events as any[]
    );

    const saved = await CareerPath.findOneAndUpdate(
      { userId },
      {
        targetRole,
        input: { currentStatus, education, skills, hoursPerWeek, challenges },
        summary: roadmap.summary,
        skillGaps: roadmap.skillGaps,
        phases: roadmap.phases,
        roles: roadmap.roles,
        interviewFocus: roadmap.interviewFocus,
        events: roadmap.events,
        completedPhases: [],
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json({ success: true, roadmap: saved }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/career-path:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** PATCH /api/career-path — save which phases are completed. */
export async function PATCH(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const body = await req.json();
    const completedPhases: number[] = Array.isArray(body?.completedPhases)
      ? body.completedPhases.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0)
      : null;

    if (!completedPhases) {
      return NextResponse.json(
        { success: false, error: "completedPhases (array of numbers) is required." },
        { status: 400 }
      );
    }

    const updated: any = await CareerPath.findOneAndUpdate(
      { userId },
      { completedPhases },
      { new: true }
    ).lean();
    if (!updated) {
      return NextResponse.json({ success: false, error: "No roadmap saved yet." }, { status: 404 });
    }
    return NextResponse.json({ success: true, completedPhases: updated.completedPhases });
  } catch (error: any) {
    console.error("Error in PATCH /api/career-path:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
