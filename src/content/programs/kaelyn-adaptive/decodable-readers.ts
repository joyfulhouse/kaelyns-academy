import type { Unit } from "../../types";
import { DECODABLE_LIBRARY, decodableReaderActivities } from "../../decodable";

// ── Decodable Readers: short vowels → digraphs → blends ──────────────
export const decodableReadersUnit: Unit = {
  id: "decodable-readers",
  order: 7,
  title: "Decodable Readers",
  emoji: "🐚",
  world: "ocean",
  bigIdea:
    "Use the sound patterns you know to unlock each sentence, then read it smoothly.",
  phonicsFocus: "Short vowels → digraphs → blends",
  mathFocus: "",
  project: "Read a whole shelf of sound-it-out sentences aloud.",
  lessons: DECODABLE_LIBRARY.map((group, index) => ({
    id: `decodable-${group.pattern}`,
    order: index + 1,
    title: group.lessonTitle,
    activities: decodableReaderActivities(group.pattern),
  })),
};
