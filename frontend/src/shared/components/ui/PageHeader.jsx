import React from 'react';
import { cn } from '@/lib/utils';

const PageHeader = ({ title, description, actions, badge, className }) => {
    return (
        <div className={cn("ds-page-header mb-6 md:mb-8", className)}>
            <div className="ds-page-title-group">
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="ds-h1">{title}</h1>
                    {badge && badge}
                </div>
                {description && <p className="ds-description mt-1">{description}</p>}
            </div>
            {actions && <div className="ds-page-actions flex items-center gap-3">{actions}</div>}
        </div>
    );
};

export default PageHeader;
