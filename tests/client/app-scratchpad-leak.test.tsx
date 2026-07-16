// @vitest-environment jsdom
// Regression for the 2026-07-15 scratchpad leak (Griff): option ids are
// per-round (1,2,3…) and collide across rounds. The allocations scratchpad
// lives in F2App, but its reset-on-round-change lived in F2RoundDetail as a
// useRef comparison — which never fires on the unmount/remount path
// (round A → votes list → round B). Draft slider values from round A then
// appeared pre-set on round B's same-id options. The reset must live in
// F2App, next to the state it guards. Isolated file due to app.jsx
// module-level state.
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
  // Colliding option ids — every round numbers its options 1, 2, 3…
  options: [{ id: 1, label: "Alice" }],
  deadline: new Date(Date.now() + 86400000).toISOString(), opensAt: null,
  tokenAddress: null, tokenChainId: null, tokenId: "tok-buidler",
  createdAt: new Date().toISOString(), createdBy: ADDR, deletedOptionIds: [], ...o,
});

beforeEach(() => {
  cleanup();
  window.history.pushState({}, "", "/votes");
});

it("does not leak draft sliders onto another round's same-id options (list navigation)", async () => {
  const rA = sp({ id: "r-a", title: "Alpha round", options: [{ id: 1, label: "Alpha" }] });
  const rB = sp({ id: "r-b", title: "Beta round", options: [{ id: 1, label: "Beta" }] });
  (votingApi.fetchProposals as any).mockResolvedValue([rA, rB]);
  (votingApi.fetchProposal as any).mockImplementation(async (id: string) => ({
    proposal: id === "r-a" ? rA : rB, tally: {}, voterCount: 0,
  }));
  render(<F2App {...props} />);

  // Open round A, drag its option to 3 pts (draft only — never signed).
  fireEvent.click(await screen.findByText("Alpha round"));
  await screen.findByText("Directions");
  fireEvent.click(screen.getByText("Alpha"));
  const slider = await screen.findByRole("slider");
  fireEvent.change(slider, { target: { value: "3" } });
  fireEvent.click(screen.getByText(/Back/i));
  await screen.findByText("Directions");
  expect(screen.getByText(/9 \/ 100 used/)).toBeInTheDocument(); // 3 pts QV = 9 credits

  // Out to the votes list via the top nav, open round B (option ALSO id 1).
  fireEvent.click(screen.getByText("Murmurations"));
  await screen.findByText("Beta round");
  fireEvent.click(screen.getByText("Beta round"));
  await screen.findByText("Directions");

  // Round B must start clean: no inherited 3-pt draft on its option 1.
  await waitFor(() => {
    expect(screen.getByText(/0 \/ 100 used/)).toBeInTheDocument();
  });
  expect(screen.queryByText(/3 pts/)).toBeNull();
});

it("keeps a round's own draft when the user leaves to the list and comes back", async () => {
  const rA = sp({ id: "r-a2", title: "Alpha round", options: [{ id: 1, label: "Alpha" }] });
  (votingApi.fetchProposals as any).mockResolvedValue([rA]);
  (votingApi.fetchProposal as any).mockResolvedValue({ proposal: rA, tally: {}, voterCount: 0 });
  render(<F2App {...props} />);

  fireEvent.click(await screen.findByText("Alpha round"));
  await screen.findByText("Directions");
  fireEvent.click(screen.getByText("Alpha"));
  const slider = await screen.findByRole("slider");
  fireEvent.change(slider, { target: { value: "3" } });
  fireEvent.click(screen.getByText(/Back/i));
  await screen.findByText("Directions");

  // list → same round again: the draft survives.
  fireEvent.click(screen.getByText("Murmurations"));
  await screen.findByText("Alpha round");
  fireEvent.click(screen.getByText("Alpha round"));
  await screen.findByText("Directions");
  await waitFor(() => {
    expect(screen.getByText(/9 \/ 100 used/)).toBeInTheDocument();
  });
});
