# Kaelyn's Adaptive Curriculum

**Program 02 of Kaelyn's Academy** · A personalized, mastery-based, *per-strand* curriculum
**Learner:** Kaelyn, just finished kindergarten (summer 2026), **academically advanced and asynchronous**
**Premise:** She is here to **learn new things**, not review. Each subject starts where she actually is and climbs from there, one mastered skill at a time, for as long as she keeps growing.

> This replaces the "Summer Bridge K→1" program (`../summer-k-to-grade1/`), which was pitched for a typical end-of-K child and turned out to be **review, not learning**, for Kaelyn. That program is archived as a reference for a different learner; it is not Kaelyn's path.

---

## 1. The one idea that changes everything: **strands move independently**

Kaelyn is not "a 1st grader." She is, right now, all of these at once:

| Strand | Where she actually is | So we teach… |
|---|---|---|
| 📖 **Reading & Comprehension** | Early chapter books (Frog and Toad, Magic Tree House) with understanding | fluency + deep comprehension + harder texts |
| 🔤 **Word Study & Vocabulary** | Past CVC/sight-words; ready for structure | multisyllable decoding, **morphology** (prefixes/roots), **vocabulary depth** |
| ✍️ **Writing & Composition** | Words & labels (single words, very short phrases) | **start here, and bridge** so big ideas aren't trapped by a small hand |
| 🔢 **Math** | Multiplication & multi-digit, place value to hundreds | multiplication/division, regrouping, **fractions**, measurement, reasoning |

This spread (a child who *reads chapter books and multiplies but writes single words*) is **normal and expected** for an advanced young learner. The technical name is **asynchronous development**: thinking races ahead while the physical act of handwriting and the mechanics of transcription lag behind. It is not a deficit. It is the single most important thing this curriculum is designed around.

**Two rules follow, and they are non-negotiable:**

1. **Never hold a strong strand back to match a weak one.** Reading and math run at full speed even while writing is still climbing out of single words. Boredom is the real risk for this child, not "gaps."
2. **Never push the lagging strand into frustration.** Writing is bridged (§4), not forced. A six-year-old who decides she "hates writing" because her hand can't keep up with her brain is a problem that takes years to undo. We will not create it.

---

## 2. How it works: mastery, not weeks

There is **no week 1 / week 10**. The calendar is not the unit; the **skill** is.

- Each strand is a **ladder of skills** (the rungs), sequenced so each depends on the last. The detailed ladders live in `strands/`.
- Kaelyn works at her **current rung** in each strand. When she **demonstrates mastery** (see below), she advances to the next rung — in that strand only.
- The **agentic tutor** (LiteLLM/Claude, see the platform spec §6) drives this: it looks at her skill state and recent work, **recommends the next best activity**, and **generates fresh practice at exactly her level** — harder when she's flying, more reps when she's not. Bounded and parent-visible; never open chat.
- **Mastery gate (default):** a skill is "solid" when she succeeds **independently** on **≥ 4 of 5** fresh items across **≥ 2 different days** (so it's retention, not a lucky session). Below that she's "emerging" and gets more, varied practice. The tutor can raise the bar for foundational skills.
- **Stretch is always offered, never forced.** Every rung has a reach activity that points at the next one. If she grabs it, she advances early.

This is what "adaptive & ongoing" means in practice: the curriculum **does not end**. It keeps generating her next right thing.

### Placement: find her real rungs first

Before anything else, a **light, playful placement** (`assessment.md`) finds her entry rung in each strand — not a test, a "show me what you can do!" game. Her expected entry points, to be confirmed by placement:

- **Reading:** ~ early chapter books → start at fluency + literal/inferential comprehension.
- **Word Study:** confirm she's solid through digraphs/blends, then begin at **vowel teams / r-controlled + syllables**, moving quickly into **morphology**.
- **Writing:** **single words / labels** → start at the bottom of the writing ladder, on the bridge.
- **Math:** confirm addition/subtraction fluency + place value, then begin at **multiplication concepts**, moving into **division and fractions**.

Placement repeats lightly whenever a strand's results suggest she's mis-placed (too easy = jump her up; struggling = step back a rung).

---

## 3. The strands (full ladders in `strands/`)

Each strand file defines its rungs (R-numbered), the can-do descriptor for each, sample activities, and the mastery gate.

- **`strands/reading.md`** — Reading & Comprehension: fluency (phrasing, expression, rate), then comprehension that gets deeper (retell → main idea → inference → character motivation → compare texts), across fiction **and** nonfiction (text features, find evidence).
- **`strands/word-study-vocabulary.md`** — the flagged "vocab," rebuilt: advanced spelling patterns and **multisyllable decoding**, then **morphology** (prefixes, suffixes, base words, Greek/Latin roots — the real engine of a big vocabulary), then **word depth** (shades of meaning, multiple meanings, context clues, Tier-2 academic words).
- **`strands/writing-composition.md`** — Writing, bridged (§4): composition decoupled from handwriting, growing words → expanded sentences → 2–3 sentences → a short paragraph, across narrative / informational / opinion, with mechanics woven in. A **separate, gentle handwriting/fine-motor track** runs alongside.
- **`strands/math.md`** — the flagged "math," teaching forward: multiplication & division (equal groups, arrays, fact families), multi-digit add/subtract **with regrouping**, place value to 1000, **fractions**, measurement (length, time to the minute, money, simple data), geometry (attributes, partitioning), and **multi-step word problems** that make her reason, not just compute.

### Knowledge expeditions (the glue)

Skills are practiced inside **knowledge-rich themes** ("expeditions": e.g. *Volcanoes & the Earth*, *Ancient Egypt*, *How Machines Work*, *Oceans & Whales*, *Space*). This is deliberate, not decoration: **comprehension and vocabulary are powered by background knowledge.** A child who knows about volcanoes reads and understands a volcano passage far better, and the new words (erupt, magma, pressure) stick because they hang on real concepts. Expeditions also give writing something worth saying and math real problems to solve. Kaelyn picks expeditions she's curious about; the tutor pulls leveled reading/word/writing/math activities into each.

---

## 4. The writing bridge (the heart of this design)

Kaelyn's ideas are years ahead of her handwriting. If "writing" means "form every letter by hand," we throttle a chapter-book mind down to single words and teach her that writing is the part of school she's bad at. Instead we **separate the two jobs**:

**Job A — Composition (her ideas → language).** Run this at her *thinking* level from day one:
- **Oral-first:** she says her sentence/story aloud; it gets **scribed** (parent types/writes it) or **dictated** (speech-to-text) so she sees her own big ideas as text.
- **Sentence frames & word banks:** "The volcano erupted because ______." She supplies the idea; transcription load is low.
- **Type option:** a keyboard sidesteps fine-motor entirely for longer pieces, so she can write a *paragraph* about whales while her hand is still mastering lowercase *b*.
- She **revises and arranges** (drag sentences into order, pick the stronger word) — real authoring, no transcription tax.

**Job B — Transcription (handwriting + mechanics).** A **short, gentle, separate** daily track: letter formation, spacing, capitals/periods, building stamina a little at a time. Low-stakes, never the gate on her ideas. As the hand catches up, more of Job A shifts to handwritten.

**The result:** her writing *output* (composition) grows at her real intellectual level immediately, while her writing *mechanics* climb their own ladder without poisoning the whole strand. Over time they converge. The writing-composition ladder (`strands/writing-composition.md`) is explicit about which rungs are scribed/typed vs handwritten.

---

## 5. Daily rhythm (flexible, ~60–80 focused minutes)

Predictable but not rigid. The tutor assembles the day from her current rungs; a typical flow:

| Block | ~Time | What |
|---|---|---|
| ☀️ **Warm-up** | 5 min | A quick win + the plan for today (number talk or word-of-the-day). |
| 📖 **Reading** | 20 min | Read a leveled chapter-book chunk → a comprehension activity (talk it through, find evidence). |
| 🔤 **Word work** | 10–15 min | Today's pattern or morpheme + a vocabulary game tied to the expedition. |
| 🔢 **Math** | 20 min | One concept (manipulatives/visual) → leveled practice → a reasoning problem. |
| ✍️ **Write** | 10–15 min | Compose at thinking-level (Job A) + a short handwriting bit (Job B). |
| 🔭 **Expedition** | 15–30 min | The knowledge theme: a read-aloud above her level, a project, a "why" question. |
| 🌙 **Bedtime read-aloud** | 15 min | Every night. Vocabulary + a love of story. Non-negotiable. |

Follow her energy. A tired day = read-aloud + one game still counts. Mastery is the goal; the schedule serves it.

### Parent playbook (the short version)

- **Feed the strong strands.** Let reading and math run. Hand her the harder book, the bigger number. Under-challenge is this child's real danger.
- **Protect writing.** Celebrate ideas, scribe generously, keep handwriting short and kind. "You're an author" long before "you're a neat writer."
- **Praise effort and strategy, not "smart."** "You tried three ways to solve that" builds a learner; "you're so smart" builds someone afraid to struggle.
- **Let her be bored-free, not pressure-full.** Advanced ≠ pushed. Depth and curiosity over acceleration-for-its-own-sake.
- **Read aloud every night**, above her level — the highest-leverage 15 minutes of the day.

---

## 6. Assessment & progress (`assessment.md`)

- **Placement** (entry rungs per strand) + **light formative checks** the tutor reads continuously from her activity results (the mastery gate, §2).
- **Skill map, parent-visible:** every skill shows *not-yet / emerging / solid*, per strand — honest, specific evidence ("reads 2-syllable vowel-team words on her own"; "multiplies within 5 using arrays"), never a vanity score.
- **Growth, made visible to her:** a filling ladder per strand, a portfolio of her composed pieces, badges for mastered morphemes/facts. Concrete, earned, non-manipulative (no streak guilt).

---

## 7. How this maps onto the platform

The platform (spec `../../specs/2026-06-13-platform-v3-design.md`) already has the machinery; this curriculum is the data + the leveling:

- **Strands → skill domains**, **rungs → skills** (`skill_state` tracks not-yet/emerging/solid per rung). `src/content/skills.ts` carries the leveled rubric below.
- **Activities** are leveled and skill-tagged; **activity-type plugins** render them (phonics/word-build extended for morphology; a new reading-comprehension type; math extended for multiplication/fractions; the journal/compose type carries the writing bridge with scribe/type modes).
- **The agentic tutor** does next-best-activity + adaptive generation against the mastery gate — this is exactly what makes the curriculum "adaptive & ongoing."
- **Per-strand placement** sets her starting `skill_state`; she advances per strand independently.

---

*Files in this curriculum:*
- `README.md` — this master design
- `strands/reading.md` — Reading & Comprehension ladder
- `strands/word-study-vocabulary.md` — Word Study & Vocabulary ladder
- `strands/writing-composition.md` — Writing & Composition ladder (the bridge)
- `strands/math.md` — Math ladder
- `assessment.md` — placement + formative checks + the skill map
