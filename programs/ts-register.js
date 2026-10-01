// Lets mocha load the TypeScript tests: ts-node with this folder's tsconfig,
// transpile only (no type-check), the way the suite has always run.
require("ts-node").register({
  project: "./tsconfig.json",
  transpileOnly: true,
});
