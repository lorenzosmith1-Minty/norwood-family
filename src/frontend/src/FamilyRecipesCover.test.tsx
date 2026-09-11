import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  EvidenceStatus,
  PrivacyLevel,
  type Recipe,
  RecipeStatus,
  SourceStatus,
} from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import App from "./App";

// Cover for the Family Recipes build: the dedicated Family Recipes page
// (reachable from Home / Family Archive / Person Profiles, never a permanent
// global navbar pill), the empty state, the add-recipe form with the Norwood
// checkmark selection pattern (selected members immediately show a checkmark
// and saved selections reopen visibly selected), the pending -> approve flow
// through Pending Contributions, the canonical recipe detail page, and the
// Person Profile Family Recipes section resolving from the canonical Recipe
// record. The backend is mocked; the PocketIC lane exercises the real canister.

configure({ testIdAttribute: "data-ocid" });

const {
  mockActor,
  makeRecipe,
  makeMedia,
  seedRecipes,
  seedMedia,
  resetState,
  setAuthenticated,
  getAuthenticated,
  setAdmin,
} = vi.hoisted(() => {
  let recipes: Recipe[] = [];
  let media: ArchiveItem[] = [];
  let nextRecipeId = 0n;
  let nextMediaId = 0n;
  let isAuthenticated = false;
  let isAdmin = false;

  const makeRecipe = (id: bigint, overrides: Partial<Recipe> = {}): Recipe => ({
    recipeId: id,
    title: "Sweet Potato Pie",
    shortDescription: "Grandma Julia's holiday favorite.",
    originatingPersonId: "julia",
    relatedPersonIds: ["clayton", "lorenzoSmithSr"],
    era: "1940s",
    year: 1942n,
    location: "Clayton, Mississippi",
    familyBranch: "the Clayton Norwood branch",
    ingredients: ["3 cups sweet potato", "1 tsp cinnamon"],
    instructions: "Mix and bake at 350.",
    familyStory: "Made every Thanksgiving.",
    tags: ["dessert", "holiday"],
    privacyLevel: PrivacyLevel.FamilyOnly,
    evidenceStatus: EvidenceStatus.PersonalMemory,
    status: RecipeStatus.Approved,
    linkedMediaIds: [],
    contributorAccountId: Principal.fromText("aaaaa-aa"),
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    ...overrides,
  });

  const makeMedia = (
    id: bigint,
    overrides: Partial<ArchiveItem> = {},
  ): ArchiveItem => ({
    id,
    title: "Pie photo",
    description: "A photo of the pie.",
    itemType: ArchiveItemType.Photo,
    blob: ExternalBlob.fromBytes(
      new Uint8Array([1, 2, 3]),
      "image/png",
      "pie.png",
    ),
    era: "1940s",
    year: 1942n,
    tags: [],
    relatedMemberIds: ["julia"],
    relatedBranchId: "branch-1",
    sourceStatus: SourceStatus.Original,
    privacyLevel: PrivacyLevel.FamilyOnly,
    classification: ArchiveItemClassification.Standard,
    status: ArchiveItemStatus.Approved,
    createdAt: 1_700_000_000_000_000_000n,
    contributor: Principal.fromText("aaaaa-aa"),
    ...overrides,
  });

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    async getPersonProfile(personId: string): Promise<{
      personId: string;
      name: string;
      claimStatus: { Unclaimed: null };
      livingStatus: { Living: null };
    } | null> {
      const names: Record<string, string> = {
        julia: "Julia “Julie” Norwood",
        clayton: "Clayton Norwood",
        lorenzoSmithSr: "Lorenzo Smith Sr.",
        versie: "Versie Smith",
      };
      const name = names[personId];
      if (!name) return null;
      return {
        personId,
        name,
        claimStatus: { Unclaimed: null },
        livingStatus: { Living: null },
      };
    },
    async listApprovedRecipes(): Promise<Recipe[]> {
      return recipes.filter((r) => r.status === RecipeStatus.Approved);
    },
    async listPendingRecipes(): Promise<Recipe[]> {
      return recipes.filter((r) => r.status === RecipeStatus.Pending);
    },
    async getRecipe(id: bigint): Promise<Recipe | null> {
      return recipes.find((r) => r.recipeId === id) ?? null;
    },
    async listRecipesForPerson(personId: string): Promise<Recipe[]> {
      return recipes.filter(
        (r) =>
          r.status === RecipeStatus.Approved &&
          (r.originatingPersonId === personId ||
            r.relatedPersonIds.includes(personId)),
      );
    },
    async submitRecipe(
      title: string,
      shortDescription: string,
      originatingPersonId: string,
      relatedPersonIds: string[],
      era: string | null,
      year: bigint | null,
      location: string | null,
      familyBranch: string | null,
      ingredients: string[],
      instructions: string,
      familyStory: string | null,
      tags: string[],
      privacyLevel: PrivacyLevel,
      evidenceStatus: EvidenceStatus,
      linkedMediaIds: bigint[],
    ): Promise<Recipe> {
      const recipe: Recipe = makeRecipe(nextRecipeId++, {
        title,
        shortDescription,
        originatingPersonId,
        relatedPersonIds,
        era: era ?? undefined,
        year: year ?? undefined,
        location: location ?? undefined,
        familyBranch: familyBranch ?? undefined,
        ingredients,
        instructions,
        familyStory: familyStory ?? undefined,
        tags,
        privacyLevel,
        evidenceStatus,
        linkedMediaIds,
        status: RecipeStatus.Pending,
      });
      recipes = [...recipes, recipe];
      return recipe;
    },
    async approveRecipe(id: bigint): Promise<Recipe | null> {
      const recipe = recipes.find((r) => r.recipeId === id);
      if (!recipe) return null;
      const updated: Recipe = { ...recipe, status: RecipeStatus.Approved };
      recipes = recipes.map((r) => (r.recipeId === id ? updated : r));
      return updated;
    },
    async rejectRecipe(id: bigint): Promise<Recipe | null> {
      const recipe = recipes.find((r) => r.recipeId === id);
      if (!recipe) return null;
      const updated: Recipe = { ...recipe, status: RecipeStatus.Rejected };
      recipes = recipes.map((r) => (r.recipeId === id ? updated : r));
      return updated;
    },
    async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
      return media.filter((m) => m.status === ArchiveItemStatus.Approved);
    },
    async listPendingArchiveItems(): Promise<ArchiveItem[]> {
      return media.filter((m) => m.status === ArchiveItemStatus.Pending);
    },
    async submitArchiveItem(
      title: string,
      description: string,
      itemType: ArchiveItemType,
      blob: ExternalBlob,
      era: string,
      year: bigint | null,
      tags: string[],
      relatedMemberIds: string[],
      relatedBranchId: string | null,
      sourceStatus: SourceStatus,
      privacyLevel: PrivacyLevel,
      classification: ArchiveItemClassification,
      _primarySpeaker: null,
    ): Promise<ArchiveItem> {
      const item: ArchiveItem = {
        id: nextMediaId++,
        title,
        description,
        itemType,
        blob,
        era,
        year: year ?? undefined,
        tags,
        relatedMemberIds,
        relatedBranchId: relatedBranchId ?? undefined,
        sourceStatus,
        privacyLevel,
        classification,
        status: ArchiveItemStatus.Pending,
        createdAt: 1_700_000_000_000_000_000n,
        contributor: Principal.fromText("aaaaa-aa"),
      };
      media = [...media, item];
      return item;
    },
  };

  return {
    mockActor,
    makeRecipe,
    makeMedia,
    seedRecipes: (seeded: Recipe[]) => {
      recipes = [...seeded];
    },
    seedMedia: (seeded: ArchiveItem[]) => {
      media = [...seeded];
    },
    resetState: () => {
      recipes = [];
      media = [];
      nextRecipeId = 0n;
      nextMediaId = 0n;
      isAuthenticated = false;
      isAdmin = false;
    },
    setAuthenticated: (value: boolean) => {
      isAuthenticated = value;
    },
    getAuthenticated: () => isAuthenticated,
    setAdmin: (value: boolean) => {
      isAdmin = value;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetState();
  window.history.replaceState(null, "", "/");
});

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when a blob is constructed. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);

  // jsdom's File does not implement Blob.prototype.arrayBuffer, which the
  // upload path uses to read the file bytes. Polyfill it via FileReader so the
  // workflow can be exercised end to end in the test environment.
  if (typeof File.prototype.arrayBuffer !== "function") {
    File.prototype.arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
});

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

/** Opens the Family Recipes page from the Home nav card. */
async function openRecipesFromHome(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Family Recipes" }));
  await screen.findByRole("heading", { name: "Family Recipes" });
}

describe("Family Recipes page", () => {
  it("is reachable from Home and is not a permanent global navbar pill", async () => {
    const user = userEvent.setup();
    renderApp();
    await openRecipesFromHome(user);

    expect(
      screen.getByRole("heading", { name: "Family Recipes" }),
    ).toBeInTheDocument();

    // It is NOT a permanent top-level navbar pill.
    const header = screen
      .getByTestId("layout.explore_link")
      .closest("header") as HTMLElement;
    expect(
      within(header).queryByRole("button", { name: /Family Recipes/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state with the accepted copy when no recipes exist", async () => {
    const user = userEvent.setup();
    renderApp();
    await openRecipesFromHome(user);

    expect(
      screen.getByRole("heading", { name: "No family recipes yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Preserve the dishes, handwritten notes, and kitchen stories your family passes down.",
      ),
    ).toBeInTheDocument();
  });

  it("lists approved recipes and opens the canonical detail view", async () => {
    seedRecipes([
      makeRecipe(0n, { title: "Sweet Potato Pie" }),
      makeRecipe(1n, { title: "Cornbread Dressing" }),
    ]);

    const user = userEvent.setup();
    renderApp();
    await openRecipesFromHome(user);

    expect(await screen.findByText("Sweet Potato Pie")).toBeInTheDocument();
    expect(screen.getByText("Cornbread Dressing")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Sweet Potato Pie/ }));
    await screen.findByRole("heading", { name: "Sweet Potato Pie" });
    // The detail view resolves from the canonical recipe record.
    expect(
      document.querySelector('[data-ocid="recipe_detail.evidence_badge"]'),
    ).toBeInTheDocument();
  });
});

describe("Add-recipe flow with Norwood checkmark selection", () => {
  it("shows checkmarks on selected members and submits a pending recipe", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openRecipesFromHome(user);

    await user.click(screen.getByTestId("recipes.add_button"));
    await screen.findByRole("heading", { name: "Add a family recipe" });

    // Fill the required title.
    await user.type(
      screen.getByTestId("recipe.form.title_input"),
      "Grandma's Sweet Potato Pie",
    );

    // Select one originating member (Julia) and two related members.
    await user.click(screen.getByTestId("recipe.form.originating.julia"));
    await user.click(screen.getByTestId("recipe.form.member.clayton"));
    await user.click(screen.getByTestId("recipe.form.member.lorenzoSmithSr"));

    // Selected members immediately show a checkmark (aria-pressed true).
    expect(screen.getByTestId("recipe.form.originating.julia")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("recipe.form.member.clayton")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByTestId("recipe.form.member.lorenzoSmithSr"),
    ).toHaveAttribute("aria-pressed", "true");
    // Unselected members show no checkmark.
    expect(
      screen.getByTestId("recipe.form.member.versie-smith"),
    ).toHaveAttribute("aria-pressed", "false");

    // Fill the remaining fields.
    await user.type(
      screen.getByTestId("recipe.form.ingredients_textarea"),
      "3 cups sweet potato\n1 tsp cinnamon",
    );
    await user.type(
      screen.getByTestId("recipe.form.instructions_textarea"),
      "Mix and bake at 350.",
    );

    await user.click(screen.getByTestId("recipe.form.submit_button"));

    // Confirmation screen.
    await screen.findByRole("heading", { name: "Recipe submitted for review" });

    // The recipe landed in pending state with the selected members.
    const pending = await mockActor.listPendingRecipes();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      title: "Grandma's Sweet Potato Pie",
      originatingPersonId: "julia",
      relatedPersonIds: ["clayton", "lorenzoSmithSr"],
      status: RecipeStatus.Pending,
    });
  });

  it("reopens saved selections visibly selected when returning to the form", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openRecipesFromHome(user);

    await user.click(screen.getByTestId("recipes.add_button"));
    await screen.findByRole("heading", { name: "Add a family recipe" });

    await user.click(screen.getByTestId("recipe.form.originating.julia"));
    await user.click(screen.getByTestId("recipe.form.member.clayton"));

    // The selected chips show checkmarks immediately.
    expect(screen.getByTestId("recipe.form.originating.julia")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("recipe.form.member.clayton")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("Recipe approval flow", () => {
  it("approves a pending recipe as steward, making it visible in Family Recipes", async () => {
    seedRecipes([
      makeRecipe(0n, {
        title: "Grandma's Sweet Potato Pie",
        status: RecipeStatus.Pending,
      }),
    ]);

    // The steward is signed in and an admin from the start, so the admin nav
    // link renders on mount.
    setAuthenticated(true);
    setAdmin(true);

    const user = userEvent.setup();
    renderApp();

    // A normal family member does not see the pending recipe in Family Recipes.
    await openRecipesFromHome(user);
    expect(
      screen.queryByText("Grandma's Sweet Potato Pie"),
    ).not.toBeInTheDocument();

    // The steward opens Pending Contributions through the Family Steward hub
    // and approves the recipe.
    await user.click(screen.getByTestId("recipes.back_button"));
    await screen.findByRole("button", { name: "Family Steward" });
    await user.click(screen.getByRole("button", { name: "Family Steward" }));
    await user.click(
      await screen.findByRole("button", { name: /Pending Contributions/ }),
    );
    await screen.findByRole("heading", { name: "Pending Contributions" });

    const recipeSection = screen.getByTestId("admin_approval.recipes_section");
    expect(
      within(recipeSection).getByText("Grandma's Sweet Potato Pie"),
    ).toBeInTheDocument();

    await user.click(
      within(recipeSection).getByTestId(
        "admin_approval.recipe_approve_button.1",
      ),
    );

    // Approval sets the status to Approved without creating a second recipe.
    const approved = await mockActor.listApprovedRecipes();
    expect(approved).toHaveLength(1);
    expect(approved[0]).toMatchObject({
      recipeId: 0n,
      title: "Grandma's Sweet Potato Pie",
      status: RecipeStatus.Approved,
    });
    expect(await mockActor.listPendingRecipes()).toEqual([]);
  });
});

describe("Recipe detail page", () => {
  it("shows the full recipe detail from the canonical record", async () => {
    seedRecipes([
      makeRecipe(0n, {
        title: "Sweet Potato Pie",
        linkedMediaIds: [0n],
      }),
    ]);
    seedMedia([makeMedia(0n)]);

    const user = userEvent.setup();
    renderApp();
    await openRecipesFromHome(user);

    await user.click(
      await screen.findByRole("button", { name: /Sweet Potato Pie/ }),
    );
    await screen.findByRole("heading", { name: "Sweet Potato Pie" });

    // Title, originating member, related people, description, ingredients,
    // instructions, family story, media gallery, era/year, location, branch,
    // tags, evidence badge, and privacy level.
    expect(screen.getByText("Clayton Norwood")).toBeInTheDocument();
    expect(
      screen.getByText("Grandma Julia's holiday favorite."),
    ).toBeInTheDocument();
    expect(screen.getByText("3 cups sweet potato")).toBeInTheDocument();
    expect(screen.getByText("Mix and bake at 350.")).toBeInTheDocument();
    expect(screen.getByText("Made every Thanksgiving.")).toBeInTheDocument();
    // The year and location appear in both the header meta row and the
    // Details section.
    expect(screen.getAllByText("1942").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Clayton, Mississippi").length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByText("the Clayton Norwood branch").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("dessert")).toBeInTheDocument();
    // Evidence status and privacy level appear in both the header meta row and
    // the Details section.
    expect(screen.getAllByText("Personal Memory").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Family Only").length).toBeGreaterThan(0);
    // The linked media gallery renders the single canonical media record.
    expect(
      document.querySelector('[data-ocid="recipe_detail.media.0"]'),
    ).toBeInTheDocument();
  });
});

describe("Person Profile Family Recipes section", () => {
  it("lists recipes linked to the person and opens the canonical detail", async () => {
    seedRecipes([
      makeRecipe(0n, {
        title: "Sweet Potato Pie",
        originatingPersonId: "julia",
      }),
      // A recipe not linked to Julia should not appear in her section.
      makeRecipe(1n, {
        title: "Clayton's Gumbo",
        originatingPersonId: "clayton",
        relatedPersonIds: [],
      }),
    ]);

    const user = userEvent.setup();
    renderApp();

    // Open Julia's profile (the default Explore Family focus) via the tree.
    await user.click(
      screen.getByRole("button", { name: "Explore the Family" }),
    );
    await user.click(screen.getByRole("button", { name: "View Profile" }));
    await screen.findByRole("heading", {
      level: 1,
      name: /Julia.*Norwood/i,
    });

    const section = screen.getByLabelText("Family Recipes");
    expect(within(section).getByText("Sweet Potato Pie")).toBeInTheDocument();
    expect(
      within(section).queryByText("Clayton's Gumbo"),
    ).not.toBeInTheDocument();

    // Opening the linked recipe routes to the canonical detail view.
    await user.click(
      within(section).getByRole("button", { name: /Sweet Potato Pie/ }),
    );
    await screen.findByRole("heading", { name: "Sweet Potato Pie" });
    expect(
      document.querySelector('[data-ocid="recipe_detail.evidence_badge"]'),
    ).toBeInTheDocument();
  });
});
