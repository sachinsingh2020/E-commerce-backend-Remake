import { Request } from "express";
import { TryCatch } from "../middlewares/error.js";
import ErrorHandler from "../utils/utility-class.js";
import {
  BaseQuery,
  NewProductRequestBody,
  SearchRequestQuery,
} from "../types/types.js";
import { Product } from "../models/product.js";
import { rm } from "fs";
import { myCache } from "../app.js";
import {
  deleteFromCloudinary,
  invalidateCache,
  uploadToCloudinary,
} from "../utils/features.js";

export const newProduct = TryCatch(
  async (req: Request<{}, {}, NewProductRequestBody>, res, next) => {
    const { name, price, stock, category, description } = req.body;
    const photo = req.file as Express.Multer.File | undefined;

    if (!photo) return next(new ErrorHandler("Please add a Photo", 400));

    if (!name || !price || !stock || !category || !description)
      return next(new ErrorHandler("Please enter All Fields", 400));

    // Upload photo to Cloudinary
    const photoData = await uploadToCloudinary(photo);

    await Product.create({
      name,
      price,
      description,
      stock,
      category: category.toLowerCase(),
      photo: photoData, // directly assign the object
    });

    await invalidateCache({ product: true, admin: true });

    return res.status(201).json({
      success: true,
      message: "Product Created Successfully",
    });
  }
);

export const getlatestProducts = TryCatch(async (req, res, next) => {
  let products;

  if (myCache.has("latest-products")) {
    products = JSON.parse(myCache.get("latest-products") as string);
  } else {
    products = await Product.find({}).sort({ createdAt: -1 }).limit(5);
    myCache.set("latest-products", JSON.stringify(products));
  }

  return res.status(200).json({
    success: true,
    products,
  });
});

export const getAllCategories = TryCatch(async (req, res, next) => {
  let categories;

  if (myCache.has("categories")) {
    categories = JSON.parse(myCache.get("categories") as string);
  } else {
    categories = await Product.distinct("category");
    myCache.set("categories", JSON.stringify(categories));
  }

  return res.status(200).json({
    success: true,
    categories,
  });
});

export const getAdminProducts = TryCatch(async (req, res, next) => {
  let products;

  if (myCache.has("all-products")) {
    products = JSON.parse(myCache.get("all-products") as string);
  } else {
    products = await Product.find({});
    myCache.set("all-products", JSON.stringify(products));
  }

  return res.status(200).json({
    success: true,
    products,
  });
});

export const getSingleProduct = TryCatch(async (req, res, next) => {
  let product;
  const id = req.params.id;
  const key = `product-${id}`;

  if (myCache.has(key)) {
    product = JSON.parse(myCache.get(key) as string);
  } else {
    product = await Product.findById(id);
    if (!product) return next(new ErrorHandler("Product Not Found", 404));
    myCache.set(key, JSON.stringify(product));
  }

  return res.status(200).json({
    success: true,
    product,
  });
});

// updateProduct
export const updateProduct = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  const { name, price, stock, category, description } = req.body;
  const photo = req.file as Express.Multer.File | undefined;

  const product = await Product.findById(id);
  if (!product) return next(new ErrorHandler("Product Not Found", 404));

  if (photo) {
    // Upload new photo
    const newPhoto = await uploadToCloudinary(photo);

    if (product.photo?.public_id) {
      await deleteFromCloudinary(product.photo.public_id);
    }

    // Replace with new one
    product.photo = newPhoto;
  }

  if (name) product.name = name;
  if (price) product.price = price;
  if (stock) product.stock = stock;
  if (category) product.category = category;
  if (description) product.description = description;

  await product.save();

  await invalidateCache({
    product: true,
    productId: String(product._id),
    admin: true,
  });

  return res.status(200).json({
    success: true,
    message: "Product Updated Successfully",
  });
});

export const deleteProduct = TryCatch(async (req, res, next) => {
  const product = await Product.findById(req.params.id);
  if (!product) return next(new ErrorHandler("Product Not Found", 404));

  if (product.photo?.public_id) {
    await deleteFromCloudinary(product.photo.public_id);
  }

  // Delete from DB
  await product.deleteOne();

  // Invalidate relevant cache
  await invalidateCache({
    product: true,
    productId: String(product._id),
    admin: true,
  });

  return res.status(200).json({
    success: true,
    message: "Product Deleted Successfully",
  });
});

export const getAllProducts = TryCatch(
  async (req: Request<{}, {}, {}, SearchRequestQuery>, res, next) => {
    const { search, sort, category, price } = req.query;

    const page = Number(req.query.page) || 1;

    const limit = Number(process.env.PRODUCT_PER_PAGE) || 8;

    const skip = (page - 1) * limit;

    const baseQuery: BaseQuery = {
      //   name: {
      //     $regex: search,
      //     $options: "i",
      //   },
      //   price: {
      //     $lte: Number(price),
      //   },
      //   category,
    };

    if (search) {
      baseQuery.name = {
        $regex: search,
        $options: "i",
      };
    }

    if (price) {
      baseQuery.price = {
        $lte: Number(price),
      };
    }

    if (category) {
      baseQuery.category = category;
    }

    const productPromise = Product.find(baseQuery)
      .sort(sort && { price: sort === "asc" ? 1 : -1 })
      .limit(limit)
      .skip(skip);

    const [products, filteredOnlyProduct] = await Promise.all([
      productPromise,
      Product.find(baseQuery),
    ]);

    const totalPage = Math.ceil(filteredOnlyProduct.length / limit);

    return res.status(200).json({
      success: true,
      products,
      totalPage,
    });
  }
);
