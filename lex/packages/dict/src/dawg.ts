// Compact binary DAWG (DESIGN §5.4): built once at build time from a sorted
// word list (Daciuk-style incremental minimization), decoded everywhere by
// one pure, zero-dependency reader shared by app, functions, and tests.
//
// Binary layout (little-endian):
//   0   u32 magic 'LXDW' (0x4c584457)
//   4   u32 version (1)
//   8   u32 wordCount
//   12  u32 edgeCount
//   16  u32 root first-edge index
//   20  32 bytes sha256 (hex-decoded) of the normalized list joined by '\n'
//   52  u8  id length, then id bytes (ASCII), padded to a 4-byte boundary
//   ... u32 edges: bits 0–4 letter (0=A), bit 5 terminal, bit 6 last-edge,
//       bits 7–31 child first-edge index (0 = no children)
// Edge index 0 is a reserved sentinel; real edges start at 1.

const MAGIC = 0x4c584457; // 'LXDW'
const VERSION = 1;

export interface DawgDictionary {
  id: string;
  wordCount: number;
  sourceHash: string;
  has(word: string): boolean;
}

interface BuildNode {
  edges: Map<number, BuildNode>;
  terminal: boolean;
  id: number; // unique id once registered (for signatures)
  firstEdge: number; // assigned during serialization
}

function newNode(): BuildNode {
  return { edges: new Map(), terminal: false, id: -1, firstEdge: 0 };
}

/** Incremental minimal-DAWG construction over a SORTED unique word list. */
function buildMinimalDawg(words: readonly string[]): BuildNode {
  const register = new Map<string, BuildNode>();
  let nextId = 0;

  const signatureOf = (node: BuildNode): string => {
    let signature = node.terminal ? 'T' : 'F';
    for (const [letter, child] of node.edges) signature += `${letter}.${child.id},`;
    return signature;
  };

  const root = newNode();
  // Path of the previous word: [parent, letter, child] per depth.
  const unchecked: Array<[BuildNode, number, BuildNode]> = [];

  const minimize = (downTo: number): void => {
    while (unchecked.length > downTo) {
      const [parent, letter, child] = unchecked.pop()!;
      const signature = signatureOf(child);
      const existing = register.get(signature);
      if (existing) {
        parent.edges.set(letter, existing);
      } else {
        child.id = nextId++;
        register.set(signature, child);
      }
    }
  };

  let previous = '';
  for (const word of words) {
    if (word <= previous) throw new Error(`word list must be sorted unique: '${word}' after '${previous}'`);
    let common = 0;
    while (common < word.length && common < previous.length && word[common] === previous[common]) common++;
    minimize(common);

    let node = unchecked.length > 0 ? unchecked[unchecked.length - 1]![2] : root;
    for (let i = common; i < word.length; i++) {
      const letter = word.charCodeAt(i) - 65;
      if (letter < 0 || letter > 25) throw new Error(`non A–Z letter in '${word}'`);
      const child = newNode();
      node.edges.set(letter, child);
      unchecked.push([node, letter, child]);
      node = child;
    }
    node.terminal = true;
    previous = word;
  }
  minimize(0);
  return root;
}

/** Serialize to the binary layout above. */
export function buildDawg(words: readonly string[], id: string, sourceHashHex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(sourceHashHex)) throw new Error('sourceHashHex must be a sha256 hex string');
  const root = buildMinimalDawg(words);

  // Collect unique nodes (post-minimization) and assign edge slots. Slot 0
  // is reserved, so the first node starts at 1. Childless nodes keep 0.
  const seen = new Set<BuildNode>();
  const order: BuildNode[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (seen.has(node)) continue;
    seen.add(node);
    if (node.edges.size > 0) order.push(node);
    for (const child of node.edges.values()) stack.push(child);
  }
  let nextEdge = 1;
  for (const node of order) {
    node.firstEdge = nextEdge;
    nextEdge += node.edges.size;
  }
  const edgeCount = nextEdge;
  if (edgeCount >= 1 << 25) throw new Error(`DAWG too large: ${edgeCount} edges`);

  const idBytes = new TextEncoder().encode(id);
  if (idBytes.length > 255) throw new Error('id too long');
  const headerLength = 52 + 1 + idBytes.length;
  const paddedHeader = Math.ceil(headerLength / 4) * 4;
  const buffer = new ArrayBuffer(paddedHeader + edgeCount * 4);
  const view = new DataView(buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, VERSION, true);
  view.setUint32(8, words.length, true);
  view.setUint32(12, edgeCount, true);
  view.setUint32(16, root.firstEdge, true);
  for (let i = 0; i < 32; i++) {
    view.setUint8(20 + i, parseInt(sourceHashHex.slice(i * 2, i * 2 + 2), 16));
  }
  view.setUint8(52, idBytes.length);
  new Uint8Array(buffer, 53, idBytes.length).set(idBytes);

  const edges = new Uint32Array(buffer, paddedHeader, edgeCount);
  for (const node of order) {
    const letters = [...node.edges.keys()].sort((a, b) => a - b);
    letters.forEach((letter, index) => {
      const child = node.edges.get(letter)!;
      let encoded = letter;
      if (child.terminal) encoded |= 1 << 5;
      if (index === letters.length - 1) encoded |= 1 << 6;
      encoded |= child.firstEdge << 7;
      edges[node.firstEdge + index] = encoded;
    });
  }
  return new Uint8Array(buffer);
}

/** Decode the binary into a Dictionary. Pure — runs in browser and node. */
export function decodeDawg(bytes: Uint8Array): DawgDictionary {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('not a LXDW dictionary');
  if (view.getUint32(4, true) !== VERSION) throw new Error('unsupported LXDW version');
  const wordCount = view.getUint32(8, true);
  const edgeCount = view.getUint32(12, true);
  const rootIndex = view.getUint32(16, true);
  let sourceHash = '';
  for (let i = 0; i < 32; i++) sourceHash += view.getUint8(20 + i).toString(16).padStart(2, '0');
  const idLength = view.getUint8(52);
  const id = new TextDecoder().decode(bytes.subarray(53, 53 + idLength));
  const paddedHeader = Math.ceil((53 + idLength) / 4) * 4;

  // Copy edges: the byte offset may not be 4-aligned relative to the buffer.
  const edges = new Uint32Array(edgeCount);
  for (let i = 0; i < edgeCount; i++) {
    edges[i] = view.getUint32(paddedHeader + i * 4, true);
  }

  const has = (word: string): boolean => {
    const upper = word.toUpperCase();
    if (upper.length === 0) return false;
    let nodeIndex = rootIndex;
    for (let i = 0; i < upper.length; i++) {
      if (nodeIndex === 0) return false;
      const target = upper.charCodeAt(i) - 65;
      if (target < 0 || target > 25) return false;
      let edge = 0;
      let cursor = nodeIndex;
      for (;;) {
        edge = edges[cursor]!;
        if ((edge & 31) === target) break;
        if (edge & (1 << 6)) return false; // last edge, no match
        cursor++;
      }
      if (i === upper.length - 1) return (edge & (1 << 5)) !== 0;
      nodeIndex = edge >>> 7;
    }
    return false;
  };

  return { id, wordCount, sourceHash, has };
}
