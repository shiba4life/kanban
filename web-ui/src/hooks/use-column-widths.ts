import { useCallback, useRef, useState } from "react";

import { useUnmount, useWindowEvent } from "@/utils/react-use";
import type { BoardColumnId } from "@/types";

const STORAGE_KEY = "kb-column-widths";
const MIN_COLUMN_FRACTION = 0.1;

/**
 * Persisted column width ratios for the kanban board.
 * Values are fractional (e.g. 0.25 = 25% of available width).
 * Null means equal distribution (default).
 */
type ColumnWidths = Record<BoardColumnId, number>;

function defaultWidths(columns: BoardColumnId[]): ColumnWidths {
	const fraction = 1 / columns.length;
	const widths: Partial<ColumnWidths> = {};
	for (const col of columns) {
		widths[col] = fraction;
	}
	return widths as ColumnWidths;
}

function loadWidths(columns: BoardColumnId[]): ColumnWidths {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored) as Partial<ColumnWidths>;
			// Validate: all columns present with finite positive values
			const allPresent = columns.every(
				(c) => typeof parsed[c] === "number" && Number.isFinite(parsed[c]) && parsed[c]! > 0,
			);
			if (allPresent) {
				// Normalize so they sum to 1
				const total = columns.reduce((sum, c) => sum + (parsed[c] ?? 0), 0);
				const widths: Partial<ColumnWidths> = {};
				for (const col of columns) {
					widths[col] = (parsed[col] ?? 0) / total;
				}
				return widths as ColumnWidths;
			}
		}
	} catch {
		// ignore
	}
	return defaultWidths(columns);
}

function saveWidths(widths: ColumnWidths): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
	} catch {
		// ignore
	}
}

interface DragState {
	/** Index of the column to the LEFT of the resize handle */
	leftIndex: number;
	startX: number;
	startLeftFraction: number;
	startRightFraction: number;
}

export interface UseColumnWidthsResult {
	/** Fractional widths keyed by column id */
	widths: ColumnWidths;
	/** Whether a resize drag is in progress */
	isDragging: boolean;
	/** Call on mousedown of the resize handle between columns[index] and columns[index+1] */
	onResizeMouseDown: (leftIndex: number, event: React.MouseEvent) => void;
	/** Reset all columns to equal width */
	resetWidths: () => void;
}

export function useColumnWidths(
	columns: BoardColumnId[],
	containerRef: React.RefObject<HTMLElement | null>,
): UseColumnWidthsResult {
	const [widths, setWidths] = useState<ColumnWidths>(() => loadWidths(columns));
	const [isDragging, setIsDragging] = useState(false);
	const dragStateRef = useRef<DragState | null>(null);
	const previousBodyStyleRef = useRef<{ userSelect: string; cursor: string } | null>(null);
	const columnsRef = useRef(columns);
	columnsRef.current = columns;

	const stopDrag = useCallback(() => {
		setIsDragging(false);
		const prev = previousBodyStyleRef.current;
		if (prev) {
			document.body.style.userSelect = prev.userSelect;
			document.body.style.cursor = prev.cursor;
			previousBodyStyleRef.current = null;
		}
		dragStateRef.current = null;
	}, []);

	useUnmount(() => {
		stopDrag();
	});

	const handleMouseMove = useCallback(
		(event: MouseEvent) => {
			if (!isDragging) {
				return;
			}
			const dragState = dragStateRef.current;
			const container = containerRef.current;
			if (!dragState || !container) {
				return;
			}
			const containerWidth = container.getBoundingClientRect().width;
			// Account for gaps: (columns.length - 1) * 8px gap
			const cols = columnsRef.current;
			const totalGap = (cols.length - 1) * 8;
			const usableWidth = containerWidth - totalGap - 16; // 16 = padding (8px each side)
			if (usableWidth <= 0) {
				return;
			}

			const deltaX = event.clientX - dragState.startX;
			const deltaFraction = deltaX / usableWidth;

			const combinedFraction = dragState.startLeftFraction + dragState.startRightFraction;
			let newLeft = dragState.startLeftFraction + deltaFraction;
			let newRight = dragState.startRightFraction - deltaFraction;

			// Enforce minimums
			if (newLeft < MIN_COLUMN_FRACTION) {
				newLeft = MIN_COLUMN_FRACTION;
				newRight = combinedFraction - MIN_COLUMN_FRACTION;
			}
			if (newRight < MIN_COLUMN_FRACTION) {
				newRight = MIN_COLUMN_FRACTION;
				newLeft = combinedFraction - MIN_COLUMN_FRACTION;
			}

			setWidths((prev) => {
				const next = { ...prev };
				next[cols[dragState.leftIndex]!] = newLeft;
				next[cols[dragState.leftIndex + 1]!] = newRight;
				saveWidths(next);
				return next;
			});
		},
		[isDragging, containerRef],
	);

	const handleMouseUp = useCallback(() => {
		if (!isDragging) {
			return;
		}
		stopDrag();
	}, [isDragging, stopDrag]);

	useWindowEvent("mousemove", isDragging ? handleMouseMove : null);
	useWindowEvent("mouseup", isDragging ? handleMouseUp : null);

	const onResizeMouseDown = useCallback(
		(leftIndex: number, event: React.MouseEvent) => {
			event.preventDefault();
			if (isDragging) {
				stopDrag();
			}
			const cols = columnsRef.current;
			const leftCol = cols[leftIndex];
			const rightCol = cols[leftIndex + 1];
			if (!leftCol || !rightCol) {
				return;
			}
			dragStateRef.current = {
				leftIndex,
				startX: event.clientX,
				startLeftFraction: widths[leftCol],
				startRightFraction: widths[rightCol],
			};
			setIsDragging(true);
			previousBodyStyleRef.current = {
				userSelect: document.body.style.userSelect,
				cursor: document.body.style.cursor,
			};
			document.body.style.userSelect = "none";
			document.body.style.cursor = "ew-resize";
		},
		[widths, isDragging, stopDrag],
	);

	const resetWidths = useCallback(() => {
		const defaults = defaultWidths(columnsRef.current);
		setWidths(defaults);
		saveWidths(defaults);
	}, []);

	return { widths, isDragging, onResizeMouseDown, resetWidths };
}
