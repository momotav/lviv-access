// Категорії об'єктів доступності

export const CATEGORIES = {
  ramp: {
    label: 'Пандус',
    shortLabel: 'Пандус',
    color: '#B5471B',
    // Wheelchair symbol over ramp
    iconPath: '<circle cx="9" cy="6" r="1.8" fill="currentColor"/><path d="M9 8.5 L9 12.5 L12 12.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M4 19 L20 19 L20 16 L4 19 Z" fill="currentColor"/>',
  },
  toilet: {
    label: 'Доступний туалет',
    shortLabel: 'Туалет',
    color: '#2E6B5A',
    iconPath: '<circle cx="9" cy="6" r="1.8" fill="currentColor"/><path d="M7 10 L7 14 L8 14 L8 18 L10 18 L10 14 L11 14 L11 10 Z" fill="currentColor"/><circle cx="16" cy="13" r="1.5" fill="currentColor"/><path d="M14 16 C14 14, 18 14, 18 16 L17.5 19 L14.5 19 Z" fill="currentColor"/>',
  },
  charging: {
    label: 'Зарядна станція',
    shortLabel: 'Зарядка',
    color: '#8C6D17',
    iconPath: '<rect x="6" y="5" width="10" height="14" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="9" y="3" width="4" height="2" fill="currentColor"/><path d="M11.5 8 L9 13 L11 13 L10.5 16 L13 11 L11 11 Z" fill="currentColor"/>',
  },
  entrance: {
    label: 'Доступний вхід',
    shortLabel: 'Вхід',
    color: '#1F4E79',
    iconPath: '<path d="M5 19 L5 6 L13 4 L13 19 Z" fill="currentColor"/><circle cx="11" cy="12" r="0.9" fill="white"/><path d="M14 19 L19 19 L19 8 L14 8" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  },
  transport: {
    label: 'Низькопідлоговий транспорт',
    shortLabel: 'Транспорт',
    color: '#5D3E7E',
    iconPath: '<rect x="4" y="5" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="8" cy="18" r="1.4" fill="currentColor"/><circle cx="16" cy="18" r="1.4" fill="currentColor"/><path d="M5 11 L19 11" stroke="currentColor" stroke-width="1.4"/><rect x="6" y="7" width="3" height="2.5" fill="currentColor"/><rect x="11" y="7" width="3" height="2.5" fill="currentColor"/>',
  },
};

export const CATEGORY_LIST = Object.keys(CATEGORIES);

// Inline icon component (used in sidebar filters, modals)
export function CategoryIcon({ category, size = 20 }) {
  const cat = CATEGORIES[category];
  if (!cat) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ color: cat.color, display: 'block' }}
      dangerouslySetInnerHTML={{ __html: cat.iconPath }}
    />
  );
}

// Map pin: cleaner droplet shape, white circle, category-colored icon
export function buildMarkerHtml(category) {
  const cat = CATEGORIES[category] || CATEGORIES.ramp;
  return `
    <div class="access-marker-pin">
      <svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 1 C7 1 1.5 6.5 1.5 13.5 C1.5 22.5 14 34 14 34 C14 34 26.5 22.5 26.5 13.5 C26.5 6.5 21 1 14 1 Z"
              fill="${cat.color}" stroke="white" stroke-width="1.5"/>
        <circle cx="14" cy="13" r="8" fill="white"/>
        <g transform="translate(2, 1)" style="color: ${cat.color}">
          ${cat.iconPath}
        </g>
      </svg>
    </div>
  `;
}
