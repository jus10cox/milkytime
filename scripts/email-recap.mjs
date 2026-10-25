// Emails Miranda a recap of products added to site/items.json since the previous commit.
// Usage: node scripts/email-recap.mjs <previous-commit-sha>
// Needs env: GMAIL_USER, GMAIL_APP_PASSWORD, RECAP_TO (comma-separated), SITE_URL.
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import nodemailer from "nodemailer";

const before = process.argv[2];
const { GMAIL_USER, GMAIL_APP_PASSWORD, RECAP_TO, SITE_URL = "https://milkytime.shop" } = process.env;
if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !RECAP_TO) {
  console.log("Email secrets not set; skipping recap.");
  process.exit(0);
}

const now = JSON.parse(await fs.readFile("site/items.json", "utf8"));
let old = { items: [] };
try {
  old = JSON.parse(execFileSync("git", ["show", `${before}:site/items.json`], { encoding: "utf8", maxBuffer: 50e6 }));
} catch {
  console.log("No previous items.json to compare against; skipping recap.");
  process.exit(0);
}
const oldIds = new Set(old.items.map((i) => i.id));
const added = now.items.filter((i) => !oldIds.has(i.id));
if (!added.length) {
  console.log("No new products; no recap needed.");
  process.exit(0);
}

const esc = (s = "") => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const site = SITE_URL.replace(/\/$/, "");
const issues = [...new Set(added.map((i) => now.posts[i.posts[0]]?.title).filter(Boolean))];
const card = (i) => `
  <tr><td style="padding:12px 0;border-bottom:1px solid #ece4d6">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td width="84" valign="top">${i.img
        ? `<img src="${site}/${esc(i.img)}" width="72" height="72" alt="" style="display:block;border-radius:6px;background:#f7f1e6">`
        : `<div style="width:72px;height:72px;border-radius:6px;background:#f6e3e1"></div>`}</td>
      <td valign="top" style="font-family:Georgia,serif;color:#3b302a">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7d6f66;font-family:Helvetica,Arial,sans-serif">${esc(i.cat)}</div>
        <div style="font-size:17px;margin:2px 0"><a href="${esc(i.href)}" style="color:#3b302a">${esc(i.name)}</a></div>
        <div style="font-size:14px;font-style:italic;color:#7d6f66">${esc(i.note)}</div>
      </td></tr></table>
  </td></tr>`;

const html = `<div style="background:#fffdf5;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
    <tr><td style="font-family:Georgia,serif;color:#3b302a">
      <p style="font-size:22px;margin:0 0 6px">${added.length} new ${added.length === 1 ? "pick is" : "picks are"} on the Milky Time Shop</p>
      <p style="font-size:15px;color:#7d6f66;margin:0 0 16px">From ${esc(issues.join(", "))}. If anything looks off, just reply to this email.</p>
      <p style="margin:0 0 8px"><a href="${site}" style="display:inline-block;background:#3b302a;color:#fffdf5;text-decoration:none;padding:10px 20px;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:.14em;text-transform:uppercase">See the shop</a></p>
    </td></tr>
    ${added.map(card).join("")}
  </table></div>`;
const text = `${added.length} new picks on the Milky Time Shop (${site})\n\n` +
  added.map((i) => `- ${i.name} (${i.cat}): ${i.note}\n  ${i.href}`).join("\n") + "\n\nIf anything looks off, just reply.";

const mail = process.env.RECAP_DRY_RUN
  ? nodemailer.createTransport({ jsonTransport: true })
  : nodemailer.createTransport({ service: "gmail", auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
const info = await mail.sendMail({
  from: `"Milky Time Shop" <${GMAIL_USER}>`,
  to: RECAP_TO,
  replyTo: GMAIL_USER,
  subject: `${added.length} new ${added.length === 1 ? "pick" : "picks"} added to the Milky Time Shop`,
  text,
  html,
});
if (process.env.RECAP_DRY_RUN) await fs.writeFile("recap-preview.html", html);
console.log(`Recap sent to ${RECAP_TO} (${added.length} new picks).`);
