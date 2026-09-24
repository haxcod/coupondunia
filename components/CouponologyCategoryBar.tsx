'use client';

import React from 'react';
import Link from 'next/link';
import { CategoryNavIcon } from './CategoryNavIcon';
import type { NavCategoryTreeItem } from '@/lib/catalog';

export interface CouponologyCategoryBarProps {
  categories?: NavCategoryTreeItem[];
  className?: string;
  onItemClick?: () => void;
}

export function CouponologyCategoryBar({
  categories = [],
  className = '',
  onItemClick,
}: CouponologyCategoryBarProps) {
  const allCategoriesItem = {
    id: 'all-categories',
    name: 'All Categories',
    slug: 'categories',
    isAll: true,
  };

  const allItems = [
    allCategoriesItem,
    ...categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      isAll: false,
    })),
  ];

  const numColumns = 6;
  const columns: typeof allItems[] = Array.from({ length: numColumns }, () => []);
  const itemsPerColumn = Math.ceil(allItems.length / numColumns);
  
  for (let i = 0; i < allItems.length; i++) {
    const colIdx = Math.floor(i / itemsPerColumn);
    if (columns[colIdx]) {
      columns[colIdx].push(allItems[i]);
    }
  }

  return (
    <div
      className={`w-full border-b border-[#e6e7eb] bg-[#f7f7f8] py-5 transition-all ${className}`}
    >
      <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-6">
          {columns.map((column, colIdx) => (
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
