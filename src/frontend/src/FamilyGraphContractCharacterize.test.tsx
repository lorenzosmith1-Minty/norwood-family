import { describe, expect, it } from "vitest";
import { FAMILY_GRAPH } from "./types/family";

// The FamilyTreePage refactor replaces its hardcoded inline person/relationship
// arrays with the shared FAMILY_GRAPH. For the refactor to render the same tree,
// the shared graph must already contain every person and relationship the tree
// currently shows. This file characterizes that data contract directly against
// FAMILY_GRAPH (the authoritative source the refactor will consume), so a
// missing or rewired relationship in the graph is caught before the tree is
// rebuilt on top of it.
describe("FAMILY_GRAPH data contract characterization", () => {
  it("contains the founding couple and their eight children", () => {
    expect(FAMILY_GRAPH.julia).toBeDefined();
    expect(FAMILY_GRAPH.isaiah).toBeDefined();
    expect(FAMILY_GRAPH.julia.spouses).toContain("isaiah");
    expect(FAMILY_GRAPH.isaiah.spouses).toContain("julia");
    for (const child of [
      "clayton",
      "isaiah-jr",
      "edward",
      "hattie",
      "pinkie",
      "louise",
      "lillie",
      "lula-e",
    ]) {
      expect(FAMILY_GRAPH.julia.children).toContain(child);
      expect(FAMILY_GRAPH.isaiah.children).toContain(child);
    }
  });

  it("contains Clayton's two marriages and their children", () => {
    expect(FAMILY_GRAPH.clayton.spouses).toEqual(["hudson", "erma"]);
    // First marriage (Ms. Hudson).
    expect(FAMILY_GRAPH.hudson.children).toEqual([
      "elbert",
      "wellman",
      "wetherby",
      "clayton-son-died",
    ]);
    // Second marriage (Erma T. Williams).
    expect(FAMILY_GRAPH.erma.children).toEqual([
      "columbus",
      "thomas-clayton",
      "alton",
      "robert-davis",
      "ardeanus",
      "willie-b",
      "james",
      "freddie",
      "zelia-mae",
      "lula-mae",
    ]);
  });

  it("contains the Lula Mae + Versie couple and their seven children", () => {
    expect(FAMILY_GRAPH["lula-mae"].spouses).toContain("versie-smith");
    expect(FAMILY_GRAPH["versie-smith"].spouses).toContain("lula-mae");
    for (const child of [
      "lorenzoSmithSr",
      "versieSmithJr",
      "herbertSmith",
      "alonzoSmith",
      "sherriSmith",
      "beatriceSmith",
      "edSmith",
    ]) {
      expect(FAMILY_GRAPH["lula-mae"].children).toContain(child);
      expect(FAMILY_GRAPH["versie-smith"].children).toContain(child);
    }
  });

  it("contains Versie's maternal ancestry: Gertrude as mother, Harvey as grandfather", () => {
    expect(FAMILY_GRAPH["versie-smith"].mother).toBe("gertrude-adams-hill");
    expect(FAMILY_GRAPH["gertrude-adams-hill"].father).toBe("harvey-adams-sr");
    expect(FAMILY_GRAPH["gertrude-adams-hill"].children).toContain(
      "versie-smith",
    );
  });

  it("contains Harvey's second marriage and Mildred's daughters", () => {
    expect(FAMILY_GRAPH["harvey-adams-sr"].spouses).toContain(
      "mary-jane-johnson",
    );
    expect(FAMILY_GRAPH["mary-jane-johnson"].children).toEqual([
      "mildred-adams",
      "christine-adams",
    ]);
    expect(FAMILY_GRAPH["mildred-adams"].children).toEqual([
      "tammy",
      "punchy",
      "patricia-rollins",
    ]);
  });
});
