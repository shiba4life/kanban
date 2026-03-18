process.on("message", (message) => {
	if (!message || typeof message !== "object") {
		return;
	}

	if (message.type !== "kanban.shutdown") {
		return;
	}

	process.emit("SIGINT");
	// The IPC channel is only used to ask the child to shut down. Disconnect it
	// as part of the handshake so the test's control channel cannot outlive the
	// server itself and keep Node 22 CI workers alive after the suite finishes.
	if (typeof process.disconnect === "function") {
		process.disconnect();
	}
});
