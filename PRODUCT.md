# PRODUCT.md — Kaelyn's Academy

> Normative product + brand context for the `impeccable` design skill. Read with `DESIGN.md` (the token/component system). Source of truth for *why*; DESIGN.md is the source of truth for *what*.

## Register

**Mixed, surface-decided.**
- **Brand** — the marketing/landing surface (`/`, about, "for families"). Design *is* the product here: it earns trust and conveys wonder in the first three seconds.
- **Product** — the app (learner surface under `(learner)`, parent surface under `(parent)`, auth). Design *serves* the task: a 5-year-old finishing a phonics activity, a parent reading a progress report in 30 seconds.

When a surface is ambiguous, the route decides. Landing → brand. Everything behind sign-in → product.

## Product purpose

Kaelyn's Academy is a **pluggable, multi-user, AI-agentic learning platform for young children** (ages ~4–8). A *program* is structured curriculum data (Program → Unit → Lesson → Activity) rendered by reusable, skill-tagged activity-type plugins. An LLM tutor (via the homelab LiteLLM gateway, Claude route) adapts difficulty, generates *bounded* practice, and writes parent progress reports. Self-hosted on the family homelab.

The first program is **Summer Bridge: Kindergarten → 1st Grade** (`docs/curriculum/summer-k-to-grade1/`), a 10-week summer curriculum getting an on-track end-of-K child ready for 1st (stretching toward 2nd). The pilot learner is the founder's daughter; the platform is built as a reusable product, not a one-off.

## Users

**The learner (child, 4–8).** Pre- or early reader. Cannot be expected to read UI chrome. Operates a tablet or laptop, often on a couch or at a kitchen table, frequently with a parent within arm's reach. Motivated by delight, progress they can *see*, and gentle forgiveness when wrong. Short attention; needs momentum, not menus. **Design for the thumb and the ear, not the cursor and the paragraph.**

**The parent/guardian (account owner).** Time-poor, glancing at "did my kid actually learn something?" on a phone in the evening. Wants reassurance, clarity, and control (what's enrolled, time limits, whether AI is on, the ability to export or delete their child's data) without a manual. Trusts calm, specific, honest interfaces; distrusts anything that feels like it's gaming their kid or harvesting data.

**The admin (founder).** Manages content/programs and platform config. Power user; not a design constraint beyond "don't make me click through a wizard to seed a program."

## Voice & tone

Two voices, one personality. The personality is a **warm, unhurried, slightly witty children's-book author** — think the narrator of a beautiful picture book, not a theme-park mascot.

- **Kid surface:** almost no text. When words appear they are short, spoken aloud (TTS), and encouraging. "Let's build a word!" not "Phonics Activity 3: Digraphs." Never babytalk, never ALL CAPS EXCITEMENT, never exclamation-point spam. Praise is specific and earned ("You found every *ch* word") not confetti for breathing.
- **Parent surface:** plain, specific, respectful of intelligence and time. "Kaelyn read 18 of 20 short-a words on her own this week. Reinforce: words ending in *-ck*." Numbers with meaning. No dashboards-for-dashboards' sake, no growth-hacking nudges.

## Anti-references (what we are NOT)

These are the training-data reflexes for "kids' learning app." We reject all of them:

1. **The primary-color circus.** Saturated red/blue/yellow/green on white, balloons, Comic Sans, jelly-bean buttons. Looks like a 2009 flash game.
2. **The pastel-rainbow / Duolingo-clone.** Mint-and-purple gamified streak-anxiety, owl guilt-trips, gem economies, rounded-everything sameness. (Second-order reflex once #1 is avoided.)
3. **The worksheet.** Times New Roman, dense text, "Question 1 of 40," a child's UI that's really a PDF.
4. **The data-harvest freemium.** Ad-supported, behavioral tracking, "upgrade to unlock," dark patterns. Our child-data posture (spec §8) forbids it and the design must *feel* like it forbids it.
5. **Generic SaaS-dark.** The parent surface is not a navy observability dashboard. It's a calm, warm, literate reading room.

If someone could say "an AI made a kids' app" looking at this, it has failed.

## The wonder we ARE — "Wonder Studio"

A **premium picture book that happens to be software.** Warm paper, ink, hand-feel. Organic rounded shapes and a small cast of charming SVG characters/decorations (a friendly star-sprite mascot, suns, hills, waves, sparkles) rather than stock 3D blobs. Generous whitespace like a well-set spread. Restraint and craft signal "this was made with care for *my* child" — the opposite of the slop above. Joyful, never cluttered; characterful, never babyish.

**Per-program theming** layers a single accent + motif over a stable warm shell: *Under the Sea* week feels tidal and teal; *Blast Off* week feels deep-violet and starry. The shell never changes; the world the child steps into does.

## Theme & color strategy (committed — see DESIGN.md for tokens)

**Scene sentences forced these (not category reflex):**
- *Kid:* "A 5-year-old at a sunny kitchen table on a summer morning, parent nearby, lighting up when she gets a word right." → **light, warm, daylight.** Energetic in application, never overstimulating.
- *Parent:* "A tired parent on their phone at 9pm wanting 30 seconds of honest reassurance." → **light, warm, calm, legible.** Lower-chroma application of the *same* palette.

Both surfaces are **light and warm-tinted** (never `#fff`/`#000`). Dark mode is not a default and is out of scope for v3.

**Color strategy: Committed.** A warm paper base + ink, with a signature **honey/marigold** (wonder, stars, progress) and **coral/persimmon** (play, primary action) carrying brand surfaces; **sky, sprout, berry** are the per-program accents. The kid surface applies these at higher chroma/energy; the parent surface leans paper + ink + one accent. Two voices, one palette — differentiated by *usage*, not by separate color systems.

## Strategic principles

1. **The child can't read the UI.** Every learner action must be discoverable by icon, color, size, position, motion, and audio. Text is a progressive enhancement, never the only signal.
2. **Forgiving by construction.** No fail states, no penalties, no timers that punish. "Try again" is gentle and immediate. Wrong answers are data for the tutor, not red Xs for the child.
3. **Progress you can see and hold.** Stars, a filling path, a sticker that pops. Concrete and earned. Never a manipulative streak/loss-aversion mechanic.
4. **Calm, honest parent truth.** Specific evidence over vanity metrics. The parent always knows what their child did, what's next, and that their data is safe and theirs.
5. **Accessibility is the floor, not a feature.** WCAG AA+ contrast, ≥44px (kid: ≥64px) tap targets, dyslexia-considerate type, full keyboard + screen-reader paths, `prefers-reduced-motion` honored. Early readers and disabled children are first-class.
6. **Bounded AI, visible to parents.** No open-ended child↔LLM chat. Generated content is schema-validated server-side before a child sees it, and logged to a parent-visible trail.
7. **Performance is part of the delight.** A child's patience is measured in hundreds of milliseconds. Motion is budgeted; the first interaction is fast.
