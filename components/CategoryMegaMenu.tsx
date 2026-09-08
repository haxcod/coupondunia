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
        className={`group/cat relative inline-flex items-center gap-1.5 py-1 text-sm font-medium transition-colors duration-200 hover:text-accent ${
          isActiveRoute ? 'text-accent' : 'text-foreground'
        }`}
      >
        <span>Categories</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-accent' : 'text-muted group-hover/cat:text-accent'
          }`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>

        {/* Active Underline */}
        <span
          aria-hidden="true"
          className={`absolute -bottom-1 left-0 h-0.5 w-full origin-center rounded-badge bg-accent transition-transform duration-300 ease-out ${
            isActiveRoute ? 'scale-x-100' : 'scale-x-0 group-hover/cat:scale-x-100'
          }`}
        />
      </Link>

      {/* Horizontal Category Dropdown */}
      {isOpen && categories.length > 0 && (
        <div
          className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-2 animate-in fade-in duration-200"
          style={{ width: 'min(860px, calc(100vw - 2rem))' }}
        >
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_22px_45px_-12px_rgba(20,20,40,0.18),0_0_1px_1px_rgba(0,0,0,0.05)]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Browse Categories
              </span>
              <Link
                href="/categories"
                onClick={() => setIsOpen(false)}
                className="text-xs font-semibold text-accent transition-colors hover:text-accent-hover hover:underline"
              >
                View all &rarr;
              </Link>
            </div>

            {/* Horizontal Categories Grid */}
            <div className="grid grid-cols-4 gap-2 p-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/category/${cat.slug}`}
                  onClick={() => setIsOpen(false)}
                  className="group/item flex flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-surface/30 px-2 py-3 text-center transition-all duration-150 hover:-translate-y-0.5 hover:border-accent/50 hover:bg-brand-soft/60 hover:shadow-sm"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-secondary shadow-xs transition-colors duration-150 group-hover/item:bg-accent group-hover/item:text-white">
                    {cat.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cat.iconUrl}
                        alt=""
                        className="h-5 w-5 object-contain"
                      />
                    ) : (
                      <CategoryNavIcon name={cat.name} className="h-5 w-5" />
                    )}
                  </span>
                  <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground transition-colors duration-150 group-hover/item:text-accent">
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
