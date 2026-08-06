import assert from "node:assert/strict";
import { parseScheduleHtml } from "../keirin/parser/schedule-parser.mjs";

const html = `
<table>
<tr><th>競輪場</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th></tr>
<tr><th><a href="/pc/venue/11">函館</a></th><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><th><a href="/pc/venue/24">宇都宮</a></th><td></td><td></td><td></td><td></td><td></td><td></td><td><img src="/pc/static/img/icon/grade/ico_f2.png"></td><td></td></tr>
<tr><th><a href="/pc/venue/43">岐阜</a></th><td colspan="6"></td><td><img src="/pc/static/img/icon/KaisaiIcon/ico_kaisaihuka_02.png"><img src="/pc/static/img/icon/grade/ico_f1.png"></td><td></td></tr>
<tr><th><a href="/pc/venue/13">いわき平</a></th><td colspan="6"></td><td><img src="/pc/static/img/icon/KaisaiIcon/ico_kaisaihuka_02.png"></td><td></td></tr>
</table>`;

const result = parseScheduleHtml(html, "https://keirin.jp/pc/raceschedule", "20260807");
assert.equal(result.ok, true);
assert.deepEqual(result.meetings.map(m => m.venueName), ["宇都宮", "岐阜"]);
assert.equal(result.diagnostics.parserMode, "target-day-cell-grade-evidence-v052");
console.log("keirin schedule parser v0.5.2: ok");
