import type { ChildProcess } from "node:child_process";

function isStreamClosed(stream: NodeJS.ReadableStream | null | undefined): boolean {
	if (!stream) {
		return true;
	}
	const readable = stream as NodeJS.ReadableStream & {
		closed?: boolean;
		destroyed?: boolean;
		readableEnded?: boolean;
	};
	return Boolean(readable.closed || readable.destroyed || readable.readableEnded);
}

export async function waitForChildProcessClose(childProcess: ChildProcess, timeoutMs: number): Promise<boolean> {
	if (childProcess.exitCode !== null && isStreamClosed(childProcess.stdout) && isStreamClosed(childProcess.stderr)) {
		return true;
	}

	return await new Promise<boolean>((resolveClose) => {
		let settled = false;

		const finish = (result: boolean) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeoutId);
			childProcess.removeListener("close", handleClose);
			childProcess.removeListener("exit", handleExit);
			resolveClose(result);
		};

		const handleClose = () => {
			finish(true);
		};

		const handleExit = () => {
			setTimeout(() => {
				if (isStreamClosed(childProcess.stdout) && isStreamClosed(childProcess.stderr)) {
					finish(true);
				}
			}, 0);
		};

		const timeoutId = setTimeout(() => {
			finish(false);
		}, timeoutMs);

		childProcess.once("close", handleClose);
		childProcess.once("exit", handleExit);
	});
}

export function unrefChildProcessIpc(childProcess: ChildProcess): void {
	// These integration tests open an IPC channel only to request graceful
	// shutdown from the parent. Once the child installs a `message` handler,
	// Node may keep that channel ref'd, which showed up in CI as Node 22 Vitest
	// workers hanging after all tests had already finished printing. Unref the
	// channel immediately and pair it with explicit `disconnect()` during
	// shutdown so the test transport never becomes the thing that pins process
	// exit.
	const channel = childProcess.channel as { unref?: () => void } | null | undefined;
	channel?.unref?.();
}

export function cleanupChildProcess(childProcess: ChildProcess): void {
	if (typeof childProcess.disconnect === "function" && childProcess.connected) {
		try {
			childProcess.disconnect();
		} catch {
			// Best effort cleanup only.
		}
	}

	const stdout = childProcess.stdout as (NodeJS.ReadableStream & {
		destroy?: () => void;
		removeAllListeners: (event?: string | symbol) => NodeJS.ReadableStream;
	}) | null;
	if (stdout) {
		stdout.removeAllListeners();
		stdout.destroy?.();
	}

	const stderr = childProcess.stderr as (NodeJS.ReadableStream & {
		destroy?: () => void;
		removeAllListeners: (event?: string | symbol) => NodeJS.ReadableStream;
	}) | null;
	if (stderr) {
		stderr.removeAllListeners();
		stderr.destroy?.();
	}

	childProcess.removeAllListeners();
}
