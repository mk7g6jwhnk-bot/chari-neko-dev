import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const outputUrl = new URL("../netlify/generated/deploy-context.mjs", import.meta.url);
const outputPath = fileURLToPath(outputUrl);
const context = String(process.env.CONTEXT || "dev");
const metadata = {
  context,
  branch: String(context === "deploy-preview"
    ? process.env.HEAD || process.env.BRANCH || ""
    : process.env.BRANCH || "")
};
const source = `// Generated at build time from non-secret Netlify metadata.\n` +
  `export const NETLIFY_DEPLOY_CONTEXT = Object.freeze(${JSON.stringify(metadata)});\n`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, source, "utf8");
console.log(`Netlify deploy context generated: ${metadata.context}/${metadata.branch || "(no branch)"}`);
