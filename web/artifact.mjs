// Turns the `--mode artifact` build into a page for claude.ai, which supplies its own
// <!doctype>, <html>, <head> and <body>: keep the title, metas, links and scripts
// from the head, then the body's contents. Run by `npm run web:artifact`.
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("./dist-artifact/", import.meta.url);
const html = readFileSync(new URL("index.html", dir), "utf8");
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>/, "")
  .replace(/<meta name="viewport"[^>]*>/, "")
  .replace(/<link rel="manifest"[^>]*>/, "");
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const title = head.match(/<title>.*?<\/title>/)[0];
const rest = head.replace(title, "");
const page = `${title}\n${rest.trim()}\n${body.trim()}\n`;
writeFileSync(new URL("page.html", dir), page);
console.log("Wrote web/dist-artifact/page.html");
