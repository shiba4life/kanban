import { useCallback } from "react";

import { cn } from "@/components/ui/cn";

export function ColumnResizeHandle({
	index,
	isDragging,
	onMouseDown,
}: {
	index: number;
	isDragging: boolean;
	onMouseDown: (leftIndex: number, event: React.MouseEvent) => void;
}): React.ReactElement {
	const handleMouseDown = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			onMouseDown(index, event);
		},
		[index, onMouseDown],
	);

	return (
		<div
			role="separator"
			aria-orientation="vertical"
			onMouseDown={handleMouseDown}
			className={cn(
				"relative flex-shrink-0 cursor-ew-resize select-none",
				"before:absolute before:inset-y-0 before:-left-1 before:-right-1 before:z-10",
				isDragging
					? "bg-accent/40"
					: "bg-transparent hover:bg-accent/30",
			)}
			style={{
				width: 3,
				marginLeft: -5.5,
				marginRight: -5.5,
				borderRadius: 2,
				transition: isDragging ? "none" : "background-color 150ms",
			}}
		/>
	);
}
