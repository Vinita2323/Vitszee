import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const Pagination = ({
    page,
    totalPages,
    total,
    pageSize,
    onPageChange,
    onPageSizeChange,
    loading = false,
    compact = false,
    className,
}) => {
    if (totalPages <= 1 && !onPageSizeChange) return null;

    const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);

    return (
        <div className={cn("flex flex-wrap items-center justify-between gap-4 py-3", compact && "gap-2", className)}>
            <p className="text-xs md:text-sm font-medium text-slate-500">
                Showing <span className="font-bold text-slate-800">{start}–{end}</span> of <span className="font-bold text-slate-800">{total}</span>
            </p>
            <div className="flex items-center gap-2">
                {onPageSizeChange && (
                    <select
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                        disabled={loading}
                        className={cn(
                            "rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm",
                            "focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:opacity-50 cursor-pointer transition-all hover:bg-slate-50"
                        )}
                    >
                        {PAGE_SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>{size} / page</option>
                        ))}
                    </select>
                )}
                <button
                    disabled={page <= 1 || loading}
                    onClick={() => onPageChange(page - 1)}
                    className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold",
                        "bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 active:scale-95 transition-all",
                        "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:active:scale-100"
                    )}
                >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                </button>
                <span className="px-2 text-xs font-bold text-slate-600">
                    Page {page} {totalPages > 0 && `of ${totalPages}`}
                </span>
                <button
                    disabled={page >= totalPages || loading}
                    onClick={() => onPageChange(page + 1)}
                    className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold",
                        "bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 active:scale-95 transition-all",
                        "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:active:scale-100"
                    )}
                >
                    Next
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
};

export default Pagination;
