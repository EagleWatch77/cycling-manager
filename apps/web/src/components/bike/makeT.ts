/** Tiny translator for client components: the server passes the messages it needs, this interpolates {vars} like getDictionary does. */
export type MessageMap = Record<string, string>;
export type ClientT = (key: string, vars?: Record<string, string | number>) => string;

export function makeT(messages: MessageMap): ClientT {
  return (key, vars) => {
    let out = messages[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
    return out;
  };
}
