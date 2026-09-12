import Cart from "../models/cart.js";
import Product from "../models/product.js";
import handleResponse from "../utils/helper.js";
import { getApprovedOrLegacyFilter } from "../services/productModerationService.js";
import { getIO } from "../socket/socketManager.js";

const CART_POPULATE_FIELDS =
  "name slug price salePrice mainImage stock status headerId categoryId sellerId variants";

const CUSTOMER_VISIBLE_PRODUCT_MATCH = {
  status: "active",
  ...getApprovedOrLegacyFilter(),
};

function sanitizeCartItems(cart) {
  if (!cart || !Array.isArray(cart.items)) return cart;
  cart.items = cart.items.filter((item) => Boolean(item?.productId));
  return cart;
}

async function getCustomerVisibleProductById(productId) {
  if (!productId) return null;
  return Product.findOne({
    _id: productId,
    ...CUSTOMER_VISIBLE_PRODUCT_MATCH,
  })
    .select("_id sellerId")
    .lean();
}

async function fetchPopulatedCart(cartId) {
  const cart = await Cart.findById(cartId)
    .populate({
      path: "items.productId",
      select: CART_POPULATE_FIELDS,
      match: CUSTOMER_VISIBLE_PRODUCT_MATCH,
    })
    .lean();

  return sanitizeCartItems(cart);
}

/* ===============================
   GET CUSTOMER CART
================================ */
export const getCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    let cart = await Cart.findOne({ customerId })
      .populate({
        path: "items.productId",
        select: CART_POPULATE_FIELDS,
        match: CUSTOMER_VISIBLE_PRODUCT_MATCH,
      })
      .lean();

    if (!cart) {
      const newCart = await Cart.create({ customerId, items: [] });
      return handleResponse(res, 200, "Cart fetched successfully", newCart);
    }

    return handleResponse(res, 200, "Cart fetched successfully", sanitizeCartItems(cart));
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADD TO CART
================================ */
export const addToCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId, quantity = 1, variantSku = "" } = req.body;
    const normalizedVariantSku = String(variantSku || "").trim();
    const customerVisibleProduct = await getCustomerVisibleProductById(productId);
    if (!customerVisibleProduct) {
      return handleResponse(res, 404, "Product is not available for purchase");
    }

    let cart = await Cart.findOne({ customerId }).populate("items.productId", "sellerId").lean();

    if (!cart) {
      cart = { customerId, items: [] };
    }

    // Validate that the new product belongs to the same seller as existing items in the cart
    if (cart.items && cart.items.length > 0) {
      const existingItem = cart.items.find(item => item.productId && item.productId.sellerId);
      if (existingItem) {
        const existingSellerId = existingItem.productId.sellerId.toString();
        const newSellerId = customerVisibleProduct.sellerId.toString();
        if (existingSellerId !== newSellerId) {
          return handleResponse(res, 400, "You can only add items from the same store. Please clear your cart to add items from a different store.");
        }
      }
    }

    // Since we used .lean() to populate, we need to fetch the mongoose document to save it
    let cartDoc = await Cart.findOne({ customerId });
    if (!cartDoc) {
      cartDoc = new Cart({ customerId, items: [] });
    }

    const itemIndex = cartDoc.items.findIndex(
      (item) =>
        item.productId.toString() === productId &&
        String(item.variantSku || "").trim() === normalizedVariantSku,
    );

    if (itemIndex > -1) {
      cartDoc.items[itemIndex].quantity += quantity;
    } else {
      cartDoc.items.push({ productId, variantSku: normalizedVariantSku, quantity });
    }

    await cartDoc.save();
    const updatedCart = await fetchPopulatedCart(cartDoc._id);

    try {
      const io = getIO();
      if (io) io.to(`customer:${customerId}`).emit("cart:update", updatedCart);
    } catch (err) {
      console.warn("Socket emission failed for cart update:", err.message);
    }

    return handleResponse(res, 200, "Item added to cart", updatedCart);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE QUANTITY
================================ */
export const updateQuantity = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId, quantity, variantSku = "" } = req.body;
    const normalizedVariantSku = String(variantSku || "").trim();

    let cart = await Cart.findOne({ customerId });

    if (!cart) {
      return handleResponse(res, 404, "Cart not found");
    }

    const itemIndex = cart.items.findIndex((item) => {
      if (!item || !item.productId) return false;
      const itemProductId = item.productId._id ? item.productId._id.toString() : item.productId.toString();
      return (
        itemProductId === productId &&
        String(item.variantSku || "").trim() === normalizedVariantSku
      );
    });

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity = quantity;
      if (cart.items[itemIndex].quantity <= 0) {
        cart.items.splice(itemIndex, 1);
      }
    } else {
      return handleResponse(res, 404, "Product not in cart");
    }

    cart.markModified("items");
    await cart.save();
    const updatedCart = await fetchPopulatedCart(cart._id);

    try {
      const io = getIO();
      if (io) io.to(`customer:${customerId}`).emit("cart:update", updatedCart);
    } catch (err) {
      console.warn("Socket emission failed for cart update:", err.message);
    }

    return handleResponse(res, 200, "Cart updated successfully", updatedCart);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REMOVE FROM CART
================================ */
export const removeFromCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId } = req.params;
    const normalizedVariantSku = String(req.query?.variantSku || "").trim();

    let cart = await Cart.findOne({ customerId });

    if (!cart) {
      return handleResponse(res, 404, "Cart not found");
    }

    console.log("Removing item from cart:", { productId, normalizedVariantSku });
    let removedCount = 0;
    
    // Iterate backwards so splice doesn't affect remaining indices
    for (let i = cart.items.length - 1; i >= 0; i--) {
      const item = cart.items[i];
      let shouldRemove = false;
      
      if (!item || !item.productId) continue;
      const itemProductId = item.productId._id ? item.productId._id.toString() : item.productId.toString();
      
      if (itemProductId === productId) {
        if (normalizedVariantSku) {
          if (String(item.variantSku || "").trim() === normalizedVariantSku) {
            shouldRemove = true;
          }
        } else {
          // If no variantSku is provided, remove all lines for that product
          shouldRemove = true;
        }
      }
      
      if (shouldRemove) {
        cart.items.splice(i, 1);
        removedCount++;
      }
    }
    
    console.log("Items removed:", removedCount);

    cart.markModified("items");
    await cart.save();
    const updatedCart = await fetchPopulatedCart(cart._id);

    try {
      const io = getIO();
      if (io) io.to(`customer:${customerId}`).emit("cart:update", updatedCart);
    } catch (err) {
      console.warn("Socket emission failed for cart update:", err.message);
    }

    return handleResponse(res, 200, "Item removed from cart", updatedCart);
  } catch (error) {
    import('fs').then(fs => fs.writeFileSync('backend_error.log', error.stack || error.message || String(error)));
    console.error("removeFromCart ERROR:", error);
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   CLEAR CART
================================ */
export const clearCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    let cart = await Cart.findOne({ customerId });

    if (cart) {
      cart.items = [];
      await cart.save();
    }

    return handleResponse(res, 200, "Cart cleared successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
