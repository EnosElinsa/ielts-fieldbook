type Fragment = { text: string; key: string };
type Choice = { code: Fragment; description: Fragment[] };

/** Recognize a flat letter bank, retaining the original text-node paths for annotations. */
export function stimulusChoiceBank(table: Element, key: string): Choice[] | null {
  if (table.querySelectorAll('td,th').length !== 1 || table.querySelector('img,table,input,script,style,iframe,object,embed,svg,form')) return null;
  const fragments: Fragment[] = [];
  const visit = (node: Node, path: string) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.trim()) fragments.push({ text: node.textContent, key: path });
    } else Array.from(node.childNodes).forEach((child, index) => visit(child, `${path}-${index}`));
  };
  visit(table, key);
  const choices: Choice[] = [];
  for (const fragment of fragments) {
    if (/^[A-Z]$/.test(fragment.text.trim())) choices.push({ code: fragment, description: [] });
    else if (choices.length) choices.at(-1)!.description.push(fragment);
    else return null;
  }
  if (choices.length < 3 || choices.some((choice, index) => choice.code.text.trim() !== String.fromCharCode(65 + index) || !choice.description.length || choice.description.some(fragment => /#####-|\[\d+\s*_/.test(fragment.text)))) return null;
  return choices;
}
