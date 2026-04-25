// Category metadata: label, icon SVG paths, color
export const CATEGORIES = {
  ramp: {
    label: 'Ramp',
    color: '#b5371b',
    // Wheelchair-style triangular ramp icon
    iconPath: '<path d="M4 18 L20 18 L20 14 L4 18 Z" fill="currentColor"/><circle cx="9" cy="8" r="1.8" fill="currentColor"/><path d="M9 10 L9 14 L13 14" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  },
  toilet: {
    label: 'Accessible WC',
    color: '#3e5a3a',
    iconPath: '<circle cx="9" cy="6" r="1.8" fill="currentColor"/><path d="M7 10 L7 14 L8 14 L8 18 L10 18 L10 14 L11 14 L11 10 Z" fill="currentColor"/><circle cx="16" cy="13" r="1.5" fill="currentColor"/><path d="M14 16 C14 14, 18 14, 18 16 L17.5 19 L14.5 19 Z" fill="currentColor"/>',
  },
  charging: {
    label: 'Charging',
    color: '#c9a227',
    iconPath: '<rect x="6" y="5" width="10" height="14" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="9" y="3" width="4" height="2" fill="currentColor"/><path d="M11.5 8 L9 13 L11 13 L10.5 16 L13 11 L11 11 Z" fill="currentColor"/>',
  },
  entrance: {
    label: 'Entrance',
    color: '#1a4a6e',
    iconPath: '<path d="M5 19 L5 6 L13 4 L13 19 Z" fill="currentColor"/><circle cx="11" cy="12" r="0.9" fill="white"/><path d="M14 19 L19 19 L19 8 L14 8" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  },
  transport: {
    label: 'Transport',
    color: '#6b3e8a',
    iconPath: '<rect x="4" y="5" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="8" cy="18" r="1.4" fill="currentColor"/><circle cx="16" cy="18" r="1.4" fill="currentColor"/><path d="M5 11 L19 11" stroke="currentColor" stroke-width="1.4"/><rect x="6" y="7" width="3" height="2.5" fill="currentColor"/><rect x="11" y="7" width="3" height="2.5" fill="currentColor"/>',
  },
};

export const CATEGORY_LIST = Object.keys(CATEGORIES);

// Inline icon component for sidebar/UI
export function CategoryIcon({ category, size = 22 }) {
  const cat = CATEGORIES[category];
  if (!cat) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ color: cat.color }}
      dangerouslySetInnerHTML={{ __html: cat.iconPath }}
    />
  );
}

// Build a Leaflet DivIcon HTML string (a custom map pin with the category icon)
export function buildMarkerHtml(category) {
  const cat = CATEGORIES[category] || CATEGORIES.ramp;
  return `
    <div class="access-marker-pin">
      <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 2 C8.27 2 2 8.27 2 16 C2 26 16 38 16 38 C16 38 30 26 30 16 C30 8.27 23.73 2 16 2 Z"
              fill="${cat.color}" stroke="#1a1410" stroke-width="1.2"/>
        <circle cx="16" cy="15" r="9" fill="#f4ede0"/>
        <g transform="translate(4, 3)" style="color: ${cat.color}">
          ${cat.iconPath}
        </g>
      </svg>
    </div>
  `;
}
