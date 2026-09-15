'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavCategoryTreeItem } from '@/lib/catalog';
import { CategoryNavIcon } from './CategoryNavIcon';

interface CategoryMegaMenuProps {
  categories: NavCategoryTreeItem[];
  isActiveRoute: boolean;
}

export function CategoryMegaMenu({
  categories,
  isActiveRoute,
}: CategoryMegaMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pathname = usePathname();

  // Close menu on route change
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsOpen(false);
  }

  // Cleanup leave timeout on unmount
  useEffect(() => {
    return () => {
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
      }
    };
  }, []);

  // Handle keyboard Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const handleMouseEnter = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    leaveTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 180);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Categories Trigger Button / Link */}
      <Link
        href="/categories"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-current={isActiveRoute ? 'page' : undefined}
        className={`group/cat relative inline-flex items-center gap-1.5 py-1.5 text-sm font-bold uppercase tracking-wider transition-colors duration-200 hover:text-[#D92E59] ${
          isActiveRoute ? 'text-[#D92E59]' : 'text-[#2b2b2b]'
        }`}
      >
        <span>Categories</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#D92E59]' : 'text-[#8e8e93] group-hover/cat:text-[#D92E59]'
          }`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>

        {/* Active Underline */}
        <span
          aria-hidden="true"
          className={`absolute -bottom-1 left-0 h-0.5 w-full origin-center bg-[#D92E59] transition-transform duration-300 ease-out ${
            isActiveRoute ? 'scale-x-100' : 'scale-x-0 group-hover/cat:scale-x-100'
          }`}
        />
      </Link>

      {/* Horizontal Category Dropdown */}
      {isOpen && categories.length > 0 && (
        <div
          className="absolute left-1/2 top-[calc(100%+8px)] z-50 -translate-x-1/2 pt-1 animate-in fade-in slide-in-from-top-2 duration-200"
          style={{ width: 'min(900px, calc(100vw - 2rem))' }}
        >
          <div className="overflow-hidden rounded-b-lg border-t-[3px] border-t-[#D92E59] bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] ring-1 ring-black/5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-[#fcfcfc]">
              <span className="text-xs font-black uppercase tracking-widest text-[#2b2b2b]">
                Browse Categories
              </span>
              <Link
                href="/categories"
                onClick={() => setIsOpen(false)}
                className="text-xs font-bold uppercase tracking-wider text-[#D92E59] transition-colors hover:text-[#be254b] hover:underline"
              >
                View all &rarr;
              </Link>
            </div>

            {/* Multi-Column Categories Grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 bg-white">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/category/${cat.slug}`}
                  onClick={() => setIsOpen(false)}
                  className="group/item flex items-center gap-3 rounded-md px-2 py-2 transition-all duration-150 hover:bg-[#f9f9f9]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f4f4f7] text-[#555] transition-all duration-150 group-hover/item:bg-white group-hover/item:text-[#D92E59] group-hover/item:shadow-sm border border-transparent group-hover/item:border-gray-200">
                    {cat.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cat.iconUrl}
                        alt=""
                        className="h-4 w-4 object-contain"
                      />
                    ) : (
                      <CategoryNavIcon name={cat.name} className="h-4 w-4" />
                    )}
                  </span>
                  <span className="truncate text-[13px] font-bold tracking-wide text-[#2b2b2b] transition-colors duration-150 group-hover/item:text-[#D92E59]">
                    {cat.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

