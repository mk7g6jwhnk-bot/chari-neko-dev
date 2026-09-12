import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LiveActionStore } from './action-tag-live-store.mjs';
import { ProductionActionTagSource } from './action-tag-production-source.mjs';

export async function collectProductionActionTags({ directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'action-tag-live-data'), maxPerRun = 5 } = {}) {
  const store = await new LiveActionStore(directory).init();
  return new ProductionActionTagSource({ store, maxPerRun }).run();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const maxPerRun = Math.max(1, Math.min(30, Number(process.argv[2]) || 5));
  console.log(JSON.stringify(await collectProductionActionTags({ maxPerRun }), null, 2));
}
