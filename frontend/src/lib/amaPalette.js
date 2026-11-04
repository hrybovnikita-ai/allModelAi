/** AllModelAI 19-color system. */
export const AMA_PALETTE = [
  ['Black', '#050505'],
  ['Dark Blue', '#07152D'],
  ['Violet', '#7535F5'],
  ['Light Violet', '#A45CFF'],
  ['Green', '#16B86A'],
  ['Lime', '#B6FF27'],
  ['Yellow-Green', '#83D824'],
  ['Yellow', '#FFE034'],
  ['Gold', '#E6B84A'],
  ['Blue', '#287BFF'],
  ['Cyan', '#49C8FF'],
  ['White', '#FFFFFF'],
  ['Pink', '#FF58B5'],
  ['Red', '#F04450'],
  ['Orange', '#FF932F'],
  ['Red-Orange', '#FF542B'],
  ['Gray', '#858585'],
  ['Dark Gray', '#292929'],
  ['Coral', '#FF7F50'],
];

/** Bubble / accent swatches (skip pure black and white backgrounds). */
export const AMA_ACCENT_SWATCHES = AMA_PALETTE.filter(([, hex]) => !['#050505', '#FFFFFF', '#07152D'].includes(hex));
