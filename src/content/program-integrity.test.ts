import { describe, expect, it } from "vitest";
import {
  allServerActivityTypes,
  getServerActivityType,
  validatePlayableActivityConfig,
} from "@/activities/definitions";
import { exactSkillRoutingIssue } from "@/activities/skill-routing";
import type {
  ActivityKind,
  MathMoneyConfig,
  PhonicsWordbuildConfig,
  SightwordGameConfig,
} from "./activity-configs";
import { ACTIVITY_CONFIG_SCHEMAS } from "./activity-configs";
import { PROGRAMS, flatActivities, getSkill } from "./index";
import { getLanguage } from "./languages";
import { SKILLS } from "./skills";
import type { Activity } from "./types";

function everyActivity() {
  return PROGRAMS.flatMap((program) =>
    flatActivities(program).map(({ unit, lesson, activity }) => ({
      program,
      unit,
      lesson,
      activity,
    })),
  );
}

function range(length: number, start = 0): number[] {
  return Array.from({ length }, (_, index) => index + start);
}

function tileIndexesForWord(config: PhonicsWordbuildConfig, word: string): number[] {
  function visit(offset: number, used: Set<number>): number[] | null {
    if (offset === word.length) return [];
    for (const [index, tile] of config.tiles.entries()) {
      if (used.has(index) || !word.startsWith(tile, offset)) continue;
      used.add(index);
      const rest = visit(offset + tile.length, used);
      used.delete(index);
      if (rest) return [index, ...rest];
    }
    return null;
  }

  const indexes = visit(0, new Set());
  if (!indexes) throw new Error(`No exact tile build for ${word}`);
  return indexes;
}

function coinTokens(config: Extract<MathMoneyConfig, { mode: "count" }>) {
  const cents = { penny: 1, nickel: 5, dime: 10, quarter: 25 } as const;
  const picked: (keyof typeof cents)[] = [];
  function solve(total: number): boolean {
    if (total === config.targetCents) return true;
    if (total > config.targetCents || picked.length === 20) return false;
    for (const coin of config.palette) {
      picked.push(coin);
      if (solve(total + cents[coin])) return true;
      picked.pop();
    }
    return false;
  }
  if (!solve(0)) throw new Error(`No bounded coin solution for ${config.targetCents}`);
  return picked.map((type, index) => ({ id: `coin-${index}`, type }));
}

function sightwordRounds(config: SightwordGameConfig) {
  if (!("rounds" in config) || !Array.isArray(config.rounds)) {
    throw new Error("Deployed sight-word configs must use explicit rounds");
  }
  return config.rounds;
}

function successfulResponse(activity: Activity): unknown {
  const { kind, config } = activity;
  switch (kind) {
    case "phonics-wordbuild":
      return {
        builds: config.words.map(({ word }, wordIndex) => ({
          wordIndex,
          tileIndices: tileIndexesForWord(config, word),
          attempts: 1,
          usedHelp: false,
        })),
      };
    case "sightword-game":
      return {
        rounds: sightwordRounds(config).map((round, roundIndex) => ({
          roundIndex,
          choiceIndex: round.choices.findIndex(
            (choice) => choice.toLocaleLowerCase() === round.target.toLocaleLowerCase(),
          ),
          attempts: 1,
          usedHelp: false,
        })),
      };
    case "math-tenframe": {
      if (config.mode === "represent") {
        return {
          mode: config.mode,
          occupiedCells: range(config.target),
          placements: range(config.target),
          attempts: 1,
        };
      }
      if (config.mode === "add") {
        const placements = range(config.addend, config.target);
        return {
          mode: config.mode,
          occupiedCells: [...range(config.target), ...placements],
          placements,
          attempts: 1,
        };
      }
      if (config.mode === "subtract") {
        const removals = range(config.subtrahend, config.target - config.subtrahend);
        return {
          mode: config.mode,
          occupiedCells: range(config.target - config.subtrahend),
          removals,
          attempts: 1,
        };
      }
      const tradeAtPlacement = 10 - config.target;
      const afterTrade = config.target + config.addend - 10;
      return {
        mode: config.mode,
        occupiedCells: range(afterTrade, 10),
        placements: [...range(tradeAtPlacement, config.target), ...range(afterTrade, 10)],
        tenTokens: 1,
        tradeAtPlacement,
        attempts: 1,
      };
    }
    case "journal-prompt": {
      const configuredMode = config.mode ?? "draw";
      const allowedModes = config.allowModes ?? ["type"];
      if (configuredMode === "compose") {
        const mode = allowedModes.includes("type")
          ? "type"
          : allowedModes.includes("scribe")
            ? "scribe"
            : "dictate";
        return {
          markCount: 0,
          textLength: 1,
          usedDictation: mode === "dictate",
          mode,
          didDraw: false,
        };
      }
      if (config.drawing === false) {
        return {
          markCount: 0,
          textLength: 1,
          usedDictation: false,
          mode: "type",
          didDraw: false,
        };
      }
      return {
        markCount: 1,
        textLength: 0,
        usedDictation: false,
        mode: "draw",
        didDraw: true,
      };
    }
    case "reading-comprehension":
      return {
        questionResults: config.questions.map((question, questionIndex) => ({
          questionIndex,
          choiceIndex: question.answerIndex,
          ...(question.evidenceSentenceIndexes
            ? { evidenceSentenceIndex: question.evidenceSentenceIndexes[0] }
            : {}),
          ...(question.evidenceChoices
            ? { evidenceChoiceIndex: question.evidenceChoices.answerIndex }
            : {}),
          attempts: 1,
        })),
        ...(config.structuredRetell
          ? {
              retell: {
                eventIds: config.structuredRetell.events.map(({ id }) => id),
                attempts: 1,
              },
            }
          : {}),
      };
    case "math-array": {
      if (config.mode === "build") {
        return { mode: config.mode, builtRows: config.rows, attempts: 1 };
      }
      if (config.mode === "multiply") {
        return {
          mode: config.mode,
          revealedRows: config.rows,
          entered: config.rows * config.cols,
          attempts: 1,
        };
      }
      if (config.mode === "divide") {
        const share = config.total / config.groups;
        return {
          mode: config.mode,
          poolRemaining: 0,
          groupCounts: Array.from({ length: config.groups }, () => share),
          factResults: [config.total, config.total, share, config.groups],
          attempts: 1,
        };
      }
      return {
        mode: config.mode,
        filledCells: range(config.rows * config.cols),
        entered: config.rows * config.cols,
        attempts: 1,
      };
    }
    case "math-fraction-bar":
      return config.mode === "partition"
        ? { mode: config.mode, partitionCount: config.denominator, attempts: 1 }
        : { mode: config.mode, selectedSegments: range(config.numerator), attempts: 1 };
    case "lang-symbol-intro":
      return {
        exposures: config.symbols.map(({ id }) => ({
          symbolId: id,
          activated: true,
          heardExample: false,
          usedHelp: false,
        })),
        checks: config.verify.map(({ answerIndex }) => ({ choiceIndex: answerIndex, attempts: 1 })),
      };
    case "lang-listen-match":
      return {
        items: config.items.map(({ answerIndex }) => ({
          choiceIndex: answerIndex,
          attempts: 1,
          usedHelp: false,
        })),
      };
    case "math-clock":
      return config.mode === "read"
        ? { selectedIndex: config.answerIndex, attempts: 1 }
        : {
            totalMinutes: ((config.targetHour % 12) * 60 + config.targetMinute) % 720,
            attempts: 1,
          };
    case "math-money":
      return config.mode === "identify"
        ? { tappedCoin: config.targetCoin, attempts: 1 }
        : { tokens: coinTokens(config), attempts: 1 };
    case "math-measure":
      return config.mode === "compare"
        ? { selectedIndex: config.answerIndex, attempts: 1 }
        : { placedUnitIds: range(config.length).map((index) => `unit-${index}`), attempts: 1 };
    case "sort-categories":
      return {
        assignments: config.items.map(({ binId }, itemIndex) => ({ itemIndex, binId })),
        attempts: 1,
      };
    case "seq-order":
      return { order: range(config.cards.length), attempts: 1 };
    case "oral-reading":
      return { status: "verified", attempts: 1, results: ["matched"] };
  }
}

describe("deployed activity trust and evidence invariants", () => {
  it("covers all 15 registered kinds with playable authored configs", () => {
    const registered = allServerActivityTypes().map(({ kind }) => kind).sort();
    const deployed = [...new Set(everyActivity().map(({ activity }) => activity.kind))].sort();
    expect(registered).toHaveLength(15);
    expect(deployed).toEqual(registered);

    for (const { program, activity } of everyActivity()) {
      expect(
        validatePlayableActivityConfig(activity.kind, activity.config),
        `${program.slug}/${activity.id} (${activity.kind})`,
      ).toMatchObject({ ok: true });
    }
  });

  it("keeps runtime skills and successful evidence known and inside outer tags", () => {
    for (const { program, activity } of everyActivity()) {
      const definition = getServerActivityType(activity.kind);
      const config = definition.schema.parse(activity.config);
      const runtimeSkills = definition.skillsAffected(config);
      expect(
        exactSkillRoutingIssue(activity.kind, activity.config, activity.skillTags),
        `${activity.id} runtime and progression skills must match exactly`,
      ).toBeNull();

      const response = definition.responseSchema.parse(successfulResponse(activity));
      const score = definition.score(config, response);
      expect(score.correct, `${program.slug}/${activity.id}`).toBe(score.total);
      for (const { skill } of score.skillEvidence) {
        expect(getSkill(skill), `${activity.id} evidence skill ${skill}`).toBeDefined();
        expect(runtimeSkills, `${activity.id} actual evidence ${skill}`).toContain(skill);
        expect(activity.skillTags, `${activity.id} outer evidence ${skill}`).toContain(skill);
      }
    }
  });

  it("uses only current direct-interaction config fields", () => {
    for (const { activity } of everyActivity()) {
      if (activity.kind === "sightword-game") {
        expect(activity.config).toHaveProperty("rounds");
        expect(activity.config).not.toHaveProperty("words");
        expect(activity.config).not.toHaveProperty("decoys");
      }
      if (activity.kind === "math-array") expect(activity.config).not.toHaveProperty("answer");
      if (activity.kind === "math-measure" && activity.config.mode === "units") {
        expect(activity.config).not.toHaveProperty("choices");
        expect(activity.config).not.toHaveProperty("answerIndex");
      }
    }
  });
});

describe("deployed progression policy", () => {
  it("keeps journals completion-only with no automatic skill routing", () => {
    for (const { activity } of everyActivity()) {
      if (activity.kind !== "journal-prompt") continue;
      expect(activity.skillTags, activity.id).toEqual([]);
      expect(getServerActivityType(activity.kind).skillsAffected(activity.config), activity.id).toEqual([]);
    }
  });

  it("uses cold oral reading only for decode evidence and keeps modeled practice neutral", () => {
    for (const { activity } of everyActivity()) {
      if (activity.kind !== "oral-reading") continue;
      if (activity.config.presentation === "cold") {
        expect(activity.skillTags, activity.id).toHaveLength(1);
        expect(activity.skillTags[0], activity.id).toMatch(/^phonics\.decode\./);
        expect(activity.config.skillTag, activity.id).toBe(activity.skillTags[0]);
      } else {
        expect(activity.skillTags, activity.id).toEqual([]);
        expect(activity.config.skillTag, activity.id).toBeUndefined();
      }
    }
  });

  it("gates advanced structured math or marks it stretch, except honest make-ten work", () => {
    const activities = new Map(everyActivity().map(({ activity, unit }) => [activity.id, { activity, unit }]));
    for (const id of ["math-r2-a1", "math-r2-a2", "math-r5-a1", "math-r8-a1"]) {
      expect(activities.get(id)?.activity.band, id).toBe("stretch");
      expect(activities.get(id)?.unit.checkpoint, id).toBeUndefined();
    }

    const makeTen = activities.get("math-r7-a1")?.activity;
    expect(makeTen?.band).toBe("ready");
    expect(makeTen?.skillTags).toEqual(["math.add.make-ten"]);
    expect(makeTen?.title.toLocaleLowerCase()).toContain("ten");
    if (makeTen?.kind === "math-tenframe") expect(makeTen.config.mode).toBe("make-ten");

    for (const { unit, activity } of everyActivity()) {
      if (activity.id.startsWith("math-baseline-")) expect(unit.checkpoint).toBe("baseline");
    }
  });

  it("does not deploy the retired summer program", () => {
    expect(PROGRAMS.map(({ slug }) => slug)).not.toContain("summer-k-to-grade1");
  });
});

describe("deployed language inventory ownership", () => {
  it("describes receptive recognition and listening rather than unobserved production", () => {
    const languageDomains = new Set(["zhuyin", "spanish", "japanese", "korean"]);
    for (const skill of SKILLS.filter(({ domain }) => languageDomains.has(domain))) {
      expect(skill.readyIndicator, skill.slug).toMatch(/recogniz|match|hear|identif|select/i);
      expect(skill.readyIndicator, skill.slug).not.toMatch(/\b(says?|counts?|names?|introduces?|uses?|reads?|blends?|combines?)\b/i);
    }
  });

  it("uses exact canonical facts, outer skill tags, and taught choices", () => {
    for (const { activity } of everyActivity()) {
      if (activity.kind !== "lang-symbol-intro" && activity.kind !== "lang-listen-match") continue;
      expect(activity.config.skillTags, activity.id).toEqual(activity.skillTags);
      const language = getLanguage(activity.skillTags[0]?.split(".")[0] ?? "");
      expect(language, `${activity.id} language`).toBeDefined();
      if (!language) continue;

      if (activity.kind === "lang-symbol-intro") {
        for (const symbol of activity.config.symbols) {
          const entry = language.inventory.find(({ id }) => id === symbol.id);
          expect(entry, `${activity.id}/${symbol.id}`).toBeDefined();
          if (!entry) continue;
          expect(symbol).toEqual({
            id: entry.id,
            symbol: entry.symbol,
            romanization: entry.romanization,
            spoken: entry.spoken,
            audioKey: entry.id,
            ...(entry.example === undefined ? {} : { example: entry.example }),
            ...(entry.exampleSpoken === undefined ? {} : { exampleSpoken: entry.exampleSpoken }),
            ...(entry.meaning === undefined ? {} : { meaning: entry.meaning }),
          });
        }
        const taught = new Set(activity.config.symbols.map(({ symbol }) => symbol));
        for (const verification of activity.config.verify) {
          expect(verification.spokenPrompt, `${activity.id} spoken prompt`).toBeTruthy();
          for (const choice of verification.choices) expect(taught, `${activity.id}/${choice}`).toContain(choice);
        }
      } else {
        for (const item of activity.config.items) {
          const entries = item.choices.map((choice) =>
            language.inventory.find(({ symbol }) => symbol === choice),
          );
          expect(entries.every(Boolean), activity.id).toBe(true);
          const answer = entries[item.answerIndex];
          expect(item.spoken, activity.id).toBe(answer?.spoken);
          expect(item.audioKey, activity.id).toBe(answer?.id);
          if (item.choiceLabels) {
            expect(item.choiceLabels, activity.id).toEqual(entries.map((entry) => entry?.romanization));
          }
        }
      }
    }
  });
});

describe("activity schema registry", () => {
  it("remains exhaustive across the same 15 server kinds", () => {
    const schemaKinds = Object.keys(ACTIVITY_CONFIG_SCHEMAS).sort() as ActivityKind[];
    const serverKinds = allServerActivityTypes().map(({ kind }) => kind).sort();
    expect(schemaKinds).toEqual(serverKinds);
  });
});
