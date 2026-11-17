import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateProductSpecMarkdown } from "@productspec/parser";
import { describe, expect, it } from "vitest";
import { checkSpecs } from "./check";
import { main } from "./cli";
import { compressProse, firstSentence } from "./compress";
import { findFiles, loadConfig } from "./config";
import { buildHandoff } from "./handoff";
import { measureCut } from "./measure";
import { parseSpec, scopeList, specIds } from "./spec";
import { estimateTokens } from "./tokens";

// cavespec: a product spec and a mission spec in one handoff that fits a token budget, with the binding parts word
// for word, plus the checks and CLI around it. The example project doubles as the fixture.

const EXAMPLE = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "examples", "lists");
const read = (rel: string) => ({ path: rel, markdown: fs.readFileSync(path.join(EXAMPLE, rel), "utf8") });
const product = read("docs/lists.product-spec.md");
const claim = read("docs/missions/claim-items.product-spec.md");

describe("cavespec", () => {
  it("ships example specs that ProductSpec itself accepts", () => {
    for (const f of findFiles(EXAMPLE, ["docs/**/*.product-spec.md"])) {
      const r = validateProductSpecMarkdown(read(f).markdown);
      expect(r.valid, `${f}: ${JSON.stringify((r as { errors?: unknown }).errors)}`).toBe(true);
    }
  });

  it("parses sections, items, ids and scope", () => {
    const spec = parseSpec(product.markdown);
    expect(spec.meta).toMatchObject({ title: "Lists", spec_revision: "3" });
    expect(spec.sections.map((s) => s.heading)).toEqual(["Problem", "Hypothesis", "Product Summary", "Scope", "Acceptance Criteria", "Success Metrics", "Standing Decisions", "Features", "Open Questions"]);
    const decisions = spec.sections.find((s) => s.heading === "Standing Decisions")!.blocks.filter((b) => b.kind === "item");
    expect(decisions[0]).toMatchObject({ kind: "item", item: { id: "D-1", label: "D-1 (2026-11-02, Maya)" } });
    expect([...specIds(spec)].sort()).toEqual(["AC-1", "AC-2", "AC-3", "D-1", "D-2", "D-3", "Q-1", "Q-2", "SM-1"]);
    expect(scopeList(spec, "out")).toEqual(["Do not build payments or splitting costs between people.", "Do not build a public social feed of lists."]);
  });

  it("shortens prose caveman-style, leaving code, quotes, ids, numbers and paths alone", () => {
    expect(compressProse("The app is basically able to sync. In order to do that, we just use the server.")).toBe("App is able to sync. To do that, we use server.");
    expect(compressProse('Keep "the Start plan" and `the_code` and D-5 at 40¢ in src/lib/the-file.ts, see [the docs](https://x.test/a).')).toBe('Keep "the Start plan" and `the_code` and D-5 at 40¢ in src/lib/the-file.ts, see docs.');
    expect(compressProse("Plan A and plan B.")).toBe("Plan A and plan B.");
    expect(firstSentence("Use e.g. `a.b`. Then more.")).toBe("Use e.g. `a.b`.");
  });

  it("keeps everything shortened only as much as the budget needs", () => {
    const roomy = buildHandoff({ product, mission: claim, budgetTokens: 5000 });
    expect(roomy.fits).toBe(true);
    expect(roomy.sections.every((s) => s.level === "verbatim" || s.level === "compressed")).toBe(true);
    expect(roomy.text).toContain("- D-2 (2026-11-05, Maya): Lists sync through server, never peer to peer.");
  });

  it("fits a tight budget with every section still there, and the binding parts word for word", () => {
    const h = buildHandoff({ product, mission: claim, budgetTokens: 900 });
    expect(h.fits).toBe(true);
    expect(h.tokens).toBeLessThanOrEqual(900);
    expect(estimateTokens(h.text)).toBe(h.tokens);
    // Word for word: scope and acceptance criteria of both specs.
    for (const spec of [product, claim]) {
      for (const heading of ["Scope", "Acceptance Criteria", "Product Summary"]) {
        expect(h.text).toContain(parseSpec(spec.markdown).sections.find((s) => s.heading === heading)!.raw);
      }
    }
    // Every id is still there, and every open question keeps its "Until decided" line.
    for (const id of ["D-1", "D-2", "D-3", "Q-1", "Q-2"]) expect(h.text).toMatch(new RegExp(`^- ${id}\\b`, "m"));
    expect(h.text).toContain("Until decided: claims never expire; show how long ago item was claimed.");
    // The header says what was cut down, and where the full text is.
    expect(h.text.split("\n")[0]).toBe("# Product spec: Lists (docs/lists.product-spec.md, rev 3)");
    expect(h.text).toMatch(/cut down most: [^.]*Features/);
    // The product gives way before the mission.
    expect(h.sections.filter((s) => s.spec === "mission").every((s) => s.level === "verbatim" || s.level === "compressed")).toBe(true);
  });

  it("cuts sections to one line before giving up, and says when even that doesn't fit", () => {
    const tiny = buildHandoff({ product, budgetTokens: 450 });
    expect(tiny.sections.find((s) => s.heading === "Features")!.level).toBe("pointer");
    expect(tiny.text).toContain("## Features\n(3 items: see the full spec.)");
    const impossible = buildHandoff({ product, budgetTokens: 50 });
    expect(impossible.fits).toBe(false);
    expect(impossible.text).toContain("AC-3");
  });

  it("keeps sections named in keep word for word", () => {
    const h = buildHandoff({ product, budgetTokens: 600, keep: ["Standing Decisions"] });
    expect(h.text).toContain(parseSpec(product.markdown).sections.find((s) => s.heading === "Standing Decisions")!.raw);
  });

  it("measures what a plain character cut keeps", () => {
    const r = measureCut(product.markdown, 1500);
    expect(r.sections.find((s) => s.heading === "Problem")!.seenPercent).toBe(100);
    expect(r.sections.find((s) => s.heading === "Open Questions")!.seenPercent).toBe(0);
  });

  it("checks a mission against its product spec", () => {
    expect(checkSpecs({ product, missions: [claim, read("docs/missions/weekly-view.product-spec.md")], budgetTokens: 1500 })).toEqual([]);
    const bad = {
      path: "docs/missions/bad.product-spec.md",
      markdown: claim.markdown
        .replace("Claim and unclaim an item with one tap.", "Split the costs of shared purchases between people.")
        .replace("(Q-1)", "(Q-1, D-9)")
        .replace("- id: AC-2", "- id: AC-1"),
    };
    const findings = checkSpecs({ product, missions: [bad], budgetTokens: 120 });
    expect(findings.map((f) => f.message)).toEqual([
      "Defines AC-1 2 times.",
      "Refers to D-9, which neither it nor the product spec (docs/lists.product-spec.md) defines.",
      'Its scope includes "Split the costs of shared purchases between people.", which the product spec rules out: "Do not build payments or splitting costs between people.". Change the product spec first, or drop it here.',
      expect.stringMatching(/^Its handoff needs about \d+ tokens with nothing left to shorten, over the 120 budget\./),
    ]);
  });

  it("finds specs from cavespec.json, or on its own", () => {
    expect(loadConfig(EXAMPLE)).toEqual({ product: "docs/lists.product-spec.md", missions: ["docs/missions/claim-items.product-spec.md", "docs/missions/weekly-view.product-spec.md"], budget: 1500, keep: [] });
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), "cavespec-"));
    fs.mkdirSync(path.join(bare, "docs", "missions"), { recursive: true });
    fs.writeFileSync(path.join(bare, "docs", "app.product-spec.md"), product.markdown);
    fs.writeFileSync(path.join(bare, "docs", "missions", "x.product-spec.md"), claim.markdown);
    expect(loadConfig(bare)).toMatchObject({ product: "docs/app.product-spec.md", missions: ["docs/missions/x.product-spec.md"], budget: 6000 });
    fs.rmSync(bare, { recursive: true, force: true });
  });

  it("runs as a CLI", async () => {
    const capture = () => {
      let text = "";
      return { stream: { write: (s: string) => (text += s) }, text: () => text };
    };
    const out = capture();
    expect(await main(["handoff", "--root", EXAMPLE, "--mission", "docs/missions/claim-items.product-spec.md", "--budget", "900"], out.stream, capture().stream)).toBe(0);
    expect(out.text()).toContain("# Mission spec: Claim items (docs/missions/claim-items.product-spec.md, rev 1)");
    const measured = capture();
    expect(await main(["measure", "--root", EXAMPLE, "--budget", "500"], measured.stream, capture().stream)).toBe(0);
    expect(measured.text()).toMatch(/Standing Decisions\s+617\s+\d+%/);
    const checked = capture();
    expect(await main(["check", "--root", EXAMPLE], checked.stream, capture().stream)).toBe(0);
    expect(checked.text()).toBe("cavespec: 3 specs checked, nothing to fix.\n");
    expect(await main([], capture().stream, capture().stream)).toBe(1);
  });
});
