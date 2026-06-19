import type { RawSchemaBlock, SchemaAnalysis, SchemaEntity } from './types';

/** Strip a schema.org URL/prefix to its bare type name ('.../Product' → 'Product'). */
function localName(type: string): string {
  const slash = type.lastIndexOf('/');
  const hash = type.lastIndexOf('#');
  const cut = Math.max(slash, hash);
  return cut >= 0 ? type.slice(cut + 1) : type;
}

/**
 * Resolves a node's @type to a single display name. Handles string and array
 * forms and full-URL types; for arrays, uses the first member.
 * @param node - A parsed structured-data node.
 * @returns {string} The local type name, or 'Unknown' when @type is absent.
 */
export function schemaTypeName(node: Record<string, unknown>): string {
  const raw = node['@type'];
  if (typeof raw === 'string') return localName(raw);
  if (Array.isArray(raw)) {
    const names = raw.filter((t): t is string => typeof t === 'string').map(localName);
    return names[0] ?? 'Unknown';
  }
  return 'Unknown';
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Collects the root nodes from one parsed block (object, array, or @graph).
 * When splitting a @graph, the wrapper's @context is copied onto each member
 * that lacks its own, so a single entity stays valid standalone JSON-LD when
 * copied or exported (validators reject a node with no @context).
 */
function rootsOf(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed.filter(isObject);
  if (isObject(parsed)) {
    if (Array.isArray(parsed['@graph'])) {
      const context = parsed['@context'];
      return parsed['@graph'].filter(isObject).map((node) => {
        if (context === undefined || node['@context'] !== undefined) return node;
        // Fresh object per member; @context first so copied JSON-LD reads naturally.
        return Object.assign({ '@context': context }, node);
      });
    }
    return [parsed];
  }
  return [];
}

/**
 * Parses the page's JSON-LD blocks into a flat list of entities.
 *
 * Each block is re-parsed from its raw text (cheap, and keeps the content-script
 * payload to plain strings). Malformed blocks are reported separately rather
 * than thrown. Well-formed blocks are flattened — top-level object, top-level
 * array, or @graph members each become an entity.
 *
 * @param {RawSchemaBlock[]} blocks - JSON-LD blocks in DOM order.
 * @returns {SchemaAnalysis} Entities plus any malformed blocks.
 */
export function analyzeSchema(blocks: RawSchemaBlock[]): SchemaAnalysis {
  const entities: SchemaEntity[] = [];
  const invalidBlocks: SchemaAnalysis['invalidBlocks'] = [];

  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block.raw);
    } catch (err) {
      invalidBlocks.push({ blockIndex: block.index, error: block.parseError ?? (err as Error).message });
      continue;
    }
    for (const node of rootsOf(parsed)) {
      entities.push({ type: schemaTypeName(node), blockIndex: block.index, data: node });
    }
  }

  return { entities, invalidBlocks };
}
