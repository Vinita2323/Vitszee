import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Home, Briefcase, MapPin, Trash2, Edit2, ChevronLeft, Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { customerApi } from '../services/customerApi';
import { useLocation } from '../context/LocationContext';
import MapPicker from '../../../shared/components/MapPicker';
import { useJsApiLoader } from "@react-google-maps/api";
import {
    normalizeGeocodedAddress,
    reverseGeocodeLatLng,
    getCurrentPosition,
} from "@/core/utils/addressUtils";
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_SCRIPT_ID } from "@/core/utils/googleMapsConfig";

const libraries = GOOGLE_MAPS_LIBRARIES;

const PlacesAutocompleteInput = ({ isLoaded, value, onChange, onPlaceSelected, id, placeholder, maxLength }) => {
    const inputRef = useRef(null);
    const autocompleteInstance = useRef(null);

    useEffect(() => {
        if (!isLoaded || !inputRef.current || !window.google) return;
        
        autocompleteInstance.current = new window.google.maps.places.Autocomplete(inputRef.current, {
            componentRestrictions: { country: "IN" },
            fields: ["geometry", "formatted_address", "address_components", "name"],
        });
        
        const listener = autocompleteInstance.current.addListener("place_changed", () => {
            const place = autocompleteInstance.current.getPlace();
            if (place && place.geometry) {
                const normalized = normalizeGeocodedAddress(place);
                onPlaceSelected(normalized || place);
            }
        });

        // Fix for Radix UI Dialog blocking pointer events on pac-container
        const style = document.createElement('style');
        style.innerHTML = `.pac-container { pointer-events: auto !important; z-index: 99999 !important; }`;
        document.head.appendChild(style);

        return () => {
            if (window.google?.maps?.event) {
                window.google.maps.event.removeListener(listener);
            }
            if (autocompleteInstance.current) {
                window.google.maps.event.clearInstanceListeners(autocompleteInstance.current);
            }
            if (document.head.contains(style)) {
                document.head.removeChild(style);
            }
        };
    }, [isLoaded, onPlaceSelected]);

    return (
        <Input ref={inputRef} id={id} placeholder={placeholder} maxLength={maxLength} value={value} onChange={onChange} className="h-8 text-xs" />
    );
};

const AddressesPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { refreshAddresses } = useLocation();

    const { isLoaded } = useJsApiLoader({
        id: "google-map-script",
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
        libraries,
    });
    const [addresses, setAddresses] = useState([]);
    const [rawAddresses, setRawAddresses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [profileName, setProfileName] = useState('');
    const [profilePhone, setProfilePhone] = useState('');

    const fetchAddresses = useCallback(async () => {
        try {
            const { data } = await customerApi.getProfile();
            const profile = data?.result ?? data?.data ?? data;
            const raw = Array.isArray(profile?.addresses) ? profile.addresses : [];
            setRawAddresses(raw);
            setProfileName(profile?.name ?? '');
            setProfilePhone(profile?.phone ?? '');
            setAddresses(raw.map((addr, idx) => ({
                id: addr._id ?? idx,
                type: (addr.label || 'home').charAt(0).toUpperCase() + (addr.label || 'home').slice(1),
                name: profile?.name ?? '',
                address: addr.fullAddress || [addr.landmark, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ') || '',
                city: addr.city,
                state: addr.state,
                pincode: addr.pincode,
                phone: profile?.phone ?? '',
                isDefault: idx === 0
            })));
        } catch {
            setAddresses([]);
            setRawAddresses([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAddresses();
    }, [fetchAddresses]);

    // Auto-open Add modal when navigated from LocationDrawer with ?add=1
    useEffect(() => {
        if (searchParams.get('add') === '1' && !loading) {
            setSearchParams({}, { replace: true });
            openAddModal();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, loading]);

    const [isAddOpen, setIsAddOpen] = useState(() => {
        return sessionStorage.getItem('addAddressModalOpen') === 'true';
    });
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [selectedAddress, setSelectedAddress] = useState(null);
    const [saving, setSaving] = useState(false);
    const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
    const [mapPickerTarget, setMapPickerTarget] = useState(null);

    const [addForm, setAddForm] = useState(() => {
        const saved = sessionStorage.getItem('addAddressForm');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) {}
        }
        return {
            type: 'home',
            name: '',
            phone: '',
            address: '',
            landmark: '',
            city: '',
            state: '',
            pincode: '',
            location: null
        };
    });

    useEffect(() => {
        sessionStorage.setItem('addAddressModalOpen', isAddOpen);
    }, [isAddOpen]);

    useEffect(() => {
        sessionStorage.setItem('addAddressForm', JSON.stringify(addForm));
    }, [addForm]);

    const handleAddPlaceChanged = useCallback((normalized) => {
        setAddForm(f => ({
            ...f,
            address: normalized.formattedAddress || normalized.address || f.address,
            city: normalized.city || f.city,
            state: normalized.state || f.state,
            pincode: normalized.pincode || f.pincode,
            landmark: normalized.area || normalized.subLocality || f.landmark,
            location: (normalized.latitude && normalized.longitude)
                ? { lat: normalized.latitude, lng: normalized.longitude }
                : (normalized.lat && normalized.lng) ? { lat: normalized.lat, lng: normalized.lng } : f.location
        }));
    }, []);

    const handleEditPlaceChanged = useCallback((normalized) => {
        setEditForm(f => ({
            ...f,
            address: normalized.formattedAddress || normalized.address || f.address,
            city: normalized.city || f.city,
            state: normalized.state || f.state,
            pincode: normalized.pincode || f.pincode,
            landmark: normalized.area || normalized.subLocality || f.landmark,
            location: (normalized.latitude && normalized.longitude)
                ? { lat: normalized.latitude, lng: normalized.longitude }
                : (normalized.lat && normalized.lng) ? { lat: normalized.lat, lng: normalized.lng } : f.location
        }));
    }, []);

    const handleDetectLocation = async (isEdit = false) => {
        const toastId = toast.loading("Detecting your location...");
        try {
            const pos = await getCurrentPosition();
            const normalized = await reverseGeocodeLatLng(pos.latitude, pos.longitude);
            const setForm = isEdit ? setEditForm : setAddForm;
            setForm(f => ({
                ...f,
                address: normalized.formattedAddress || f.address,
                city: normalized.city || f.city,
                state: normalized.state || f.state,
                pincode: normalized.pincode || f.pincode,
                landmark: normalized.area || normalized.subLocality || f.landmark,
                location: { lat: pos.latitude, lng: pos.longitude }
            }));
            toast.dismiss(toastId);
            toast.success("Location detected successfully!");
        } catch (error) {
            toast.dismiss(toastId);
            toast.error(error.message || "Failed to detect location");
        }
    };

    const openAddModal = () => {
        setAddForm(f => ({
            ...f,
            name: f.name || profileName,
            phone: f.phone || profilePhone || ''
        }));
        setIsAddOpen(true);
    };

    const handleCloseAddModal = () => {
        setIsAddOpen(false);
        sessionStorage.removeItem('addAddressForm');
        sessionStorage.removeItem('addAddressModalOpen');
        setAddForm({
            type: 'home',
            name: profileName,
            phone: profilePhone || '',
            address: '',
            landmark: '',
            city: '',
            state: '',
            pincode: '',
            location: null
        });
    };

    
    const validateAddressForm = (form) => {
        if (form.name && !/^[A-Za-z\s]+$/.test(form.name.trim())) {
            toast.error('Name should contain only alphabets');
            return false;
        }
        if (form.phone && !/^[6-9]\d{9}$/.test(form.phone.trim())) {
            toast.error('Phone number must start with 6,7,8,9 and be exactly 10 digits');
            return false;
        }
        if (!form.address?.trim()) {
            toast.error('Please enter the address');
            return false;
        }
        if (form.landmark && !/^[A-Za-z\s]+$/.test(form.landmark.trim())) {
            toast.error('Landmark should contain only alphabets');
            return false;
        }
        if (form.city && !/^[A-Za-z\s]+$/.test(form.city.trim())) {
            toast.error('City should contain only alphabets');
            return false;
        }
        if (form.state && !/^[A-Za-z\s]+$/.test(form.state.trim())) {
            toast.error('State should contain only alphabets');
            return false;
        }
        if (form.pincode && !/^\d{6}$/.test(form.pincode.trim())) {
            toast.error('Pincode must be exactly 6 numeric digits');
            return false;
        }
        return true;
    };

    const handleMapConfirm = (data) => {
        const lat = data.lat ?? data.latitude;
        const lng = data.lng ?? data.longitude;
        const address = data.formattedAddress || data.address || '';
        const landmark = data.area || data.subLocality || data.locality || '';

        if (mapPickerTarget === 'add') {
            setAddForm(f => ({
                ...f,
                address: address || f.address,
                city: data.city || f.city,
                state: data.state || f.state,
                pincode: data.pincode || f.pincode,
                landmark: landmark || f.landmark,
                location: (lat && lng) ? { lat, lng } : f.location
            }));
        } else if (mapPickerTarget === 'edit') {
            setEditForm(f => ({
                ...f,
                address: address || f.address,
                city: data.city || f.city,
                state: data.state || f.state,
                pincode: data.pincode || f.pincode,
                landmark: landmark || f.landmark,
                location: (lat && lng) ? { lat, lng } : f.location
            }));
        }
    };

    const handleSaveNewAddress = async () => {
        if (!validateAddressForm(addForm)) return;
        const name = addForm.name?.trim();
        const address = addForm.address?.trim();
        const city = addForm.city?.trim();
        const landmark = addForm.landmark?.trim();
        const state = addForm.state?.trim();
        const pincode = addForm.pincode?.trim();

        const isDuplicate = rawAddresses.some(addr => 
            addr.fullAddress?.toLowerCase().trim() === address.toLowerCase() &&
            (addr.label || 'home').toLowerCase() === addForm.type.toLowerCase()
        );

        if (isDuplicate) {
            toast.error('This address already exists');
            return;
        }

        const newAddr = {
            label: addForm.type.toLowerCase(),
            fullAddress: address,
            ...(landmark && { landmark }),
            ...(city && { city }),
            ...(state && { state }),
            ...(pincode && { pincode }),
            ...(addForm.location && { location: addForm.location }),
        };
        setSaving(true);
        try {
            if (!newAddr.location?.lat) {
                try {
                    const query = [address, landmark, city, state, pincode].filter(Boolean).join(', ');
                    const geo = await customerApi.geocodeAddress(query);
                    const loc = geo.data?.result?.location;
                    if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
                        newAddr.location = { lat: loc.lat, lng: loc.lng };
                        if (geo.data?.result?.placeId) newAddr.placeId = geo.data.result.placeId;
                        if (geo.data?.result?.formattedAddress) newAddr.formattedAddress = geo.data.result.formattedAddress;
                    }
                } catch {
                    // best effort
                }
            }

            await customerApi.updateProfile({
                ...(name && { name }),
                phone: profilePhone || addForm.phone,
                addresses: [...rawAddresses, newAddr]
            });
            toast.success('Address added successfully');
            handleCloseAddModal();
            await fetchAddresses();
            await refreshAddresses?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save address');
        } finally {
            setSaving(false);
        }
    };

    const [editForm, setEditForm] = useState({
        type: 'home',
        name: '',
        phone: '',
        address: '',
        landmark: '',
        city: '',
        state: '',
        pincode: '',
        location: null
    });
    const [updating, setUpdating] = useState(false);

    const handleEdit = (addr) => {
        setSelectedAddress(addr);
        const raw = rawAddresses.find(r => (r._id === addr.id) || (r.fullAddress === addr.address));
        setEditForm({
            type: (addr.type || 'Home').toLowerCase(),
            name: addr.name ?? '',
            phone: addr.phone ?? '',
            address: addr.address ?? '',
            landmark: addr.landmark ?? raw?.landmark ?? '',
            city: addr.city ?? raw?.city ?? '',
            state: addr.state ?? raw?.state ?? '',
            pincode: addr.pincode ?? raw?.pincode ?? '',
            location: raw?.location ? { lat: raw.location.lat, lng: raw.location.lng } : null
        });
        setIsEditOpen(true);
    };

    const handleUpdateAddress = async () => {
        if (!selectedAddress) return;
        const address = editForm.address?.trim();
        if (!address) {
            toast.error('Please enter the address');
            return;
        }
        const idx = rawAddresses.findIndex(a => (a._id === selectedAddress.id) || (a.fullAddress === selectedAddress.address));
        if (idx < 0) {
            setIsEditOpen(false);
            return;
        }
        const updatedRaw = {
            ...(rawAddresses[idx] && typeof rawAddresses[idx] === 'object' ? rawAddresses[idx] : {}),
            label: editForm.type.toLowerCase(),
            fullAddress: address,
            ...(editForm.landmark?.trim() && { landmark: editForm.landmark.trim() }),
            ...(editForm.city?.trim() && { city: editForm.city.trim() }),
            ...(editForm.state?.trim() && { state: editForm.state.trim() }),
            ...(editForm.pincode?.trim() && { pincode: editForm.pincode.trim() }),
            ...(editForm.location && { location: editForm.location }),
        };

        if (!updatedRaw.location?.lat) {
            try {
                const query = [
                    editForm.address?.trim(),
                    editForm.landmark?.trim(),
                    editForm.city?.trim(),
                    editForm.state?.trim(),
                    editForm.pincode?.trim(),
                ].filter(Boolean).join(', ');
                const geo = await customerApi.geocodeAddress(query);
                const loc = geo.data?.result?.location;
                if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
                    updatedRaw.location = { lat: loc.lat, lng: loc.lng };
                    if (geo.data?.result?.placeId) updatedRaw.placeId = geo.data.result.placeId;
                    if (geo.data?.result?.formattedAddress) updatedRaw.formattedAddress = geo.data.result.formattedAddress;
                }
            } catch {
                // best effort
            }
        }

        const nextAddresses = [...rawAddresses];
        nextAddresses[idx] = updatedRaw;

        setUpdating(true);
        try {
            await customerApi.updateProfile({
                addresses: nextAddresses
            });
            toast.success('Address updated successfully');
            setIsEditOpen(false);
            await fetchAddresses();
            await refreshAddresses?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update address');
        } finally {
            setUpdating(false);
        }
    };

    const handleDelete = (addr) => {
        setSelectedAddress(addr);
        setIsDeleteOpen(true);
    };

    const [deleting, setDeleting] = useState(false);

    const handleConfirmDelete = async () => {
        if (!selectedAddress) return;
        const idx = addresses.findIndex(a => (a.id === selectedAddress.id) || (a.address === selectedAddress.address && a.type === selectedAddress.type));
        if (idx < 0) {
            setIsDeleteOpen(false);
            return;
        }
        const updatedAddresses = rawAddresses.filter((_, i) => i !== idx);
        setDeleting(true);
        try {
            await customerApi.updateProfile({ addresses: updatedAddresses });
            toast.success('Address deleted successfully');
            setIsDeleteOpen(false);
            setSelectedAddress(null);
            setLoading(true);
            await fetchAddresses();
            await refreshAddresses?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete address');
        } finally {
            setDeleting(false);
        }
    };

    const handleMakeDefault = async (addr) => {
        const idx = addresses.findIndex(a => (a.id === addr.id) || (a.address === addr.address && a.type === addr.type));
        if (idx <= 0) return; 

        const updatedAddresses = [...rawAddresses];
        const [moved] = updatedAddresses.splice(idx, 1);
        updatedAddresses.unshift(moved);

        setLoading(true);
        try {
            await customerApi.updateProfile({ addresses: updatedAddresses });
            toast.success('Default address updated');
            await fetchAddresses();
            await refreshAddresses?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update default address');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] pb-24 font-sans">
            {/* Compact Header */}
            <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 py-2.5 border-b border-slate-200/80 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center justify-center p-1 -ml-1 text-slate-700 hover:text-[#1A4516] transition-colors"
                    >
                        <ChevronLeft size={22} className="text-[#1A4516]" />
                    </button>
                    <div>
                        <h1 className="text-[16px] font-bold text-[#1A4516] tracking-tight leading-none">Saved Addresses</h1>
                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">{addresses.length} {addresses.length === 1 ? 'address' : 'addresses'} saved</p>
                    </div>
                </div>
                <button
                    onClick={openAddModal}
                    className="flex items-center gap-1 bg-[#F5FBF5] text-[#1A4516] hover:bg-[#e6f4e6] px-3 py-1.5 rounded-full text-xs font-bold border border-[#1A4516]/20 transition-all active:scale-95 shadow-2xs"
                >
                    <Plus size={14} strokeWidth={2.5} /> Add New
                </button>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-4 relative z-20">
                {/* Address List */}
                {loading ? (
                    <div className="bg-white rounded-xl p-8 border border-slate-200/80 text-center shadow-xs">
                        <div className="w-6 h-6 border-2 border-[#1A4516] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-slate-500 font-medium text-xs">Loading addresses...</p>
                    </div>
                ) : addresses.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 border border-slate-200/80 text-center shadow-xs max-w-md mx-auto my-6">
                        <div className="w-12 h-12 rounded-full bg-[#F5FBF5] flex items-center justify-center text-[#1A4516] mx-auto mb-3">
                            <MapPin size={22} />
                        </div>
                        <h3 className="text-slate-800 font-bold text-sm mb-1">No saved addresses</h3>
                        <p className="text-slate-500 text-xs mb-4">Add your delivery address for faster checkout.</p>
                        <Button onClick={openAddModal} className="bg-[#1A4516] hover:bg-[#0a3000] text-white text-xs h-8 px-4 rounded-full">
                            <Plus size={14} className="mr-1" /> Add Address
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {addresses.map((addr) => (
                            <div key={addr.id} className="bg-white rounded-xl p-3 md:p-3.5 border border-slate-200/80 hover:border-[#1A4516]/30 shadow-xs hover:shadow-sm transition-all relative overflow-hidden flex flex-col justify-between">
                                {addr.isDefault && (
                                    <div className="absolute top-0 right-0 bg-[#1A4516] text-white text-[9px] font-bold px-2.5 py-0.5 rounded-bl-lg uppercase tracking-wide">
                                        Default
                                    </div>
                                )}

                                <div className="flex items-start gap-2.5">
                                    <div className="h-8 w-8 rounded-lg bg-[#F5FBF5] flex items-center justify-center text-[#1A4516] shrink-0 mt-0.5 border border-[#1A4516]/10">
                                        {addr.type === 'Home' ? <Home size={15} /> : addr.type === 'Work' ? <Briefcase size={15} /> : <MapPin size={15} />}
                                    </div>
                                    <div className="flex-1 min-w-0 pr-12">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <span className="text-xs font-bold text-[#1A4516] uppercase tracking-wide">{addr.type}</span>
                                            {addr.name && (
                                                <>
                                                    <span className="text-xs text-slate-300">•</span>
                                                    <span className="text-xs font-semibold text-slate-800 truncate">{addr.name}</span>
                                                </>
                                            )}
                                        </div>
                                        <p className="text-slate-700 text-[12px] leading-relaxed line-clamp-2">{addr.address}</p>
                                        <p className="text-slate-500 text-[11px] mt-0.5">
                                            {[addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}
                                        </p>
                                        {addr.phone && (
                                            <p className="text-[#1A4516] font-medium text-[11px] mt-1">
                                                📞 {addr.phone}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-3 pt-2.5 flex items-center gap-2 border-t border-slate-100">
                                    {!addr.isDefault && (
                                        <button
                                            onClick={() => handleMakeDefault(addr)}
                                            className="flex-1 bg-white border border-slate-200 hover:border-[#1A4516] text-slate-700 hover:text-[#1A4516] h-7.5 rounded-lg text-[11px] font-semibold transition-colors"
                                        >
                                            Set Default
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleEdit(addr)}
                                        className="flex-1 bg-[#F5FBF5] text-[#1A4516] hover:bg-[#e6f4e6] h-7.5 rounded-lg text-[11px] font-semibold transition-colors flex items-center justify-center gap-1"
                                    >
                                        <Edit2 size={12} /> Edit
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (window.confirm('Are you sure you want to delete this address?')) {
                                                handleDelete(addr);
                                            }
                                        }}
                                        className="w-7.5 h-7.5 flex items-center justify-center bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors shrink-0"
                                        title="Delete"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Compact Add Address Modal */}
            <Dialog open={isAddOpen} onOpenChange={(open) => !open ? handleCloseAddModal() : setIsAddOpen(true)}>
                <DialogContent className="sm:max-w-[460px] p-4 sm:p-5 max-h-[90vh] overflow-y-auto no-scrollbar">
                    <DialogHeader className="pb-1 border-b border-slate-100">
                        <DialogTitle className="text-base font-bold text-slate-800">Add New Address</DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Enter your delivery details below.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2.5 py-3 text-xs">
                        <div>
                            <Label className="text-[11px] font-semibold text-slate-700 mb-1 block">Address Type</Label>
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" size="sm" className={`flex-1 h-7.5 text-xs font-semibold ${addForm.type === 'home' ? 'border-[#1A4516] text-[#1A4516] bg-[#F5FBF5]' : ''}`} onClick={() => setAddForm(f => ({ ...f, type: 'home' }))}>Home</Button>
                                <Button type="button" variant="outline" size="sm" className={`flex-1 h-7.5 text-xs font-semibold ${addForm.type === 'work' ? 'border-[#1A4516] text-[#1A4516] bg-[#F5FBF5]' : ''}`} onClick={() => setAddForm(f => ({ ...f, type: 'work' }))}>Work</Button>
                                <Button type="button" variant="outline" size="sm" className={`flex-1 h-7.5 text-xs font-semibold ${addForm.type === 'other' ? 'border-[#1A4516] text-[#1A4516] bg-[#F5FBF5]' : ''}`} onClick={() => setAddForm(f => ({ ...f, type: 'other' }))}>Other</Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label htmlFor="name" className="text-[11px] font-semibold text-slate-700 mb-1 block">Full Name</Label>
                                <Input id="name" placeholder="John Doe" maxLength={50} className="h-8 text-xs" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value.replace(/[^A-Za-z\s]/g, '') }))} />
                            </div>
                            <div>
                                <Label htmlFor="phone" className="text-[11px] font-semibold text-slate-700 mb-1 block">Phone Number</Label>
                                <Input id="phone" placeholder="9876543210" maxLength={10} className="h-8 text-xs" value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))} />
                            </div>
                        </div>
                        
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <Label htmlFor="address" className="text-[11px] font-semibold text-slate-700">Address / Flat / Building</Label>
                                <div className="flex gap-1.5">
                                    <button type="button" className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold text-[#1A4516] bg-[#F5FBF5] border border-[#1A4516]/30 hover:bg-[#e6f4e6]" onClick={() => handleDetectLocation(false)}>
                                        <Crosshair size={11} className="mr-1" /> Detect
                                    </button>
                                    <button type="button" className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold text-[#1A4516] bg-[#F5FBF5] border border-[#1A4516]/30 hover:bg-[#e6f4e6]" onClick={() => { setMapPickerTarget('add'); setIsMapPickerOpen(true); }}>
                                        <MapPin size={11} className="mr-1" /> Map
                                    </button>
                                </div>
                            </div>
                            <PlacesAutocompleteInput 
                                isLoaded={isLoaded}
                                id="address" 
                                placeholder="Flat No, Building, Street" 
                                maxLength={200} 
                                value={addForm.address} 
                                onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))}
                                onPlaceSelected={handleAddPlaceChanged}
                            />
                            {addForm.location && (
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    📍 Lat: {addForm.location.lat.toFixed(5)}, Lng: {addForm.location.lng.toFixed(5)}
                                </p>
                            )}
                        </div>

                        <div>
                            <Label htmlFor="landmark" className="text-[11px] font-semibold text-slate-700 mb-1 block">Nearest Landmark (optional)</Label>
                            <Input
                                id="landmark"
                                placeholder="Near City Mall, Opp. Temple"
                                className="h-8 text-xs"
                                value={addForm.landmark}
                                onChange={e => setAddForm(f => ({ ...f, landmark: e.target.value }))}
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <Label htmlFor="city" className="text-[11px] font-semibold text-slate-700 mb-1 block">City</Label>
                                <Input id="city" placeholder="New Delhi" maxLength={50} className="h-8 text-xs" value={addForm.city} onChange={e => setAddForm(f => ({ ...f, city: e.target.value.replace(/[^A-Za-z\s]/g, '') }))} />
                            </div>
                            <div>
                                <Label htmlFor="state" className="text-[11px] font-semibold text-slate-700 mb-1 block">State</Label>
                                <Input id="state" placeholder="Delhi" maxLength={50} className="h-8 text-xs" value={addForm.state} onChange={e => setAddForm(f => ({ ...f, state: e.target.value.replace(/[^A-Za-z\s]/g, '') }))} />
                            </div>
                            <div>
                                <Label htmlFor="pincode" className="text-[11px] font-semibold text-slate-700 mb-1 block">Pincode</Label>
                                <Input id="pincode" placeholder="110075" maxLength={6} className="h-8 text-xs" value={addForm.pincode} onChange={e => setAddForm(f => ({ ...f, pincode: e.target.value.replace(/\D/g, '') }))} />
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="pt-2 border-t border-slate-100 flex-row justify-end gap-2">
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCloseAddModal} disabled={saving}>Cancel</Button>
                        <Button size="sm" className="bg-[#1A4516] hover:bg-[#0a3000] text-white h-8 text-xs font-bold px-4" onClick={handleSaveNewAddress} disabled={saving}>{saving ? 'Saving...' : 'Save Address'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Compact Edit Address Modal */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="sm:max-w-[460px] p-4 sm:p-5 max-h-[90vh] overflow-y-auto no-scrollbar">
                    <DialogHeader className="pb-1 border-b border-slate-100">
                        <DialogTitle className="text-base font-bold text-slate-800">Edit Address</DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Update your delivery details.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2.5 py-3 text-xs">
                        <div>
                            <Label className="text-[11px] font-semibold text-slate-700 mb-1 block">Address Type</Label>
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" size="sm" className={`flex-1 h-7.5 text-xs font-semibold ${editForm.type === 'home' ? 'border-[#1A4516] text-[#1A4516] bg-[#F5FBF5]' : ''}`} onClick={() => setEditForm(f => ({ ...f, type: 'home' }))}>Home</Button>
                                <Button type="button" variant="outline" size="sm" className={`flex-1 h-7.5 text-xs font-semibold ${editForm.type === 'work' ? 'border-[#1A4516] text-[#1A4516] bg-[#F5FBF5]' : ''}`} onClick={() => setEditForm(f => ({ ...f, type: 'work' }))}>Work</Button>
                                <Button type="button" variant="outline" size="sm" className={`flex-1 h-7.5 text-xs font-semibold ${editForm.type === 'other' ? 'border-[#1A4516] text-[#1A4516] bg-[#F5FBF5]' : ''}`} onClick={() => setEditForm(f => ({ ...f, type: 'other' }))}>Other</Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label htmlFor="edit-name" className="text-[11px] font-semibold text-slate-700 mb-1 block">Full Name</Label>
                                <Input id="edit-name" maxLength={50} className="h-8 text-xs" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value.replace(/[^A-Za-z\s]/g, '') }))} />
                            </div>
                            <div>
                                <Label htmlFor="edit-phone" className="text-[11px] font-semibold text-slate-700 mb-1 block">Phone Number</Label>
                                <Input id="edit-phone" maxLength={10} className="h-8 text-xs" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))} />
                            </div>
                        </div>
                        
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <Label htmlFor="edit-address" className="text-[11px] font-semibold text-slate-700">Address / Flat / Building</Label>
                                <div className="flex gap-1.5">
                                    <button type="button" className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold text-[#1A4516] bg-[#F5FBF5] border border-[#1A4516]/30 hover:bg-[#e6f4e6]" onClick={() => handleDetectLocation(true)}>
                                        <Crosshair size={11} className="mr-1" /> Detect
                                    </button>
                                    <button type="button" className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold text-[#1A4516] bg-[#F5FBF5] border border-[#1A4516]/30 hover:bg-[#e6f4e6]" onClick={() => { setMapPickerTarget('edit'); setIsMapPickerOpen(true); }}>
                                        <MapPin size={11} className="mr-1" /> Map
                                    </button>
                                </div>
                            </div>
                            <PlacesAutocompleteInput 
                                isLoaded={isLoaded}
                                id="edit-address" 
                                maxLength={200} 
                                value={editForm.address} 
                                onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                                onPlaceSelected={handleEditPlaceChanged}
                            />
                            {editForm.location && (
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    📍 Lat: {editForm.location.lat.toFixed(5)}, Lng: {editForm.location.lng.toFixed(5)}
                                </p>
                            )}
                        </div>

                        <div>
                            <Label htmlFor="edit-landmark" className="text-[11px] font-semibold text-slate-700 mb-1 block">Nearest Landmark (optional)</Label>
                            <Input
                                id="edit-landmark"
                                placeholder="Near City Mall, Opp. Temple"
                                className="h-8 text-xs"
                                value={editForm.landmark}
                                onChange={e => setEditForm(f => ({ ...f, landmark: e.target.value }))}
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <Label htmlFor="edit-city" className="text-[11px] font-semibold text-slate-700 mb-1 block">City</Label>
                                <Input id="edit-city" placeholder="New Delhi" maxLength={50} className="h-8 text-xs" value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value.replace(/[^A-Za-z\s]/g, '') }))} />
                            </div>
                            <div>
                                <Label htmlFor="edit-state" className="text-[11px] font-semibold text-slate-700 mb-1 block">State</Label>
                                <Input id="edit-state" placeholder="Delhi" maxLength={50} className="h-8 text-xs" value={editForm.state} onChange={e => setEditForm(f => ({ ...f, state: e.target.value.replace(/[^A-Za-z\s]/g, '') }))} />
                            </div>
                            <div>
                                <Label htmlFor="edit-pincode" className="text-[11px] font-semibold text-slate-700 mb-1 block">Pincode</Label>
                                <Input id="edit-pincode" placeholder="110075" maxLength={6} className="h-8 text-xs" value={editForm.pincode} onChange={e => setEditForm(f => ({ ...f, pincode: e.target.value.replace(/\D/g, '') }))} />
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="pt-2 border-t border-slate-100 flex-row justify-end gap-2">
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setIsEditOpen(false)} disabled={updating}>Cancel</Button>
                        <Button size="sm" className="bg-[#1A4516] hover:bg-[#0a3000] text-white h-8 text-xs font-bold px-4" onClick={handleUpdateAddress} disabled={updating}>{updating ? 'Updating...' : 'Update Address'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Compact Delete Confirmation Modal */}
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent className="sm:max-w-[380px] p-4 sm:p-5">
                    <DialogHeader className="pb-1">
                        <DialogTitle className="text-sm font-bold text-red-600">Delete Address?</DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Are you sure you want to delete this address? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedAddress && (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 my-2 text-xs">
                            <span className="font-bold text-slate-800 uppercase text-[10px] tracking-wide block mb-0.5">{selectedAddress.type}</span>
                            <p className="text-slate-600 text-[11px] line-clamp-2">{selectedAddress.address}</p>
                        </div>
                    )}

                    <DialogFooter className="pt-2 flex-row justify-end gap-2">
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setIsDeleteOpen(false)} disabled={deleting}>Cancel</Button>
                        <Button variant="destructive" size="sm" className="bg-red-500 hover:bg-red-600 h-8 text-xs px-4" onClick={handleConfirmDelete} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Map Picker Modal */}
            <MapPicker
                isOpen={isMapPickerOpen}
                onClose={() => setIsMapPickerOpen(false)}
                onConfirm={handleMapConfirm}
                initialLocation={mapPickerTarget === 'edit' ? editForm.location : addForm.location}
                showRadius={false}
                title="Select Address Location"
            />
        </div>
    );
};

export default AddressesPage;

