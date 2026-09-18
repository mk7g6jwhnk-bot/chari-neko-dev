import fs from 'node:fs/promises';
import { fetchMilestoneSource } from './recommendation-thick-100r-fetch.mjs';

const cohort = JSON.parse(await fs.readFile(new URL('./recommendation-thick-150r-cohort.json', import.meta.url)));
const source = await fetchMilestoneSource({ cohort, expectedRaces: 150 });
const target = new URL('./recommendation-thick-150r-source.json', import.meta.url);
await fs.writeFile(target, JSON.stringify(source, null, 2));
console.log(JSON.stringify({ target: target.pathname, fetched: source.ticketDiagnostics.length, exclusions: source.exclusions, hashes: source.hashes }, null, 2));
