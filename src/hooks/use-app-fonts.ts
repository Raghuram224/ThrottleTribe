/**
 * Native: Inter is embedded at build time by the expo-font config plugin (app.json), so there is
 * nothing to load and no flash. The web variant (use-app-fonts.web.ts) loads the files at runtime.
 */
export function useAppFonts(): boolean {
  return true;
}
