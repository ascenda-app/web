import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mobileRoot = join(root, "..", "..", "mobile", "app");
const source = join(root, "src", "app", "assets", "logo.png");

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const white = { r: 255, g: 255, b: 255, alpha: 1 };

const densities = [
  ["mdpi", 1],
  ["hdpi", 1.5],
  ["xhdpi", 2],
  ["xxhdpi", 3],
  ["xxxhdpi", 4],
];

const opaqueBounds = async () => {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bounds = { minX: info.width, minY: info.height, maxX: -1, maxY: -1 };

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] > 16) {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }

  return { ...bounds, width: info.width, height: info.height };
};

const squareAround = (bounds) => {
  const side = Math.min(
    Math.max(bounds.maxX - bounds.minX + 1, bounds.maxY - bounds.minY + 1),
    bounds.width,
    bounds.height,
  );
  const centreX = (bounds.minX + bounds.maxX) / 2;
  const centreY = (bounds.minY + bounds.maxY) / 2;
  const clamp = (value, limit) =>
    Math.round(Math.min(Math.max(value, 0), limit - side));

  return {
    left: clamp(centreX - side / 2, bounds.width),
    top: clamp(centreY - side / 2, bounds.height),
    width: side,
    height: side,
  };
};

const render = async (badge, size, { coverage = 1, background = transparent }) => {
  const inner = Math.round(size * coverage);
  const art = await sharp(source)
    .extract(badge)
    .resize(inner, inner, { fit: "contain", background: transparent })
    .png()
    .toBuffer();

  const canvas = sharp({
    create: { width: size, height: size, channels: 4, background },
  }).composite([{ input: art, gravity: "centre" }]);

  return (background.alpha === 1 ? canvas.flatten({ background }) : canvas)
    .png({ compressionLevel: 9, palette: true, dither: 0 })
    .toBuffer();
};

const write = (path, contents) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  console.log(`  ${path.replace(join(root, ".."), "..")}`);
};

const icoEntry = (png, size, offset) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size % 256, 0);
  entry.writeUInt8(size % 256, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);

  return entry;
};

const ico = (images) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ png, size }) => {
    const entry = icoEntry(png, size, offset);
    offset += png.length;

    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
};

const writePortalIcons = async (badge) => {
  console.log("portal:");
  write(join(root, "src", "app", "icon.png"), await render(badge, 192, {}));
  write(
    join(root, "src", "app", "apple-icon.png"),
    await render(badge, 180, { coverage: 0.92, background: white }),
  );

  const images = await Promise.all(
    [32, 16].map(async (size) => ({ size, png: await render(badge, size, {}) })),
  );
  write(join(root, "src", "app", "favicon.ico"), ico(images));
};

const androidRes = join(mobileRoot, "android", "app", "src", "main", "res");

const writeLauncherIcons = async (badge, density, scale) => {
  const folder = join(androidRes, `mipmap-${density}`);
  const legacy = await render(badge, Math.round(48 * scale), {});

  write(join(folder, "ic_launcher.png"), legacy);
  write(join(folder, "ic_launcher_round.png"), legacy);
  write(
    join(folder, "ic_launcher_foreground.png"),
    await render(badge, Math.round(108 * scale), { coverage: 2 / 3 }),
  );
};

const writeMobileIcons = async (badge) => {
  if (!existsSync(mobileRoot)) {
    console.log(`mobile no disponible en ${mobileRoot}; omitido.`);

    return;
  }

  console.log("mobile:");

  for (const [density, scale] of densities) {
    await writeLauncherIcons(badge, density, scale);
  }

  write(
    join(
      mobileRoot,
      "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
    ),
    await render(badge, 1024, { coverage: 0.92, background: white }),
  );
};

const badge = squareAround(await opaqueBounds());
console.log(
  `Recorte del logotipo: ${badge.width}x${badge.height} desde (${badge.left}, ${badge.top}).`,
);

await writePortalIcons(badge);
await writeMobileIcons(badge);
