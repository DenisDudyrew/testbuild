// Old release notes were pasted from GitHub and carry inline colours
// (e.g. color: rgb(31, 35, 40)) which override our theme classes and make
// text unreadable in dark mode. Remove only colour-related declarations and
// keep everything else (positioning, opacity, etc.).
const COLOUR_PROPS = new Set([
  "color",
  "background",
  "background-color",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "fill",
  "stroke",
  "font-family",
]);

function cleanStyle(style: string): string {
  const kept = style
    .split(";")
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const prop = decl.split(":")[0]?.trim().toLowerCase() ?? "";
      return !COLOUR_PROPS.has(prop);
    });
  return kept.join("; ");
}

export function themeSafeHtml(html: string): string {
  return html.replace(/style\s*=\s*"([^"]*)"/gi, (_match, style: string) => {
    const cleaned = cleanStyle(style);
    return cleaned ? `style="${cleaned}"` : "";
  });
}
