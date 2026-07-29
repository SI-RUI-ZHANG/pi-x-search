import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const changelog = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const failures = [];

if (packageJson.private === true) failures.push('package.json still has "private": true');
if (packageJson.version === "0.0.0") failures.push("package version is still 0.0.0");
if (packageLock.version !== packageJson.version || packageLock.packages?.[""]?.version !== packageJson.version) {
	failures.push("package-lock.json version does not match package.json");
}
if (!changelog.includes(`## ${packageJson.version}`) && !changelog.includes(`## [${packageJson.version}]`)) {
	failures.push(`CHANGELOG.md has no release heading for ${packageJson.version}`);
}

if (failures.length > 0) {
	console.error("Release manifest is not ready:");
	for (const failure of failures) console.error(`- ${failure}`);
	process.exit(1);
}

console.log(`Release manifest is ready for ${packageJson.name}@${packageJson.version}.`);
