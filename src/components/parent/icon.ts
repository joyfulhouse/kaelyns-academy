import type { ComponentType, SVGProps } from "react";

/**
 * Shape of a Phosphor SSR icon component, typed locally so we don't reach into
 * the package's client (csr) barrel just for the `IconProps` type (the ssr
 * entry does not re-export it). Covers the props we pass: `weight` + className.
 */
export type PhosphorIcon = ComponentType<
  SVGProps<SVGSVGElement> & {
    weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
    size?: string | number;
  }
>;
