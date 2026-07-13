import { describe, it, expect, beforeEach, vi } from "vitest";

// Pin the threshold before api.mjs loads (module-scope constant) so the
// promotion test's Monday-schedule assertions always execute regardless of
// the production default (10 as of 2026-07-13, per Zep).
vi.hoisted(() => { process.env.DRAFT_SUPPORT_THRESHOLD = "3"; });
import { makeDraft, makeSupport, makeBallot, voterAccount, strangerAccount, adminAccount, pastDeadline } from "../helpers";

vi.mock("../../server/db.mjs", () => {
  let proposals: Record<string, any> = {};
  let ballots: Record<string, any> = {};
  return {
    pool: { query: vi.fn(async () => ({ rows: [] })), end: vi.fn() },
    bootstrap: vi.fn(async () => {}),
    loadProposals: vi.fn(async () => structuredClone(proposals)),
    saveProposals: vi.fn(async (m: any) => { proposals = structuredClone(m); }),
    loadBallots: vi.fn(async () => structuredClone(ballots)),
    saveBallots: vi.fn(async (m: any) => { ballots = structuredClone(m); }),
    __reset: () => { proposals = {}; ballots = {}; },
    __seedProposals: (p: any) => { proposals = structuredClone(p); },
    __getProposals: () => structuredClone(proposals),
  };
});
vi.mock("viem", async (orig) => {
  const actual: any = await orig();
  return {
    ...actual,
    createPublicClient: () => ({ readContract: async () => (globalThis as any).__BADGE_BALANCE ?? 0n }),
    createWalletClient: () => ({ writeContract: async () => "0x0" }),
  };
});

import { app } from "../../server/api.mjs";
import * as db from "../../server/db.mjs";

const setBadge = (b: bigint) => { (globalThis as any).__BADGE_BALANCE = b; };
const createDraft = (body: any) => app.inject({ method: "POST", url: "/api/proposals/draft", payload: body });
const supportDraft = (id: string, body: any) => app.inject({ method: "POST", url: `/api/proposals/${id}/support`, payload: body });

const PROPOSAL = { id: "r-draft1", title: "Should we fund X?", description: "d", options: [{ label: "Yes" }, { label: "No" }], durationDays: 7 };

beforeEach(() => { (db as any).__reset(); setBadge(1n); });

describe("POST /api/proposals/draft", () => {
  it("creates a draft for a badge holder", async () => {
    const signed = await makeDraft(voterAccount, { proposalId: PROPOSAL.id, title: PROPOSAL.title });
    const res = await createDraft({ ...signed, proposal: PROPOSAL });
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.proposal.status).toBe("draft");
    expect(j.proposal.supporters).toEqual([]);
    expect(j.proposal.opensAt).toBeNull();
    expect(j.supportThreshold).toBeGreaterThanOrEqual(1);
    expect(j.proposal.options.length).toBe(2);
  });

  it("403 for non badge holders", async () => {
    setBadge(0n);
    const signed = await makeDraft(voterAccount, { proposalId: PROPOSAL.id, title: PROPOSAL.title });
    const res = await createDraft({ ...signed, proposal: PROPOSAL });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("not_a_badgeholder");
  });

  it("401 on a signature from a different address", async () => {
    const signed = await makeDraft(voterAccount, { proposalId: PROPOSAL.id, title: PROPOSAL.title });
    signed.draft.creator = strangerAccount.address; // tamper
    const res = await createDraft({ ...signed, proposal: PROPOSAL });
    expect([400, 401]).toContain(res.statusCode);
  });

  it("400 on expired signature", async () => {
    const signed = await makeDraft(voterAccount, { proposalId: PROPOSAL.id, title: PROPOSAL.title, deadline: pastDeadline() });
    const res = await createDraft({ ...signed, proposal: PROPOSAL });
    expect(res.json().error).toBe("signature_expired");
  });

  it("enforces one live draft per creator", async () => {
    const first = await makeDraft(voterAccount, { proposalId: "r-a", title: "First proposal!" });
    expect((await createDraft({ ...first, proposal: { ...PROPOSAL, id: "r-a", title: "First proposal!" } })).statusCode).toBe(200);
    const second = await makeDraft(voterAccount, { proposalId: "r-b", title: "Second proposal!" });
    const res = await createDraft({ ...second, proposal: { ...PROPOSAL, id: "r-b", title: "Second proposal!" } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("draft_limit");
  });

  it("409 when the id is taken", async () => {
    (db as any).__seedProposals({ [PROPOSAL.id]: { id: PROPOSAL.id, status: "open", createdBy: "0x0" } });
    const signed = await makeDraft(voterAccount, { proposalId: PROPOSAL.id, title: PROPOSAL.title });
    expect((await createDraft({ ...signed, proposal: PROPOSAL })).json().error).toBe("proposal_id_taken");
  });
});

describe("POST /api/proposals/:id/support + promotion", () => {
  async function seedDraft() {
    const signed = await makeDraft(voterAccount, { proposalId: PROPOSAL.id, title: PROPOSAL.title });
    const res = await createDraft({ ...signed, proposal: PROPOSAL });
    expect(res.statusCode).toBe(200);
  }

  it("creator cannot support their own draft", async () => {
    await seedDraft();
    const s = await makeSupport(voterAccount, { proposalId: PROPOSAL.id });
    expect((await supportDraft(PROPOSAL.id, s)).json().error).toBe("creator_cannot_support_own_draft");
  });

  it("counts supporters, dedupes, and promotes at the threshold with a scheduled open", async () => {
    await seedDraft();
    // threshold defaults to 3 (or env). Support with distinct accounts; admin bypasses badge.
    const s1 = await makeSupport(strangerAccount, { proposalId: PROPOSAL.id });
    const r1 = await supportDraft(PROPOSAL.id, s1);
    expect(r1.json()).toMatchObject({ ok: true, supporterCount: 1, promoted: false });

    // duplicate support rejected
    const s1b = await makeSupport(strangerAccount, { proposalId: PROPOSAL.id, nonce: 1 });
    expect((await supportDraft(PROPOSAL.id, s1b)).json().error).toBe("already_supported");

    const s2 = await makeSupport(adminAccount, { proposalId: PROPOSAL.id });
    const r2 = await supportDraft(PROPOSAL.id, s2);
    const threshold = r2.json().supportThreshold;

    if (threshold === 3) {
      expect(r2.json().promoted).toBe(false);
      // a third distinct supporter — reuse a fresh key
      const { privateKeyToAccount } = await import("viem/accounts");
      const third = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
      const s3 = await makeSupport(third, { proposalId: PROPOSAL.id });
      const r3 = await supportDraft(PROPOSAL.id, s3);
      expect(r3.json().promoted).toBe(true);
      expect(r3.json().opensAt).toBeTruthy();
      const opens = new Date(r3.json().opensAt);
      expect(opens.getUTCDay()).toBe(1);           // Monday
      expect(opens.getUTCHours()).toBe(12);        // 12:00 UTC cycle start
      expect(opens.getTime()).toBeGreaterThan(Date.now());
      const deadline = new Date(r3.json().deadline);
      expect(deadline.getTime() - opens.getTime()).toBe(7 * 86400000);
      const p = (db as any).__getProposals()[PROPOSAL.id];
      expect(p.status).toBe("open");
      expect(p.promotedAt).toBeTruthy();
    } else {
      expect(r2.json().promoted).toBe(threshold <= 2);
    }
  });

  it("rejects support from non badge holders", async () => {
    await seedDraft();
    setBadge(0n);
    const s = await makeSupport(strangerAccount, { proposalId: PROPOSAL.id });
    expect((await supportDraft(PROPOSAL.id, s)).json().error).toBe("not_a_badgeholder");
  });

  it("400 not_a_draft once promoted or for normal proposals", async () => {
    (db as any).__seedProposals({ [PROPOSAL.id]: { id: PROPOSAL.id, status: "open", createdBy: "0x0", supporters: [] } });
    const s = await makeSupport(strangerAccount, { proposalId: PROPOSAL.id });
    expect((await supportDraft(PROPOSAL.id, s)).json().error).toBe("not_a_draft");
  });
});

describe("drafts are not votable", () => {
  it("castVote rejects a draft", async () => {
    const signed = await makeDraft(voterAccount, { proposalId: PROPOSAL.id, title: PROPOSAL.title });
    await createDraft({ ...signed, proposal: PROPOSAL });
    const body = await makeBallot(strangerAccount, { proposalId: PROPOSAL.id, allocations: [{ issueId: 1, points: 2 }], budget: 100 });
    const res = await app.inject({ method: "POST", url: `/api/proposals/${PROPOSAL.id}/vote`, payload: body });
    expect(res.json().error).toBe("draft_not_votable");
  });
});
