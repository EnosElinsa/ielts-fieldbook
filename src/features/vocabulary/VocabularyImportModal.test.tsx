import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { VocabularyImportModal } from "./VocabularyImportModal";

const { fb, importer } = vi.hoisted(() => ({
  fb: { current: null as any },
  importer: { merge: vi.fn() },
}));
vi.mock("../../context/FieldbookContext", () => ({
  useFieldbook: () => fb.current,
}));
vi.mock("../../domain/vocabulary/import", () => ({
  parseVocabularyImport: (text: string) => {
    if (text === "invalid") throw new Error("Invalid snapshot version.");
    return { provider: "csv", records: [{ term: "resilient" }] };
  },
  previewVocabularyImport: () => ({
    matched: 0,
    imported: 1,
    duplicated: 0,
    missingEnrichment: 0,
    manualReviewRequired: 0,
    invalid: 0,
  }),
  mergeVocabularyImport: importer.merge,
}));
beforeEach(() => {
  fb.current = {
    modal: "vocabularyImport",
    stateRef: { current: { vocabularyImportBatches: [] } },
    persistVocabularyImport: vi.fn(async () => true),
    closeModal: vi.fn(),
    toast: vi.fn(),
  };
  importer.merge.mockReset().mockImplementation((draft: any) => {
    draft.vocabularyImportBatches.push({ id: "batch-1" });
    return { imported: 1 };
  });
});
afterEach(cleanup);

test("previews first and closes only after the atomic import save completes", async () => {
  let finish: (value: boolean) => void;
  fb.current.persistVocabularyImport.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<VocabularyImportModal />);
  const user = userEvent.setup();
  expect(
    screen.getByRole("button", { name: "Import vocabulary" }),
  ).toBeDisabled();
  await user.type(
    screen.getByRole("textbox", { name: "Export contents" }),
    "term\nresilient",
  );
  await user.click(screen.getByRole("button", { name: "Preview import" }));
  expect(screen.getByText("Matched entries")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Import vocabulary" }));
  expect(fb.current.persistVocabularyImport).toHaveBeenCalledWith(
    expect.objectContaining({ vocabularyImportBatches: [{ id: "batch-1" }] }),
    "batch-1",
  );
  expect(fb.current.closeModal).not.toHaveBeenCalled();
  finish!(true);
  expect(
    await screen.findByRole("button", { name: "Import vocabulary" }),
  ).toBeEnabled();
  expect(fb.current.closeModal).toHaveBeenCalledOnce();
});

test("failed atomic import can retry the same batch without merging twice", async () => {
  fb.current.persistVocabularyImport
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  render(<VocabularyImportModal />);
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("textbox", { name: "Export contents" }),
    "term\nresilient",
  );
  await user.click(screen.getByRole("button", { name: "Preview import" }));
  await user.click(screen.getByRole("button", { name: "Import vocabulary" }));
  expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
  expect(fb.current.closeModal).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Retry import" }));
  expect(importer.merge).toHaveBeenCalledOnce();
  expect(fb.current.persistVocabularyImport).toHaveBeenCalledTimes(2);
  expect(fb.current.closeModal).toHaveBeenCalledOnce();
});

test("parser validation errors remain in the import dialog", async () => {
  render(<VocabularyImportModal />);
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("textbox", { name: "Export contents" }),
    "invalid",
  );
  await user.click(screen.getByRole("button", { name: "Preview import" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Invalid snapshot version.",
  );
  expect(
    screen.getByRole("button", { name: "Import vocabulary" }),
  ).toBeDisabled();
});
