import fs from "node:fs";
import assert from "node:assert/strict";

const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
const version=JSON.parse(fs.readFileSync(new URL("../public/version.json",import.meta.url),"utf8"));
const match=app.match(/const APP_RELEASE="([^"]+)"/);
assert.ok(match,"APP_RELEASE is missing from public/app.mjs");
assert.equal(match[1],String(version.version||""),"APP_RELEASE and public/version.json must match exactly");
console.log("app-version-consistency: ok",match[1]);
