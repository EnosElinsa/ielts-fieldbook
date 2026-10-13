let currentId: string | null = null;
let generation = 0;

export function accountId() { return currentId; }
export function accountGeneration() { return generation; }
export function setAccountIdentity(id: string | null) { currentId = id; }
export function beginAccountLoad() { generation += 1; return generation; }
export function resetAccountIdentity() { generation += 1; currentId = null; }
