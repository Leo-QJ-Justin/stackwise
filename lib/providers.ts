import { execFile } from "child_process";
import type { LanguageModel } from "ai";

export { PROVIDERS, getProvider } from "./shared";
export type { ProviderConfig } from "./shared";

/**
 * Create an AI SDK LanguageModel for the given provider and config.
 */
export async function createModel(
  providerId: string,
  apiKey: string,
  modelId: string
): Promise<LanguageModel> {
  switch (providerId) {
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey })(modelId);
    }
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({ apiKey })(modelId);
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      return createGoogleGenerativeAI({ apiKey })(modelId);
    }
    case "mistral": {
      const { createMistral } = await import("@ai-sdk/mistral");
      return createMistral({ apiKey })(modelId);
    }
    case "bedrock": {
      const parts = apiKey.split(":");
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        throw new Error(
          "Amazon Bedrock credentials must be in format ACCESS_KEY:SECRET_KEY:REGION. " +
          "Region defaults to us-east-1 if omitted."
        );
      }
      const { createAmazonBedrock } = await import("@ai-sdk/amazon-bedrock");
      return createAmazonBedrock({
        accessKeyId: parts[0],
        secretAccessKey: parts[1],
        region: parts[2] || "us-east-1",
      })(modelId);
    }
    case "openrouter": {
      const { createOpenRouter } = await import(
        "@openrouter/ai-sdk-provider"
      );
      return createOpenRouter({ apiKey })(modelId);
    }
    case "ollama": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({
        baseURL: "http://localhost:11434/v1",
        apiKey: "ollama",
      })(modelId);
    }
    default:
      throw new Error(`Unknown provider: ${providerId}`);
  }
}

/**
 * Run classification via Claude Code CLI.
 * Returns raw JSON string from claude -p.
 */
export function classifyViaCLI(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "claude",
      ["-p", "--output-format", "json"],
      { timeout: 60000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const errno = (error as NodeJS.ErrnoException).code;
          if (errno === "ENOENT") {
            reject(new Error(
              'Claude Code CLI ("claude") is not installed or not in your PATH. ' +
              "Install it or select a different provider in Settings."
            ));
          } else if (error.killed || error.signal === "SIGTERM") {
            reject(new Error(
              "Claude CLI timed out after 60 seconds. The prompt may be too large."
            ));
          } else {
            reject(new Error(`Claude CLI failed: ${stderr || error.message}`));
          }
          return;
        }
        if (!stdout.trim()) {
          reject(new Error("Claude CLI returned an empty response."));
          return;
        }
        resolve(stdout);
      }
    );

    if (!child.stdin) {
      reject(new Error("Failed to open stdin for Claude CLI process."));
      return;
    }

    child.stdin.on("error", (err) => {
      reject(new Error(`Failed to write prompt to Claude CLI: ${err.message}`));
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
