import { afterEach, describe, expect, it, vi } from "vitest";
import {
  legalEntity,
  termsVersion,
  unresolvedLegalFields,
  type LegalEntity,
} from "./entity";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.resetModules();
});

const reloadWith = async (values: Record<string, string>) => {
  Object.assign(process.env, values);
  vi.resetModules();

  return import("./entity");
};

describe("legalEntity", () => {
  it("legalEntity_anEmptyEnvironmentVariable_fallsBackToThePlaceholder", async () => {
    const { legalEntity: reloaded, unresolvedLegalFields: report } = await reloadWith({
      LEGAL_HOLDER: "",
      LEGAL_TAX_ID: "",
      LEGAL_ADDRESS: "",
      LEGAL_EMAIL: "",
    });

    expect(report(reloaded)).toEqual(["holder", "taxId", "address", "email"]);
  });

  it("legalEntity_anEmptyDpo_isTreatedAsNotDesignated", async () => {
    const { legalEntity: reloaded } = await reloadWith({ LEGAL_DPO: "" });

    expect(reloaded.dpo).toBeUndefined();
  });

  it("legalEntity_aConfiguredHolder_isUsed", async () => {
    const { legalEntity: reloaded } = await reloadWith({
      LEGAL_HOLDER: "Ascenda SL",
    });

    expect(reloaded.holder).toBe("Ascenda SL");
  });

  it("legalEntity_everyRequiredField_isPresent", () => {
    expect(Object.keys(legalEntity)).toEqual(
      expect.arrayContaining(["holder", "taxId", "address", "email"]),
    );
  });

  it("termsVersion_matchesTheBackendFormat", () => {
    expect(termsVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("unresolvedLegalFields_aFilledInEntity_reportsNothingPending", () => {
    const filled: LegalEntity = {
      holder: "Rubén",
      taxId: "00000000A",
      address: "Calle de la Montaña 1",
      email: "hola@example.com",
    };

    expect(unresolvedLegalFields(filled)).toEqual([]);
  });

  it("unresolvedLegalFields_aPlaceholder_isReportedByName", () => {
    const partial: LegalEntity = {
      holder: "Rubén",
      taxId: "[PENDIENTE: NIF]",
      address: "Calle de la Montaña 1",
      email: "hola@example.com",
    };

    expect(unresolvedLegalFields(partial)).toEqual(["taxId"]);
  });

  it("unresolvedLegalFields_reportsEveryPlaceholderAtOnce", () => {
    const empty: LegalEntity = {
      holder: "[PENDIENTE: a]",
      taxId: "[PENDIENTE: b]",
      address: "[PENDIENTE: c]",
      email: "[PENDIENTE: d]",
    };

    expect(unresolvedLegalFields(empty)).toEqual([
      "holder",
      "taxId",
      "address",
      "email",
    ]);
  });
});
