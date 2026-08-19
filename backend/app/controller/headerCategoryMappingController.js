import HeaderCategoryMapping from "../models/headerCategoryMapping.js";

// Fetch all mappings (Admin)
export const getAllAdmin = async (req, res) => {
  try {
    const mappings = await HeaderCategoryMapping.find()
      .populate("categoryId")
      .sort({ displayOrder: 1, createdAt: -1 });
    res.json({ success: true, result: mappings });
  } catch (error) {
    console.error("Error fetching admin header category mappings:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Fetch active mappings (Customer)
export const getAllActive = async (req, res) => {
  try {
    let mappings = await HeaderCategoryMapping.find({ isActive: true })
      .populate("categoryId")
      .sort({ displayOrder: 1, createdAt: -1 });
      
    // Filter out mappings where the underlying category was deleted or marked inactive
    mappings = mappings.filter(m => m.categoryId && m.categoryId.status === "active");

    res.json({ success: true, result: mappings });
  } catch (error) {
    console.error("Error fetching active header category mappings:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Create a new mapping
export const create = async (req, res) => {
  try {
    const { categoryId, customName, iconId, image, isActive, displayOrder } = req.body;

    const existing = await HeaderCategoryMapping.findOne({ categoryId });
    if (existing) {
      return res.status(400).json({ success: false, message: "Category is already mapped to the header." });
    }

    const mapping = new HeaderCategoryMapping({
      categoryId,
      customName,
      iconId,
      image,
      isActive,
      displayOrder,
    });
    
    await mapping.save();
    const populated = await HeaderCategoryMapping.findById(mapping._id).populate("categoryId");
    res.status(201).json({ success: true, result: populated, message: "Added to Header Categories successfully." });
  } catch (error) {
    console.error("Error creating header category mapping:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update a mapping
export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { customName, iconId, image, isActive, displayOrder } = req.body;

    const mapping = await HeaderCategoryMapping.findByIdAndUpdate(
      id,
      { customName, iconId, image, isActive, displayOrder },   
      { new: true, runValidators: true }
    ).populate("categoryId");

    if (!mapping) {
      return res.status(404).json({ success: false, message: "Mapping not found" });
    }
    res.json({ success: true, result: mapping, message: "Header Category updated successfully." });
  } catch (error) {
    console.error("Error updating header category mapping:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Delete a mapping
export const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const mapping = await HeaderCategoryMapping.findByIdAndDelete(id);
    if (!mapping) {
      return res.status(404).json({ success: false, message: "Mapping not found" });
    }
    res.json({ success: true, message: "Removed from Header Categories." });
  } catch (error) {
    console.error("Error deleting header category mapping:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Reorder mappings
export const reorder = async (req, res) => {
  try {
    const { orderedIds } = req.body; // Array of HeaderCategoryMapping IDs

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, message: "orderedIds must be an array" });
    }

    const bulkOps = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { displayOrder: index },
      },
    }));

    if (bulkOps.length > 0) {
      await HeaderCategoryMapping.bulkWrite(bulkOps);
    }

    res.json({ success: true, message: "Order updated successfully." });
  } catch (error) {
    console.error("Error reordering header category mappings:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
