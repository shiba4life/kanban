import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeClineProviderSettings } from "@/runtime/types";
import type { FeaturebaseFeedbackState } from "@/hooks/use-featurebase-feedback-widget";

import { FeedbackCard } from "./project-navigation-panel";

const defaultClineProviderSettings: RuntimeClineProviderSettings = {
	providerId: null,
	modelId: null,
	baseUrl: null,
	apiKeyConfigured: false,
	oauthProvider: null,
	oauthAccessTokenConfigured: false,
	oauthRefreshTokenConfigured: false,
	oauthAccountId: null,
	oauthExpiresAt: null,
};

const authenticatedClineSettings: RuntimeClineProviderSettings = {
	...defaultClineProviderSettings,
	oauthProvider: "cline",
	oauthAccessTokenConfigured: true,
	oauthRefreshTokenConfigured: true,
	oauthAccountId: "acc-1",
};

const tokensOnlySettings: RuntimeClineProviderSettings = {
	...defaultClineProviderSettings,
	oauthProvider: null,
	oauthAccessTokenConfigured: true,
	oauthRefreshTokenConfigured: true,
};

describe("FeedbackCard", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
	});

	function getFeedbackButton(): HTMLButtonElement | null {
		const buttons = container.querySelectorAll("button");
		for (const btn of buttons) {
			if (btn.textContent?.includes("Share Feedback")) {
				return btn;
			}
		}
		return null;
	}

	// 1. Non-Cline agent => renders nothing
	it("renders nothing when selected agent is not Cline", () => {
		const fbState: FeaturebaseFeedbackState = { authState: "ready", retry: vi.fn() };
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={"claude" as never}
					clineProviderSettings={authenticatedClineSettings}
					featurebaseFeedbackState={fbState}
				/>,
			);
		});
		expect(container.innerHTML).toBe("");
	});

	// 2. Cline runtime + unauthenticated => renders nothing
	it("renders nothing when not authenticated", () => {
		const fbState: FeaturebaseFeedbackState = { authState: "ready", retry: vi.fn() };
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={"cline"}
					clineProviderSettings={defaultClineProviderSettings}
					featurebaseFeedbackState={fbState}
				/>,
			);
		});
		expect(container.innerHTML).toBe("");
	});

	// 3. Cline runtime + non-Cline provider/tokens => renders nothing
	it("renders nothing when tokens present but oauthProvider is not cline", () => {
		const fbState: FeaturebaseFeedbackState = { authState: "ready", retry: vi.fn() };
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={"cline"}
					clineProviderSettings={tokensOnlySettings}
					featurebaseFeedbackState={fbState}
				/>,
			);
		});
		expect(container.innerHTML).toBe("");
	});

	// 4. Authenticated Cline OAuth + authState: "idle" => renders nothing
	it("renders nothing when Featurebase is idle", () => {
		const fbState: FeaturebaseFeedbackState = { authState: "idle", retry: vi.fn() };
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={"cline"}
					clineProviderSettings={authenticatedClineSettings}
					featurebaseFeedbackState={fbState}
				/>,
			);
		});
		expect(container.innerHTML).toBe("");
	});

	// 5. Authenticated Cline OAuth + authState: "loading" => renders nothing
	it("renders nothing when Featurebase is loading", () => {
		const fbState: FeaturebaseFeedbackState = { authState: "loading", retry: vi.fn() };
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={"cline"}
					clineProviderSettings={authenticatedClineSettings}
					featurebaseFeedbackState={fbState}
				/>,
			);
		});
		expect(container.innerHTML).toBe("");
	});

	// 6. Authenticated Cline OAuth + authState: "error" => renders nothing
	it("renders nothing when Featurebase has error", () => {
		const fbState: FeaturebaseFeedbackState = { authState: "error", retry: vi.fn() };
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={"cline"}
					clineProviderSettings={authenticatedClineSettings}
					featurebaseFeedbackState={fbState}
				/>,
			);
		});
		expect(container.innerHTML).toBe("");
	});

	// 7. Authenticated Cline OAuth + authState: "ready" => renders enabled Share Feedback
	it("renders enabled Share Feedback when fully authenticated and Featurebase is ready", () => {
		const fbState: FeaturebaseFeedbackState = { authState: "ready", retry: vi.fn() };
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={"cline"}
					clineProviderSettings={authenticatedClineSettings}
					featurebaseFeedbackState={fbState}
				/>,
			);
		});
		const button = getFeedbackButton();
		expect(button).toBeTruthy();
		expect(button!.disabled).toBe(false);
		expect(button!.textContent).toContain("Share Feedback");
	});

	// 8. Regression: ready-state button has data-featurebase-feedback
	it("renders data-featurebase-feedback attribute on the Share Feedback button (regression)", () => {
		const fbState: FeaturebaseFeedbackState = { authState: "ready", retry: vi.fn() };
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={"cline"}
					clineProviderSettings={authenticatedClineSettings}
					featurebaseFeedbackState={fbState}
				/>,
			);
		});
		const button = getFeedbackButton();
		expect(button).toBeTruthy();
		expect(button!.hasAttribute("data-featurebase-feedback")).toBe(true);
	});

	// Edge: featurebaseFeedbackState undefined => defaults to idle => renders nothing
	it("renders nothing when featurebaseFeedbackState is undefined", () => {
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={"cline"}
					clineProviderSettings={authenticatedClineSettings}
				/>,
			);
		});
		expect(container.innerHTML).toBe("");
	});
});
