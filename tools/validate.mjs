import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = path.join(root, "skills/life-path-explorer");
const readText = file => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const entry = readText(path.join(skillRoot, "SKILL.md"));
const checks = [];
const check = (name, run) => {
  run();
  checks.push(name);
};

check("entry frontmatter and identity", () => {
  const frontmatter = entry.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(frontmatter, "Missing YAML frontmatter");
  assert.match(frontmatter[1], /^name: life-path-explorer$/m);
  const description = frontmatter[1].match(/^description: "(.+)"$/m);
  assert.ok(description, "Missing quoted one-line description");
  assert.ok(description[1].length <= 1024);
  assert.ok(!/[<>]/.test(description[1]));
});

const skillFiles = [];
const walk = directory => {
  for (const name of fs.readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    const stat = fs.lstatSync(absolute);
    assert.ok(!stat.isSymbolicLink(), `Symlink is not portable: ${name}`);
    if (stat.isDirectory()) walk(absolute);
    else skillFiles.push(absolute);
  }
};
walk(skillRoot);

check("skill package contains all required resources", () => {
  const expected = [
    "LICENSE.txt",
    "SKILL.md",
    "agents/openai.yaml",
    "references/interview-and-evidence.md",
    "references/odyssey-method.md",
    "references/output-and-review.md",
  ];
  assert.deepEqual(skillFiles.map(file => path.relative(skillRoot, file)).sort(), expected.sort());
});

check("local links resolve inside the skill", () => {
  for (const file of skillFiles.filter(file => file.endsWith(".md"))) {
    const content = readText(file);
    for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^https?:\/\//.test(target) || target.startsWith("#")) continue;
      const [relative, fragment] = target.split("#");
      const resolved = path.resolve(path.dirname(file), relative);
      assert.ok(resolved.startsWith(skillRoot + path.sep), `Link escapes skill: ${target}`);
      assert.ok(fs.existsSync(resolved), `Missing link: ${target}`);
      if (fragment === "实验卡") {
        assert.match(readText(resolved), /^## 实验卡$/m);
      }
    }
  }
});

check("interface can invoke the actual skill", () => {
  const yaml = readText(path.join(skillRoot, "agents/openai.yaml"));
  assert.match(yaml, /^interface:$/m);
  assert.match(yaml, /default_prompt: "[^"\n]*\$life-path-explorer[^"\n]*"/);
  const description = yaml.match(/short_description: "([^"]+)"/);
  assert.ok(description && description[1].length >= 25 && description[1].length <= 64);
});

check("package is text-only and contains no local paths or credentials", () => {
  const files = [
    ...skillFiles,
    ...["README.md", "SOURCES.md", "LICENSE", ".gitignore"].map(name => path.join(root, name)),
  ];
  for (const file of files) {
    const content = readText(file);
    assert.ok(!content.includes("\u0000"), `Unexpected binary file: ${file}`);
    assert.ok(!content.includes("\ufffd"), `Invalid UTF-8 replacement: ${file}`);
    assert.ok(!/(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)/.test(content), `Private local path: ${file}`);
    assert.ok(!/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,})\b/.test(content), `Credential-like value: ${file}`);
    assert.ok(!/\[TODO:|REPLACE_ME|YOUR_TOKEN/.test(content), `Unfinished scaffold: ${file}`);
  }
});

check("source attribution and license are present", () => {
  const sources = readText(path.join(root, "SOURCES.md"));
  assert.ok(sources.includes("lifedesignlab.stanford.edu/resources"));
  assert.ok(sources.includes("designingyour.life"));
  assert.ok(sources.includes("Bill Burnett"));
  const license = readText(path.join(root, "LICENSE"));
  assert.match(license, /^MIT License/);
  assert.equal(readText(path.join(skillRoot, "LICENSE.txt")), license);
});

console.log(JSON.stringify({
  status: "passed",
  structural_checks: checks.length,
  checks,
  skill_files: skillFiles.map(file => path.relative(skillRoot, file)),
  scope: "Package structure, interface, local links, portability and attribution. Not a behavior evaluation.",
}, null, 2));
