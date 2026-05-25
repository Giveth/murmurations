// Mobile snapshot — branded companion view of Flow 2
function MobileSnap() {
  const allocations = { 3: 18, 1: 12, 9: 8, 5: 6 };
  const used = Object.values(allocations).reduce((a, b) => a + b, 0);
  const TOTAL = 100;

  return (
    <div style={{
      width: "100%", height: "100%",
      background: "var(--dao-paper)",
      display: "flex", flexDirection: "column",
      fontFamily: "Inter, sans-serif",
      color: "var(--dao-blue-900)",
    }}>
      {/* Branded blue hero */}
      <div className="dao-blue-surface" style={{ padding: "44px 22px 20px", position: "relative" }}>
        <SquaresBackdrop density={14} tint="light" />
        <div style={{ position: "relative", zIndex: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Wordmark light />
          <div className="dao-badge" style={{ width: 36, height: 36 }}><ShieldGlyph /></div>
        </div>
        <div style={{ position: "relative", zIndex: 2, marginTop: 18 }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--dao-gold-300)" }}>ROUND 7 · 4D 12H LEFT</div>
          <div className="font-display" style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}>Your ballot</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
            <span className="font-display" style={{ fontSize: 54, fontWeight: 700, lineHeight: 1, color: "var(--dao-gold-300)" }}>{used}</span>
            <span className="font-mono" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>/ {TOTAL} pt</span>
          </div>
          <div style={{ marginTop: 10, height: 6, background: "rgba(0,0,0,0.3)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${(used / TOTAL) * 100}%`, height: "100%", background: "var(--dao-gold-500)" }} />
          </div>
        </div>
      </div>

      <div style={{ padding: "18px 22px", flex: 1, overflowY: "auto" }}>
        <div className="font-mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(11,11,11,0.5)" }}>4 ISSUES ALLOCATED</div>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {ISSUES.slice(0, 4).map(iss => {
            const v = allocations[iss.id] || 0;
            return (
              <div key={iss.id} style={{
                background: "white", borderRadius: 12,
                border: v > 0 ? "1px solid rgba(225,175,55,0.5)" : "1px solid var(--dao-stroke-2)",
                padding: 14,
                boxShadow: v > 0 ? "0 4px 14px rgba(225,175,55,0.10)" : "none",
              }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <SevTag s={iss.severity} />
                  <span className="font-mono" style={{ fontSize: 10, color: "rgba(11,11,11,0.5)" }}>#{iss.num}</span>
                </div>
                <div className="font-display" style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{iss.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                  <input type="range" min="0" max="20" defaultValue={v} style={{ flex: 1, accentColor: "var(--dao-gold-600)" }} />
                  <span className="font-mono" style={{
                    fontSize: 13, fontWeight: 600,
                    color: v > 0 ? "var(--dao-gold-800)" : "rgba(11,11,11,0.4)",
                    minWidth: 38, textAlign: "right",
                  }}>{v} pt</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        padding: "14px 22px 26px",
        borderTop: "1px solid var(--dao-stroke-2)",
        background: "white",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div className="font-mono" style={{ fontSize: 11, color: "rgba(11,11,11,0.55)" }}>{TOTAL - used} pt left</div>
        <button className="btn btn-primary" style={{
          background: "var(--dao-blue-800)",
          padding: "12px 20px", fontSize: 14,
        }}>Sign + commit →</button>
      </div>
    </div>
  );
}

window.MobileSnap = MobileSnap;
