import { describe, expect, it } from "vitest";
import { recordPartyId, relationshipIdList } from "./focused-record-relationships";

describe("focused record relationships", () => {
  it("reads the singular projectId returned by revenue recognition events", () => {
    expect(relationshipIdList({ projectId: "project-1" }, "projectId")).toEqual(["project-1"]);
  });

  it("resolves a recognition customer through the linked project", () => {
    expect(
      recordPartyId({ projectId: "project-1" }, [{ id: "project-1", client_party_id: "party-1" }]),
    ).toBe("party-1");
  });

  it("keeps a document's direct customer relationship authoritative", () => {
    expect(
      recordPartyId({ party_id: "party-document", projectId: "project-1" }, [
        { id: "project-1", client_party_id: "party-project" },
      ]),
    ).toBe("party-document");
  });
});
