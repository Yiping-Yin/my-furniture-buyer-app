// Generates a flat-illustration SVG per product into public/images/.
// Deliberately simple shapes: they always load, need no external host, and
// read as intentional placeholders rather than broken images.
// Regenerate with: npm run images
import { mkdirSync, writeFileSync } from 'node:fs'

const BG = '#f5f1ea'
const INK = '#8a7f70'
const ACCENT = '#b8a68f'

// Each shape is drawn inside a 600x400 viewBox.
const SHAPES = {
  sofa: `<rect x="120" y="200" width="360" height="90" rx="14" fill="${ACCENT}"/>
         <rect x="100" y="170" width="60" height="120" rx="16" fill="${INK}"/>
         <rect x="440" y="170" width="60" height="120" rx="16" fill="${INK}"/>
         <rect x="170" y="175" width="130" height="40" rx="10" fill="${INK}" opacity="0.5"/>
         <rect x="310" y="175" width="130" height="40" rx="10" fill="${INK}" opacity="0.5"/>
         <rect x="150" y="290" width="16" height="30" fill="${INK}"/>
         <rect x="434" y="290" width="16" height="30" fill="${INK}"/>`,
  table: `<rect x="110" y="180" width="380" height="22" rx="8" fill="${INK}"/>
          <rect x="140" y="202" width="18" height="120" fill="${ACCENT}"/>
          <rect x="442" y="202" width="18" height="120" fill="${ACCENT}"/>
          <rect x="140" y="300" width="320" height="14" rx="6" fill="${ACCENT}"/>`,
  chair: `<rect x="240" y="120" width="120" height="130" rx="14" fill="${ACCENT}"/>
          <rect x="225" y="245" width="150" height="24" rx="8" fill="${INK}"/>
          <rect x="235" y="269" width="16" height="70" fill="${INK}"/>
          <rect x="349" y="269" width="16" height="70" fill="${INK}"/>`,
  bed: `<rect x="90" y="150" width="90" height="150" rx="14" fill="${INK}"/>
        <rect x="180" y="230" width="330" height="70" rx="12" fill="${ACCENT}"/>
        <rect x="200" y="200" width="110" height="40" rx="12" fill="#ffffff" opacity="0.8"/>
        <rect x="180" y="300" width="16" height="26" fill="${INK}"/>
        <rect x="494" y="300" width="16" height="26" fill="${INK}"/>`,
  shelf: `<rect x="180" y="110" width="240" height="16" fill="${INK}"/>
          <rect x="180" y="180" width="240" height="16" fill="${INK}"/>
          <rect x="180" y="250" width="240" height="16" fill="${INK}"/>
          <rect x="180" y="110" width="16" height="210" fill="${ACCENT}"/>
          <rect x="404" y="110" width="16" height="210" fill="${ACCENT}"/>`,
  lamp: `<path d="M300 90 L360 170 L240 170 Z" fill="${ACCENT}"/>
         <rect x="294" y="170" width="12" height="140" fill="${INK}"/>
         <rect x="255" y="308" width="90" height="14" rx="6" fill="${INK}"/>`,
  desk: `<rect x="120" y="190" width="360" height="20" rx="8" fill="${INK}"/>
         <rect x="140" y="210" width="120" height="90" rx="8" fill="${ACCENT}"/>
         <rect x="170" y="240" width="60" height="8" rx="4" fill="${BG}"/>
         <rect x="450" y="210" width="16" height="110" fill="${ACCENT}"/>
         <rect x="140" y="300" width="120" height="20" rx="6" fill="${INK}"/>`,
  stool: `<rect x="245" y="200" width="110" height="22" rx="10" fill="${ACCENT}"/>
          <rect x="258" y="222" width="14" height="100" fill="${INK}"/>
          <rect x="328" y="222" width="14" height="100" fill="${INK}"/>
          <rect x="258" y="270" width="84" height="10" fill="${INK}" opacity="0.6"/>`,
  wardrobe: `<rect x="200" y="100" width="200" height="220" rx="10" fill="${ACCENT}"/>
             <rect x="298" y="100" width="4" height="220" fill="${BG}"/>
             <circle cx="288" cy="210" r="7" fill="${INK}"/>
             <circle cx="312" cy="210" r="7" fill="${INK}"/>
             <rect x="200" y="320" width="200" height="12" rx="4" fill="${INK}"/>`,
  rug: `<ellipse cx="300" cy="230" rx="170" ry="70" fill="${ACCENT}"/>
        <ellipse cx="300" cy="230" rx="120" ry="46" fill="none" stroke="${BG}" stroke-width="10"/>
        <ellipse cx="300" cy="230" rx="70" ry="24" fill="none" stroke="${BG}" stroke-width="10"/>`,
}

// Slugs must match the image_url values in supabase/seed.sql.
const PRODUCTS = [
  ['oak-dining-table', 'table'],
  ['linen-three-seat-sofa', 'sofa'],
  ['walnut-dining-chair', 'chair'],
  ['upholstered-bed-frame', 'bed'],
  ['open-oak-bookshelf', 'shelf'],
  ['brass-floor-lamp', 'lamp'],
  ['compact-writing-desk', 'desk'],
  ['ash-counter-stool', 'stool'],
  ['two-door-wardrobe', 'wardrobe'],
  ['handwoven-wool-rug', 'rug'],
]

mkdirSync('public/images', { recursive: true })
for (const [slug, shape] of PRODUCTS) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400" role="img"><rect width="600" height="400" fill="${BG}"/>${SHAPES[shape]}</svg>`
  writeFileSync(`public/images/${slug}.svg`, svg)
}
console.log(`wrote ${PRODUCTS.length} images`)
