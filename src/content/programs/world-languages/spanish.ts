import type { Unit } from "../../types";

/**
 * Spanish — a new language on the familiar Latin alphabet. Listening- and
 * vocabulary-led for a young learner. Starter ladder; the content pass extends
 * through numbers, colors, family, and simple phrases.
 */
export const spanishUnit: Unit = {
  id: "spanish",
  order: 2,
  title: "Español",
  emoji: "🌮",
  world: "garden",
  bigIdea: "A new language opens a new world. Start with the words that greet people.",
  phonicsFocus: "Listening → words → phrases",
  mathFocus: "6 levels",
  project: "Introduce yourself in Spanish: a greeting, your name, and one favorite thing.",
  lessons: [
    {
      id: "spanish-l1",
      order: 1,
      title: "Greetings",
      activities: [
        {
          id: "spanish-l1-a1",
          kind: "lang-symbol-intro",
          title: "¡Hola! Greetings",
          blurb: "Listen, then say them with me.",
          estMinutes: 6,
          band: "ready",
          skillTags: ["spanish.greetings"],
          config: {
            locale: "es-MX",
            instruction: "Here are your first Spanish words. Tap each one to hear it.",
            skillTags: ["spanish.greetings"],
            symbols: [
              { id: "es-hola", symbol: "Hola", romanization: "OH-lah", spoken: "Hola", meaning: "Hello" },
              { id: "es-adios", symbol: "Adiós", romanization: "ah-DYOHS", spoken: "Adiós", meaning: "Goodbye" },
              { id: "es-gracias", symbol: "Gracias", romanization: "GRAH-syahs", spoken: "Gracias", meaning: "Thank you" },
            ],
            verify: [
              { prompt: "Which word means “Hello”?", choices: ["Hola", "Adiós", "Gracias"], answerIndex: 0 },
              { prompt: "Which word means “Thank you”?", choices: ["Hola", "Adiós", "Gracias"], answerIndex: 2 },
            ],
          },
        },
        {
          id: "spanish-l1-a2",
          kind: "lang-listen-match",
          title: "Hear it, tap it",
          blurb: "Which Spanish word did you hear?",
          estMinutes: 5,
          band: "ready",
          skillTags: ["spanish.listening", "spanish.greetings"],
          config: {
            locale: "es-MX",
            instruction: "Listen. Then tap the Spanish word you heard.",
            skillTags: ["spanish.listening", "spanish.greetings"],
            items: [
              { spoken: "Hola", choices: ["Hola", "Adiós", "Gracias"], answerIndex: 0 },
              { spoken: "Gracias", choices: ["Hola", "Adiós", "Gracias"], answerIndex: 2 },
            ],
          },
        },
      ],
    },
  ],
};
