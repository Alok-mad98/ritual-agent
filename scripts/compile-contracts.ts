import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import solc from 'solc';

const CONTRACT_DIR = resolve('contracts');
const OUTPUT_DIR = resolve('contracts', 'artifacts');

function findImports(importPath: string): { contents: string } | { error: string } {
  try {
    const fullPath = resolve(CONTRACT_DIR, importPath);
    return { contents: readFileSync(fullPath, 'utf-8') };
  } catch {
    return { error: `File not found: ${importPath}` };
  }
}

function compileContract(name: string): {
  abi: unknown[];
  bytecode: `0x${string}`;
} {
  const filePath = resolve(CONTRACT_DIR, `${name}.sol`);
  const source = readFileSync(filePath, 'utf-8');

  const input = {
    language: 'Solidity',
    sources: {
      [`${name}.sol`]: { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  if (output.errors) {
    const hasError = output.errors.some((e: { severity: string }) => e.severity === 'error');
    if (hasError) {
      console.error('Compilation errors:');
      for (const err of output.errors) {
        console.error(err.formattedMessage);
      }
      process.exit(1);
    }
  }

  const contract = output.contracts[`${name}.sol`][name];
  const abi = contract.abi;
  const bytecode = `0x${contract.evm.bytecode.object}` as `0x${string}`;

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  writeFileSync(
    resolve(OUTPUT_DIR, `${name}.json`),
    JSON.stringify({ abi, bytecode }, null, 2),
  );

  return { abi, bytecode };
}

async function main(): Promise<void> {
  const contracts = ['RitualChatPayment'];
  for (const name of contracts) {
    console.log(`Compiling ${name}...`);
    const result = compileContract(name);
    console.log(`  ABI entries: ${result.abi.length}`);
    console.log(`  Bytecode size: ${(result.bytecode.length - 2) / 2} bytes`);
    console.log(`  Output: contracts/artifacts/${name}.json`);
  }
}

main().catch(err => {
  console.error('Compile error:', err);
  process.exit(1);
});
