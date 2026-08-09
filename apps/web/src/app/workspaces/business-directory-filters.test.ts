import { describe, expect, it } from "vitest";
import { projectMatchesDirectoryFilters } from "./business-directory-filters";

const activeProject = {
  id: "project-ylvn-2025-05",
  name: "Yêu Lắm VN — 05/2025",
  state: "active",
  starts_on: "2025-04-30T00:00:00.000Z",
  ends_on: "2025-05-30T00:00:00.000Z",
};

describe("project directory filters", () => {
  it("supports the default all-state view and keeps text search", () => {
    expect(
      projectMatchesDirectoryFilters(activeProject, {
        query: "yêu lắm",
        state: "all",
        startsOn: "",
        endsOn: "",
      }),
    ).toBe(true);
    expect(
      projectMatchesDirectoryFilters(
        { ...activeProject, state: "closed" },
        { query: "", state: "all", startsOn: "", endsOn: "" },
      ),
    ).toBe(true);
  });

  it("matches projects whose execution period overlaps the selected range", () => {
    expect(
      projectMatchesDirectoryFilters(activeProject, {
        query: "",
        state: "all",
        startsOn: "2025-05-15",
        endsOn: "2025-05-20",
      }),
    ).toBe(true);
    expect(
      projectMatchesDirectoryFilters(activeProject, {
        query: "",
        state: "all",
        startsOn: "2025-06-01",
        endsOn: "2025-06-30",
      }),
    ).toBe(false);
  });

  it("treats an open-ended project as overlapping future ranges", () => {
    expect(
      projectMatchesDirectoryFilters(
        { ...activeProject, ends_on: null },
        {
          query: "",
          state: "active",
          startsOn: "2026-01-01",
          endsOn: "2026-12-31",
        },
      ),
    ).toBe(true);
  });
});
