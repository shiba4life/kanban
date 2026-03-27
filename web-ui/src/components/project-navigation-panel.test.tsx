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
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={"claude" as never}
					clineProviderSettings={authenticatedClineSettings}
				/>,
			);
		});
		expect(container.innerHTML).toBe("");
	});

	it("renders nothing when selectedAgentId is null", () => {
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={null}
					clineProviderSettings={authenticatedClineSettings}
				/>,
			);
		});
		expect(container.innerHTML).toBe("");
	});

	// 2. Cline runtime + no Cline OAuth => renders nothing (no CTA)
	it("renders nothing when not authenticated (no sign-in CTA)", () => {
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={"cline"}
					clineProviderSettings={defaultClineProviderSettings}
				/>,
			);
		});
		expect(container.innerHTML).toBe("");
	});

	it("renders nothing when clineProviderSettings is null", () => {
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={"cline"}
					clineProviderSettings={null}
				/>,
			);
		});
		expect(container.innerHTML).toBe("");
	});

	// 3. Cline runtime + non-Cline provider auth => renders nothing
	it("renders nothing when tokens present but oauthProvider is not cline", () => {
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={"cline"}
					clineProviderSettings={tokensOnlySettings}
				/>,
			);
		});
		expect(container.innerHTML).toBe("");
	});

	// 4. Cline runtime + authenticated Cline OAuth => shows Share Feedback
	//    regardless of Featurebase pre-auth state
	it("renders Share Feedback when authenticated, Featurebase ready", () => {
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
	});

	it("renders Share Feedback when authenticated, Featurebase loading", () => {
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
		expect(getFeedbackButton()).toBeTruthy();
	});

	it("renders Share Feedback when authenticated, Featurebase error", () => {
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
		expect(getFeedbackButton()).toBeTruthy();
	});

	it("renders Share Feedback when authenticated, featurebaseFeedbackState undefined", () => {
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={"cline"}
					clineProviderSettings={authenticatedClineSettings}
				/>,
			);
		});
		expect(getFeedbackButton()).toBeTruthy();
	});

	// 5. Regression: button always has data-featurebase-feedback
	it("renders data-featurebase-feedback attribute on the Share Feedback button (regression)", () => {
		act(() => {
			root.render(
				<FeedbackCard
					selectedAgentId={"cline"}
					clineProviderSettings={authenticatedClineSettings}
				/>,
			);
		});
		const button = getFeedbackButton();
		expect(button).toBeTruthy();
		expect(button!.hasAttribute("data-featurebase-feedback")).toBe(true);
	});
});
