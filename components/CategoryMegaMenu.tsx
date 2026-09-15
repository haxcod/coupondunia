'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavCategoryTreeItem } from '@/lib/catalog';
import { CategoryNavIcon } from './CategoryNavIcon';
import { CouponologyCategoryBar } from './CouponologyCategoryBar';

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
        className={`group/cat relative inline-flex items-center gap-1.5 py-1.5 text-sm font-bold uppercase tracking-wider transition-colors duration-200 hover:text-[#D92E59] ${isActiveRoute ? 'text-[#D92E59]' : 'text-[#2b2b2b]'
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
          className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#D92E59]' : 'text-[#8e8e93] group-hover/cat:text-[#D92E59]'
            }`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>

        {/* Active Underline */}
        <span
          aria-hidden="true"
          className={`absolute -bottom-1 left-0 h-0.5 w-full origin-center bg-[#D92E59] transition-transform duration-300 ease-out ${isActiveRoute ? 'scale-x-100' : 'scale-x-0 group-hover/cat:scale-x-100'
            }`}
        />
      </Link>

      {/* Full-Width Couponology Category Mega Menu */}
      {isOpen && (
        <div
          className="fixed left-0 right-0 top-[var(--header-height,4.5rem)] z-50 w-screen border-t border-gray-100 animate-in fade-in slide-in-from-top-1 duration-150 shadow-lg"
        >
          <CouponologyCategoryBar onItemClick={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  );
}

