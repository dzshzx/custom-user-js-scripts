import { Command } from 'commander';

// Shared commander setup for the browser tools. Callers keep their own help text
// and receive plain Errors, so `main` reports every parse failure the same way.
export function createCli() {
  return new Command()
    .helpOption(false)
    .option('-h, --help')
    .allowExcessArguments(false)
    .exitOverride()
    .configureOutput({ writeOut: () => {}, writeErr: () => {} });
}

export function requireValue(flagName) {
  return (value) => {
    if (!value) throw new Error(`${flagName} requires a value`);
    return value;
  };
}

export function appendValue(flagName) {
  const check = requireValue(flagName);
  return (value, previous) => [...previous, check(value)];
}

export function parseInteger(value, flagName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flagName} expects a non-negative integer, got: ${value}`);
  }
  return parsed;
}

export function integerValue(flagName) {
  const check = requireValue(flagName);
  return (value) => parseInteger(check(value), flagName);
}

export function parseCli(program, argv) {
  try {
    program.parse(argv, { from: 'user' });
  } catch (error) {
    if (error.code === 'commander.unknownOption') {
      const unknown = /unknown option '([^']+)'/.exec(error.message)?.[1];
      throw new Error(`Unknown argument: ${unknown}`, { cause: error });
    }
    if (error.code === 'commander.excessArguments') {
      throw new Error(`Unknown argument: ${program.args[0]}`, { cause: error });
    }
    if (error.code === 'commander.optionMissingArgument') {
      const flag = /'(-[^' ]+)/.exec(error.message)?.[1] ?? '';
      const long = program.options.find((option) => option.flags.includes(flag))?.long ?? flag;
      throw new Error(`${long} requires a value`, { cause: error });
    }
    throw error;
  }
  return program.opts();
}
