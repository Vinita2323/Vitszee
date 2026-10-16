import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, ShoppingBag, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
    { label: 'Home', icon: Home, path: '/' },
    { label: 'Category', icon: LayoutGrid, path: '/categories' },
    { label: 'Orders', icon: ShoppingBag, path: '/orders' },
    { label: 'Profile', icon: User, path: '/profile' },
];

const BottomNav = () => {
    const location = useLocation();

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-[500] bg-white border-t border-gray-100 flex items-stretch justify-around md:hidden shadow-[0_-8px_30px_rgba(0,0,0,0.06)] px-4 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
            aria-label="Primary"
        >
            {navItems.map((item) => {
                const isActive = location.pathname === item.path ||
                    (item.path !== '/' && location.pathname.startsWith(item.path));

                return (
                    <Link
                        key={item.path}
                        to={item.path}
                        className="flex-1 flex flex-col items-center justify-center min-h-[56px] h-14 relative group transition-all"
                    >
                        {isActive && (
                            <div className="absolute -inset-y-2 -inset-x-4 bg-[#1A4516]/5 rounded-[20px] -z-10 transition-opacity duration-300" />
                        )}

                        <div className="flex flex-col items-center justify-center relative">
                            <div
                                className={cn(
                                    "transition-transform duration-300",
                                    isActive ? "-translate-y-0.5 scale-110" : "translate-y-0 scale-100"
                                )}
                            >
                                <item.icon
                                    size={24}
                                    strokeWidth={isActive ? 2.5 : 2}
                                    className={cn(
                                        "transition-colors duration-300",
                                        isActive ? "text-[#1A4516]" : "text-gray-400"
                                    )}
                                />
                            </div>

                            <span
                                className={cn(
                                    "text-[10px] font-bold tracking-tight mt-1 transition-all duration-300",
                                    isActive ? "text-[#1A4516]" : "text-gray-400"
                                )}
                                style={{ transform: isActive ? "translateY(1px)" : "translateY(0)" }}
                            >
                                {item.label}
                            </span>
                        </div>

                        {/* Top Accent Line for Active State */}
                        {isActive && (
                            <div className="absolute -top-[1px] w-8 h-[3px] bg-[#1A4516] rounded-full transition-opacity duration-300" />
                        )}
                    </Link>
                );
            })}
        </nav>
    );
};

export default BottomNav;