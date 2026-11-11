/** Repair only the identifiable damaged restaurant-table import, including saved attempts. */
export function stimulusDocument(html: string): Document {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
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
