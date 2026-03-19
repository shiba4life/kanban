import { defineConfig } from "vitest/config";
import vitestNode22CiReporter from "./test/vitest-node22-ci-reporter.js";

process.env.NODE_ENV = "production";

function currentNodeMajorVersion(): number | null {
	const majorVersion = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
	return Number.isFinite(majorVersion) ? majorVersion : null;
}

function shouldSerializeNode22CiFiles(): boolean {
	if (!process.env.CI) {
		return false;
	}

	const majorVersion = currentNodeMajorVersion();
	return majorVersion !== null && majorVersion >= 22;
}

function resolveCiPool(): "forks" | "threads" {
	return shouldSerializeNode22CiFiles() ? "threads" : "forks";
}

export default defineConfig({
	resolve: {
		alias: [
			{
				find: /^@clinebot\/agents$/,
				replacement: "@clinebot/agents/node",
			},
			{
				find: /^@clinebot\/llms$/,
				replacement: "@clinebot/llms/node",
			},
		],
	},
	test: {
		globals: true,
		environment: "node",
		globalSetup: ["./test/vitest-global-teardown.ts"],
		reporters: ["default", vitestNode22CiReporter],
		// Node 22 CI has shown two separate Vitest worker-pool shutdown failures:
		// `forks` can stall mid-run with a live child process, and successful runs
		// can also finish with a referenced `MessagePort`. Serialize files there
		// and switch to a single `threads` worker to avoid the fork-pool hang while
		// keeping local runs and Node 20 unchanged.
		pool: resolveCiPool(),
		fileParallelism: !shouldSerializeNode22CiFiles(),
		poolOptions: {
			forks: {
				singleFork: false,
			},
			threads: {
				singleThread: shouldSerializeNode22CiFiles(),
			},
		},
		exclude: ["apps/**", "web-ui/**", "third_party/**", "**/node_modules/**", "**/dist/**", ".worktrees/**"],
		testTimeout: 15_000,
	},
});
