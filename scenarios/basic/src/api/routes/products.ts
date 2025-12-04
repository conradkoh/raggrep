/**
 * Product API Routes
 *
 * REST API endpoints for product catalog management.
 * Includes CRUD operations, search, and inventory management.
 */

import { Router, Request, Response } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  tags: string[];
  inventory: {
    quantity: number;
    warehouse: string;
    reorderPoint: number;
  };
  images: string[];
  status: "active" | "draft" | "archived";
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductSearchFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  tags?: string[];
  status?: Product["status"];
  inStock?: boolean;
}

// In-memory product store (would be database in production)
const products: Map<string, Product> = new Map();

/**
 * GET /api/products
 * List all products with optional filters
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      category,
      minPrice,
      maxPrice,
      tag,
      status,
      inStock,
      page = "1",
      pageSize = "20",
      sort = "createdAt",
      order = "desc",
    } = req.query;

    let filteredProducts = Array.from(products.values());

    // Apply filters
    if (category) {
      filteredProducts = filteredProducts.filter(
        (p) => p.category === category
      );
    }

    if (minPrice) {
      filteredProducts = filteredProducts.filter(
        (p) => p.price >= parseFloat(minPrice as string)
      );
    }

    if (maxPrice) {
      filteredProducts = filteredProducts.filter(
        (p) => p.price <= parseFloat(maxPrice as string)
      );
    }

    if (tag) {
      filteredProducts = filteredProducts.filter((p) =>
        p.tags.includes(tag as string)
      );
    }

    if (status) {
      filteredProducts = filteredProducts.filter((p) => p.status === status);
    }

    if (inStock === "true") {
      filteredProducts = filteredProducts.filter(
        (p) => p.inventory.quantity > 0
      );
    }

    // Sort
    filteredProducts.sort((a, b) => {
      const aVal = a[sort as keyof Product];
      const bVal = b[sort as keyof Product];

      if (aVal < bVal) return order === "asc" ? -1 : 1;
      if (aVal > bVal) return order === "asc" ? 1 : -1;
      return 0;
    });

    // Paginate
    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);
    const start = (pageNum - 1) * pageSizeNum;
    const paginatedProducts = filteredProducts.slice(start, start + pageSizeNum);

    res.json({
      products: paginatedProducts,
      total: filteredProducts.length,
      page: pageNum,
      pageSize: pageSizeNum,
    });
  } catch (error) {
    console.error("List products error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/products/search
 * Full-text search for products
 */
router.get("/search", async (req: Request, res: Response) => {
  try {
    const { q, limit = "20" } = req.query;

    if (!q) {
      res.status(400).json({ error: "Search query required" });
      return;
    }

    const query = (q as string).toLowerCase();
    const limitNum = parseInt(limit as string);

    const results = Array.from(products.values())
      .filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.tags.some((t) => t.toLowerCase().includes(query))
      )
      .slice(0, limitNum);

    res.json({ results, total: results.length });
  } catch (error) {
    console.error("Search products error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/products/:id
 * Get a single product by ID
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const product = products.get(req.params.id);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    res.json(product);
  } catch (error) {
    console.error("Get product error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/products
 * Create a new product (admin only)
 */
router.post("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      sku,
      name,
      description,
      price,
      currency = "USD",
      category,
      tags = [],
      inventory,
      images = [],
      status = "draft",
    } = req.body;

    // Validate required fields
    if (!sku || !name || !price || !category) {
      res
        .status(400)
        .json({ error: "Missing required fields: sku, name, price, category" });
      return;
    }

    // Check for duplicate SKU
    for (const p of products.values()) {
      if (p.sku === sku) {
        res.status(409).json({ error: "Product with this SKU already exists" });
        return;
      }
    }

    const product: Product = {
      id: generateId(),
      sku,
      name,
      description: description || "",
      price,
      currency,
      category,
      tags,
      inventory: inventory || { quantity: 0, warehouse: "main", reorderPoint: 10 },
      images,
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    products.set(product.id, product);

    res.status(201).json(product);
  } catch (error) {
    console.error("Create product error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/products/:id
 * Update a product (admin only)
 */
router.put("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const product = products.get(req.params.id);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const updates = req.body;

    // Update allowed fields
    const allowedUpdates = [
      "name",
      "description",
      "price",
      "currency",
      "category",
      "tags",
      "inventory",
      "images",
      "status",
    ];

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        (product as any)[key] = updates[key];
      }
    }

    product.updatedAt = new Date();

    res.json(product);
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/products/:id
 * Delete a product (admin only)
 */
router.delete("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const product = products.get(req.params.id);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    products.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/products/:id/inventory
 * Update product inventory
 */
router.post(
  "/:id/inventory",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const product = products.get(req.params.id);

      if (!product) {
        res.status(404).json({ error: "Product not found" });
        return;
      }

      const { adjustment, reason } = req.body;

      if (typeof adjustment !== "number") {
        res.status(400).json({ error: "Adjustment must be a number" });
        return;
      }

      const newQuantity = product.inventory.quantity + adjustment;

      if (newQuantity < 0) {
        res.status(400).json({ error: "Insufficient inventory" });
        return;
      }

      product.inventory.quantity = newQuantity;
      product.updatedAt = new Date();

      console.log(
        `Inventory updated for ${product.sku}: ${adjustment} (${reason || "no reason"})`
      );

      res.json({
        productId: product.id,
        sku: product.sku,
        previousQuantity: newQuantity - adjustment,
        newQuantity,
        adjustment,
        reason,
      });
    } catch (error) {
      console.error("Update inventory error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * GET /api/products/categories
 * Get all product categories
 */
router.get("/meta/categories", async (_req: Request, res: Response) => {
  const categories = new Set<string>();

  for (const product of products.values()) {
    categories.add(product.category);
  }

  res.json(Array.from(categories).sort());
});

/**
 * GET /api/products/low-stock
 * Get products below reorder point (admin only)
 */
router.get("/reports/low-stock", requireAdmin, async (_req: Request, res: Response) => {
  const lowStockProducts = Array.from(products.values()).filter(
    (p) => p.inventory.quantity <= p.inventory.reorderPoint
  );

  res.json({
    products: lowStockProducts.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      quantity: p.inventory.quantity,
      reorderPoint: p.inventory.reorderPoint,
    })),
    total: lowStockProducts.length,
  });
});

function generateId(): string {
  return `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default router;
