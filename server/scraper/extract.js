/**
 * Pulls raw listing data from the current page using a source's CSS selectors.
 * Runs inside the browser, so it only returns plain strings. Normalising happens in runner.js.
 */
export function extractListing(page, selectors) {
  return page.evaluate((sel) => {
    const first = (root, selector) => (selector ? root.querySelector(selector) : null);
    const text = (root, selector) => {
      const el = first(root, selector);
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    };

    return Array.from(document.querySelectorAll(sel.item)).map((item) => {
      const ratingEl = first(item, sel.rating);
      let ratingPercent = null;
      if (ratingEl) {
        const styled = ratingEl.matches('[style*="width"]')
          ? ratingEl
          : ratingEl.querySelector('[style*="width"]');
        const match = styled && styled.getAttribute('style').match(/width:\s*(\d+(?:\.\d+)?)%/);
        if (match) ratingPercent = Number(match[1]);
      }

      const linkEl = first(item, sel.link);
      const imgEl = first(item, sel.image);

      return {
        name: text(item, sel.name),
        priceText: text(item, sel.price),
        oldPriceText: text(item, sel.oldPrice),
        discountText: text(item, sel.discount),
        ratingText: text(item, sel.rating),
        ratingPercent,
        href: linkEl ? linkEl.getAttribute('href') : null,
        image: imgEl ? imgEl.getAttribute('data-src') || imgEl.getAttribute('src') : null,
      };
    });
  }, selectors);
}
