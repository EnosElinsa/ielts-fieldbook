/** Repair identifiable import defects, including saved attempts. */
export function stimulusDocument(html: string): Document {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  if (parsed.body.textContent?.includes('List of Researchers:') && parsed.body.textContent.includes('ook at the following statements (Questions 5-9)')) {
    const walker = parsed.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) walker.currentNode.textContent = walker.currentNode.textContent!.replace(/^ook at the following statements \(Questions 5-9\)/, 'Look at the following statements (Questions 5-9)');
  }
  // Identify the damaged twins summary; preserve its element tree and block IDs.
  if (parsed.body.textContent?.includes('Epigenetic processes')) {
    const walker = parsed.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) walker.currentNode.textContent = walker.currentNode.textContent!.replace('Onexample', 'One example');
  }
  for (const table of parsed.querySelectorAll('table')) {
    if (!table.textContent?.includes('The Junction') || !table.textContent.includes('Paloma')) continue;
    for (const paragraph of table.querySelectorAll('p')) {
      const text = (paragraph.textContent || '').replace(/\s+/g, ' ').trim();
      const selection = /^A limited selectionof \[4 _+\] \.{4}food on the menu$/.test(text);
      const lunch = /^Set lunch costs 9 £ \[9 _+\] person$/.test(text);
      if (!selection && !lunch) continue;
      // Keep the original element tree, so unaffected annotation block IDs stay stable.
      const walker = parsed.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (selection) node.textContent = node.textContent!.replace('selectionof', 'selection of').replace('....food', 'food');
        // The cached question answer is 30 (alternative: thirty), confirmed by
        // transcript source:88910: "£30 a head". The stray 9 is a duplicate label.
        if (lunch) node.textContent = node.textContent!.replace(/^9\s+$/, '').replace(/^(\s*)person$/, '$1per person');
      }
    }
  }
  return parsed;
}
/** Restore missing image links in an older question without changing its saved text. */
export function restoredStimulusImages(saved?: string, current?: string): string {
  if (!saved || !current || !/<img\b(?![^>]*\bsrc="[^"]+")[^>]*>/i.test(saved)) return saved || '';
  const omitImageLinks = (html: string) => html.replace(/(<img\b[^>]*?) src="exam-asset:[^"]+"/gi, '$1');
  if (omitImageLinks(saved) !== omitImageLinks(current)) return saved;
  // Only fill empty links. Existing links remain part of the saved reference.
  const currentImages = [...current.matchAll(/<img\b[^>]*>/gi)];
  let index = 0;
  return saved.replace(/<img\b[^>]*>/gi, tag => {
    const replacement = currentImages[index++][0];
    return /\bsrc="[^"]+"/i.test(tag) ? tag : replacement;
  });
}
