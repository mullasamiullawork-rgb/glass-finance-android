// Builds www/ from web/: copies sources and writes index.html with every module in load order.
import { mkdirSync, rmSync, cpSync, writeFileSync, readFileSync } from "node:fs";
const order = JSON.parse(readFileSync("web/modules.json", "utf8"));
rmSync("www", { recursive: true, force: true });
mkdirSync("www", { recursive: true });
cpSync("web/src", "www/src", { recursive: true });
cpSync("web/assets", "www/assets", { recursive: true });
const tpl = readFileSync("web/index.template.html", "utf8");
const scripts = order.map((f) => `    <script src="src/${f}"></script>`).join("\n");
writeFileSync("www/index.html", tpl.replace("<!--SCRIPTS-->", scripts));
console.log("Built www/ with", order.length, "modules");
