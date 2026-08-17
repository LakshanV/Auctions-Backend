/**
 * Emit the demo-media manifest that drives image generation (SVG or real AI). One row per SMKT
 * listing: its ref, category, human title, condition and how many images it should have. The
 * frontend generator (`apps/web/scripts/gen-demo-media.mjs`) reads this to build coherent,
 * per-listing prompts and write files at the deterministic `demo/smkt/<cat>/<ref>-<n>.<ext>` paths
 * the seeder references. Re-run whenever the dataset changes:
 *   DATABASE_URL=… node database/prisma/emit-demo-manifest.mjs > ../Auctions-New/apps/web/scripts/demo-media.manifest.json
 */
import { disconnectPrisma, getPrisma } from '../src/client';

async function main() {
  const prisma = getPrisma();
  const listings = await prisma.listing.findMany({
    where: { publicRef: { startsWith: 'SMKT-' } },
    select: {
      publicRef: true,
      title: true,
      asset: { select: { category: true, attributes: true } },
    },
    orderBy: { publicRef: 'asc' },
  });

  // Count images per asset separately (media hangs off asset, not listing).
  const rows = [];
  for (const l of listings) {
    const attrs = l.asset.attributes ?? {};
    const imageCount = await prisma.mediaObject.count({
      where: { asset: { listings: { some: { publicRef: l.publicRef } } }, kind: 'image' },
    });
    rows.push({
      ref: l.publicRef,
      category: l.asset.category,
      title: l.title ?? l.asset.category,
      condition: typeof attrs.condition === 'string' ? attrs.condition : 'used',
      imageCount,
    });
  }
  process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
