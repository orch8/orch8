/**
 * Renders an arbitrary JSON payload as formatted key-value pairs,
 * matching the dl grid style used by typed confirm/info cards.
 * Used by the generic fallback cards when strict validation fails.
 */
export function GenericPayload({ data }: { data: unknown }) {
  if (data == null) return null;

  if (typeof data !== "object") {
    return <span className="text-zinc-300">{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    return (
      <ul className="space-y-2">
        {data.map((item, i) => (
          <li key={i} className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
            <GenericPayload data={item} />
          </li>
        ))}
      </ul>
    );
  }

  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) return null;

  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
      {entries.map(([key, value]) => (
        <GenericPayloadEntry key={key} label={key} value={value} />
      ))}
    </dl>
  );
}

function GenericPayloadEntry({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;

  // Primitive values
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return (
      <>
        <dt className="text-zinc-500">{label}</dt>
        <dd className="text-zinc-300">{String(value)}</dd>
      </>
    );
  }

  // Arrays of primitives — render inline
  if (Array.isArray(value) && value.every((v) => typeof v !== "object" || v === null)) {
    return (
      <>
        <dt className="text-zinc-500">{label}</dt>
        <dd className="text-zinc-300">{value.join(", ")}</dd>
      </>
    );
  }

  // Arrays of objects — render as nested cards
  if (Array.isArray(value)) {
    return (
      <>
        <dt className="text-zinc-500 col-span-2 mt-1">{label}</dt>
        <dd className="col-span-2">
          <GenericPayload data={value} />
        </dd>
      </>
    );
  }

  // Nested object — render as nested grid
  if (typeof value === "object") {
    return (
      <>
        <dt className="text-zinc-500 col-span-2 mt-1">{label}</dt>
        <dd className="col-span-2 ml-2 border-l border-zinc-800 pl-3">
          <GenericPayload data={value} />
        </dd>
      </>
    );
  }

  return null;
}
