import React, { useState, useEffect, useCallback } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import { adminApi } from '../../services/adminApi';
import { toast } from 'sonner';
import { 
  Plus, Search, Edit, Trash2, GripVertical, 
  ArrowUp, ArrowDown, X, Save, Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const HeaderMenuConfig = () => {
  const [mappings, setMappings] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [draggedItem, setDraggedItem] = useState(null);
  
  // Form State
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    categoryId: '',
    customName: '',
    iconId: '',
    isActive: true
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [mappingsRes, categoriesRes] = await Promise.all([
        adminApi.getHeaderCategories(),
        adminApi.getCategories({ flat: true }) // assuming flat returns a flat list
      ]);

      if (mappingsRes.data.success) {
        setMappings(mappingsRes.data.result || []);
      }
      
      if (categoriesRes.data.success) {
        // extract all categories (some might be nested if flat isn't fully working)
        let cats = categoriesRes.data.results || categoriesRes.data.result || [];
        setAllCategories(cats);
      }
    } catch (error) {
      toast.error('Failed to load Header Menu configurations');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Drag & Drop
  const onDragStart = (e, index) => {
    setDraggedItem(mappings[index]);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", e.target.parentNode);
    e.dataTransfer.setDragImage(e.target.parentNode, 20, 20);
  };

  const onDragOver = (index) => {
    const draggedOverItem = mappings[index];
    if (draggedItem === draggedOverItem) return;

    let newMappings = mappings.filter(item => item !== draggedItem);
    newMappings.splice(index, 0, draggedItem);
    setMappings(newMappings);
  };

  const onDragEnd = async () => {
    setDraggedItem(null);
    try {
      const orderedIds = mappings.map(m => m._id);
      await adminApi.reorderHeaderCategories(orderedIds);
      toast.success('Order updated successfully');
    } catch (error) {
      toast.error('Failed to update order');
      fetchData(); // revert
    }
  };

  const moveItem = async (index, direction) => {
    if ((direction === -1 && index === 0) || (direction === 1 && index === mappings.length - 1)) return;
    
    const newMappings = [...mappings];
    const temp = newMappings[index];
    newMappings[index] = newMappings[index + direction];
    newMappings[index + direction] = temp;
    
    setMappings(newMappings);
    
    try {
      const orderedIds = newMappings.map(m => m._id);
      await adminApi.reorderHeaderCategories(orderedIds);
      toast.success('Order updated');
    } catch (error) {
      toast.error('Failed to update order');
      fetchData();
    }
  };

  const toggleStatus = async (item) => {
    try {
      await adminApi.updateHeaderCategory(item._id, { isActive: !item.isActive });
      toast.success('Status updated');
      fetchData();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to remove this category from the header?')) return;
    try {
      await adminApi.deleteHeaderCategory(id);
      toast.success('Removed from Header Menu');
      fetchData();
    } catch (error) {
      toast.error('Failed to remove');
    }
  };

  const openModal = (item = null) => {
    if (item) {
      setEditingId(item._id);
      setFormData({
        categoryId: item.categoryId?._id || item.categoryId,
        customName: item.customName || '',
        iconId: item.iconId || '',
        isActive: item.isActive
      });
    } else {
      setEditingId(null);
      setFormData({
        categoryId: '',
        customName: '',
        iconId: '',
        isActive: true
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.categoryId) {
      return toast.error("Please select a category");
    }

    try {
      if (editingId) {
        await adminApi.updateHeaderCategory(editingId, formData);
        toast.success('Updated successfully');
      } else {
        // Set displayOrder to end of list
        const payload = { ...formData, displayOrder: mappings.length };
        await adminApi.createHeaderCategory(payload);
        toast.success('Added to Header Menu');
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Action failed');
    }
  };

  // Extract flat categories nicely, avoiding duplicates in dropdown
  const getFlatCategories = () => {
    const flat = [];
    const traverse = (items, prefix = "") => {
      items.forEach(cat => {
        flat.push({ ...cat, displayName: prefix + cat.name });
        if (cat.children && cat.children.length > 0) {
          traverse(cat.children, prefix + cat.name + " > ");
        }
      });
    };
    traverse(allCategories);
    return flat;
  };

  const availableCategories = getFlatCategories().filter(cat => 
    !mappings.some(m => m.categoryId?._id === cat._id) || (editingId && formData.categoryId === cat._id)
  );

  return (
    <div className="ds-section-spacing animate-in fade-in pb-16">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="ds-h1 flex items-center gap-2">
            Header Menu Config
            <Badge variant="primary" className="text-[9px] px-1.5 py-0 font-bold uppercase">Admin</Badge>
          </h1>
          <p className="ds-description mt-0.5">Control exactly which categories appear in the customer app's top header.</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-xl hover:bg-slate-800 flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>ADD TO HEADER</span>
        </button>
      </div>

      <Card className="bg-white p-6 shadow-sm ring-1 ring-slate-100 rounded-2xl min-h-[400px]">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : mappings.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-semibold text-sm">No categories configured for the header.</p>
            <button onClick={() => openModal()} className="text-primary mt-2 font-bold hover:underline">Add one now</button>
          </div>
        ) : (
          <div className="space-y-2">
            {mappings.map((mapping, index) => (
              <div 
                key={mapping._id}
                onDragOver={() => onDragOver(index)}
                className="group relative flex items-center bg-slate-50 border border-slate-100 p-3 rounded-xl transition-all"
              >
                {/* Drag Handle */}
                <div 
                  draggable
                  onDragStart={e => onDragStart(e, index)}
                  onDragEnd={onDragEnd}
                  className="cursor-grab p-2 text-slate-300 hover:text-slate-600 flex-shrink-0"
                >
                  <GripVertical className="h-5 w-5" />
                </div>
                
                {/* Visuals */}
                <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center shadow-sm overflow-hidden flex-shrink-0 mr-4">
                   {mapping.image || mapping.categoryId?.image ? (
                     <img src={mapping.image || mapping.categoryId?.image} alt="" className="h-full w-full object-cover" />
                   ) : (
                     <span className="font-bold text-slate-300">{mapping.customName ? mapping.customName[0] : mapping.categoryId?.name?.[0]}</span>
                   )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-slate-800 text-sm truncate">
                    {mapping.customName || mapping.categoryId?.name}
                    {mapping.customName && <span className="ml-2 text-[10px] text-slate-400 font-normal italic">(Original: {mapping.categoryId?.name})</span>}
                  </h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider truncate">
                    ID: {mapping.categoryId?._id}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-3 ml-4 flex-shrink-0">
                  <div className="flex flex-col space-y-1">
                    <button onClick={() => moveItem(index, -1)} disabled={index === 0} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30">
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button onClick={() => moveItem(index, 1)} disabled={index === mappings.length - 1} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30">
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>

                  <button 
                    onClick={() => toggleStatus(mapping)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                      mapping.isActive ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {mapping.isActive ? 'Active' : 'Hidden'}
                  </button>

                  <button onClick={() => openModal(mapping)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors">
                    <Edit className="h-4 w-4" />
                  </button>

                  <button onClick={() => handleDelete(mapping._id)} className="p-2 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-500 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
            
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-lg">{editingId ? 'Edit Header Mapping' : 'Add to Header Menu'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X className="h-4 w-4" /></button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Category</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    disabled={!!editingId}
                    className="w-full px-4 py-2.5 bg-slate-50 border-none ring-1 ring-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-primary disabled:opacity-50"
                  >
                    <option value="">-- Select Category --</option>
                    {availableCategories.map(cat => (
                      <option key={cat._id} value={cat._id}>{cat.displayName}</option>
                    ))}
                  </select>
                  {!editingId && <p className="text-[10px] text-slate-400 mt-1">Only unmapped categories are shown.</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Custom Display Name (Optional)</label>
                  <input
                    value={formData.customName}
                    onChange={(e) => setFormData({ ...formData, customName: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border-none ring-1 ring-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-primary"
                    placeholder="Leave blank to use original name"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Icon Identifier (Optional)</label>
                  <input
                    value={formData.iconId}
                    onChange={(e) => setFormData({ ...formData, iconId: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border-none ring-1 ring-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-primary"
                    placeholder="e.g. Sparkles, Home, ShoppingBag"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-xs font-bold text-slate-900">Visibility Status</p>
                    <p className="text-[9px] text-slate-400">Show this category in the header</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="sr-only peer" />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors flex justify-center items-center gap-2">
                    <Save className="h-4 w-4" /> Save
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HeaderMenuConfig;
