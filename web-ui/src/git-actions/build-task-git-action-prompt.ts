import type { RuntimeTaskAutoReviewMode, RuntimeTaskWorkspaceInfoResponse } from "@/runtime/types";

export type TaskGitAction = Extract<RuntimeTaskAutoReviewMode, "commit" | "pr"> | "pr_monitor";

interface TaskGitPromptVariable {
	key: string;
	token: string;
	description: string;
}

export const TASK_GIT_BASE_REF_PROMPT_VARIABLE: TaskGitPromptVariable = {
	key: "base_ref",
	token: "{{base_ref}}",
	description: "the branch this task worktree was created from",
};

export interface TaskGitPromptTemplates {
	commitPromptTemplate?: string | null;
	openPrPromptTemplate?: string | null;
	commitPromptTemplateDefault?: string | null;
	openPrPromptTemplateDefault?: string | null;
}

interface BuildTaskGitActionPromptInput {
	action: TaskGitAction;
	workspaceInfo: RuntimeTaskWorkspaceInfoResponse;
	templates?: TaskGitPromptTemplates | null;
}

function resolveTemplate(action: TaskGitAction, templates?: TaskGitPromptTemplates | null): string {
	if (action === "commit") {
		const template = templates?.commitPromptTemplate?.trim();
		if (template) {
			return template;
		}
		const defaultTemplate = templates?.commitPromptTemplateDefault?.trim();
		if (defaultTemplate) {
			return defaultTemplate;
		}
		return "Handle this commit action using the provided git context.";
	}
	if (action === "pr_monitor") {
		return `You previously created a pull request for this branch. Now monitor it until it is merged.

Check the PR status using: gh pr view --json state,mergeable,statusCheckRollup

Based on what you find:
- If the PR is MERGED: you are done, stop working.
- If CI checks are failing: investigate the failures, fix the code, commit, and push the fixes. Then check the PR status again.
- If there are merge conflicts: rebase your branch against {{base_ref}}, resolve conflicts, and force-push. Then check the PR status again.
- If the PR is OPEN and all checks pass: wait 30 seconds, then check the status again. Repeat until merged.
- If the PR is CLOSED (not merged): stop working and report the issue.

Keep monitoring until the PR reaches a terminal state (merged or closed).`;
	}
	const template = templates?.openPrPromptTemplate?.trim();
	if (template) {
		return template;
	}
	const defaultTemplate = templates?.openPrPromptTemplateDefault?.trim();
	if (defaultTemplate) {
		return defaultTemplate;
	}
	return "Handle this pull request action using the provided git context.";
}

function interpolateTemplate(template: string, variables: Record<string, string>): string {
	let result = template;
	for (const [key, value] of Object.entries(variables)) {
		result = result.replaceAll(`{{${key}}}`, value);
	}
	return result;
}

export function buildTaskGitActionPrompt(input: BuildTaskGitActionPromptInput): string {
	const variables: Record<string, string> = {
		[TASK_GIT_BASE_REF_PROMPT_VARIABLE.key]: input.workspaceInfo.baseRef,
	};
	const template = resolveTemplate(input.action, input.templates);
	return interpolateTemplate(template, variables);
}
