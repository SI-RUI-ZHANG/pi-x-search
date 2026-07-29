import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const expectedName = "pi-x-search";
const expectedRepository = "git+https://github.com/SI-RUI-ZHANG/pi-x-search.git";
const expectedPublishConfig = {
	access: "public",
	provenance: true,
	registry: "https://registry.npmjs.org",
};
const expectedFiles = [
	"CHANGELOG.md",
	"LICENSE",
	"README.md",
	"SECURITY.md",
	"docs/assets/hero.png",
	"docs/assets/hero.svg",
	"docs/design.md",
	"extensions/x-search.ts",
	"package.json",
	"src/auth.ts",
	"src/client.ts",
	"src/contracts.ts",
	"src/errors.ts",
	"src/service.ts",
];
const stableSemver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const failures = [];

async function readJson(path) {
	try {
		return JSON.parse(await readFile(new URL(path, root), "utf8"));
	} catch (error) {
		failures.push(`cannot parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
		return {};
	}
}

const packageJson = await readJson("package.json");
const packageLock = await readJson("package-lock.json");
const changelog = await readFile(new URL("CHANGELOG.md", root), "utf8");

if (packageJson.name !== expectedName) failures.push(`package name must be ${expectedName}`);
if (!stableSemver.test(packageJson.version)) failures.push("package version must be stable SemVer");
if (packageJson.private === true) failures.push('package.json still has "private": true');
if (packageLock.name !== expectedName || packageLock.packages?.[""]?.name !== expectedName) {
	failures.push("package-lock.json names do not match package.json");
}
if (packageLock.version !== packageJson.version || packageLock.packages?.[""]?.version !== packageJson.version) {
	failures.push("package-lock.json version does not match package.json");
}
if (packageJson.repository?.url !== expectedRepository) {
	failures.push(`repository must be ${expectedRepository}`);
}
if (JSON.stringify(packageJson.publishConfig) !== JSON.stringify(expectedPublishConfig)) {
	failures.push(`publishConfig must be exactly ${JSON.stringify(expectedPublishConfig)}`);
}

const escapedVersion = packageJson.version.replaceAll(".", "\\.");
const releaseHeading = new RegExp(`^## ${escapedVersion} - \\d{4}-\\d{2}-\\d{2}$`, "gm");
const matchingHeadings = changelog.match(releaseHeading) ?? [];
if (matchingHeadings.length !== 1) {
	failures.push(`CHANGELOG.md must contain exactly one dated heading for ${packageJson.version}`);
}
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${packageJson.version}`) {
	failures.push(`RELEASE_TAG must equal v${packageJson.version}`);
}

try {
	const { stdout } = await execFileAsync(
		"npm",
		["pack", "--dry-run", "--json", "--ignore-scripts"],
		{ cwd: root, maxBuffer: 10 * 1024 * 1024 },
	);
	const packs = JSON.parse(stdout);
	if (!Array.isArray(packs) || packs.length !== 1) {
		failures.push("npm pack dry run must produce exactly one package");
	} else {
		const actualFiles = packs[0].files.map((file) => file.path).sort();
		if (JSON.stringify(actualFiles) !== JSON.stringify([...expectedFiles].sort())) {
			failures.push(
				`packed files differ from the reviewed allowlist:\nexpected ${JSON.stringify(expectedFiles)}\nactual   ${JSON.stringify(actualFiles)}`,
			);
		}
	}
} catch (error) {
	failures.push(`npm pack dry run failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length > 0) {
	process.stderr.write(`Release manifest is not ready:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n`);
	process.exit(1);
}

process.stdout.write(`Release manifest is ready for ${packageJson.name}@${packageJson.version}.\n`);
