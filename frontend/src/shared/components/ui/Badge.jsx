import React from 'react';
import { Badge as ShadcnBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const Badge = ({ children, variant = 'gray', className, ...props }) => {
    const variantStyles = {
        primary: 'bg-primary-50 text-primary-700 border-primary-100 hover:bg-primary-100',
        success: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
        warning: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
        error: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
        info: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
        gray: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200',
        secondary: 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200',
    };

    return (
        <ShadcnBadge
            variant="outline"
            className={cn(
                'text-[11px] md:text-xs font-bold transition-colors px-2.5 py-1 rounded-lg tracking-wide inline-flex items-center gap-1',
                variantStyles[variant] || variantStyles.gray,
                className
            )}
            {...props}
        >
            {children}
        </ShadcnBadge>
    );
};

export default Badge;
