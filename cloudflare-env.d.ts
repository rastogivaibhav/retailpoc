declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    OWNER_EMAILS?: string;
    OPERATIONS_RUNNER_KEY?: string;
    BUCKET?: R2Bucket;
    AI_SETTINGS_KEY?: string;
    NVIDIA_API_KEY?: string;
  }
}
