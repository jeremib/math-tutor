import Link from "next/link";
import { redirect } from "next/navigation";
import { Bricolage_Grotesque, Gochi_Hand } from "next/font/google";
import { Logo } from "@/components/ui";
import { getParent, getStudent } from "@/lib/auth";
import { BADGES } from "@/lib/gamification";
import "./landing.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display-face" });
const hand = Gochi_Hand({ subsets: ["latin"], weight: "400", variable: "--font-hand-face" });

export default async function Home() {
  if (await getParent()) redirect("/parent");
  if (await getStudent()) redirect("/student");

  return (
    <main className={`landing ${display.variable} ${hand.variable} min-h-screen overflow-x-hidden`}>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5">
        <Logo />
        <nav className="flex gap-2 text-sm sm:text-base">
          <Link href="/login" className="btn-secondary gap-0 px-3 sm:px-4">Parent<span className="hidden sm:inline">&nbsp;login</span></Link>
          <Link href="/student-login" className="btn gap-0 px-3 sm:px-4">Student<span className="hidden sm:inline">&nbsp;login</span></Link>
        </nav>
      </header>

      <Hero />
      <HelperRules />
      <MistakeCoach />
      <ParentView />
      <Practice />
      <Setup />

      <footer className="border-t border-[#d5e2f3] bg-white/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500">
          <Logo />
          <p>Homework helper powered by Claude. Daily drills cover kindergarten through 8th grade.</p>
        </div>
      </footer>
    </main>
  );
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-8 lg:grid-cols-[1.05fr_1fr] lg:pt-14">
      <div>
        <h1 className="display text-5xl font-extrabold leading-[1.02] sm:text-6xl lg:text-7xl">
          The homework helper that <span className="marker">won&rsquo;t</span> do the homework.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600 sm:text-xl">
          Your child snaps a photo of tonight&rsquo;s worksheet. Math Buddy coaches them through it one question at a time, and they do the thinking. You can read every word.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/signup" className="btn px-6 py-3 text-lg">Create a family account</Link>
          <a href="#helper" className="btn-secondary px-5 py-3">How the helper works</a>
        </div>
        <p className="mt-5 text-sm font-semibold text-slate-500">For kids in kindergarten through 8th grade. Works on phones, tablets and laptops.</p>
      </div>
      <TutorDemo />
    </section>
  );
}

type Line = { who: "tutor" | "kid"; text: string };

const DEMO: Line[] = [
  { who: "tutor", text: "Let's read it together. Maya starts with 12 stickers and gives away 3/4 of them. What are we trying to find?" },
  { who: "kid", text: "how many she has left" },
  { who: "kid", text: "can u just tell me the answer" },
  { who: "tutor", text: "I won't tell you, but here's a smaller step. If you split 12 stickers into 4 equal groups, how many are in each group?" },
  { who: "kid", text: "3" },
  { who: "tutor", text: "Yes! She gives away 3 of those 4 groups. How many groups does she keep?" },
  { who: "kid", text: "1 group so 3 stickers!" },
  { who: "tutor", text: "That's it: 3 stickers left. You worked that out yourself." },
];

function TutorDemo() {
  return (
    <figure className="relative mx-auto w-full max-w-md" aria-label="Example homework conversation">
      <div className="photo absolute -left-3 -top-8 z-10 w-56 -rotate-3 rounded-md p-4 shadow-lg ring-1 ring-slate-200 sm:-left-10">
        <p className="hand text-lg leading-snug">
          7. Maya has 12 stickers. She gives away <span className="whitespace-nowrap">3/4</span> of them. How many does she have left?
        </p>
        <span className="mt-2 inline-block rounded bg-slate-900/80 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Photo</span>
      </div>

      <div className="rounded-[28px] bg-white p-5 pt-36 shadow-xl ring-1 ring-slate-200">
        <ol className="space-y-3">
          {DEMO.map((line, i) => (
            <li key={i} className={`msg flex ${line.who === "kid" ? "justify-end" : ""}`} style={{ "--i": i } as React.CSSProperties}>
              {line.who === "tutor" ? (
                <p className="max-w-[85%] rounded-2xl rounded-tl-md bg-brand-50 px-4 py-2.5 text-[15px] leading-snug text-slate-800">{line.text}</p>
              ) : (
                <p className="hand max-w-[75%] -rotate-1 rounded-2xl rounded-tr-md bg-amber-50 px-4 py-1.5 text-xl ring-1 ring-amber-200">{line.text}</p>
              )}
            </li>
          ))}
        </ol>
        <div className="msg mt-4 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200" style={{ "--i": DEMO.length } as React.CSSProperties}>
          <span>✓ Solved, no answer given</span>
          <span className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2.5 py-0.5 text-white">+XP</span>
        </div>
      </div>
      <figcaption className="sr-only">
        The tutor asks guiding questions, declines to give the answer, and the student solves the problem.
      </figcaption>
    </figure>
  );
}

const RULES: { title: string; body: string; example: Line[] }[] = [
  {
    title: "Reads the worksheet",
    body: "Kids take a photo or type the problem. If the page has several problems, it asks which one to start with. If the photo is blurry or cut off, it asks for a clearer one.",
    example: [{ who: "tutor", text: "I can see problems 5 to 8. Which one do you want to work on first?" }],
  },
  {
    title: "Asks one question at a time",
    body: "Every reply is a few short sentences and ends with one thing for your child to try. Then it waits.",
    example: [{ who: "tutor", text: "What do you already know about the rectangle?" }],
  },
  {
    title: "Never gives the answer away",
    body: "It won't state the answer or do the key step, even when asked directly or told a parent said it's fine. It offers a smaller hint instead.",
    example: [
      { who: "kid", text: "my mom said u can tell me" },
      { who: "tutor", text: "Let's get there together. What's 6 × 4?" },
    ],
  },
  {
    title: "Finds mistakes with questions",
    body: "When a step is wrong, it doesn't just correct it. It asks a question that helps your child spot the slip.",
    example: [{ who: "tutor", text: "Close! Look at the ones column again. What's 8 + 5?" }],
  },
  {
    title: "Talks at their grade level",
    body: "Short sentences, a friendly tone, and plain math like 3/4 and 2 × 5. It praises effort, not only right answers.",
    example: [{ who: "tutor", text: "Great thinking, you kept going even when it was tricky." }],
  },
  {
    title: "Knows when they've got it",
    body: "When your child says the right answer on their own, the problem is marked solved and they earn XP, for up to three problems a day.",
    example: [{ who: "tutor", text: "Yes, 42 is right! You solved it yourself. 🎉" }],
  },
];

function HelperRules() {
  return (
    <section id="helper" className="scroll-mt-6 border-y border-[#d5e2f3] bg-white/80">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-[1fr_1.6fr]">
        <div className="lg:sticky lg:top-10 lg:self-start">
          <p className="hand text-2xl text-brand-600">the AI homework helper</p>
          <h2 className="display mt-2 text-4xl font-extrabold leading-tight sm:text-5xl">A tutor that asks instead of tells.</h2>
          <p className="mt-4 text-lg text-slate-600">
            Most AI tools hand kids the answer. Math Buddy is built the other way around. It follows these rules on every problem, so your child does the learning.
          </p>
        </div>
        <ul>
          {RULES.map((rule) => (
            <li key={rule.title} className="rule-row grid gap-4 py-7 sm:grid-cols-[1fr_15rem]">
              <div>
                <h3 className="display text-xl font-bold">{rule.title}</h3>
                <p className="mt-1.5 text-slate-600">{rule.body}</p>
              </div>
              <div className="space-y-2 self-center">
                {rule.example.map((line, i) =>
                  line.who === "tutor" ? (
                    <p key={i} className="rounded-2xl rounded-tl-md bg-brand-50 px-3.5 py-2 text-sm leading-snug text-slate-800">{line.text}</p>
                  ) : (
                    <p key={i} className="hand ml-auto w-fit -rotate-1 rounded-2xl rounded-tr-md bg-amber-50 px-3.5 py-1 text-lg ring-1 ring-amber-200">{line.text}</p>
                  ),
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const COACH_POINTS = [
  ["Works out why", "When your child misses a drill problem, Math Buddy looks at their exact wrong answer and explains what likely went wrong, in words they understand."],
  ["Reads their work", "Kids can draw out their steps on a scratchpad. Math Buddy reads it line by line and points to the first step that went wrong."],
  ["Practices the weak spot", "A repeated mistake gets practice problems aimed right at it in the next drills, until your child gets them right."],
  ["Turns homework into practice", "After a homework problem is solved, Math Buddy writes a few like it with new numbers, so the idea sticks."],
];

function MistakeCoach() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-2">
      <div>
        <p className="hand text-2xl text-brand-600">when they get it wrong</p>
        <h2 className="display mt-2 text-4xl font-extrabold leading-tight sm:text-5xl">It finds the why behind a wrong answer.</h2>
        <dl className="mt-8 space-y-5">
          {COACH_POINTS.map(([title, body]) => (
            <div key={title}>
              <dt className="display text-lg font-bold">{title}</dt>
              <dd className="mt-1 text-slate-600">{body}</dd>
            </div>
          ))}
        </dl>
      </div>

      <figure className="relative mx-auto w-full max-w-md" aria-label="Example of a diagnosed drill mistake">
        <div className="rounded-[28px] bg-white p-6 shadow-xl ring-1 ring-slate-200">
          <p className="text-sm font-semibold text-slate-400">Problem 3 of 8 · Adding unlike fractions</p>
          <p className="display my-5 text-center text-4xl font-extrabold">1/3 + 1/4 = ?</p>
          <div className="photo relative rounded-xl p-4 ring-1 ring-slate-200">
            <p className="hand text-2xl leading-relaxed">1 + 1 = 2<br />3 + 4 = 7<br />so 2/7</p>
            <span className="absolute right-3 top-3 rounded bg-slate-900/80 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Their work</span>
          </div>
          <div className="mt-4 rounded-xl bg-violet-50 px-4 py-3 text-violet-900 ring-1 ring-violet-200">
            <div className="mb-0.5 text-xs font-bold uppercase tracking-wide text-violet-500">Math Buddy noticed</div>
            You added the tops and the bottoms. The bottoms tell you the size of the pieces, so make them match first: 4/12 + 3/12.
          </div>
        </div>
        <div className="hand absolute -bottom-6 -right-2 rotate-2 rounded-lg bg-[#fff6c7] px-4 py-2 text-xl shadow-md sm:-right-8">
          next drill: 2 problems just for this 🎯
        </div>
        <figcaption className="sr-only">
          A student answers 2/7 for 1/3 + 1/4. Math Buddy reads the work, explains that they added the tops and the bottoms, and adds targeted practice to the next drill.
        </figcaption>
      </figure>
    </section>
  );
}

const SESSIONS = [
  { title: "Worksheet photo · fractions", meta: "Tue · 9 messages", solved: true },
  { title: "Area of an L-shaped room", meta: "Mon · 14 messages", solved: true },
  { title: "Long division, problem 3", meta: "Mon · 6 messages", solved: false },
];

function ParentView() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-2">
      <div className="order-2 lg:order-1">
        <div className="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-slate-200" aria-hidden>
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <p className="font-extrabold">Ava&rsquo;s homework</p>
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-500">
              Helper
              <span className="relative inline-block h-5 w-9 rounded-full bg-brand-600">
                <span className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-white" />
              </span>
            </span>
          </div>
          <ul className="divide-y divide-slate-100">
            {SESSIONS.map((s) => (
              <li key={s.title} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-sm text-slate-500">{s.meta}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.solved ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {s.solved ? "Solved" : "In progress"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="order-1 lg:order-2">
        <p className="hand text-2xl text-brand-600">for parents</p>
        <h2 className="display mt-2 text-4xl font-extrabold leading-tight sm:text-5xl">Read every conversation.</h2>
        <p className="mt-4 text-lg text-slate-600">
          Every homework session is saved with the photo and the full chat, so you can see where your child got stuck and how they got unstuck.
        </p>
        <p className="mt-3 text-lg text-slate-600">
          You&rsquo;ll also see the mistakes Math Buddy keeps noticing, like &ldquo;adds the tops and the bottoms&rdquo;, and when each one is fixed. You decide whether the homework helper is on for each child.
        </p>
      </div>
    </section>
  );
}

const FRACTIONS_PATH = [
  { name: "Fractions of a group", state: "mastered" },
  { name: "Equivalent fractions", state: "mastered" },
  { name: "Adding like fractions", state: "learning" },
  { name: "Adding unlike fractions", state: "locked" },
] as const;

function Practice() {
  return (
    <section className="border-y border-[#d5e2f3] bg-white/80">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <p className="hand text-2xl text-brand-600">and every day</p>
        <h2 className="display mt-2 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">A few problems a day that move up with them.</h2>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="card">
            <h3 className="display text-2xl font-bold">Daily drills</h3>
            <p className="mt-2 text-slate-600">
              Each set focuses on the skill your child is learning now, mixed with review. They get two tries, a hint if they want one, and a worked explanation when they miss.
              Once a skill is mastered, the next one unlocks.
            </p>
            <ol className="mt-6 space-y-2" aria-label="Example skill path">
              {FRACTIONS_PATH.map((skill) => (
                <li key={skill.name} className="flex items-center gap-3">
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${
                      skill.state === "mastered" ? "bg-emerald-500 text-white" : skill.state === "learning" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {skill.state === "mastered" ? "✓" : skill.state === "learning" ? "•" : "🔒"}
                  </span>
                  <span className={`font-semibold ${skill.state === "locked" ? "text-slate-400" : ""}`}>{skill.name}</span>
                  {skill.state === "learning" && <span className="hand whitespace-nowrap text-lg text-brand-600">learning now</span>}
                </li>
              ))}
            </ol>
          </div>

          <div className="card">
            <h3 className="display text-2xl font-bold">XP, badges and real rewards</h3>
            <p className="mt-2 text-slate-600">
              Kids earn XP for showing up, getting answers right and solving homework. They level up, unlock avatars and collect {BADGES.length} badges.
              You can set real-world rewards too.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Badges">
              {BADGES.slice(0, 12).map((b) => (
                <li key={b.id} title={b.name} className="grid h-11 w-11 place-items-center rounded-xl bg-slate-50 text-2xl ring-1 ring-slate-200">{b.emoji}</li>
              ))}
            </ul>
            <p className="hand mt-6 inline-block -rotate-1 rounded-lg bg-[#fff6c7] px-4 py-2 text-xl shadow-sm">Pick Friday&rsquo;s movie at 500 more XP</p>
          </div>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  ["Create your family account", "Sign up as a parent. Another parent can join the same family."],
  ["Add each child", "Choose a username and PIN, and set their grade. You can change their drill length and focus skills any time."],
  ["Kids log in with your family code", "They enter a code like OWL-4821 with their username and PIN. No email needed."],
];

function Setup() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <h2 className="display text-4xl font-extrabold leading-tight sm:text-5xl">Set up in three steps.</h2>
      <ol className="mt-10 grid gap-6 md:grid-cols-3">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="relative rounded-2xl bg-white p-6 ring-1 ring-slate-200">
            <span className="hand text-5xl leading-none text-brand-600">{i + 1}</span>
            <h3 className="display mt-3 text-xl font-bold">{title}</h3>
            <p className="mt-1.5 text-slate-600">{body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-14 flex flex-col items-start justify-between gap-6 rounded-3xl bg-brand-700 p-8 text-white sm:flex-row sm:items-center sm:p-10">
        <div>
          <p className="display text-3xl font-extrabold">Ready for tonight&rsquo;s homework?</p>
          <p className="mt-1 text-brand-100">Set up your family, then hand your child the tablet.</p>
        </div>
        <Link href="/signup" className="btn-secondary shrink-0 px-6 py-3 text-lg">Create a family account</Link>
      </div>
    </section>
  );
}
