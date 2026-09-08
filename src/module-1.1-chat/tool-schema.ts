const GEMINI_TYPES = new Set(['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY', 'OBJECT', 'NULL']);

export function toGeminiSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema;

  const source = schema as Record<string, unknown>;
  const result: Record<string, unknown> = { ...source };
  if (typeof source.type === 'string') {
    const type = source.type.toUpperCase();
    if (GEMINI_TYPES.has(type)) result.type = type;
  }

  if (source.properties && typeof source.properties === 'object') {
    const properties = source.properties as Record<string, unknown>;
    result.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, toGeminiSchema(value)]),
    );
  }
  if (source.items) result.items = toGeminiSchema(source.items);
  return result;
}