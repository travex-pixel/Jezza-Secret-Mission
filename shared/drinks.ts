// The Cellar's quick-pick menu. Free text still works; these are the taps that save typing with a beer in the
// other hand. Grouped so a lad can find his in one glance, and each group has its emoji for the feed and the list.
export type DrinkGroup = 'beer' | 'soft' | 'wine' | 'spirit';
export const DRINK_GROUPS: { id: DrinkGroup; label: string; emoji: string; items: string[] }[] = [
  { id: 'beer', label: 'Beers', emoji: '🍺', items: ['Great Northern', 'Carlton Dry', 'XXXX Gold', 'Tooheys New', 'VB', 'Coopers Pale', 'Stone & Wood', 'Balter XPA', 'Hahn Super Dry', 'Furphy', 'Corona', 'Bintang', 'Guinness', 'Zero beer'] },
  { id: 'soft', label: 'Softies', emoji: '🥤', items: ['Pepsi Max', 'Coke Zero', 'Solo', 'Lift', 'Fanta', 'Ginger beer', 'Lemon lime bitters', 'Soda water', 'Red Bull', 'Iced coffee', 'Water', 'Yakult'] },
  { id: 'wine', label: 'Wines', emoji: '🍷', items: ['Hunter Semillon', 'Shiraz', 'Chardonnay', 'Rosé', 'Pinot Noir', 'Sparkling', 'Cab Sav', 'Goon'] },
  { id: 'spirit', label: 'Spirits', emoji: '🥃', items: ['Bourbon & Coke', 'Vodka soda', 'Gin & tonic', 'Espresso martini', 'Rum & Coke', 'Tequila shot', 'Jägerbomb', 'Whisky neat'] },
];
// Checked in this order: cocktails first (so "Bourbon & Coke" is a spirit, not a soft drink), then softies (so
// "ginger beer" stays soft), then beers, then wine as the Hunter Valley default.
const KEYWORDS: [DrinkGroup, RegExp][] = [
  ['spirit', /\b(bourbon|vodka|gin\b|rum\b|tequila|whisk|scotch|martini|j[aä]ger|shot|cocktail|margarita|negroni|spritz|cider)/i],
  ['soft', /\b(pepsi|coke|cola|solo|lift|fanta|sprite|ginger beer|bitters|soda|water|red bull|mother|monster|coffee|tea|juice|yakult|milk|zero sugar|lemonade|milo)/i],
  ['beer', /\b(beer|lager|ale|xpa|ipa|pale|stout|draught|schooner|pint|tinnie|tinny|stubby|carlton|xxxx|tooheys|vb\b|coopers|balter|hahn|furphy|corona|bintang|guinness|great northern|stone ?& ?wood)/i],
  ['wine', /\b(wine|semillon|shiraz|chardonnay|ros[eé]|pinot|sparkling|champagne|prosecco|cab ?sav|cabernet|merlot|riesling|sauv|goon|verdelho)/i],
];
/** Best-guess group for any free-text drink, wine being the Hunter Valley default. */
export function drinkGroup(name: string): DrinkGroup {
  for (const g of DRINK_GROUPS) if (g.items.some((i) => i.toLowerCase() === name.trim().toLowerCase())) return g.id;
  for (const [g, re] of KEYWORDS) if (re.test(name)) return g;
  return 'wine';
}
export const drinkEmoji = (name: string) => DRINK_GROUPS.find((g) => g.id === drinkGroup(name))!.emoji;
