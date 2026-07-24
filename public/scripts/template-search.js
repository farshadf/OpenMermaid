const searchForm = document.querySelector('[data-template-search]');
const input = searchForm?.querySelector('input[type="search"]');
const cards = Array.from(document.querySelectorAll('[data-template-card]'));
const resultText = document.querySelector('#template-results');
const noResults = document.querySelector('[data-no-results]');

const filterTemplates = () => {
  const query = input?.value.trim().toLocaleLowerCase() ?? '';
  let visible = 0;

  for (const card of cards) {
    const matches = query.length === 0 || (card.dataset.search?.includes(query) ?? false);
    card.hidden = !matches;
    if (matches) visible += 1;
  }

  if (resultText) {
    resultText.textContent = query
      ? `${visible} template${visible === 1 ? '' : 's'} found.`
      : `Showing all ${cards.length} templates.`;
  }

  if (noResults) noResults.hidden = visible !== 0;
};

input?.addEventListener('input', filterTemplates);
