# Math

**Strand 🔢 of Kaelyn's Adaptive Curriculum** (Program 02) · the ladder that teaches forward

> Read the master design first: [`../README.md`](../README.md). This strand obeys its two rules — never hold a strong strand back, never push it into frustration — and its mastery gate (independently right on **≥ 4 of 5** fresh items across **≥ 2 days**).

Kaelyn already multiplies, works with multi-digit numbers, and reads place value into the hundreds. The old "Summer Bridge" math (counting to 120, sums within 20) was **review, not learning** for her. So this ladder does not start at the bottom of arithmetic. It **confirms** addition/subtraction fluency and place value in a quick placement, then **climbs** from the meaning of multiplication up through division, regrouping, fractions, measurement, geometry, and finally multi-step reasoning. Target band: roughly grade 2 into grade 3 and beyond, paced by mastery, not grade label.

### How this strand is taught

Every rung runs the same loop, in this order, every time:

1. **Concept** — what is actually happening, in her words, before any symbol. "Three groups of four" before "3 × 4."
2. **Visual / manipulative** — she *builds* it: counters into equal groups, an array of tiles, a number line, a fraction bar, base-ten blocks, coins. Hands and eyes first; the notation is a label for something she already sees.
3. **Practice** — leveled reps that get harder when she flies, more varied when she stalls. The tutor generates fresh items at her exact band (never raw model text to her — every item is schema-validated).
4. **A reasoning problem** — one "why" or "is that reasonable?" question per session. We are growing a mathematician, not a calculator. She explains her thinking; "I tried it two ways and they matched" is the win we praise, not "you're so smart."

**Manipulatives, real and on-screen.** Where possible use physical objects (beans, blocks, coins, paper she folds). On the platform these map to extended/new **activity-type plugins**: `math-tenframe` (already built for Program 01) extended toward larger numbers, plus an **array** builder, a **number-line** tool, and a **fraction-bar** tool. Each is referenced on the relevant rung. The point of the plugin is the same as the point of the beans: she manipulates the quantity herself.

**Strategy over rote.** Facts matter, but we reach them through reasoning (doubles, fives, "one more group"), so a forgotten fact can be *rebuilt*, not just lost. We never drill a fact she cannot yet explain.

**Expeditions give the numbers somewhere to live.** Arrays become rocket-seat grids and egg cartons; fractions become an Egyptian flatbread shared at a dig; data becomes whale sightings tallied off the boat. Kaelyn picks the expedition; the tutor pulls leveled math into it.

---

## The rungs (in order)

Place a probe first (see **Placement probe** below) to find her real entry rung. Most likely she lands around **R-MA-2 / R-MA-3** with place value (R-MA-6) confirmed and regrouping (R-MA-7) close behind — but the probe decides, not the assumption.

---

### R-MA-1 · Equal groups & arrays
**Can-do:** "I can make equal groups and arrange things in rows and columns, and say how many without counting every one."

This is the seedbed for everything multiplicative. Before any × sign, she sees that **equal groups** and **rows-and-columns** are two pictures of the same idea, and that you can *skip-count* them instead of counting by ones.

**Sample activities**
- **Rocket seats (array build).** "The rocket has 4 rows of seats, 5 seats in each row. Build it." She lays out an array with tiles (or the `math-array` plugin: rows × columns of tappable seats), then finds the total by skip-counting a row at a time: 5, 10, 15, 20. She says it two ways: "4 rows of 5" and "5 seats, 4 times."
- **Egg-carton groups.** Real egg cartons or counters. "Make 3 groups of 6." She builds them, then we ask: "Could you make 6 groups of 3 with the same beans?" She rearranges and discovers the count holds — first taste of commutativity, no rule stated yet.
- **Equal or not?** Sorting game: piles of objects, she sorts into "equal groups" vs "not equal," then fixes the unequal ones by moving objects. Cements that *equal* is the whole point.

**Mastery gate:** On ≥ 4 of 5 fresh prompts across ≥ 2 days, she builds the correct equal groups or array and finds the total by skip-counting (not one-by-one), and describes it as "__ groups of __."
**Stretch:** Given a total like 12, she finds *all* the equal-group ways to build it (1×12, 2×6, 3×4) — the doorway to factors.

`math.equal-groups.arrays`

---

### R-MA-2 · Multiplication means equal groups
**Can-do:** "I know that multiplication is repeated addition of equal groups, and I can write and read it as ×. I can solve facts within 5, then within 10, by building or skip-counting."

The leap from picture to symbol. "4 groups of 5" becomes **4 × 5**, and she knows the × sign *means* "groups of." She connects it to repeated addition (5 + 5 + 5 + 5) so the symbol is never empty.

**Sample activities**
- **Say it three ways.** Show an array (e.g. 3 × 4). She writes it as repeated addition (4 + 4 + 4), as multiplication (3 × 4), and the product (12) — and reads "3 times 4 equals 12" aloud. Use the `math-array` plugin with a "show the equation" toggle.
- **Number-line hops.** On the `math-number-line` plugin, she makes 3 equal jumps of 4 (0 → 4 → 8 → 12). Same fact, a *different* model, so multiplication isn't welded to one picture.
- **Within-5, then within-10 reps.** Tutor-generated facts at her band: products with a factor ≤ 5 first, opening to ≤ 10 as she's ready. She may build or skip-count; speed is not the goal yet, *meaning* is.
- **Story match.** "Which story matches 2 × 6? (a) 2 baskets, 6 eggs each, (b) 6 eggs eaten." She picks and justifies.

**Mastery gate:** On ≥ 4 of 5 fresh items across ≥ 2 days, she represents a multiplication fact within 10 with a model AND its equation, reads it correctly, and finds the product (building/skip-counting allowed).
**Stretch:** She writes a multiplication equation for a word problem she's never seen and explains why × fits ("because it's equal groups").

`math.mult.meaning`

---

### R-MA-3 · Multiplication facts with strategies
**Can-do:** "I can find multiplication facts using strategies, not just memory: 2s/5s/10s, then 3s/4s, then squares, then the rest — and if I forget one, I can rebuild it from one I know."

Now we build fluency, but **through reasoning**. The order is deliberate, easiest leverage first: **2s** (doubles), **10s** and **5s** (skip-count patterns), then **3s/4s** (add a group to a known fact), then **squares** (3×3, 4×4 — she'll love these), then **the rest** using "near facts" (6×7 = 6×6 + 6). A forgotten fact is a *rebuildable* fact.

**Sample activities**
- **Doubles to 2s.** She already doubles; "2 × 7 is just 7 doubled." Match the addition double to the multiplication fact across a set.
- **The ×5 and ×10 patterns.** Skip-count grids for 5s and 10s; she spots the pattern (5s end in 5 or 0; 10s just "add a zero-ish"). Number-line and `math-array` reps.
- **Build-up strategy.** "You know 4 × 5 = 20. So 4 × 6 is one more group of 4 — 24." She adds a row to an array and watches the product jump. This is the heart of the rung: facts as a *connected web*, not flashcards.
- **Squares club.** Build 3×3, 4×4, 5×5 as actual squares of tiles; she sees why they're called squares. A small badge per square earned (concrete, non-manipulative — no streak guilt).
- **Strategy talk.** Pull a "hard" fact (7 × 8). "Show me a way to get there." She might do 7×8 = 7×4 + 7×4, or 7×8 = 7×10 − 7×2. Any valid path counts.

**Mastery gate:** Across ≥ 2 days, for facts within 10, she's solid on 2s/5s/10s/squares from recall AND can *rebuild* any other fact with a named strategy on ≥ 4 of 5 fresh prompts. (We track recall and strategy separately; strategy is the non-negotiable one.)
**Stretch:** Mixed facts to 12 (×11, ×12 patterns), and she explains a strategy for a fact a "robot would just memorize."

`math.mult.facts`

---

### R-MA-4 · The commutative property
**Can-do:** "I know that 4 × 5 and 5 × 4 give the same answer, and I can show *why* by turning an array. So learning one fact gives me two."

Made explicit now (she met it informally at R-MA-1). The pay-off is real: it **halves** the facts she must hold, and it's her first named mathematical *property* — a rule that's always true and that she can prove.

**Sample activities**
- **Turn the array.** On `math-array`, build 3 × 6, then rotate it 90°. Same tiles, now 6 × 3. "Did the number of tiles change? Why not?" She articulates: the total is the same, the rows and columns just swapped jobs.
- **Two-for-one facts.** A set where knowing one fact unlocks its partner. "You know 8 × 2 = 16. Tell me 2 × 8 without counting." She states the property as her reason.
- **Find the twin.** Given 7 × 3, she writes its commutative twin and confirms both products match by building once.

**Mastery gate:** On ≥ 4 of 5 fresh items across ≥ 2 days, she gives the commutative partner of a fact, states that the product is unchanged, and can justify it with a turned array.
**Stretch:** "Does turning work for subtraction? Is 8 − 3 the same as 3 − 8?" She tests it and discovers commutativity is special to × (and +), not universal — real mathematical reasoning.

`math.mult.commutative`

---

### R-MA-5 · Division as sharing & grouping; fact families
**Can-do:** "I can divide by sharing equally and by making equal groups, and I know division and multiplication are partners — they undo each other (fact families)."

Division enters as the **inverse** of what she just mastered, through two real pictures: **sharing** ("12 cookies shared among 4 friends — how many each?") and **grouping** ("12 cookies, 3 per bag — how many bags?"). Then the big idea: **× and ÷ are one fact family.** 3 × 4 = 12, 4 × 3 = 12, 12 ÷ 3 = 4, 12 ÷ 4 = 3 — one array, four facts.

**Sample activities**
- **Share the treasure (sharing).** 15 gold coins, 3 explorers, share fairly. She deals them out one-to-each and finds 5 apiece. Connects to 15 ÷ 3 = 5.
- **Bag the rocks (grouping).** 20 moon rocks, 5 per bag. She makes bags until the rocks run out, counts 4 bags. Connects to 20 ÷ 5 = 4. She *feels* the difference between the two division pictures (how many *each* vs how many *groups*).
- **One array, four facts (fact family).** Build a 3 × 4 array (`math-array`), then write all four equations it holds. The array is the proof that ÷ undoes ×.
- **Missing factor.** "__ × 6 = 24." She solves it as division (24 ÷ 6) and explains why that works — cements the inverse link.

**Mastery gate:** On ≥ 4 of 5 fresh items across ≥ 2 days, she solves a division situation by sharing or grouping (with a model if needed) AND writes the full fact family for a given × or ÷ fact.
**Stretch:** Division with a remainder in a story ("13 cookies, 4 friends — everyone fair, what's left over?"); she interprets the leftover, no formal notation required.

`math.div.fact-families`

---

### R-MA-6 · Place value to 1000
**Can-do:** "I can compose and decompose numbers to 1000 by hundreds, tens, and ones; I can compare them; and I can round to the nearest ten or hundred and say why."

She's solid to hundreds already; this rung firms it to **1000** and adds two moves she may not have: flexible **decomposing** (347 = 300 + 40 + 7 = 34 tens + 7 ones) and **rounding with reasoning** (not a trick — *which ten/hundred is it closest to on the line?*).

**Sample activities**
- **Build it three ways (base-ten).** Show 256. She builds it with hundreds/tens/ones blocks, then *re-*builds it a second way (e.g. trade a hundred for ten tens) and proves it's still 256. Decomposing as a flexible, not fixed, act.
- **Compare the expedition's numbers.** "The Great Pyramid has about 230 courses of stone; another has 140. Which is more — and how do you know?" She compares using place value (hundreds first), writes >, <, or =.
- **Round on a number line.** `math-number-line` zoomed 200–300, tick at 250. She drops 268 on it and sees it's past the middle, so it rounds to 270 (ten) or 300 (hundred). Rounding becomes *position*, not a rule about the digit.
- **Number of the day.** One number, many lenses: expanded form, word form, +10/−10, +100/−100, "is it closer to 300 or 400?"

**Mastery gate:** On ≥ 4 of 5 fresh items across ≥ 2 days, she composes/decomposes a 3-digit number in more than one way, compares two 3-digit numbers with the correct symbol and a place-value reason, and rounds to the nearest ten and hundred.
**Stretch:** Numbers past 1000 (place value to 10,000), and "round 268 to the nearest hundred, then explain when rounding would give a wrong-feeling answer" (e.g. rounding money you owe).

`math.place-value.thousands`

---

### R-MA-7 · Multi-digit addition & subtraction with regrouping
**Can-do:** "I can add and subtract multi-digit numbers, regrouping (carrying and borrowing) when I need to, and I understand *why* the regroup works — it's trading tens and ones."

The rung the parent specifically wants reached well. **Regrouping is taught as trading**, on base-ten blocks, before the standard algorithm — so "carry the 1" is never magic. Ten ones get *traded* for one ten; when you can't subtract, you *break* a ten into ten ones.

**Sample activities**
- **Trade up (addition with regrouping).** 47 + 38 with base-ten blocks. She combines ones (7 + 8 = 15), sees 15 ones is "too many for the ones house," trades ten of them for a ten-rod, and records the carry. The written algorithm is layered *on top of* the trade she just did.
- **Break a ten (subtraction with regrouping).** 52 − 27. She has 5 tens 2 ones, can't take 7 ones from 2, so she breaks a ten-rod into ten ones (now 4 tens, 12 ones) and subtracts. "Borrowing" is *breaking*, and she's seen it.
- **Estimate-then-check.** Before computing 384 + 219, she rounds (≈ 400 + 200 = 600), then computes (603), then checks her exact answer against the estimate. Builds the "is this reasonable?" reflex early.
- **Where's the bug?** A worked problem with a regrouping error. She finds and fixes it, explaining what went wrong — debugging is deep understanding.

**Mastery gate:** On ≥ 4 of 5 fresh items across ≥ 2 days, she correctly adds and subtracts 2- and 3-digit numbers that require regrouping, AND can explain one regroup as a trade (or correct a regrouping error).
**Stretch:** Three-addend sums, subtraction across a zero (305 − 168), and a quick mental strategy ("399 + 256: think 400 + 256, then take one back").

`math.regrouping`

---

### R-MA-8 · Fractions: unit fractions, of a shape and of a set
**Can-do:** "I understand a fraction is equal parts of one whole. I can name unit fractions (1/2, 1/3, 1/4, 1/6, 1/8), find a fraction of a shape and of a set, and I know fair shares must be *equal* parts."

The first genuinely *new* land for her, and the one most kids stumble on, so we go slow and concrete. The non-negotiable foundation: **the parts must be equal**, and **the bottom number tells how many equal parts the whole is cut into**. Unit fractions (one part) first, before any other numerator.

**Sample activities**
- **Share the flatbread (fraction of a shape).** An Egyptian flatbread (paper circle) at the dig, shared among 4. She folds it into 4 equal parts; each is 1/4. Then we ask the killer question: "If I cut it into 4 *unequal* pieces, is one piece 1/4?" She says no, and *that's* the concept locked in. Use the `math-fraction-bar` plugin: partition a bar/shape into equal parts, shade one.
- **Fraction of a set.** 12 dates on the dig table, "give me 1/3 of them." She shares 12 into 3 equal groups, takes one group (4 dates). Fractions aren't only pizza slices — they act on *sets* too. This is the harder, often-skipped half, so we give it real time.
- **Name and build.** Tutor names a unit fraction (1/6); she partitions the bar into 6 and shades 1. Then reverse: shows a shaded bar, she names the fraction.
- **Equivalence, gently introduced.** She folds her 1/2 bar again and sees 1/2 = 2/4. Lay two `math-fraction-bar`s side by side: same length, different cuts. Just the *idea* that different fractions can be the same amount — no procedures.
- **Compare with same denominator or same numerator.** Same bottom: 3/8 vs 5/8 (more eighths = more). Same top: 1/4 vs 1/8 (the *bigger cut* — fewer pieces — is more, which surprises kids: 1/4 > 1/8). She proves each with bars.

**Mastery gate:** On ≥ 4 of 5 fresh items across ≥ 2 days, she partitions a whole into equal parts and names the unit fraction, finds a unit fraction of a set, insists on equal parts when shown unequal ones, and compares two fractions with the same denominator (and, for stretch, same numerator) using a model.
**Stretch:** Non-unit fractions (3/4 of a shape and of a set), naming a simple equivalence she built (1/2 = 2/4 = 3/6), and placing a fraction on a number line between 0 and 1.

`math.fractions.unit`

---

### R-MA-9 · Measurement: length, time, money, simple data
**Can-do:** "I can measure length with units, tell time to the minute and figure elapsed time, make money amounts and give change, and read and build picture and bar graphs."

A broad, applied rung — four connected real-world tools. It's bundled because each is a short build on what she knows, and all four feed the word problems in R-MA-11.

**Sample activities**
- **Length with units.** She measures classroom/dig objects with a ruler in inches and centimeters, and notices the *same object* gets a bigger number in cm than in inches — units matter. Estimate first ("about how many cm?"), then measure, then compare to the estimate.
- **Time to the minute + elapsed time.** Read an analog clock to the minute (the minute hand is the hard part — count by 5s plus ones). Then elapsed time on a number line: "The whale watch left at 9:15 and returned at 10:45 — how long?" She hops along `math-number-line` (9:15 → 10:15 is 1 hour, → 10:45 is 30 more = 1 hr 30 min). Elapsed time as *distance on a line*, not a formula.
- **Make amounts & give change (money).** With coin/bill manipulatives: "Make 67¢ two different ways." Then change: "The papyrus costs 80¢, you pay $1 — what's your change?" She counts up from 80¢ to $1 (the cashier's method), gets 20¢.
- **Simple data — graph the whale sightings.** Tally whale sightings over a week, build a **picture graph** (one whale icon = 1 sighting) and a **bar graph**, then *read* it: "Which day had most? How many more than Tuesday?" Reading the graph (comparison questions) matters as much as making it.

**Mastery gate:** On ≥ 4 of 5 fresh items across ≥ 2 days, she measures a length with correct units, tells time to the minute and finds a simple elapsed time, makes a money amount and gives correct change, and answers comparison questions from a picture or bar graph she reads.
**Stretch:** Elapsed time crossing the hour and across noon; "make $1.25 with the fewest coins"; a two-step graph question ("how many sightings Monday and Tuesday combined, and how many fewer on Wednesday?").

`math.measurement.time`

> Companion slugs tracked under this rung: `math.measurement.length`, `math.measurement.money`, `math.data.graphs`. Length/time/money/data advance together but the tutor can flag any one as still emerging.

---

### R-MA-10 · Geometry: attributes, partitioning, and area as arrays
**Can-do:** "I can describe 2D and 3D shapes by their attributes, partition shapes into equal parts, and find the area of a rectangle by seeing it as an array of unit squares."

Geometry, deliberately placed *after* multiplication and fractions so it can **reconnect** to both: partitioning ties back to fractions, and **area is literally an array** — the bridge home to multiplication.

**Sample activities**
- **Attribute detective (2D & 3D).** Sort shapes by attributes that matter (number of sides, vertices, faces) not just names. "These are quadrilaterals — what do they share? Is a square also a rectangle?" 3D: count faces/edges/vertices on real blocks (cube, rectangular prism, cylinder, cone) from the building expedition.
- **Partition into equal parts.** Cut a rectangle into halves, thirds, fourths, sixths in *different ways* (a rectangle halved vertically vs diagonally vs horizontally — all valid halves). Direct callback to R-MA-8: equal parts is equal parts, whatever the shape.
- **Area is an array.** Tile a rectangle with unit squares (`math-array` reused as a grid). "How many squares cover it?" She counts, then *discovers* she can multiply rows × columns instead. Area = length × width *falls out of* the array she already understands. This is the rung's keystone: geometry and multiplication are the same picture.
- **Build a given area.** "Make a rectangle with an area of 12 squares." She finds 3×4, 2×6, 1×12 — connecting back to factors (R-MA-1 stretch) from the other direction.

**Mastery gate:** On ≥ 4 of 5 fresh items across ≥ 2 days, she names/sorts 2D and 3D shapes by attributes, partitions a shape into equal parts (more than one way), and finds a rectangle's area by arraying unit squares — and connects it to multiplication.
**Stretch:** Perimeter vs area (why two rectangles with the same area can have different perimeters), and composing/decomposing a shape to find the area of an L-shape.

`math.geometry.area-arrays`

---

### R-MA-11 · Multi-step word problems & reasoning
**Can-do:** "I can solve word problems that take more than one step: I figure out what's being asked, choose the right operation, estimate, model it, solve, and check whether my answer is reasonable."

The summit, and the whole point. This rung is **not new arithmetic** — it's the thinking that uses everything below. The parent wanted reasoning over rote; this is where it lives, and it runs as a thread through every other rung, then stands alone here at full strength.

**Sample activities**
- **Choose the operation.** A problem set where the *hard part* is deciding ×, ÷, +, or −, not the computing. "There are 6 rows of rocket seats, 4 in each row. 18 are filled. How many empty?" She sees it's two steps (× then −), names each, then solves. She explains *why* each operation fits.
- **Estimate first, then solve.** Before computing, she predicts a ballpark ("about 30"), solves exactly, and compares. A wildly-off answer becomes a flag *she* catches.
- **Is my answer reasonable?** Given a finished (sometimes wrong) solution, she judges: "They shared 24 dates among 4 and got 80 — can that be right?" She catches that sharing *makes each share smaller*, so 80 is impossible. Reasonableness as a habit, not an afterthought.
- **Represent with a model.** She draws the bar model / array / number line that fits the problem *before* computing — making the structure visible. Modeling is the move that turns a word wall into a solvable problem.
- **Write your own.** She authors a two-step problem for a given expedition (e.g. whales or pyramids) and the equation that solves it — the deepest check of understanding.

**Mastery gate:** On ≥ 4 of 5 fresh multi-step problems across ≥ 2 days, she identifies what's asked, chooses and justifies the operation(s), represents the problem with a model, solves it, and states whether the answer is reasonable.
**Stretch:** Problems with extra (distractor) information she must ignore, problems with a missing piece she must identify, and explaining *two different* solution paths to the same problem.

`math.wordproblems.multistep`

---

## Placement probe

A short, playful "show me what you can do!" — **not** a test. Goal: confirm the floor is solid, then find the first rung that actually teaches her something new. Stop climbing the probe the moment she hits real effort; that's her entry rung.

**Probe steps (stop early when she struggles):**

1. **Addition/subtraction fluency + regrouping (confirm the floor).**
   - Facts within 20, mixed (8 + 7, 15 − 9): fluent? → floor confirmed.
   - One regrouping problem each (47 + 38, 52 − 27): "show me how." If she regroups confidently and can say *why*, mark **R-MA-7 solid** and don't dwell. If she gets the answer but "carries" without understanding the trade, place at **R-MA-7** (teach the trade). If 2-digit is shaky, place at **R-MA-7** at its start.
2. **Place value to 1000 (confirm).**
   - "Build/expand 347. Which is more, 230 or 213, and how do you know? Round 268 to the nearest ten." Confident with reasoning → **R-MA-6 solid**. Hundreds fine but rounding/flexible-decompose shaky → place at **R-MA-6**.
3. **Multiplication (find the real entry).**
   - "What does 3 × 4 mean? Can you show it?" Builds an array/groups and explains → she has the *meaning* (R-MA-2); probe her facts.
   - Facts: 2s/5s/10s from recall? squares? a "build-up" strategy for a harder one? → places her within **R-MA-3** (recall solid + strategy solid = move toward R-MA-4/5).
   - No clear meaning yet → start at **R-MA-1 / R-MA-2** (most likely *not* the case for Kaelyn, but the probe checks, it doesn't assume).
4. **Division & fact families (quick check).**
   - "12 cookies shared by 3 — how many each? Write all the math facts this picture holds." Solid → **R-MA-5** is review-to-confirm; weak → R-MA-5 is her live rung.
5. **Fractions (find the edge).**
   - "Fold this into fourths. What's one piece called? Give me 1/3 of these 12 counters. Which is more, 1/4 or 1/8?" This is most likely her **frontier** — wherever she falters (unequal-parts confusion, fraction-of-a-set, same-numerator compare) is her entry into **R-MA-8**.

**Placement outcome:** a starting `skill_state` per slug (not-yet / emerging / solid). Expected, to be confirmed: floor + place value + regrouping **solid or near-solid**, multiplication **emerging→solid (live work in R-MA-3)**, division/fractions **not-yet→emerging (the climb ahead)**. Re-probe lightly if a rung turns out too easy (jump her) or too hard (step back one).

---

## Skill tags

Stable slugs, one anchor per rung (dot-separated, lowercase — matching `src/content/skills.ts` convention). Companion slugs sit under their rung where a rung spans several tools.

| Slug | Rung | Label |
|---|---|---|
| `math.equal-groups.arrays` | R-MA-1 | Equal groups & arrays |
| `math.mult.meaning` | R-MA-2 | Multiplication as equal groups (repeated addition, within 10) |
| `math.mult.facts` | R-MA-3 | Multiplication facts with strategies |
| `math.mult.commutative` | R-MA-4 | Commutative property |
| `math.div.fact-families` | R-MA-5 | Division (sharing & grouping); × / ÷ fact families |
| `math.place-value.thousands` | R-MA-6 | Place value to 1000 (compose/decompose, compare, round) |
| `math.regrouping` | R-MA-7 | Multi-digit addition & subtraction with regrouping |
| `math.fractions.unit` | R-MA-8 | Unit fractions; fraction of a shape & of a set; equivalence/compare intro |
| `math.measurement.time` | R-MA-9 | Measurement (length, time to the minute & elapsed, money, simple data) |
| `math.geometry.area-arrays` | R-MA-10 | Geometry attributes, partitioning, area via arrays |
| `math.wordproblems.multistep` | R-MA-11 | Multi-step word problems & reasoning |

**Companion slugs** (tracked under their anchor rung, so the tutor can mark one part emerging while the rung advances):
`math.measurement.length`, `math.measurement.money`, `math.data.graphs` (all R-MA-9).

> These slugs feed `skill_state` (not-yet / emerging / solid) per the master design §2 and the platform mapping §7. Activity-type plugins referenced — `math-tenframe` (built, extended toward larger numbers), and new `math-array`, `math-number-line`, `math-fraction-bar` — render the leveled, schema-validated items the tutor generates for each rung.
