import { ImageResponse } from "next/og";

/**
 * Site-wide Open Graph / social card (1200×630), replacing the old 512² icon
 * fallback. Generated with next/og (Satori) at build time — a real branded card
 * for link previews. Satori does NOT parse oklch, so the Wonder Studio tokens
 * (globals.css) are mirrored here as their hex equivalents.
 */
export const alt = "Kaelyn's Academy — a warm, adaptive learning studio for young children";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Wonder Studio palette → hex (from the oklch tokens in src/app/globals.css).
const PAPER = "#fdf8ef"; // --color-paper
const INK = "#3b322a"; // --color-ink
const INK_SOFT = "#6e6151"; // --color-ink-soft
const HONEY = "#e9b25e"; // --color-honey
const HONEY_DEEP = "#cf9445"; // --color-honey-deep
const CORAL = "#e17a5f"; // --color-coral

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: PAPER,
          padding: "84px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative shapes — echo the home hero, kept soft so text stays dominant. */}
        <div
          style={{
            position: "absolute",
            top: -160,
            right: -110,
            width: 460,
            height: 460,
            borderRadius: 9999,
            backgroundColor: HONEY,
            opacity: 0.3,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -190,
            left: -150,
            width: 420,
            height: 420,
            borderRadius: 9999,
            backgroundColor: CORAL,
            opacity: 0.16,
            display: "flex",
          }}
        />

        {/* Eyebrow pill */}
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            alignItems: "center",
            borderRadius: 9999,
            border: `3px solid ${INK}`,
            backgroundColor: "#ffffff",
            padding: "10px 24px",
            fontSize: 27,
            fontWeight: 600,
            color: INK,
          }}
        >
          A personalized learning studio
        </div>

        {/* Wordmark */}
        <div
          style={{
            display: "flex",
            marginTop: 38,
            fontSize: 96,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: INK,
          }}
        >
          Kaelyn&rsquo;s Academy
        </div>

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            marginTop: 22,
            maxWidth: 940,
            fontSize: 46,
            fontWeight: 500,
            color: INK_SOFT,
          }}
        >
          Meet her exactly where she&rsquo;s ready.
        </div>

        {/* Footer promise */}
        <div
          style={{
            display: "flex",
            marginTop: 48,
            alignItems: "center",
            gap: 16,
            fontSize: 27,
            color: INK_SOFT,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 18,
              height: 18,
              borderRadius: 9999,
              backgroundColor: HONEY_DEEP,
            }}
          />
          Personalized · teaches forward, never busywork · no ads, ever
        </div>
      </div>
    ),
    { ...size },
  );
}
