'use client';

import React from 'react';
import Link from 'next/link';
import { CategoryNavIcon } from './CategoryNavIcon';

export interface CategoryBarItem {
  id: string;
  name: string;
  slug: string;
  isAll?: boolean;
}

export const COUPONOLOGY_CATEGORY_COLUMNS: CategoryBarItem[][] = [
  // Column 1
  [
    { id: 'all-categories', name: 'All Categories', slug: 'categories', isAll: true },
    { id: 'beauty', name: 'Beauty', slug: 'beauty' },
    { id: 'outdoor-living', name: 'Outdoor Living', slug: 'outdoor-living' },
  ],
  // Column 2
  [
    { id: 'accessories', name: 'Accessories', slug: 'accessories' },
    { id: 'health-wellness', name: 'Health & Wellness', slug: 'health-wellness' },
    { id: 'shoes', name: 'Shoes', slug: 'shoes' },
  ],
  // Column 3
  [
    { id: 'womens-apparel', name: "Women's Apparel", slug: 'womens-apparel' },
    { id: 'eyewear', name: 'Eyewear', slug: 'eyewear' },
    { id: 'swimwear', name: 'Swimwear', slug: 'swimwear' },
  ],
  // Column 4
  [
    { id: 'mens-apparel', name: "Men's Apparel", slug: 'mens-apparel' },
    { id: 'flowers', name: 'Flowers', slug: 'flowers' },
    { id: 'bed-bath', name: 'Bed & Bath', slug: 'bed-bath' },
  ],
  // Column 5
  [
    { id: 'kids-apparel', name: 'Kids Apparel', slug: 'kids-apparel' },
    { id: 'home-decor', name: 'Home Decor', slug: 'home-decor' },
    { id: 'tech', name: 'Tech', slug: 'tech' },
  ],
  // Column 6
  [
    { id: 'baby', name: 'Baby', slug: 'baby' },
    { id: 'pet', name: 'Pet', slug: 'pet' },
    { id: 'toys-games', name: 'Toys & Games', slug: 'toys-games' },
  ],
];

export interface CouponologyCategoryBarProps {
  className?: string;
  onItemClick?: () => void;
}

export function CouponologyCategoryBar({
  className = '',
  onItemClick,
}: CouponologyCategoryBarProps) {
  return (
    <div
      className={`w-full border-b border-[#e6e7eb] bg-[#f7f7f8] py-5 transition-all ${className}`}
    >
      <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
        {/* 6-column Grid across full width */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-6">
          {COUPONOLOGY_CATEGORY_COLUMNS.map((column, colIdx) => (
            <div key={colIdx} className="flex flex-col space-y-3.5">
              {column.map((item) => {
                const isAll = item.isAll;
                return (
                  <Link
                    key={item.id}
                    href={isAll ? '/categories' : `/category/${item.slug}`}
                    onClick={onItemClick}
                    className="group flex items-center gap-2.5 text-[13px] font-normal transition-colors duration-150"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center transition-transform duration-150 group-hover:scale-110 ${
                        isAll ? 'text-[#D92E59]' : 'text-[#444444] group-hover:text-[#D92E59]'
                      }`}
                    >
                      <CategoryNavIcon
                        name={item.name}
                        className="h-4.5 w-4.5"
                      />
                    </span>
                    <span
                      className={`truncate leading-snug transition-colors duration-150 ${
                        isAll
                          ? 'font-medium text-[#D92E59]'
                          : 'text-[#333333] group-hover:text-[#D92E59]'
                      }`}
                    >
                      {item.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CouponologyCategoryBar;
