/**
 * Source presets. A source is just a search URL template plus CSS selectors,
 * so any ecommerce site can be added from the admin panel without new code.
 * {query} and {page} are replaced at run time.
 */
export const PRESETS = {
  jumia_ke: {
    label: 'Jumia Kenya',
    name: 'Jumia Kenya',
    slug: 'jumia-ke',
    base_url: 'https://www.jumia.co.ke',
    search_url_template: 'https://www.jumia.co.ke/catalog/?q={query}&page={page}',
    currency: 'KES',
    selectors: {
      item: 'article.prd',
      name: '.name',
      price: '.prc',
      oldPrice: '.old',
      discount: '.bdg._dsct',
      rating: '.stars._s',
      link: 'a.core',
      image: 'img.img',
    },
  },
  custom: {
    label: 'Custom site (enter selectors)',
    name: '',
    slug: '',
    base_url: '',
    search_url_template: 'https://example.com/search?q={query}&page={page}',
    currency: 'USD',
    selectors: {
      item: '',
      name: '',
      price: '',
      oldPrice: '',
      discount: '',
      rating: '',
      link: 'a',
      image: 'img',
    },
  },
};
