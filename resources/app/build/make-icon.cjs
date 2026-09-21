// Generates the Danfosal App icons from www/assets/danfosal-logo.svg.
// Run with: node build/make-icon.cjs   (re-run whenever the SVG changes)
//
// - www/assets/danfosal-logo.png: the window/taskbar icon. main.js loads it at runtime,
//   and it lives under www/ because that is what the installer packages.
// - build/icon.ico: the program, shortcut, installer and uninstaller icon, which
//   electron-builder embeds at build time.
// Mirrors WarrantyApp/build/make-icon.cjs so both apps produce icons the same way.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function buildIcon() {
  const root = path.resolve(__dirname, '..');
  const source = path.join(root, 'www/assets/danfosal-logo.svg');
  await sharp(source).resize(512).png().toFile(path.join(root, 'www/assets/danfosal-logo.png'));

  // Windows picks the closest size per context (16 title bar, 32/48 taskbar and desktop,
  // 256 large views), so render each one from the vector instead of scaling one bitmap.
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await Promise.all(sizes.map(size => sharp(source).resize(size).png().toBuffer()));

  // ICO container: 6-byte header, one 16-byte directory entry per image, then the PNGs.
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(1, 2);                 // type 1 = icon
  directory.writeUInt16LE(images.length, 4);
  let offset = directory.length;
  images.forEach((buffer, i) => {
    const entry = 6 + i * 16;
    directory[entry] = sizes[i] === 256 ? 0 : sizes[i];  // 0 means 256 in the ICO format
    directory[entry + 1] = directory[entry];
    directory.writeUInt16LE(1, entry + 4);       // colour planes
    directory.writeUInt16LE(32, entry + 6);      // bits per pixel
    directory.writeUInt32LE(buffer.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += buffer.length;
  });
  fs.writeFileSync(path.join(root, 'build/icon.ico'), Buffer.concat([directory, ...images]));
  console.log('Generated Danfosal App PNG and seven-size Windows icon.');
}

buildIcon().catch(error => { console.error(error); process.exitCode = 1; });
