/** Tiny helper to print a uniform scorecard line per eval category. */
export interface CaseResult {
  name: string;
  pass: boolean;
  note?: string;
}

export function printScorecard(category: string, results: CaseResult[], threshold = 1): number {
  const passed = results.filter((r) => r.pass).length;
  const rate = results.length === 0 ? 1 : passed / results.length;
  const icon = rate >= threshold ? "✅" : "❌";
  console.log(`\n${icon} EVAL [${category}] ${passed}/${results.length} (${Math.round(rate * 100)}%)`);
  for (const r of results) {
    console.log(`   ${r.pass ? "·" : "✗"} ${r.name}${r.note ? ` — ${r.note}` : ""}`);
  }
  return rate;
}
