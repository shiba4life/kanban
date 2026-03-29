import { useCallback, useEffect, useRef } from "react";

import type { TaskGitAction } from "@/git-actions/build-task-git-action-prompt";
import { findCardSelection } from "@/state/board-state";
import { getTaskWorkspaceSnapshot, subscribeToAnyTaskMetadata } from "@/stores/workspace-metadata-store";
import type { BoardCard, BoardColumnId, BoardData, TaskAutoReviewMode } from "@/types";
import { resolveTaskAutoReviewMode } from "@/types";

const AUTO_REVIEW_ACTION_DELAY_MS = 500;

function isTaskAutoReviewEnabled(task: BoardCard): boolean {
	return task.autoReviewEnabled === true;
}

interface TaskGitActionLoadingStateLike {
	commitSource: string | null;
	prSource: string | null;
}

interface RequestMoveTaskToTrashOptions {
	skipWorkingChangeWarning?: boolean;
}

interface UseReviewAutoActionsOptions {
	board: BoardData;
	taskGitActionLoadingByTaskId: Record<string, TaskGitActionLoadingStateLike>;
	runAutoReviewGitAction: (taskId: string, action: TaskGitAction) => Promise<boolean>;
	requestMoveTaskToTrash: (
		taskId: string,
		fromColumnId: BoardColumnId,
		options?: RequestMoveTaskToTrashOptions,
	) => Promise<void>;
	resetKey?: string | null;
}

export function useReviewAutoActions({
	board,
	taskGitActionLoadingByTaskId,
	runAutoReviewGitAction,
	requestMoveTaskToTrash,
	resetKey,
}: UseReviewAutoActionsOptions): void {
	const boardRef = useRef<BoardData>(board);
	const runAutoReviewGitActionRef = useRef(runAutoReviewGitAction);
	const requestMoveTaskToTrashRef = useRef(requestMoveTaskToTrash);
	const awaitingCleanActionByTaskIdRef = useRef<Record<string, TaskGitAction>>({});
	const timerByTaskIdRef = useRef<Record<string, number>>({});
	const scheduledActionByTaskIdRef = useRef<Record<string, TaskAutoReviewMode>>({});
	const moveToTrashInFlightTaskIdsRef = useRef<Set<string>>(new Set());
	// Tracks pr_merge phase: "creating_pr" after initial PR action, "monitoring" after PR is created
	const prMergePhaseByTaskIdRef = useRef<Record<string, "creating_pr" | "monitoring">>({});

	useEffect(() => {
		boardRef.current = board;
	}, [board]);

	useEffect(() => {
		runAutoReviewGitActionRef.current = runAutoReviewGitAction;
	}, [runAutoReviewGitAction]);

	useEffect(() => {
		requestMoveTaskToTrashRef.current = requestMoveTaskToTrash;
	}, [requestMoveTaskToTrash]);

	const clearAutoReviewTimer = useCallback((taskId: string) => {
		const timer = timerByTaskIdRef.current[taskId];
		if (typeof timer === "number") {
			window.clearTimeout(timer);
		}
		delete timerByTaskIdRef.current[taskId];
		delete scheduledActionByTaskIdRef.current[taskId];
	}, []);

	const clearAllAutoReviewState = useCallback(() => {
		for (const timer of Object.values(timerByTaskIdRef.current)) {
			window.clearTimeout(timer);
		}
		awaitingCleanActionByTaskIdRef.current = {};
		timerByTaskIdRef.current = {};
		scheduledActionByTaskIdRef.current = {};
		moveToTrashInFlightTaskIdsRef.current.clear();
		prMergePhaseByTaskIdRef.current = {};
	}, []);

	const scheduleAutoReviewAction = useCallback((taskId: string, action: TaskAutoReviewMode, execute: () => void) => {
		const existingTimer = timerByTaskIdRef.current[taskId];
		const existingAction = scheduledActionByTaskIdRef.current[taskId];
		if (typeof existingTimer === "number" && existingAction === action) {
			return;
		}
		if (typeof existingTimer === "number") {
			window.clearTimeout(existingTimer);
		}
		scheduledActionByTaskIdRef.current[taskId] = action;
		timerByTaskIdRef.current[taskId] = window.setTimeout(() => {
			delete timerByTaskIdRef.current[taskId];
			delete scheduledActionByTaskIdRef.current[taskId];
			execute();
		}, AUTO_REVIEW_ACTION_DELAY_MS);
	}, []);

	useEffect(() => {
		return () => {
			clearAllAutoReviewState();
		};
	}, [clearAllAutoReviewState]);

	useEffect(() => {
		clearAllAutoReviewState();
	}, [clearAllAutoReviewState, resetKey]);

	const scheduleTrashAction = useCallback(
		(taskId: string, expectedMode: TaskAutoReviewMode) => {
			scheduleAutoReviewAction(taskId, "move_to_trash", () => {
				const latestSelection = findCardSelection(boardRef.current, taskId);
				if (!latestSelection || latestSelection.column.id !== "review") {
					return;
				}
				if (!isTaskAutoReviewEnabled(latestSelection.card)) {
					return;
				}
				const latestMode = resolveTaskAutoReviewMode(latestSelection.card.autoReviewMode);
				if (latestMode !== expectedMode) {
					return;
				}
				moveToTrashInFlightTaskIdsRef.current.add(taskId);
				void requestMoveTaskToTrashRef
					.current(taskId, "review", {
						skipWorkingChangeWarning: true,
					})
					.finally(() => {
						delete awaitingCleanActionByTaskIdRef.current[taskId];
						moveToTrashInFlightTaskIdsRef.current.delete(taskId);
					});
			});
		},
		[scheduleAutoReviewAction],
	);

	const evaluateAutoReview = useCallback(
		(_trigger: { source: string; taskId?: string }) => {
			const columnByTaskId = new Map<string, BoardColumnId>();
			const reviewCardsForAutomation: BoardCard[] = [];
			for (const column of boardRef.current.columns) {
				for (const card of column.cards) {
					columnByTaskId.set(card.id, column.id);
					if (column.id === "review") {
						reviewCardsForAutomation.push(card);
					}
				}
			}

			for (const taskId of Object.keys(awaitingCleanActionByTaskIdRef.current)) {
				const columnId = columnByTaskId.get(taskId);
				if (!columnId || columnId === "trash") {
					delete awaitingCleanActionByTaskIdRef.current[taskId];
					clearAutoReviewTimer(taskId);
					moveToTrashInFlightTaskIdsRef.current.delete(taskId);
					delete prMergePhaseByTaskIdRef.current[taskId];
				}
			}

			for (const taskId of moveToTrashInFlightTaskIdsRef.current) {
				if (columnByTaskId.get(taskId) !== "review") {
					moveToTrashInFlightTaskIdsRef.current.delete(taskId);
				}
			}

			// Clean up pr_merge phase for tasks no longer in review
			for (const taskId of Object.keys(prMergePhaseByTaskIdRef.current)) {
				if (columnByTaskId.get(taskId) !== "review") {
					delete prMergePhaseByTaskIdRef.current[taskId];
				}
			}

			const reviewTaskIds = new Set(reviewCardsForAutomation.map((card) => card.id));
			for (const taskId of Object.keys(timerByTaskIdRef.current)) {
				if (!reviewTaskIds.has(taskId)) {
					clearAutoReviewTimer(taskId);
				}
			}

			for (const reviewTask of reviewCardsForAutomation) {
				const autoReviewEnabled = isTaskAutoReviewEnabled(reviewTask);
				if (!autoReviewEnabled) {
					delete awaitingCleanActionByTaskIdRef.current[reviewTask.id];
					delete prMergePhaseByTaskIdRef.current[reviewTask.id];
					clearAutoReviewTimer(reviewTask.id);
					continue;
				}

				const autoReviewMode = resolveTaskAutoReviewMode(reviewTask.autoReviewMode);
				const loadingState = taskGitActionLoadingByTaskId[reviewTask.id];
				const isGitActionInFlight =
					autoReviewMode === "commit"
						? loadingState?.commitSource !== null && loadingState?.commitSource !== undefined
						: autoReviewMode === "pr" || autoReviewMode === "pr_merge"
							? loadingState?.prSource !== null && loadingState?.prSource !== undefined
							: false;

				if (autoReviewMode === "move_to_trash") {
					if (moveToTrashInFlightTaskIdsRef.current.has(reviewTask.id)) {
						continue;
					}
					scheduleAutoReviewAction(reviewTask.id, "move_to_trash", () => {
						const latestSelection = findCardSelection(boardRef.current, reviewTask.id);
						if (!latestSelection || latestSelection.column.id !== "review") {
							return;
						}
						if (!isTaskAutoReviewEnabled(latestSelection.card)) {
							return;
						}
						if (resolveTaskAutoReviewMode(latestSelection.card.autoReviewMode) !== "move_to_trash") {
							return;
						}
						delete awaitingCleanActionByTaskIdRef.current[reviewTask.id];
						moveToTrashInFlightTaskIdsRef.current.add(reviewTask.id);
						void requestMoveTaskToTrashRef
							.current(reviewTask.id, "review", {
								skipWorkingChangeWarning: true,
							})
							.finally(() => {
								moveToTrashInFlightTaskIdsRef.current.delete(reviewTask.id);
							});
					});
					continue;
				}

				// Commit/PR/PR-merge automation mental model:
				// - A task is only "armed" for auto-trash after we actually see working changes in review and trigger commit/pr.
				// - Review entries with zero changes (common during start-in-plan-mode planning loops) are intentionally ignored.
				// - Once armed, a later review state with zero changes is treated as commit/pr success.
				// - For commit/pr modes: auto-move to trash immediately.
				// - For pr_merge mode: after PR is created (changedFiles === 0), send a monitoring prompt instead of trashing.
				//   The agent monitors the PR, fixes CI/merge issues, and only when the agent returns to review again
				//   with changedFiles === 0 while in monitoring phase, we auto-trash (PR is merged).
				const changedFiles = getTaskWorkspaceSnapshot(reviewTask.id)?.changedFiles;
				const awaitingAction = awaitingCleanActionByTaskIdRef.current[reviewTask.id] ?? null;
				const prMergePhase = prMergePhaseByTaskIdRef.current[reviewTask.id] ?? null;

				if (awaitingAction) {
					if (
						changedFiles === 0 &&
						!isGitActionInFlight &&
						!moveToTrashInFlightTaskIdsRef.current.has(reviewTask.id)
					) {
						if (autoReviewMode === "pr_merge" && prMergePhase === "creating_pr") {
							// PR was just created (changedFiles went to 0). Send monitoring prompt instead of trashing.
							prMergePhaseByTaskIdRef.current[reviewTask.id] = "monitoring";
							delete awaitingCleanActionByTaskIdRef.current[reviewTask.id];
							clearAutoReviewTimer(reviewTask.id);
							scheduleAutoReviewAction(reviewTask.id, "pr_merge", () => {
								const latestSelection = findCardSelection(boardRef.current, reviewTask.id);
								if (!latestSelection || latestSelection.column.id !== "review") {
									return;
								}
								if (!isTaskAutoReviewEnabled(latestSelection.card)) {
									return;
								}
								const latestMode = resolveTaskAutoReviewMode(latestSelection.card.autoReviewMode);
								if (latestMode !== "pr_merge") {
									return;
								}
								void runAutoReviewGitActionRef.current(reviewTask.id, "pr_monitor");
							});
						} else if (autoReviewMode === "pr_merge" && prMergePhase === "monitoring") {
							// Agent returned from monitoring with changedFiles === 0 → PR is merged. Auto-trash.
							delete prMergePhaseByTaskIdRef.current[reviewTask.id];
							scheduleTrashAction(reviewTask.id, "pr_merge");
						} else {
							// commit or pr mode: auto-trash as before
							scheduleTrashAction(reviewTask.id, autoReviewMode);
						}
					} else if (autoReviewMode === "pr_merge" && prMergePhase === "monitoring" && (changedFiles ?? 0) > 0) {
						// Agent fixed something during monitoring (changedFiles > 0). Commit the fixes then re-monitor.
						delete awaitingCleanActionByTaskIdRef.current[reviewTask.id];
						clearAutoReviewTimer(reviewTask.id);
						awaitingCleanActionByTaskIdRef.current[reviewTask.id] = "commit";
						void runAutoReviewGitActionRef.current(reviewTask.id, "commit").then((triggered) => {
							if (!triggered && awaitingCleanActionByTaskIdRef.current[reviewTask.id] === "commit") {
								delete awaitingCleanActionByTaskIdRef.current[reviewTask.id];
							}
						});
					} else {
						clearAutoReviewTimer(reviewTask.id);
					}
					continue;
				}

				// pr_merge monitoring phase: agent returned to review with no awaiting action.
				if (autoReviewMode === "pr_merge" && prMergePhase === "monitoring") {
					if ((changedFiles ?? 0) > 0 && !isGitActionInFlight) {
						// Agent made fixes, commit them
						awaitingCleanActionByTaskIdRef.current[reviewTask.id] = "commit";
						void runAutoReviewGitActionRef.current(reviewTask.id, "commit").then((triggered) => {
							if (!triggered && awaitingCleanActionByTaskIdRef.current[reviewTask.id] === "commit") {
								delete awaitingCleanActionByTaskIdRef.current[reviewTask.id];
							}
						});
					} else if (changedFiles === 0 && !isGitActionInFlight) {
						// No changes + monitoring phase → PR is merged. Trash it.
						delete prMergePhaseByTaskIdRef.current[reviewTask.id];
						scheduleTrashAction(reviewTask.id, "pr_merge");
					} else {
						// Send monitoring prompt to check PR status again
						scheduleAutoReviewAction(reviewTask.id, "pr_merge", () => {
							void runAutoReviewGitActionRef.current(reviewTask.id, "pr_monitor");
						});
					}
					continue;
				}

				if ((changedFiles ?? 0) <= 0 || isGitActionInFlight) {
					clearAutoReviewTimer(reviewTask.id);
					continue;
				}

				// Initial trigger: changedFiles > 0, start the git action.
				// For pr_merge, use "pr" action for initial PR creation.
				const initialAction: TaskGitAction = autoReviewMode === "pr_merge" ? "pr" : autoReviewMode;
				scheduleAutoReviewAction(reviewTask.id, autoReviewMode, () => {
					const latestSelection = findCardSelection(boardRef.current, reviewTask.id);
					if (!latestSelection || latestSelection.column.id !== "review") {
						return;
					}
					if (!isTaskAutoReviewEnabled(latestSelection.card)) {
						return;
					}
					const latestMode = resolveTaskAutoReviewMode(latestSelection.card.autoReviewMode);
					if (latestMode !== autoReviewMode) {
						return;
					}
					if (autoReviewMode === "pr_merge") {
						prMergePhaseByTaskIdRef.current[reviewTask.id] = "creating_pr";
					}
					awaitingCleanActionByTaskIdRef.current[reviewTask.id] = initialAction;
					void runAutoReviewGitActionRef.current(reviewTask.id, initialAction).then((triggered) => {
						if (!triggered && awaitingCleanActionByTaskIdRef.current[reviewTask.id] === initialAction) {
							delete awaitingCleanActionByTaskIdRef.current[reviewTask.id];
							if (autoReviewMode === "pr_merge") {
								delete prMergePhaseByTaskIdRef.current[reviewTask.id];
							}
						}
					});
				});
			}
		},
		[clearAutoReviewTimer, scheduleAutoReviewAction, scheduleTrashAction, taskGitActionLoadingByTaskId],
	);

	useEffect(() => {
		evaluateAutoReview({
			source: "board_or_loading_change",
		});
	}, [board, evaluateAutoReview, taskGitActionLoadingByTaskId]);

	useEffect(() => {
		return subscribeToAnyTaskMetadata((taskId) => {
			const selection = findCardSelection(boardRef.current, taskId);
			if (!selection || selection.column.id !== "review") {
				return;
			}
			evaluateAutoReview({
				source: "task_metadata_store",
				taskId,
			});
		});
	}, [evaluateAutoReview]);
}
