import 'dotenv/config';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';

const REQUIRED_SECRETS = [
  'PRIVATE_KEY',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_KEY',
  'TINYFISH_API_KEY',
  'FIRECRAWL_API_KEY',
];

const ALIASES: Record<string, string[]> = {
  PRIVATE_KEY: ['private_key'],
  CLOUDFLARE_ACCOUNT_ID: ['cloud_flare_account_id'],
  CLOUDFLARE_API_KEY: ['cloud_flare_api_key'],
  TINYFISH_API_KEY: ['tiny_fish_api_key'],
  FIRECRAWL_API_KEY: ['fire_claw_api_key'],
};

function loadEnvFromFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const content = readFileSync(path, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      env[key] = value;
    }
  } catch {
    // ignore
  }
  return env;
}

function getValue(env: Record<string, string>, key: string): string | undefined {
  if (env[key]) return env[key];
  for (const alias of ALIASES[key] || []) {
    if (env[alias]) return env[alias];
  }
  return undefined;
}

async function main(): Promise<void> {
  const env = {
    ...process.env,
    ...loadEnvFromFile('.env'),
  } as Record<string, string>;

  const secrets: Record<string, string> = {};
  const missing: string[] = [];

  for (const key of REQUIRED_SECRETS) {
    const value = getValue(env, key);
    if (!value) {
      missing.push(key);
      continue;
    }
    secrets[key] = value;
  }

  if (missing.length > 0) {
    console.error('Missing required secrets in .env:');
    for (const key of missing) {
      console.error(`  - ${key}`);
      const aliases = ALIASES[key];
      if (aliases) {
        console.error(`    (also accepted: ${aliases.join(', ')})`);
      }
    }
    process.exit(1);
  }

  const tempFile = `wrangler-secrets-${Date.now()}.json`;
  writeFileSync(tempFile, JSON.stringify(secrets, null, 2));

  try {
    console.log('Uploading secrets to Cloudflare Workers...');
    execSync(`npx wrangler secret bulk ${tempFile}`, { stdio: 'inherit' });
    console.log('\nAll secrets uploaded successfully.');
  } finally {
    try {
      unlinkSync(tempFile);
      console.log('Temporary secrets file deleted.');
    } catch {
      // ignore
    }
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
