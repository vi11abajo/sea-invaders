// Flattens a compiled message's instructions to `{ programId, accountKeys, data }[]` (base58 keys,
// raw `Buffer` data). One pure function shared by production (`chain/readers.js#getConfirmedInstructions`,
// against a real RPC response) and tests (`test/helpers/fixtureTx.js`, against a locally-built
// transaction) - so a test fixture is flattened exactly the way a real confirmed transaction is,
// address-lookup-table accounts included. `keys` is a `MessageAccountKeys` (from `message.getAccountKeys(...)`),
// which resolves both static and looked-up indexes.
export function flattenInstructions(message, keys) {
  return message.compiledInstructions.map((ix) => ({
    programId: keys.get(ix.programIdIndex).toBase58(),
    accountKeys: ix.accountKeyIndexes.map((i) => keys.get(i).toBase58()),
    data: Buffer.from(ix.data),
  }));
}
