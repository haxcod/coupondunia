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
    keywords: ['mobile', 'smartphone', 'phone', 'iphone', 'android'],
    svg: (
      <>
        <rect width="14" height="20" x="5" y="2" rx="2.5" />
        <path d="M12 18h.01" />
      </>
    ),
  },
  {
    keywords: ['women', 'dress', 'kurta', 'female', 'girl'],
    svg: (
      <>
        <path d="M9 3h6l2 4-3 14H10L7 7l2-4Z" />
        <path d="M9 3v4" />
        <path d="M15 3v4" />
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
    keywords: ['fashion', 'cloth', 'apparel', 'wear', 'jeans'],
    svg: (
      <>
        <path d="M8 4 5 7l2 2 1-1v11h8V8l1 1 2-2-3-3-2 1a2 2 0 0 1-4 0Z" />
      </>
    ),
  },
  {
    keywords: ['electronic', 'tech', 'gadget'],
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
    keywords: ['home', 'kitchen', 'furniture', 'decor', 'bed', 'bath'],
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
        <path d="M9 8V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4" />
        <rect x="6" y="8" width="12" height="13" rx="2" />
        <path d="M10 13h4" />
      </>
    ),
  },
  {
    keywords: ['shoe', 'footwear', 'sneaker'],
    svg: (
      <>
        <path d="M3.5 14h17l-1.5 5h-14l-1.5-5Z" />
        <path d="M4 14l3-6 5 2 4-2 3 6" />
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
    keywords: ['travel', 'flight', 'hotel', 'tour'],
    svg: (
      <>
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3.5c-.5-.5-2.5 0-4 1.5L13.5 8.5 5.3 6.7c-.8-.2-1.6.2-1.9 1-.3.8 0 1.7.7 2.1l5.5 3.8-3.4 3.4-3-.6c-.5-.1-1 .1-1.3.5-.3.4-.3.9 0 1.3l2.4 2.4c.4.4.9.4 1.3 0 .4-.3.6-.8.5-1.3l-.6-3 3.4-3.4 3.8 5.5c.4.7 1.3 1 2.1.7.8-.3 1.2-1.1 1-1.9z" />
      </>
    ),
  },
  {
    keywords: ['grocery', 'supermarket', 'market', 'basket'],
    svg: (
      <>
        <path d="M5 9h14l-1.5 9h-11L5 9Z" />
        <path d="M9 9 7 4M15 9l2-5" />
      </>
    ),
  },
  {
    keywords: ['game', 'gaming', 'toy'],
    svg: (
      <>
        <rect x="3" y="8" width="18" height="9" rx="4" />
        <path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01" />
      </>
    ),
  },
  {
    keywords: ['health', 'wellness', 'medical', 'fitness', 'pharmacy'],
    svg: (
      <>
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        <path d="M12 9v4M10 11h4" />
      </>
    ),
  },
  {
    keywords: ['baby', 'kid', 'child'],
    svg: (
      <>
        <circle cx="12" cy="8" r="5" />
        <path d="M20 21a8 8 0 0 0-16 0" />
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
