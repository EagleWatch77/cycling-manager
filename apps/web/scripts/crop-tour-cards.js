/**
 * One-off derivative asset build: crops a clean, text-free scenic region out
 * of each existing Tour poster (public/tours/*.png) to use as the Tour card
 * cover. The poster itself (crest, title, stat bar) stays as-is and becomes
 * the detail-page heroImage; nothing here invents new imagery.
 */
const sharp = require('sharp');
const path = require('path');

const TOURS_DIR = path.join(__dirname, '..', 'public', 'tours');

const SOURCES = [
  { src: 'Danube-tour.png', out: 'Danube-tour-card.png' },
  { src: 'Coastal-tour.png', out: 'Coastal-tour-card.png' },
  { src: 'Highlands-tour.png', out: 'Highlands-tour-card.png' },
  { src: 'Northerd-crown-tour.png', out: 'Northern-crown-tour-card.png' },
  { src: 'Silver-horizont-tour.png', out: 'Silver-horizon-tour-card.png' },
];

// Original posters are 2172x724: crest+title text sits in the left ~40%,
// a white stat bar spans the full width for the bottom ~35%. This window
// keeps only the clean photo — no text, no icons.
const CROP = { left: 1320, top: 118, width: 852, height: 350 };

async function run() {
  for (const { src, out } of SOURCES) {
    await sharp(path.join(TOURS_DIR, src))
      .extract(CROP)
      .toFile(path.join(TOURS_DIR, out));
    console.log('wrote', out);
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
