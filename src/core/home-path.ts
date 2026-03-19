import { homedir } from "node:os";

export function getUserHomePath(env: NodeJS.ProcessEnv = process.env): string {
	const home = env.HOME?.trim() || env.USERPROFILE?.trim();
	return home || homedir();
}
