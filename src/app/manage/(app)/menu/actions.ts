"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ForbiddenError, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { ConfigError } from "@/server/services/configuration";
import {
  createMenuCategory,
  createMenuItem,
  updateMenuCategory,
  updateMenuItem,
  type MenuCategoryInput,
  type MenuItemInput,
} from "@/server/services/menu";

const CENTS = 100;
const PATH = "/manage/menu";

const text = (form: FormData, name: string): string => String(form.get(name) ?? "");
const checked = (form: FormData, name: string): boolean => form.get(name) === "on";

async function menuAction(run: (staffId: string) => Promise<unknown>): Promise<void> {
  const query = new URLSearchParams();
  try {
    const staff = await requirePermission("configuration");
    await run(staff.id);
    query.set("saved", "1");
  } catch (error) {
    if (error instanceof ConfigError) query.set("error", error.code);
    else if (error instanceof ForbiddenError) query.set("error", "FORBIDDEN");
    else throw error;
  }
  revalidatePath("/", "layout");
  redirect(`${PATH}?${query}`);
}

function categoryInput(form: FormData): MenuCategoryInput {
  return {
    name: { en: text(form, "nameEn"), el: text(form, "nameEl") },
    description: { en: text(form, "descriptionEn"), el: text(form, "descriptionEl") },
    displayOrder: Number(form.get("displayOrder")),
    active: checked(form, "active"),
  };
}

function itemInput(form: FormData): MenuItemInput {
  const price = text(form, "price").trim();
  return {
    categoryId: text(form, "categoryId"),
    name: { en: text(form, "nameEn"), el: text(form, "nameEl") },
    description: { en: text(form, "descriptionEn"), el: text(form, "descriptionEl") },
    ingredients: { en: text(form, "ingredientsEn"), el: text(form, "ingredientsEl") },
    priceCents: price === "" ? null : Math.round(Number(price) * CENTS),
    vegetarian: checked(form, "vegetarian"),
    vegan: checked(form, "vegan"),
    spicy: checked(form, "spicy"),
    signature: checked(form, "signature"),
    chefRecommendation: checked(form, "chefRecommendation"),
    available: checked(form, "available"),
    active: checked(form, "active"),
    displayOrder: Number(form.get("displayOrder")),
    allergenIds: form.getAll("allergenIds").map(String),
    imageUrl: text(form, "imageUrl").trim(),
  };
}

export async function saveMenuCategory(categoryId: string, form: FormData): Promise<void> {
  await menuAction((staffId) => updateMenuCategory(db, categoryId, categoryInput(form), staffId));
}

export async function addMenuCategory(form: FormData): Promise<void> {
  await menuAction((staffId) => createMenuCategory(db, { ...categoryInput(form), active: true }, staffId));
}

export async function saveMenuItem(itemId: string, form: FormData): Promise<void> {
  await menuAction((staffId) => updateMenuItem(db, itemId, itemInput(form), staffId));
}

export async function addMenuItem(form: FormData): Promise<void> {
  await menuAction((staffId) => createMenuItem(db, { ...itemInput(form), active: true, available: true }, staffId));
}
