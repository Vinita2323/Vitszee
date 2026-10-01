import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, ShoppingCart, Heart, User, Menu, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWishlist } from '../../context/WishlistContext';
import { useCart } from '../../context/CartContext';
import { useLocation as useAppLocation } from "../../context/LocationContext";
import { useSettings } from '@core/context/SettingsContext';
import { cn } from '@/lib/utils';
import LocationDrawer from '../shared/LocationDrawer';

const Header = () => {
    const { settings } = useSettings();
    const { count: wishlistCount } = useWishlist();
    const { cartCount } = useCart();
    const location = useLocation();
    const isCheckoutPage = location.pathname === '/checkout';
    const [isLocationOpen, setIsLocationOpen] = useState(false);
    const { currentLocation, refreshLocation } = useAppLocation();

    // Search placeholder animation
    const [searchPlaceholder, setSearchPlaceholder] = useState('Search ');
    const [typingState, setTypingState] = useState({
        textIndex: 0,
        charIndex: 0,
        isDeleting: false,
        isPaused: false
    });

    const staticText = "Search ";
    const typingPhrases = ['"bread"', '"milk"', '"chocolate"', '"eggs"', '"chips"'];

    React.useEffect(() => {
        const { textIndex, charIndex, isDeleting, isPaused } = typingState;
        const currentPhrase = typingPhrases[textIndex];

        if (isPaused) {
            const timeout = setTimeout(() => {
                setTypingState(prev => ({ ...prev, isPaused: false, isDeleting: true }));
            }, 2000); // Pause after full phrase
            return () => clearTimeout(timeout);
        }

        const timeout = setTimeout(() => {
            if (!isDeleting) {
                // Typing
                if (charIndex < currentPhrase.length) {
                    setSearchPlaceholder(staticText + currentPhrase.substring(0, charIndex + 1));
                    setTypingState(prev => ({ ...prev, charIndex: prev.charIndex + 1 }));
                } else {
                    // Finished typing
                    setTypingState(prev => ({ ...prev, isPaused: true }));
                }
            } else {
                // Deleting
                if (charIndex > 0) {
                    setSearchPlaceholder(staticText + currentPhrase.substring(0, charIndex - 1));
                    setTypingState(prev => ({ ...prev, charIndex: prev.charIndex - 1 }));
                } else {
                    // Finished deleting
                    setTypingState(prev => ({
                        ...prev,
                        isDeleting: false,
                        textIndex: (prev.textIndex + 1) % typingPhrases.length
                    }));
                }
            }
        }, isDeleting ? 50 : 100);

        return () => clearTimeout(timeout);
    }, [typingState]);

    return (
        <header className="absolute top-4 md:top-8 left-0 right-0 z-[200] px-4">
            <div className="container mx-auto max-w-6xl">
                {/* Mobile Top Row: Location & Profile */}
                <div className="md:hidden mb-3 px-1">
                    <button
                        type="button"
                        data-lenis-prevent
                        data-lenis-prevent-touch
                        onClick={() => {
                            refreshLocation();
                            setIsLocationOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 border-0 bg-transparent p-0 text-left"
                    >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
                            <MapPin size={18} className="fill-current text-primary" />
                        </div>
                        <div className="min-w-0 leading-tight">
                            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-primary"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                                {currentLocation.time}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-slate-800">
                                <span className="max-w-[220px] truncate">{currentLocation.name}</span>
                                <span className="text-[10px] text-slate-400">▼</span>
                            </span>
                        </div>
                    </button>
                </div>

                {/* Main Header Capsule */}
                <div className="flex h-16 items-center gap-3 rounded-2xl border border-slate-200/90 bg-white px-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] md:gap-4 md:px-5">
                    <Link to="/" className="shrink-0">
                        <span className="text-xl font-semibold tracking-tight md:text-[22px]" style={{ color: settings?.primaryColor || 'var(--primary)' }}>{settings?.appName || 'App'}</span>
                    </Link>

                    <button
                        type="button"
                        data-lenis-prevent
                        data-lenis-prevent-touch
                        onClick={() => {
                            refreshLocation();
                            setIsLocationOpen(true);
                        }}
                        className="hidden min-w-0 items-center gap-2 border-l border-slate-200 pl-4 text-left md:flex"
                    >
                        <span className="min-w-0">
                            <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                Delivery in {currentLocation.time}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 text-[13px] font-medium text-slate-700">
                                <span className="max-w-[150px] truncate">{currentLocation.name}</span>
                                <MapPin size={13} className="shrink-0 fill-current text-slate-500" />
                            </span>
                        </span>
                    </button>

                    <nav className="hidden items-center gap-1 lg:flex">
                        <Link to="/" className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-[var(--primary)]">Home</Link>
                        <Link to="/categories" className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-[var(--primary)]">Categories</Link>
                        <Link to="/offers" className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-[var(--primary)]">Offers</Link>
                    </nav>

                    {!isCheckoutPage && (
                        <div className="ml-auto min-w-0 flex-1 md:max-w-[240px]">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="search"
                                    placeholder={searchPlaceholder}
                                    className="h-9 w-full rounded-lg border-0 bg-slate-100 pl-9 pr-3 text-sm text-slate-700 outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-primary/30"
                                />
                            </div>
                        </div>
                    )}

                    <div className={cn("hidden items-center gap-0.5 md:flex", isCheckoutPage && "ml-auto")}>
                        <Link to="/wishlist" className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-50 hover:text-[var(--primary)]">
                            <Heart className="h-5 w-5" />
                            {wishlistCount > 0 && (
                                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-primary px-1 text-[9px] font-semibold text-white">
                                    {wishlistCount}
                                </span>
                            )}
                        </Link>
                        <Link to="/checkout" id="header-cart-icon" className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-50 hover:text-[var(--primary)]">
                            <ShoppingCart className="h-5 w-5" />
                            {cartCount > 0 && (
                                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-primary px-1 text-[9px] font-semibold text-white">
                                    {cartCount}
                                </span>
                            )}
                        </Link>
                        <Link to="/profile" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-50 hover:text-[var(--primary)]">
                            <User className="h-5 w-5" />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Location Selection Drawer */}
            <LocationDrawer
                isOpen={isLocationOpen}
                onClose={() => setIsLocationOpen(false)}
            />
        </header>
    );
};

export default Header;

