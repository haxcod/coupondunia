import React from 'react';

interface CategoryNavIconProps {
  name: string;
  className?: string;
}

const ICONS_MAP: { keywords: string[]; svg: React.ReactNode }[] = [
  {
    keywords: ['all', 'everything'],
    svg: (
      <>
        <rect width="6" height="6" x="3.5" y="3.5" rx="1.5" />
        <rect width="6" height="6" x="14.5" y="3.5" rx="1.5" />
        <rect width="6" height="6" x="14.5" y="14.5" rx="1.5" />
        <rect width="6" height="6" x="3.5" y="14.5" rx="1.5" />
      </>
    ),
  },
  {
    keywords: ['outdoor', 'garden', 'patio'],
    svg: (
      <>
        <path d="M4 18h16M5 18V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v10M8 18v3M16 18v3M5 12h14" />
      </>
    ),
  },
  {
    keywords: ['eyewear', 'glasses', 'optical', 'spectacle'],
    svg: (
      <>
        <rect x="3" y="11" width="7" height="6" rx="2" />
        <rect x="14" y="11" width="7" height="6" rx="2" />
        <path d="M10 14h4" />
        <path d="M4 11l2-5h12l2 5" />
      </>
    ),
  },
  {
    keywords: ['accessories', 'sunglass'],
    svg: (
      <>
        <circle cx="6.5" cy="14.5" r="3.5" />
        <circle cx="17.5" cy="14.5" r="3.5" />
        <path d="M10 14.5h4" />
        <path d="M3 12.5 5 6h14l2 6.5" />
      </>
    ),
  },
  {
    keywords: ['swimwear', 'bikini', 'swim'],
    svg: (
      <>
        <path d="M6 5l3 5H3L6 5ZM18 5l3 5h-6l3-5ZM5 16h14l-7 5-7-5Z" />
      </>
    ),
  },
  {
    keywords: ['flower', 'flora', 'plant', 'bouquet'],
    svg: (
      <>
        <path d="M12 2a4 4 0 0 0-4 4c0 3 4 6 4 6s4-3 4-6a4 4 0 0 0-4-4Z" />
        <path d="M12 12v9" />
        <path d="M12 16a4 4 0 0 0 4-3" />
        <path d="M12 18a4 4 0 0 1-4-3" />
      </>
    ),
  },
  {
    keywords: ['decor', 'furniture', 'interior'],
    svg: (
      <>
        <path d="M19 10V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v4" />
        <path d="M4 14a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4H4v-4Z" />
        <path d="M6 18v3" />
        <path d="M18 18v3" />
      </>
    ),
  },
  {
    keywords: ['pet', 'dog', 'cat', 'animal'],
    svg: (
      <>
        <path d="M4.5 9.5 7 4l4.5 3 4.5-3 2.5 5.5c0 5-3.5 9-6.5 9s-7.5-4-7.5-9Z" />
        <circle cx="9" cy="11" r="1" />
        <circle cx="15" cy="11" r="1" />
        <path d="M11 14h2" />
      </>
    ),
  },
  {
    keywords: ['laptop', 'computer', 'macbook', 'pc'],
    svg: (
      <>
        <rect width="18" height="12" x="3" y="4" rx="2" />
        <line x1="2" x2="22" y1="20" y2="20" />
      </>
    ),
  },
  {
    keywords: ['headphone', 'audio', 'earphone', 'airpod', 'sound'],
    svg: (
      <>
        <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
      </>
    ),
  },
  {
    keywords: ['mobile', 'smartphone', 'phone', 'iphone', 'android', 'tech'],
    svg: (
      <>
        <rect width="12" height="20" x="6" y="2" rx="2.5" />
        <path d="M12 18h.01" />
      </>
    ),
  },
  {
    keywords: ['women', 'dress', 'kurta', 'female', 'girl'],
    svg: (
      <>
        <path d="M9 3h6l2 4-2.5 14h-9L3 7l2-4h4Z" />
        <path d="M9 3v4a3 3 0 0 0 6 0V3" />
      </>
    ),
  },
  {
    keywords: ['men', 'shirt', 'male', 'boy', 't-shirt'],
    svg: (
      <>
        <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
      </>
    ),
  },
  {
    keywords: ['kids apparel', 'kid apparel', 'child apparel'],
    svg: (
      <>
        <path d="M12 4a2 2 0 0 1 2 2c0 .8-.5 1.5-1.2 1.8L18 10l-1.5 2L15 11v8a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-8L7.5 12 6 10l5.2-2.2A2 2 0 0 1 12 4Z" />
      </>
    ),
  },
  {
    keywords: ['fashion', 'cloth', 'apparel', 'wear', 'jeans'],
    svg: (
      <>
        <path d="M8 4 5 7l2 2 1-1v11h8V8l1 1 2-2-3-3-2 1a2 2 0 0 1-4 0Z" />
      </>
    ),
  },
  {
    keywords: ['electronic', 'gadget'],
    svg: (
      <>
        <rect x="4" y="4" width="16" height="12" rx="2" />
        <path d="M12 16v4" />
        <path d="M8 20h8" />
        <path d="M9 9h6" />
      </>
    ),
  },
  {
    keywords: ['bed', 'bath'],
    svg: (
      <>
        <path d="M2 4v16" />
        <path d="M2 13h20" />
        <path d="M22 8v12" />
        <path d="M6 8h5a2 2 0 0 1 2 2v3H4v-3a2 2 0 0 1 2-2Z" />
      </>
    ),
  },
  {
    keywords: ['home', 'kitchen'],
    svg: (
      <>
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </>
    ),
  },
  {
    keywords: ['beauty', 'cosmetic', 'personal', 'makeup', 'care'],
    svg: (
      <>
        <path d="m8 10 3.5-7 3.5 7" />
        <rect x="6.5" y="10" width="11" height="11" rx="2" />
        <line x1="6.5" y1="15" x2="17.5" y2="15" />
      </>
    ),
  },
  {
    keywords: ['shoe', 'footwear', 'sneaker'],
    svg: (
      <>
        <path d="M3 14h18v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3Z" />
        <path d="M3 14l3.5-6 4.5 2 4.5-2 3.5 6" />
        <line x1="8" y1="10" x2="12" y2="10" />
      </>
    ),
  },
  {
    keywords: ['food', 'dining', 'restaurant', 'drink', 'beverage'],
    svg: (
      <>
        <path d="M4 10h16a8 8 0 0 1-16 0Z" />
        <path d="M6 10c0-3 2-5 6-5s6 2 6 5" />
        <path d="M4 15h16" />
      </>
    ),
  },
  {
    keywords: ['game', 'gaming', 'toy'],
    svg: (
      <>
        <rect x="2" y="6" width="20" height="12" rx="4" />
        <path d="M6 12h4" />
        <path d="M8 10v4" />
        <circle cx="16" cy="10" r="1" fill="currentColor" />
        <circle cx="18" cy="13" r="1" fill="currentColor" />
      </>
    ),
  },
  {
    keywords: ['health', 'wellness', 'medical', 'fitness', 'pharmacy'],
    svg: (
      <>
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        <path d="M4 12h3l1.5-3 2 6 2-4 1.5 2h3" />
      </>
    ),
  },
  {
    keywords: ['baby', 'kid', 'child'],
    svg: (
      <>
        <path d="M9 3h6v2H9z" />
        <path d="M8 5h8a2 2 0 0 1 2 2v12a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V7a2 2 0 0 1 2-2z" />
        <path d="M10 10h4" />
        <path d="M10 14h4" />
      </>
    ),
  },
];

const DEFAULT_SVG = (
  <>
    <path d="M20.59 13.41 12 22l-8-8V4h10l6.59 6.59a2 2 0 0 1 0 2.82Z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </>
);

export function CategoryNavIcon({ name, className = 'h-5 w-5' }: CategoryNavIconProps) {
  const lower = name.toLowerCase();
  const match = ICONS_MAP.find((entry) =>
    entry.keywords.some((kw) => lower.includes(kw)),
  );

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {match ? match.svg : DEFAULT_SVG}
    </svg>
  );
}
