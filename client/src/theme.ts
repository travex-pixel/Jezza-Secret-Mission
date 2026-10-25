// The party's theme on the client: who the guest of honour is, the words to use, which features are on.
import { THEMES, PRODUCT_NAME, fill, type ThemeDef, type ThemeId } from '@shared/themes';
import { useStore } from './store';

export interface ThemeCtx { theme: ThemeDef; id: ThemeId; name: string; t: (text: string) => string; product: string }
export function themeFor(id: ThemeId | undefined, name: string | undefined): ThemeCtx {
  const theme = THEMES[id ?? 'bucks'] ?? THEMES.bucks;
  const n = name || theme.defaultHonour;
  return { theme, id: theme.id, name: n, t: (text) => fill(text, theme.id, n), product: PRODUCT_NAME };
}
export function useTheme(): ThemeCtx {
  const id = useStore((s) => s.party?.theme);
  const name = useStore((s) => s.party?.honourName);
  return themeFor(id, name);
}
