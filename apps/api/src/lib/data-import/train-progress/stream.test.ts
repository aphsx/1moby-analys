import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearProgressStoreForTest,
  getTrainImportSnapshot,
  publishTrainImportDone,
  publishTrainImportError,
  publishTrainImportProgress,
} from "./stream";

describe("train-progress stream (in-memory)", () => {
  beforeEach(() => {
    clearProgressStoreForTest();
  });

  test("publishes progress events", async () => {
    await publishTrainImportProgress("src-1", {
      progress: 25,
      step: "Importing: users…",
      phase: "raw",
      sheet: "users",
    });

    const snap = getTrainImportSnapshot("src-1");
    expect(snap).toBeDefined();
    expect(snap?.kind).toBe("progress");
    if (snap?.kind === "progress") {
      expect(snap.event.progress).toBe(25);
      expect(snap.event.step).toBe("Importing: users…");
      expect(snap.event.sheet).toBe("users");
    }
  });

  test("publishes done event", async () => {
    await publishTrainImportDone("src-2", {
      source_id: "src-2",
      import_status: "ready",
      sheet_manifest: { users: 100 },
      file_checksum_sha256: "abc",
    });

    const snap = getTrainImportSnapshot("src-2");
    expect(snap).toBeDefined();
    expect(snap?.kind).toBe("done");
    if (snap?.kind === "done") {
      expect(snap.result.import_status).toBe("ready");
    }
  });

  test("publishes error event", async () => {
    await publishTrainImportError("src-3", "Malformed file", { code: "CORRUPT" });

    const snap = getTrainImportSnapshot("src-3");
    expect(snap).toBeDefined();
    expect(snap?.kind).toBe("failed");
    if (snap?.kind === "failed") {
      expect(snap.message).toBe("Malformed file");
      expect(snap.code).toBe("CORRUPT");
    }
  });
});

