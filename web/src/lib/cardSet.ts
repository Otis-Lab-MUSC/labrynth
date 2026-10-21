// Pure helpers for device-card "Set" buttons. Erasable TS only: node --test imports this directly.

export interface CardField {
  code: number;
  value: number;
  valid: boolean;
  label?: string;
}

export function buildCardCommands(fields: CardField[]): [number, number][] | null {
  if (fields.some((f) => !f.valid)) return null;
  return fields.map((f) => [f.code, f.value]);
}

export function firstInvalid(fields: CardField[]): string | null {
  const bad = fields.find((f) => !f.valid);
  if (!bad) return null;
  return bad.label ?? "a field";
}

export async function sendAll(
  send: (code: number, value: number) => Promise<unknown> | unknown,
  cmds: [number, number][],
): Promise<{ sent: number; error: string | null }> {
  let sent = 0;
  for (const [code, value] of cmds) {
    try {
      const pending = send(code, value);
      if (pending === undefined) return { sent, error: "not connected" };
      await pending;
    } catch (err) {
      return { sent, error: err instanceof Error ? err.message : String(err) };
    }
    sent++;
  }
  return { sent, error: null };
}
