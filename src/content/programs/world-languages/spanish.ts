import type { Unit } from "../../types";

/**
 * Spanish — a new language on the familiar Latin alphabet. Listening- and
 * vocabulary-led for a young learner. Starter ladder climbing the skill rungs:
 * greetings → numbers → colors → family → a self-introduction phrase. Every
 * word is drawn verbatim from the authored inventory (src/content/languages/
 * spanish.ts); each lesson teaches a small set (lang-symbol-intro) then trains
 * the ear on the same words (lang-listen-match, tagged spanish.listening).
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
              { id: "es-hola", symbol: "Hola", romanization: "OH-lah", spoken: "Hola", audioKey: "es-hola", meaning: "Hello" },
              { id: "es-adios", symbol: "Adiós", romanization: "ah-DYOHS", spoken: "Adiós", audioKey: "es-adios", meaning: "Goodbye" },
              { id: "es-gracias", symbol: "Gracias", romanization: "GRAH-syahs", spoken: "Gracias", audioKey: "es-gracias", meaning: "Thank you" },
              { id: "es-por-favor", symbol: "Por favor", romanization: "por fah-VOR", spoken: "Por favor", audioKey: "es-por-favor", meaning: "Please" },
            ],
            verify: [
              { prompt: "Which word means “Hello”?", choices: ["Hola", "Adiós", "Gracias"], answerIndex: 0 },
              { prompt: "Which word means “Thank you”?", choices: ["Por favor", "Adiós", "Gracias"], answerIndex: 2 },
              { prompt: "Which word means “Goodbye”?", choices: ["Hola", "Adiós", "Por favor"], answerIndex: 1 },
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
              { spoken: "Hola", audioKey: "es-hola", choices: ["Hola", "Adiós", "Gracias"], answerIndex: 0 },
              { spoken: "Gracias", audioKey: "es-gracias", choices: ["Hola", "Adiós", "Gracias"], answerIndex: 2 },
              { spoken: "Adiós", audioKey: "es-adios", choices: ["Adiós", "Por favor", "Hola"], answerIndex: 0 },
              { spoken: "Por favor", audioKey: "es-por-favor", choices: ["Gracias", "Por favor", "Adiós"], answerIndex: 1 },
            ],
          },
        },
      ],
    },
    {
      id: "spanish-l2",
      order: 2,
      title: "Numbers 1–5",
      activities: [
        {
          id: "spanish-l2-a1",
          kind: "lang-symbol-intro",
          title: "Uno, dos, tres",
          blurb: "Count with me. Tap each number to hear it.",
          estMinutes: 6,
          band: "ready",
          skillTags: ["spanish.numbers"],
          config: {
            locale: "es-MX",
            instruction: "Let's count in Spanish. Tap each number to hear it.",
            skillTags: ["spanish.numbers"],
            symbols: [
              { id: "es-uno", symbol: "uno", romanization: "OO-noh", spoken: "uno", audioKey: "es-uno", meaning: "one" },
              { id: "es-dos", symbol: "dos", romanization: "DOHS", spoken: "dos", audioKey: "es-dos", meaning: "two" },
              { id: "es-tres", symbol: "tres", romanization: "TREHS", spoken: "tres", audioKey: "es-tres", meaning: "three" },
              { id: "es-cuatro", symbol: "cuatro", romanization: "KWAH-troh", spoken: "cuatro", audioKey: "es-cuatro", meaning: "four" },
              { id: "es-cinco", symbol: "cinco", romanization: "SEEN-koh", spoken: "cinco", audioKey: "es-cinco", meaning: "five" },
            ],
            verify: [
              { prompt: "Which word means “one”?", choices: ["uno", "tres", "cinco"], answerIndex: 0 },
              { prompt: "Which word means “three”?", choices: ["dos", "tres", "cuatro"], answerIndex: 1 },
              { prompt: "Which word means “five”?", choices: ["cuatro", "uno", "cinco"], answerIndex: 2 },
            ],
          },
        },
        {
          id: "spanish-l2-a2",
          kind: "lang-listen-match",
          title: "Hear the number",
          blurb: "Which number did you hear?",
          estMinutes: 5,
          band: "ready",
          skillTags: ["spanish.listening", "spanish.numbers"],
          config: {
            locale: "es-MX",
            instruction: "Listen. Then tap the number you heard.",
            skillTags: ["spanish.listening", "spanish.numbers"],
            items: [
              { spoken: "uno", audioKey: "es-uno", choices: ["uno", "dos", "tres"], answerIndex: 0 },
              { spoken: "tres", audioKey: "es-tres", choices: ["uno", "tres", "cinco"], answerIndex: 1 },
              { spoken: "dos", audioKey: "es-dos", choices: ["cuatro", "dos", "cinco"], answerIndex: 1 },
              { spoken: "cinco", audioKey: "es-cinco", choices: ["cinco", "cuatro", "uno"], answerIndex: 0 },
              { spoken: "cuatro", audioKey: "es-cuatro", choices: ["tres", "dos", "cuatro"], answerIndex: 2 },
            ],
          },
        },
      ],
    },
    {
      id: "spanish-l3",
      order: 3,
      title: "Colors",
      activities: [
        {
          id: "spanish-l3-a1",
          kind: "lang-symbol-intro",
          title: "Los colores",
          blurb: "Listen, then say each color with me.",
          estMinutes: 6,
          band: "ready",
          skillTags: ["spanish.colors"],
          config: {
            locale: "es-MX",
            instruction: "Here are some colors in Spanish. Tap each one to hear it.",
            skillTags: ["spanish.colors"],
            symbols: [
              { id: "es-rojo", symbol: "rojo", romanization: "ROH-hoh", spoken: "rojo", audioKey: "es-rojo", meaning: "red" },
              { id: "es-azul", symbol: "azul", romanization: "ah-SOOL", spoken: "azul", audioKey: "es-azul", meaning: "blue" },
              { id: "es-verde", symbol: "verde", romanization: "VEHR-deh", spoken: "verde", audioKey: "es-verde", meaning: "green" },
              { id: "es-amarillo", symbol: "amarillo", romanization: "ah-mah-REE-yoh", spoken: "amarillo", audioKey: "es-amarillo", meaning: "yellow" },
            ],
            verify: [
              { prompt: "Which word means “red”?", choices: ["rojo", "azul", "verde"], answerIndex: 0 },
              { prompt: "Which word means “blue”?", choices: ["verde", "azul", "amarillo"], answerIndex: 1 },
              { prompt: "Which word means “yellow”?", choices: ["rojo", "verde", "amarillo"], answerIndex: 2 },
            ],
          },
        },
        {
          id: "spanish-l3-a2",
          kind: "lang-listen-match",
          title: "Hear the color",
          blurb: "Which color did you hear?",
          estMinutes: 5,
          band: "ready",
          skillTags: ["spanish.listening", "spanish.colors"],
          config: {
            locale: "es-MX",
            instruction: "Listen. Then tap the color you heard.",
            skillTags: ["spanish.listening", "spanish.colors"],
            items: [
              { spoken: "rojo", audioKey: "es-rojo", choices: ["rojo", "azul", "verde"], answerIndex: 0 },
              { spoken: "verde", audioKey: "es-verde", choices: ["amarillo", "verde", "rojo"], answerIndex: 1 },
              { spoken: "azul", audioKey: "es-azul", choices: ["azul", "rojo", "amarillo"], answerIndex: 0 },
              { spoken: "amarillo", audioKey: "es-amarillo", choices: ["verde", "azul", "amarillo"], answerIndex: 2 },
            ],
          },
        },
      ],
    },
    {
      id: "spanish-l4",
      order: 4,
      title: "Family",
      activities: [
        {
          id: "spanish-l4-a1",
          kind: "lang-symbol-intro",
          title: "La familia",
          blurb: "Listen, then say each family word with me.",
          estMinutes: 6,
          band: "ready",
          skillTags: ["spanish.family"],
          config: {
            locale: "es-MX",
            instruction: "Here are family words in Spanish. Tap each one to hear it.",
            skillTags: ["spanish.family"],
            symbols: [
              { id: "es-mama", symbol: "mamá", romanization: "mah-MAH", spoken: "mamá", audioKey: "es-mama", meaning: "mom" },
              { id: "es-papa", symbol: "papá", romanization: "pah-PAH", spoken: "papá", audioKey: "es-papa", meaning: "dad" },
              { id: "es-hermano", symbol: "hermano", romanization: "ehr-MAH-noh", spoken: "hermano", audioKey: "es-hermano", meaning: "brother" },
              { id: "es-hermana", symbol: "hermana", romanization: "ehr-MAH-nah", spoken: "hermana", audioKey: "es-hermana", meaning: "sister" },
            ],
            verify: [
              { prompt: "Which word means “mom”?", choices: ["mamá", "papá", "hermano"], answerIndex: 0 },
              { prompt: "Which word means “dad”?", choices: ["hermana", "papá", "mamá"], answerIndex: 1 },
              { prompt: "Which word means “sister”?", choices: ["hermano", "papá", "hermana"], answerIndex: 2 },
            ],
          },
        },
        {
          id: "spanish-l4-a2",
          kind: "lang-listen-match",
          title: "Hear the family word",
          blurb: "Which family word did you hear?",
          estMinutes: 5,
          band: "ready",
          skillTags: ["spanish.listening", "spanish.family"],
          config: {
            locale: "es-MX",
            instruction: "Listen. Then tap the family word you heard.",
            skillTags: ["spanish.listening", "spanish.family"],
            items: [
              { spoken: "mamá", audioKey: "es-mama", choices: ["mamá", "papá", "hermano"], answerIndex: 0 },
              { spoken: "papá", audioKey: "es-papa", choices: ["hermana", "papá", "hermano"], answerIndex: 1 },
              { spoken: "hermano", audioKey: "es-hermano", choices: ["hermano", "mamá", "hermana"], answerIndex: 0 },
              { spoken: "hermana", audioKey: "es-hermana", choices: ["papá", "hermano", "hermana"], answerIndex: 2 },
            ],
          },
        },
      ],
    },
    {
      id: "spanish-l5",
      order: 5,
      title: "Say your name",
      activities: [
        {
          id: "spanish-l5-a1",
          kind: "lang-symbol-intro",
          title: "Me llamo…",
          blurb: "Learn to tell people your name and age.",
          estMinutes: 6,
          band: "ready",
          skillTags: ["spanish.phrases"],
          config: {
            locale: "es-MX",
            instruction: "Now you can introduce yourself. Tap each one to hear it.",
            skillTags: ["spanish.phrases"],
            symbols: [
              { id: "es-frase-me-llamo", symbol: "Me llamo ___", romanization: "meh YAH-moh ___", spoken: "Me llamo", audioKey: "es-frase-me-llamo", example: "Me llamo Ana.", exampleSpoken: "Me llamo Ana.", meaning: "My name is ___" },
              { id: "es-frase-tengo-seis-anos", symbol: "Tengo seis años", romanization: "TEHN-goh SAYSS AH-nyohs", spoken: "Tengo seis años", audioKey: "es-frase-tengo-seis-anos", example: "Hola, tengo seis años.", exampleSpoken: "Hola, tengo seis años.", meaning: "I am six years old" },
              { id: "es-hola", symbol: "Hola", romanization: "OH-lah", spoken: "Hola", audioKey: "es-hola", meaning: "Hello" },
            ],
            verify: [
              { prompt: "Which one means “My name is ___”?", choices: ["Me llamo ___", "Tengo seis años", "Hola"], answerIndex: 0 },
              { prompt: "Which one means “I am six years old”?", choices: ["Hola", "Tengo seis años", "Me llamo ___"], answerIndex: 1 },
            ],
          },
        },
        {
          id: "spanish-l5-a2",
          kind: "lang-listen-match",
          title: "Hear it, tap it",
          blurb: "Which one did you hear?",
          estMinutes: 5,
          band: "ready",
          skillTags: ["spanish.listening", "spanish.phrases"],
          config: {
            locale: "es-MX",
            instruction: "Listen. Then tap the one you heard.",
            skillTags: ["spanish.listening", "spanish.phrases"],
            items: [
              { spoken: "Me llamo", audioKey: "es-frase-me-llamo", choices: ["Me llamo ___", "Tengo seis años", "Hola"], answerIndex: 0 },
              { spoken: "Tengo seis años", audioKey: "es-frase-tengo-seis-anos", choices: ["Hola", "Tengo seis años", "Me llamo ___"], answerIndex: 1 },
              { spoken: "Hola", audioKey: "es-hola", choices: ["Tengo seis años", "Me llamo ___", "Hola"], answerIndex: 2 },
            ],
          },
        },
      ],
    },
  ],
};
