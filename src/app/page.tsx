import {
  ArrowRightIcon,
  BookOpenTextIcon,
  HeartIcon,
  PuzzlePieceIcon,
  RobotIcon,
  ShieldCheckIcon,
  SparkleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Mascot } from "@/components/art/Mascot";
import { Hills, Sparkle, Sun } from "@/components/art/Decorations";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { programStats } from "@/content";
import { getProgramAsync } from "@/lib/content/repository";
import { cn } from "@/lib/cn";

const PILLARS = [
  {
    icon: PuzzlePieceIcon,
    title: "One studio, many adventures",
    body: "Every program is a world to step into, built from the same friendly pieces. Phonics, number sense, writing, and projects, woven into a theme each week so skills feel like play.",
  },
  {
    icon: RobotIcon,
    title: "A patient guide, never a chatbot",
    body: "A gentle tutor watches what your child has mastered and offers exactly the right next thing, with fresh practice made just for them. It is bounded by design: no open-ended chatting, ever.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Parents see everything, control everything",
    body: "Calm, specific reports of what your child actually did and what to reinforce. No ads, no tracking, no dark patterns. Their data is yours to export or delete, always.",
  },
];

const FAMILY_POINTS = [
  { icon: ShieldCheckIcon, label: "Bounded AI", text: "Children never free-chat with a model. Generated practice is checked before it is ever shown." },
  { icon: HeartIcon, label: "Forgiving by design", text: "No timers that punish, no red Xs. A wrong answer is a gentle try-again and a hint." },
  { icon: BookOpenTextIcon, label: "Real curriculum", text: "Ten themed weeks aligned to Common Core, decoding before memorizing, understanding before drilling." },
  { icon: SparkleIcon, label: "Progress you can hold", text: "Stars, a filling path, a finished portfolio. Concrete wins, never a manipulative streak." },
];

export default async function Home() {
  const program = await getProgramAsync("kaelyn-adaptive");
  const stats = program ? programStats(program) : { units: 0, lessons: 0, activities: 0 };

  return (
    <>
      <SiteHeader />
      <main>
        {/* ── Hero ── */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(60rem 40rem at 85% -10%, oklch(0.8 0.135 80 / 0.28), transparent 60%), radial-gradient(40rem 30rem at -5% 10%, oklch(0.7 0.11 222 / 0.14), transparent 55%)",
            }}
          />
          <Sun className="pointer-events-none absolute -right-6 top-10 h-28 w-28 opacity-80 motion-safe:animate-[spin_60s_linear_infinite]" />
          <Sparkle className="pointer-events-none absolute left-[8%] top-[22%] h-6 w-6 opacity-70" />
          <Sparkle className="pointer-events-none absolute right-[18%] bottom-[18%] h-8 w-8 opacity-60" />

          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-[1.1fr_0.9fr] md:py-24">
            <div>
              <Pill tone="accent" icon={<SparkleIcon weight="fill" className="text-honey-deep" />}>
                A personalized learning studio
              </Pill>
              <h1 className="mt-5 text-balance font-display text-4xl font-semibold leading-[1.04] tracking-tight md:text-5xl">
                Meet her exactly where she&rsquo;s ready.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-ink-soft">
                Every subject starts at her real level and teaches forward, one mastered skill
                at a time. Reading, words, writing, and math each climb at their own pace, so
                she is always learning something new, never reviewing or waiting. Joyful always.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button href="/learn" variant="primary" size="lg">
                  Start exploring
                  <ArrowRightIcon weight="bold" />
                </Button>
                <Button href="#program" variant="soft" size="lg">
                  See her curriculum
                </Button>
              </div>
              <p className="mt-5 text-sm text-ink-faint">
                Personalized to each child · teaches forward, never busywork · no ads, ever
              </p>
            </div>

            <div className="relative grid place-items-center">
              <div
                aria-hidden
                className="absolute h-64 w-64 rounded-full md:h-80 md:w-80"
                style={{ background: "radial-gradient(circle, oklch(0.8 0.135 80 / 0.35), transparent 70%)" }}
              />
              <Mascot mood="cheer" size={260} className="relative motion-safe:animate-float" />
            </div>
          </div>

          <Hills aria-hidden className="pointer-events-none block h-24 w-full md:h-32" />
        </section>

        {/* ── How it works ── */}
        <section id="how" className="mx-auto max-w-5xl px-5 py-20 md:py-28">
          <div className="max-w-2xl">
            <h2 className="text-balance font-display text-3xl font-semibold tracking-tight md:text-4xl">
              A studio, not a worksheet.
            </h2>
            <p className="mt-4 text-lg text-ink-soft">
              Three ideas hold the whole thing together.
            </p>
          </div>

          <div className="mt-14 flex flex-col gap-14">
            {PILLARS.map((pillar, i) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={pillar.title}
                  className={cn(
                    "flex flex-col gap-6 md:items-center",
                    i % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row",
                  )}
                >
                  <div className="grid size-20 shrink-0 place-items-center rounded-2xl border-[3px] border-ink bg-accent/15 shadow-pop">
                    <Icon weight="duotone" className="size-10 text-ink" />
                  </div>
                  <div className={cn(i % 2 === 1 && "md:text-right")}>
                    <div className="font-display text-sm font-semibold text-ink-faint">
                      0{i + 1}
                    </div>
                    <h3 className="mt-1 font-display text-2xl font-semibold tracking-tight">
                      {pillar.title}
                    </h3>
                    <p className="mt-2 max-w-xl text-ink-soft">{pillar.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Her curriculum ── */}
        {program && (
          <section id="program" className="bg-paper-raised py-20 md:py-28">
            <div className="mx-auto max-w-6xl px-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="max-w-2xl">
                  <Pill tone="ready">Her curriculum</Pill>
                  <h2 className="mt-4 text-balance font-display text-3xl font-semibold tracking-tight md:text-4xl">
                    {program.title}: {program.subtitle}
                  </h2>
                  <p className="mt-4 text-lg text-ink-soft">{program.summary}</p>
                </div>
                <dl className="flex gap-7">
                  {[
                    { n: stats.units, l: "strands" },
                    { n: stats.activities, l: "activities" },
                    { n: "∞", l: "tries" },
                  ].map((s) => (
                    <div key={s.l}>
                      <dt className="font-display text-3xl font-semibold text-ink">{s.n}</dt>
                      <dd className="text-sm text-ink-faint">{s.l}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {program.units.map((unit) => (
                  <li
                    key={unit.id}
                    data-world={unit.world}
                    className="rounded-xl border-2 border-accent/30 bg-accent/8 p-5 transition-transform hover:-translate-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-3xl" aria-hidden>
                        {unit.emoji}
                      </span>
                      <span className="font-display text-sm font-semibold text-accent-deep">
                        {unit.mathFocus}
                      </span>
                    </div>
                    <h3 className="mt-3 font-display text-xl font-semibold tracking-tight">
                      {unit.title}
                    </h3>
                    <p className="mt-1 text-sm text-ink-soft">{unit.bigIdea}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      <Pill tone="neutral">{unit.phonicsFocus}</Pill>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-12">
                <Button href="/learn" variant="accent" size="lg">
                  Step into the studio
                  <ArrowRightIcon weight="bold" />
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* ── For families ── */}
        <section id="families" className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <div className="max-w-2xl">
            <h2 className="text-balance font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Made for parents who pay attention.
            </h2>
            <p className="mt-4 text-lg text-ink-soft">
              The hard promises, kept in the design itself.
            </p>
          </div>
          <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {FAMILY_POINTS.map((point) => {
              const Icon = point.icon;
              return (
                <div key={point.label} className="flex gap-4">
                  <Icon weight="duotone" className="mt-0.5 size-7 shrink-0 text-accent-deep" />
                  <div>
                    <h3 className="font-display text-lg font-semibold">{point.label}</h3>
                    <p className="mt-1 text-ink-soft">{point.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="px-5 pb-20">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border-[3px] border-ink bg-honey px-6 py-16 text-center shadow-pop">
            <Sparkle className="pointer-events-none absolute left-10 top-8 h-7 w-7 text-ink/20" />
            <Sparkle className="pointer-events-none absolute bottom-8 right-12 h-9 w-9 text-ink/20" />
            <Mascot mood="wave" size={90} className="mx-auto" />
            <h2 className="mt-4 text-balance font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Ready when she is.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-ink/80">
              Open the studio and let her meet her first week. It only gets warmer from here.
            </p>
            <div className="mt-7 flex justify-center">
              <Button href="/learn" variant="primary" size="lg">
                Start exploring
                <ArrowRightIcon weight="bold" />
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
