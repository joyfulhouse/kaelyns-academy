import type { Unit } from "../../types";

// ── Science & Nature (B2): classify · sequence ─────────────────────────
// Ocean map world (shared theme, its own map path). Two new activity kinds:
// sort-categories (science.classify) and seq-order (science.sequence). The
// Players speak only the `instruction`, so card/bin labels need no phoneme
// overrides; instructions stay in plainly-voiced words. Every seq-order
// `cards` array is authored in TRUE real-world order (array order = answer
// key); every sort item.binId references a real bin id in the same activity.
export const scienceNatureUnit: Unit = {
  id: "science-nature",
  order: 6,
  title: "Science & Nature",
  emoji: "🔬",
  world: "ocean",
  bigIdea: "We can look closely, sort things into groups, and put nature's steps in order.",
  phonicsFocus: "",
  mathFocus: "Sorting & classifying, life cycles, day & seasons",
  project: "Make a nature collection: sort five things you find outside into two groups.",
  lessons: [
    {
      id: "sci-sort",
      order: 1,
      title: "Sorting & Classifying",
      activities: [
        {
          id: "sci-sort-living",
          kind: "sort-categories",
          title: "Living or not living?",
          blurb: "Sort each thing into living or nonliving.",
          estMinutes: 6,
          band: "ready",
          skillTags: ["science.classify"],
          config: {
            instruction: "Sort each one: is it living or not living?",
            bins: [
              { id: "living", label: "Living", emoji: "🌱" },
              { id: "nonliving", label: "Nonliving", emoji: "🪨" },
            ],
            items: [
              { label: "Dog", emoji: "🐶", binId: "living" },
              { label: "Tree", emoji: "🌳", binId: "living" },
              { label: "Fish", emoji: "🐟", binId: "living" },
              { label: "Bird", emoji: "🐦", binId: "living" },
              { label: "Rock", emoji: "🪨", binId: "nonliving" },
              { label: "Toy car", emoji: "🚗", binId: "nonliving" },
              { label: "Cup", emoji: "🥤", binId: "nonliving" },
              { label: "Ball", emoji: "⚽", binId: "nonliving" },
            ],
          },
        },
        {
          id: "sci-sort-animals",
          kind: "sort-categories",
          title: "Animal groups",
          blurb: "Put each animal in its group.",
          estMinutes: 8,
          band: "stretch",
          skillTags: ["science.classify"],
          config: {
            instruction: "Put each animal in its group.",
            bins: [
              { id: "mammal", label: "Mammal", emoji: "🐶" },
              { id: "bird", label: "Bird", emoji: "🐦" },
              { id: "fish", label: "Fish", emoji: "🐟" },
              { id: "bug", label: "Insect", emoji: "🐛" },
            ],
            items: [
              { label: "Dog", emoji: "🐶", binId: "mammal" },
              { label: "Cat", emoji: "🐱", binId: "mammal" },
              { label: "Robin", emoji: "🐦", binId: "bird" },
              { label: "Owl", emoji: "🦉", binId: "bird" },
              { label: "Shark", emoji: "🦈", binId: "fish" },
              { label: "Goldfish", emoji: "🐟", binId: "fish" },
              { label: "Ant", emoji: "🐜", binId: "bug" },
              { label: "Bee", emoji: "🐝", binId: "bug" },
            ],
          },
        },
        {
          id: "sci-sort-materials",
          kind: "sort-categories",
          title: "What is it made of?",
          blurb: "Sort each thing by what it is made of.",
          estMinutes: 8,
          band: "ready",
          skillTags: ["science.classify"],
          config: {
            instruction: "Sort each thing by what it is made of.",
            bins: [
              { id: "wood", label: "Wood", emoji: "🪵" },
              { id: "metal", label: "Metal", emoji: "🔩" },
              { id: "plastic", label: "Plastic", emoji: "🪣" },
              { id: "cloth", label: "Cloth", emoji: "🧵" },
            ],
            items: [
              { label: "Log", emoji: "🪵", binId: "wood" },
              { label: "Wooden craft stick", emoji: "🪵", binId: "wood" },
              { label: "Key", emoji: "🔑", binId: "metal" },
              { label: "Spoon", emoji: "🥄", binId: "metal" },
              { label: "Plastic building block", emoji: "🧱", binId: "plastic" },
              { label: "Bucket", emoji: "🪣", binId: "plastic" },
              { label: "Shirt", emoji: "👕", binId: "cloth" },
              { label: "Sock", emoji: "🧦", binId: "cloth" },
            ],
          },
        },
        {
          id: "sci-sort-habitat",
          kind: "sort-categories",
          title: "Land or water home",
          blurb: "Sort each animal by where it lives.",
          estMinutes: 8,
          band: "stretch",
          skillTags: ["science.classify"],
          config: {
            instruction: "Where does each animal live: on land or in the water?",
            bins: [
              { id: "land", label: "On land", emoji: "🌳" },
              { id: "water", label: "In water", emoji: "🌊" },
            ],
            items: [
              { label: "Lion", emoji: "🦁", binId: "land" },
              { label: "Rabbit", emoji: "🐰", binId: "land" },
              { label: "Bear", emoji: "🐻", binId: "land" },
              { label: "Fish", emoji: "🐟", binId: "water" },
              { label: "Whale", emoji: "🐳", binId: "water" },
              { label: "Jellyfish", emoji: "🪼", binId: "water" },
            ],
          },
        },
      ],
    },
    {
      id: "sci-cycle",
      order: 2,
      title: "Life Cycles & Order",
      activities: [
        {
          id: "sci-cycle-butterfly",
          kind: "seq-order",
          title: "Butterfly life cycle",
          blurb: "Put the butterfly's life cycle in order.",
          estMinutes: 6,
          band: "ready",
          skillTags: ["science.sequence"],
          config: {
            instruction: "Put the butterfly's life cycle in order, from first to last.",
            cards: [
              { label: "Egg", emoji: "🥚" },
              { label: "Caterpillar", emoji: "🐛" },
              { label: "Chrysalis", emoji: "🛡️" },
              { label: "Butterfly", emoji: "🦋" },
            ],
          },
        },
        {
          id: "sci-cycle-frog",
          kind: "seq-order",
          title: "Frog life cycle",
          blurb: "Put the frog's life cycle in order.",
          estMinutes: 6,
          band: "ready",
          skillTags: ["science.sequence"],
          config: {
            instruction: "Put the frog's life cycle in order, from first to last.",
            cards: [
              { label: "Egg", emoji: "🥚" },
              { label: "Tadpole", emoji: "🐟" },
              { label: "Froglet", emoji: "🐸" },
              { label: "Frog", emoji: "🐸" },
            ],
          },
        },
        {
          id: "sci-cycle-plant",
          kind: "seq-order",
          title: "Bean plant life cycle",
          blurb: "Put the bean plant's life cycle in order.",
          estMinutes: 6,
          band: "ready",
          skillTags: ["science.sequence"],
          config: {
            instruction: "Put the bean plant's life cycle in order, from first to last.",
            cards: [
              { label: "Seed", emoji: "🫘" },
              { label: "Sprout", emoji: "🌱" },
              { label: "Plant", emoji: "🪴" },
              { label: "Flower", emoji: "🌸" },
            ],
          },
        },
        {
          id: "sci-cycle-grow",
          kind: "seq-order",
          title: "Growing up",
          blurb: "Put the stages of growing up in order.",
          estMinutes: 6,
          band: "stretch",
          skillTags: ["science.sequence"],
          config: {
            instruction: "Put the stages of growing up in order, from baby to grown-up.",
            cards: [
              { label: "Baby", emoji: "👶" },
              { label: "Kid", emoji: "🧒" },
              { label: "Teen", emoji: "🧑" },
              { label: "Grown-up", emoji: "👵" },
            ],
          },
        },
      ],
    },
    {
      id: "sci-nature",
      order: 3,
      title: "Nature & Weather",
      activities: [
        {
          id: "sci-nature-day",
          kind: "seq-order",
          title: "One day in order",
          blurb: "Put the parts of a day in order.",
          estMinutes: 6,
          band: "ready",
          skillTags: ["science.sequence"],
          config: {
            instruction: "Put one day in order, from morning to night.",
            cards: [
              { label: "Morning", emoji: "🌅" },
              { label: "Noon", emoji: "☀️" },
              { label: "Evening", emoji: "🌆" },
              { label: "Night", emoji: "🌙" },
            ],
          },
        },
        {
          id: "sci-nature-seasons",
          kind: "seq-order",
          title: "The four seasons",
          blurb: "Put the seasons in order, starting with spring.",
          estMinutes: 8,
          band: "stretch",
          skillTags: ["science.sequence"],
          config: {
            instruction: "Put the seasons in order, starting with spring.",
            cards: [
              { label: "Spring", emoji: "🌷" },
              { label: "Summer", emoji: "☀️" },
              { label: "Fall", emoji: "🍂" },
              { label: "Winter", emoji: "❄️" },
            ],
          },
        },
        {
          id: "sci-nature-read",
          kind: "reading-comprehension",
          title: "Where does rain come from?",
          blurb: "Read a short science page, then answer.",
          estMinutes: 8,
          band: "ready",
          skillTags: ["reading.comprehension.main-idea"],
          config: {
            instruction: "Read the page. Then use the words on the page to answer.",
            title: "Where Does Rain Come From?",
            passage:
              "The sun warms the water in lakes and oceans. The warm water turns into tiny drops that float up into the sky. Up high, the drops come together and make clouds. When a cloud gets very full, the drops fall back down as rain.",
            questions: [
              {
                prompt: "What makes the water turn into tiny drops?",
                choices: ["The wind", "The warm sun", "The moon"],
                answerIndex: 1,
                kind: "literal",
              },
              {
                prompt: "What happens when a cloud gets very full?",
                choices: ["It rains", "It turns into a rock", "It flies away"],
                answerIndex: 0,
                kind: "literal",
              },
              {
                prompt: "What is this page mostly about?",
                choices: ["How rain is made", "How to swim", "Why the sun is hot"],
                answerIndex: 0,
                kind: "main-idea",
                skillTag: "reading.comprehension.main-idea",
              },
            ],
          },
        },
      ],
    },
  ],
};
