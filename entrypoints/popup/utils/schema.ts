import type { RawSchemaBlock, SchemaAnalysis, SchemaEntity, SummaryItem } from './types';
import { queryActiveTab } from './messaging';

/**
 * Extracts all JSON-LD structured-data blocks from the active tab via content script.
 * @returns {Promise<RawSchemaBlock[]>} Blocks in DOM order, or empty array on failure.
 */
export const getSchema = (): Promise<RawSchemaBlock[]> => queryActiveTab<RawSchemaBlock[]>('get_schema', []);

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
 * Roots from a single node: a @graph wrapper expands to its members, anything
 * else is its own root. Members inherit the wrapper @context so each stays valid
 * standalone JSON-LD when copied or exported (validators reject a node with no
 * @context).
 */
function rootsFromNode(node: Record<string, unknown>): Record<string, unknown>[] {
  const graph = node['@graph'];
  // @graph may be a node object or an array of node objects (JSON-LD 1.1).
  const members = Array.isArray(graph) ? graph : isObject(graph) ? [graph] : null;
  if (!members) return [node];
  const context = node['@context'];
  return members
    .filter(isObject)
    .map((member) =>
      context === undefined || member['@context'] !== undefined
        ? member
        : Object.assign({ '@context': context }, member)
    );
}

/**
 * Collects the root nodes from one parsed block. A block may be a single node, a
 * @graph wrapper, or a top-level array of either, so array elements run through
 * the same wrapper expansion.
 */
function rootsOf(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed.filter(isObject).flatMap(rootsFromNode);
  if (isObject(parsed)) return rootsFromNode(parsed);
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

/** Builds the Schema footer summary: entity-type count, plus invalid blocks when any failed to parse. */
export function summarizeSchema(analysis: SchemaAnalysis): SummaryItem[] {
  const n = analysis.entities.length;
  const items: SummaryItem[] = [{ text: `${n} ${n === 1 ? 'type' : 'types'}` }];
  if (analysis.invalidBlocks.length > 0) {
    items.push({
      text: `${analysis.invalidBlocks.length} invalid`,
      tone: 'err',
      title: 'Blocks that failed to parse as JSON'
    });
  }
  return items;
}
