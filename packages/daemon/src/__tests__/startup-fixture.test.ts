import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agents, projects } from "@orch/shared/db";
import { eq } from "drizzle-orm";
import { setupTestDb, teardownTestDb } from "./helpers/test-db.js";
import { buildStartupTestServer } from "./helpers/startup-server.js";
import { deferred } from "./helpers/async-work.js";
import { SeedingService } from "../services/seeding.service.js";
import { SchedulerService } from "../services/scheduler.service.js";
import { ChatService } from "../services/chat.service.js";

function throwFixtureFailures(failures: unknown[]) {
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, failures.map(String).join("; "));
  }
}

describe("startup fixture ownership", () => {
  it("reports the assertion alongside an unexpected cleanup failure", () => {
    const assertion = new Error("assertion failed");
    const cleanup = new Error("cleanup failed");
    try {
      throwFixtureFailures([assertion, cleanup]);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([assertion, cleanup]);
      expect((error as Error).message).toContain("assertion failed");
      expect((error as Error).message).toContain("cleanup failed");
    }
  });

  it.each(["success", "assertion", "provisioning rejection", "assertion and close rejection"])(
    "joins held real chat provisioning before SQL close: %s", async (failure) => {
      const db = await setupTestDb();
      const dir = mkdtempSync(join(tmpdir(), "orch-fixture-"));
      const entered = deferred();
      const release = deferred();
      let finished = false;
      const provision = SeedingService.prototype.provisionChatAgent;
      const spy = vi.spyOn(SeedingService.prototype, "provisionChatAgent").mockImplementation(async function (this: SeedingService, ...args) {
        entered.resolve();
        await release.promise;
        try {
          const result = await provision.apply(this, args);
          if (failure === "provisioning rejection") throw new Error("injected provisioning rejection");
          return result;
        } finally { finished = true; }
      });
      let fixture: ReturnType<typeof buildStartupTestServer> | undefined;
      let closing: ReturnType<typeof vi.spyOn> | undefined;
      const failures: unknown[] = [];
      let assertedCloseFailure: unknown;
      let assertionFailure: unknown;
      const closeFailure = new Error("injected close failure");
      try {
        const [project] = await db.db.insert(projects).values({ name: "Startup", slug: "startup", homeDir: dir }).returning();
        fixture = buildStartupTestServer({ databaseUrl: db.connectionUri });
        const owner = fixture;
        const close = owner.app.close.bind(owner.app);
        const closeStates: boolean[] = [];
        closing = vi.spyOn(owner.app, "close").mockImplementation((async () => {
          closeStates.push(finished);
          await close();
          if (failure === "assertion and close rejection" && closeStates.length === 1) throw closeFailure;
        }) as typeof owner.app.close);
        let ready = false;
        const readiness = owner.ready().then(() => { ready = true; });
        // Attach a handler immediately; the negative case is asserted below.
        void readiness.catch(() => {});
        await entered.promise;
        expect(ready).toBe(false);
        const scenario = async () => {
          const scenarioFailures: unknown[] = [];
          try {
            if (failure === "assertion") expect("actual").toBe("expected");
            if (failure === "assertion and close rejection") {
              try { expect("actual").toBe("expected"); }
              catch (error) { assertionFailure = error; throw error; }
            }
          } catch (error) {
            scenarioFailures.push(error);
          } finally {
            release.resolve();
            try { await owner.close(); }
            catch (error) {
              if (failure === "assertion and close rejection") assertedCloseFailure = error;
              scenarioFailures.push(error);
            }
          }
          throwFixtureFailures(scenarioFailures);
        };
        if (failure === "success") await scenario();
        else if (failure === "assertion and close rejection") {
          try {
            await scenario();
            expect.unreachable();
          } catch (error) {
            expect(assertionFailure).toBeDefined();
            expect(error).toBeInstanceOf(AggregateError);
            expect((error as AggregateError).errors).toEqual([assertionFailure, closeFailure]);
            expect((error as AggregateError).errors[0]).toBe(assertionFailure);
            expect((error as AggregateError).errors[1]).toBe(closeFailure);
          }
        } else await expect(scenario().catch((error) => {
          if (failure === "provisioning rejection") assertedCloseFailure = error;
          throw error;
        })).rejects.toThrow(failure === "assertion" ? "expected" : "Unexpected startup errors");
        if (failure === "provisioning rejection") await expect(readiness).rejects.toThrow("Unexpected startup errors");
        else await readiness;
        expect(closeStates).toEqual([true]);
        const rows = await db.db.select().from(agents).where(eq(agents.projectId, project.id));
        expect(rows.some((agent) => agent.id === "chat")).toBe(true);
        await expect(owner.app.db.select().from(agents)).rejects.toThrow();
      } catch (error) {
        failures.push(error);
      } finally {
        release.resolve();
        try { await fixture?.close(); }
        catch (error) {
          // Only ignore the exact close rejection already asserted by the scenario.
          if (error !== assertedCloseFailure) failures.push(error);
        }
        try { closing?.mockRestore(); }
        catch (error) { failures.push(error); }
        try { spy.mockRestore(); }
        catch (error) { failures.push(error); }
        try { await teardownTestDb(db); }
        catch (error) { failures.push(error); }
        try { rmSync(dir, { recursive: true, force: true }); }
        catch (error) { failures.push(error); }
      }
      throwFixtureFailures(failures);
    }, 20_000,
  );

  it("retains join and app close failures when both reject", async () => {
    const db = await setupTestDb();
    const original = SchedulerService.prototype.resumeInterruptedRuns;
    const joinFailure = new Error("injected startup join failure");
    const closeFailure = new Error("injected app close failure");
    SchedulerService.prototype.resumeInterruptedRuns = async () => { throw joinFailure; };
    let fixture: ReturnType<typeof buildStartupTestServer> | undefined;
    let closing: ReturnType<typeof vi.spyOn> | undefined;
    const failures: unknown[] = [];
    let assertedCloseFailure: unknown;
    try {
      fixture = buildStartupTestServer({ databaseUrl: db.connectionUri });
      const owner = fixture;
      const close = owner.app.close.bind(owner.app);
      closing = vi.spyOn(owner.app, "close").mockImplementation((async () => {
        await close();
        throw closeFailure;
      }) as unknown as typeof owner.app.close);
      const firstClose = owner.close();
      expect(owner.close()).toBe(firstClose);
      try {
        await firstClose;
        expect.unreachable("both failures should reject close");
      } catch (error) {
        assertedCloseFailure = error;
        expect(error).toBeInstanceOf(AggregateError);
        const causes = (error as AggregateError).errors;
        expect(causes).toHaveLength(2);
        expect(causes[0]).toBeInstanceOf(AggregateError);
        expect((causes[0] as AggregateError).errors).toContain(joinFailure);
        expect(causes[1]).toBe(closeFailure);
      }
      expect(closing).toHaveBeenCalledTimes(1);
      await expect(owner.app.db.select().from(agents)).rejects.toThrow();
    } catch (error) {
      failures.push(error);
    } finally {
      try { await fixture?.close(); }
      catch (error) { if (error !== assertedCloseFailure) failures.push(error); }
      try { closing?.mockRestore(); }
      catch (error) { failures.push(error); }
      SchedulerService.prototype.resumeInterruptedRuns = original;
      try { await teardownTestDb(db); }
      catch (error) { failures.push(error); }
    }
    throwFixtureFailures(failures);
  });

  it.each([
    [SchedulerService.prototype, "resumeInterruptedRuns"],
    [ChatService.prototype, "reapOrphanedChatMessages"],
  ] as const)("observes detached startup failures %#", async (target, method) => {
    const db = await setupTestDb();
    const original = (target as any)[method];
    (target as any)[method] = async () => { throw new Error(`injected ${method}`); };
    const fixture = buildStartupTestServer({ databaseUrl: db.connectionUri });
    try {
      await expect(fixture.ready()).rejects.toThrow("Unexpected startup errors");
      await expect(fixture.close()).rejects.toThrow("Unexpected startup errors");
      await expect(fixture.app.db.select().from(agents)).rejects.toThrow();
    } finally {
      try { await fixture.close().catch(() => {}); }
      finally { (target as any)[method] = original; await teardownTestDb(db); }
    }
  });
});
