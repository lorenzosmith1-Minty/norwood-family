import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FamilyTreePage } from "./pages/FamilyTreePage";

// The FamilyTreePage refactor replaced its hardcoded inline person/relationship
// arrays with derivation from the shared FAMILY_GRAPH. The characterization
// suite freezes the rendering contract against the real graph. This cover file
// proves the tree is actually DRIVEN by the graph rather than by a frozen copy:
// it mocks the shared graph with a modified structure and asserts the tree
// renders the modified structure. A tree that still rendered the original
// hardcoded people would fail here, so this is the direct test of the
// "a change to the shared family graph is reflected automatically in Family
// Tree" acceptance criterion.
//
// We mock only ./types/family (the module FamilyTreePage imports FAMILY_GRAPH
// from). The real graph is imported and cloned so the mock is a faithful
// superset, then a new child is added to Julia's children to prove the tree
// follows the graph.

vi.mock("./types/family", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./types/family")>();
  // Clone the real graph so the mock is a faithful superset of the shared data.
  const graph = structuredClone(actual.FAMILY_GRAPH);
  // Add a brand-new child to the founding couple. The tree must render it.
  graph["new-child"] = {
    id: "new-child",
    father: "isaiah",
    mother: "julia",
    spouses: [],
    children: [],
  };
  graph.julia.children = [...graph.julia.children, "new-child"];
  graph.isaiah.children = [...graph.isaiah.children, "new-child"];
  return {
    ...actual,
    FAMILY_GRAPH: graph,
  };
});

function renderTree() {
  render(
    <FamilyTreePage
      onBack={() => {}}
      onOpenProfile={() => {}}
      profilePhotos={{}}
    />,
  );
}

afterEach(cleanup);

describe("FamilyTreePage is driven by the shared FAMILY_GRAPH", () => {
  it("renders a person added to the shared graph's children", () => {
    renderTree();

    // The new child added to the graph renders in the children row. It has no
    // TREE_PERSON entry and no profile, so it falls back to its raw id as the
    // card name — proving the card came from the graph, not a hardcoded array.
    expect(screen.getByText("new-child")).toBeInTheDocument();
  });

  it("renders the founding couple and the original eight children alongside the new one", () => {
    renderTree();

    // The original people still render (the graph is a superset), so the
    // refactor did not drop anyone.
    expect(screen.getByText("Julia “Julie” Norwood")).toBeInTheDocument();
    expect(screen.getByText("Isaiah Norwood")).toBeInTheDocument();
    for (const name of [
      "Clayton",
      "Isaiah Jr.",
      "Edward",
      "Hattie",
      "Pinkie",
      "Louise",
      "Lillie",
      "Lula E.",
    ]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });
});
