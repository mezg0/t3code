import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, it, assert } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Sink, Stream } from "effect";
import * as PlatformError from "effect/PlatformError";
import { ChildProcessSpawner } from "effect/unstable/process";

import {
  checkCodexProviderStatus,
  checkOpenCodeProviderStatus,
  hasCustomModelProvider,
  parseAuthStatusFromOutput,
  readCodexConfigModelProvider,
} from "./ProviderHealth";

const encoder = new TextEncoder();

function mockHandle(result: { stdout: string; stderr: string; code: number }) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(result.code)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    stdin: Sink.drain,
    stdout: Stream.make(encoder.encode(result.stdout)),
    stderr: Stream.make(encoder.encode(result.stderr)),
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

function mockSpawnerLayer(
  handler: (args: ReadonlyArray<string>) => { stdout: string; stderr: string; code: number },
) {
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) => {
      const cmd = command as unknown as { args: ReadonlyArray<string> };
      return Effect.succeed(mockHandle(handler(cmd.args)));
    }),
  );
}

function failingSpawnerLayer(description: string) {
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() =>
      Effect.fail(
        PlatformError.systemError({
          _tag: "NotFound",
          module: "ChildProcess",
          method: "spawn",
          description,
        }),
      ),
    ),
  );
}

function withTempCodexHome(configContent?: string) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-test-codex-" });

    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const originalCodexHome = process.env.CODEX_HOME;
        process.env.CODEX_HOME = tmpDir;
        return originalCodexHome;
      }),
      (originalCodexHome) =>
        Effect.sync(() => {
          if (originalCodexHome !== undefined) {
            process.env.CODEX_HOME = originalCodexHome;
          } else {
            delete process.env.CODEX_HOME;
          }
        }),
    );

    if (configContent !== undefined) {
      yield* fileSystem.writeFileString(path.join(tmpDir, "config.toml"), configContent);
    }

    return { tmpDir } as const;
  });
}

it.layer(NodeServices.layer)("ProviderHealth", (it) => {
  describe("checkCodexProviderStatus", () => {
    it.effect("returns ready when codex is installed and authenticated", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome();
        const status = yield* checkCodexProviderStatus;
        assert.strictEqual(status.provider, "codex");
        assert.strictEqual(status.status, "ready");
        assert.strictEqual(status.available, true);
        assert.strictEqual(status.authStatus, "authenticated");
      }).pipe(
        Effect.provide(
          mockSpawnerLayer((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "codex 1.0.0\n", stderr: "", code: 0 };
            if (joined === "login status") return { stdout: "Logged in\n", stderr: "", code: 0 };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );

    it.effect("returns unavailable when codex is missing", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome();
        const status = yield* checkCodexProviderStatus;
        assert.strictEqual(status.provider, "codex");
        assert.strictEqual(status.status, "error");
        assert.strictEqual(status.available, false);
        assert.strictEqual(status.authStatus, "unknown");
        assert.strictEqual(status.message, "Codex CLI (`codex`) is not installed or not on PATH.");
      }).pipe(Effect.provide(failingSpawnerLayer("spawn codex ENOENT"))),
    );

    it.effect("returns unavailable when codex is below the minimum supported version", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome();
        const status = yield* checkCodexProviderStatus;
        assert.strictEqual(status.provider, "codex");
        assert.strictEqual(status.status, "error");
        assert.strictEqual(status.available, false);
        assert.strictEqual(status.authStatus, "unknown");
        assert.strictEqual(
          status.message,
          "Codex CLI v0.36.0 is too old for T3 Code. Upgrade to v0.37.0 or newer and restart T3 Code.",
        );
      }).pipe(
        Effect.provide(
          mockSpawnerLayer((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "codex 0.36.0\n", stderr: "", code: 0 };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );

    it.effect("returns unauthenticated when auth probe reports login required", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome();
        const status = yield* checkCodexProviderStatus;
        assert.strictEqual(status.provider, "codex");
        assert.strictEqual(status.status, "error");
        assert.strictEqual(status.available, true);
        assert.strictEqual(status.authStatus, "unauthenticated");
        assert.strictEqual(
          status.message,
          "Codex CLI is not authenticated. Run `codex login` and try again.",
        );
      }).pipe(
        Effect.provide(
          mockSpawnerLayer((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "codex 1.0.0\n", stderr: "", code: 0 };
            if (joined === "login status") {
              return { stdout: "", stderr: "Not logged in. Run codex login.", code: 1 };
            }
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );

    it.effect("returns unauthenticated when login status output includes 'not logged in'", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome();
        const status = yield* checkCodexProviderStatus;
        assert.strictEqual(status.provider, "codex");
        assert.strictEqual(status.status, "error");
        assert.strictEqual(status.available, true);
        assert.strictEqual(status.authStatus, "unauthenticated");
        assert.strictEqual(
          status.message,
          "Codex CLI is not authenticated. Run `codex login` and try again.",
        );
      }).pipe(
        Effect.provide(
          mockSpawnerLayer((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "codex 1.0.0\n", stderr: "", code: 0 };
            if (joined === "login status")
              return { stdout: "Not logged in\n", stderr: "", code: 1 };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );

    it.effect("returns warning when login status command is unsupported", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome();
        const status = yield* checkCodexProviderStatus;
        assert.strictEqual(status.provider, "codex");
        assert.strictEqual(status.status, "warning");
        assert.strictEqual(status.available, true);
        assert.strictEqual(status.authStatus, "unknown");
        assert.strictEqual(
          status.message,
          "Codex CLI authentication status command is unavailable in this Codex version.",
        );
      }).pipe(
        Effect.provide(
          mockSpawnerLayer((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "codex 1.0.0\n", stderr: "", code: 0 };
            if (joined === "login status") {
              return { stdout: "", stderr: "error: unknown command 'login'", code: 2 };
            }
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );
  });

  describe("checkOpenCodeProviderStatus", () => {
    it.effect("returns ready when opencode is installed", () =>
      Effect.gen(function* () {
        const status = yield* checkOpenCodeProviderStatus;
        assert.strictEqual(status.provider, "opencode");
        assert.strictEqual(status.status, "ready");
        assert.strictEqual(status.available, true);
        assert.strictEqual(status.authStatus, "unknown");
      }).pipe(
        Effect.provide(
          mockSpawnerLayer((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "opencode 1.0.0\n", stderr: "", code: 0 };
            throw new Error(`Unexpected args: ${joined}`);
          }),
        ),
      ),
    );
  });

  describe("checkCodexProviderStatus with custom model provider", () => {
    it.effect("skips auth probe and returns ready when a custom model provider is configured", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome(
          [
            'model_provider = "portkey"',
            "",
            "[model_providers.portkey]",
            'base_url = "https://api.portkey.ai/v1"',
            'env_key = "PORTKEY_API_KEY"',
          ].join("\n"),
        );
        const status = yield* checkCodexProviderStatus;
        assert.strictEqual(status.provider, "codex");
        assert.strictEqual(status.status, "ready");
        assert.strictEqual(status.available, true);
        assert.strictEqual(status.authStatus, "unknown");
        assert.strictEqual(
          status.message,
          "Using a custom Codex model provider; OpenAI login check skipped.",
        );
      }).pipe(
        Effect.provide(
          mockSpawnerLayer((args) => {
            const joined = args.join(" ");
            if (joined === "--version") return { stdout: "codex 1.0.0\n", stderr: "", code: 0 };
            throw new Error(`Auth probe should have been skipped but got args: ${joined}`);
          }),
        ),
      ),
    );

    it.effect("still reports error when codex CLI is missing even with custom provider", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome('model_provider = "portkey"\n');
        const status = yield* checkCodexProviderStatus;
        assert.strictEqual(status.status, "error");
        assert.strictEqual(status.available, false);
      }).pipe(Effect.provide(failingSpawnerLayer("spawn codex ENOENT"))),
    );
  });

  describe("readCodexConfigModelProvider", () => {
    it.effect("returns undefined when config file does not exist", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome();
        assert.strictEqual(yield* readCodexConfigModelProvider, undefined);
      }),
    );

    it.effect("returns the provider when model_provider is set at top level", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome('model = "gpt-5-codex"\nmodel_provider = "portkey"\n');
        assert.strictEqual(yield* readCodexConfigModelProvider, "portkey");
      }),
    );
  });

  describe("hasCustomModelProvider", () => {
    it.effect("returns false when model_provider is openai", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome('model_provider = "openai"\n');
        assert.strictEqual(yield* hasCustomModelProvider, false);
      }),
    );

    it.effect("returns true when model_provider is portkey", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome('model_provider = "portkey"\n');
        assert.strictEqual(yield* hasCustomModelProvider, true);
      }),
    );
  });

  describe("parseAuthStatusFromOutput", () => {
    it("exit code 0 with no auth markers is ready", () => {
      const parsed = parseAuthStatusFromOutput({ stdout: "OK\n", stderr: "", code: 0 });
      assert.strictEqual(parsed.status, "ready");
      assert.strictEqual(parsed.authStatus, "authenticated");
    });

    it("JSON with authenticated=false is unauthenticated", () => {
      const parsed = parseAuthStatusFromOutput({
        stdout: '[{"authenticated":false}]\n',
        stderr: "",
        code: 0,
      });
      assert.strictEqual(parsed.status, "error");
      assert.strictEqual(parsed.authStatus, "unauthenticated");
    });

    it("JSON without auth marker is warning", () => {
      const parsed = parseAuthStatusFromOutput({
        stdout: '[{"ok":true}]\n',
        stderr: "",
        code: 0,
      });
      assert.strictEqual(parsed.status, "warning");
      assert.strictEqual(parsed.authStatus, "unknown");
    });
  });
});
