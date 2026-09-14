const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
async function buildIcon() {
  const root = path.resolve(__dirname, '..');
  const source = path.join(root, 'www/assets/garanci-logo.svg');
  await sharp(source).resize(512).png().toFile(path.join(root, 'www/assets/garanci-logo.png'));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await Promise.all(sizes.map(size => sharp(source).resize(size).png().toBuffer()));
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(1, 2); directory.writeUInt16LE(images.length, 4);
  let offset = directory.length;
  images.forEach((buffer, i) => {
    const entry = 6 + i * 16;
    directory[entry] = sizes[i] === 256 ? 0 : sizes[i];
    directory[entry + 1] = directory[entry];
    directory.writeUInt16LE(1, entry + 4); directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(buffer.length, entry + 8); directory.writeUInt32LE(offset, entry + 12);
    offset += buffer.length;
  });
  fs.writeFileSync(path.join(root, 'build/icon.ico'), Buffer.concat([directory, ...images]));
  console.log('Generated Danfos Garanci PNG and seven-size Windows icon.');
}
buildIcon().catch(error => { console.error(error); process.exitCode = 1; });
