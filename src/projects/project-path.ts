import { resolve } from "node:path";

import { getUserHomePath } from "../core/home-path.js";

export function resolveProjectInputPath(inputPath: string, cwd: string): string {
	if (inputPath === "~") {
		return getUserHomePath();
	}
	if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
		return resolve(getUserHomePath(), inputPath.slice(2));
	}
	return resolve(cwd, inputPath);
}
