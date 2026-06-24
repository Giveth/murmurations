// @vitest-environment jsdom
// Regression: directions in a round render sorted by score (live tally)
// descending, not in first-come insertion order. Isolated file because
// app.jsx keeps module-level state that leaks between sequential renders.
import { it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";

vi.mock("wagmi", () => ({
  useConnect: () => ({ connectors: [], connect: vi.fn() }),
  useReadContract: () => ({ data: undefined }),
  useReadContracts: () => ({ data: undefined }),
  useWalletClient: () => ({ data: { signTypedData: vi.fn(async () => "0xsig") } }),
}));
vi.mock("../../src/votingApi", () => ({
  fetchProposals: vi.fn(async () => []),
  fetchProposal: vi.fn(async () => ({ proposal: {}, tally: {}, voterCount: 0 })),
  fetchBallots: vi.fn(async () => []),
  castVote: vi.fn(), createProposal: vi.fn(), deleteOption: vi.fn(),
  deleteProposal: vi.fn(), addOption: vi.fn(), fetchGithubPreview: vi.fn(),
}));

import { F2App } from "../../src/app.jsx";
import * as votingApi from "../../src/votingApi";

const ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const props = {
  role: "badgeholder", address: ADDR, isIncognito: false, isPublicBadgeholder: true,
  isBadgeholder: true, onDisconnect: vi.fn(), onConnectClick: vi.fn(),
  tokens: [{ id: "tok-buidler", address: "0x32d6", chain: "Arbitrum One", symbol: "TDSB", name: "BUIDLER", kind: "ERC-721" }],
  setTokens: vi.fn(),
};
const sp = (o: any = {}) => ({
  id: "r-1", title: "T", description: "", votingMode: "quadratic", budget: 100,
  // Insertion order: Alice (id 1) first, Bob (id 2) second.
  options: [{ id: 1, label: "Alice" }, { id: 2, label: "Bob" }],
  deadline: new Date(Date.now() + 86400000).toISOString(), opensAt: null,
  tokenAddress: null, tokenChainId: null, tokenId: "tok-buidler",
  createdAt: new Date().toISOString(), createdBy: ADDR, deletedOptionIds: [], ...o,
});

beforeEach(() => { cleanup(); });

it("orders directions by score (highest first), not insertion order", async () => {
  const p = sp({ id: "r-sort", title: "Sort round" });
  (votingApi.fetchProposals as any).mockResolvedValue([p]);
  // Bob (id 2) leads with 10 points; Alice (id 1) trails with 1.
  (votingApi.fetchProposal as any).mockResolvedValue({ proposal: p, tally: { 1: 1, 2: 10 }, voterCount: 2 });
  render(<F2App {...props} />);
  fireEvent.click(await screen.findByText("Sort round"));

  await waitFor(() => {
    const alice = screen.getByText("Alice");
    const bob = screen.getByText("Bob");
    // Bob (score 10) must appear before Alice (score 1) in the DOM.
    const bobBeforeAlice = bob.compareDocumentPosition(alice) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(bobBeforeAlice).toBeTruthy();
  });
});
