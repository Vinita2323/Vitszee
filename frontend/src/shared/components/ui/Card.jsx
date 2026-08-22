import React from 'react';
import {
    Card as ShadcnCard,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { cn } from '@/lib/utils';

const Card = ({ children, title, subtitle, className, headerAction, footer, contentClassName, ...props }) => {
    return (
        <ShadcnCard className={cn("glass-card border-none rounded-2xl shadow-sm ring-1 ring-slate-100", className)} {...props}>
            {(title || subtitle || headerAction) && (
                <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-slate-100 bg-slate-50/40 px-6 py-4.5 rounded-t-2xl">
                    <div className="space-y-1">
                        {title && <CardTitle className="text-base md:text-lg font-bold text-slate-900 tracking-tight">{title}</CardTitle>}
                        {subtitle && <CardDescription className="text-xs md:text-sm font-medium text-slate-500">{subtitle}</CardDescription>}
                    </div>
                    {headerAction && <div>{headerAction}</div>}
                </CardHeader>
            )}
            <CardContent className={cn("p-6", !title && !subtitle && !headerAction && "pt-6", contentClassName)}>
                {children}
            </CardContent>
            {footer && (
                <CardFooter className="bg-slate-50/40 border-t border-slate-100 px-6 py-4 rounded-b-2xl">
                    {footer}
                </CardFooter>
            )}
        </ShadcnCard>
    );
};

export default Card;
