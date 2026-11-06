/** Page buttons for a pager: first, last, and the current page with one neighbour each side. 5 of 258 → [1, "…", 4, 5, 6, "…", 258]. */
export function pageItems(page: number, totalPages: number): (number | "…")[] {
  const keep = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...keep].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const items: (number | "…")[] = [];
  pages.forEach((p, i) => {
    const gap = p - (pages[i - 1] ?? p);
    if (gap === 2) items.push(p - 1); // a gap of one page shows the page, not "…"
    else if (gap > 2) items.push("…");
    items.push(p);
  });
  return items;
}
