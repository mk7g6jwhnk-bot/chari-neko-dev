import fs from "node:fs/promises";
import { evaluateScenarioCliffV5 } from "./scenario-cliff-shadow.mjs";

const input = process.argv[2];
if (!input) throw new Error("usage: node research/scenario-cliff-shadow-audit.mjs <records.json> [output.json]");
const source = JSON.parse(await fs.readFile(input, "utf8"));
const records = Array.isArray(source) ? source : source.records || [];
const result = evaluateScenarioCliffV5(records);
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (process.argv[3]) await fs.writeFile(process.argv[3], serialized); else process.stdout.write(serialized);
