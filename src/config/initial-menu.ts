/**
 * Initial menu, used by the database seed only. Dishes are taken from the
 * restaurant's current website (October 2026) with spelling corrected. Greek
 * dish names and descriptions are left empty until the owner supplies them;
 * the Greek menu shows the English text meanwhile.
 */

/** The 14 allergens that EU Regulation 1169/2011 requires restaurants to declare. */
export const ALLERGENS: ReadonlyArray<{ code: string; en: string; el: string }> = [
  { code: "gluten", en: "Cereals containing gluten", el: "Δημητριακά με γλουτένη" },
  { code: "crustaceans", en: "Crustaceans", el: "Καρκινοειδή" },
  { code: "eggs", en: "Eggs", el: "Αυγά" },
  { code: "fish", en: "Fish", el: "Ψάρια" },
  { code: "peanuts", en: "Peanuts", el: "Αράπικα φιστίκια" },
  { code: "soy", en: "Soybeans", el: "Σόγια" },
  { code: "milk", en: "Milk", el: "Γάλα" },
  { code: "nuts", en: "Nuts", el: "Ξηροί καρποί" },
  { code: "celery", en: "Celery", el: "Σέλινο" },
  { code: "mustard", en: "Mustard", el: "Μουστάρδα" },
  { code: "sesame", en: "Sesame", el: "Σουσάμι" },
  { code: "sulphites", en: "Sulphites", el: "Θειώδη" },
  { code: "lupin", en: "Lupin", el: "Λούπινο" },
  { code: "molluscs", en: "Molluscs", el: "Μαλάκια" },
];

export interface InitialDish {
  name: string;
  description?: string;
  vegetarian?: boolean;
  /** Allergen codes the current website marks. Not a complete declaration. */
  allergens?: string[];
}

export const MENU: ReadonlyArray<{ en: string; el: string; dishes: InitialDish[] }> = [
  {
    en: "Starters",
    el: "Ορεκτικά",
    dishes: [
      { name: "Prosciutto with Melon or Mozzarella" },
      { name: "Smoked Salmon with Lettuce and Capers" },
      { name: "Bruschetta", description: "Bread with tomatoes, olive oil and fresh basil" },
      { name: "Roasted Aubergines with Tomato, Basil and Parmesan", vegetarian: true },
      { name: "Saganaki Cavalieri" },
    ],
  },
  {
    en: "Mains",
    el: "Κυρίως πιάτα",
    dishes: [
      { name: "USA Black Angus Rib-Eye 350gr" },
      { name: "USA Black Angus Tenderloin 350gr" },
      { name: "Pork with Plums and Cream with Brandy Sauce" },
      { name: "Grilled Fillet Steak 250gr", description: "Sauces: Béarnaise, green peppercorn or mushroom" },
      { name: "Grilled Chicken" },
      { name: "Perch Fillet", description: "In the oven with potatoes, peppers and herbs in tomato sauce" },
      { name: "Swordfish with Roasted Vegetables" },
      { name: "Prawns with Tomatoes, Feta Cheese and Basil", description: "Baked in the oven" },
      { name: "Soutzoukakia", description: "Meatballs in tomato sauce" },
    ],
  },
  {
    en: "Pasta",
    el: "Ζυμαρικά",
    dishes: [
      { name: "Prawns in Tomato Sauce with Cuttlefish Ink Spaghetti and Basil" },
      { name: "Seafood with Cuttlefish Ink Spaghetti" },
      { name: "Linguine with Chicken", description: "With gorgonzola cream, sun-dried tomatoes and rocket" },
      {
        name: "Fresh Truffle-Stuffed Tortelloni",
        description: "Butter, white truffle oil, Parmesan and black pepper",
      },
    ],
  },
  {
    en: "Salads",
    el: "Σαλάτες",
    dishes: [
      {
        name: "Cavalieri Salad",
        description:
          "Lollo rosso, lollo verde, radicchio and Chinese cabbage with raspberry sauce, raisins, mixed nuts and halloumi cheese",
        allergens: ["nuts"],
      },
      {
        name: "Mexican Salad",
        description:
          "Lollo rosso, lollo verde, radicchio and Chinese cabbage with guacamole sauce, cherry tomatoes, red kidney beans, corn and Parmesan crisps with black and white sesame seeds",
      },
      { name: "Greek Salad", description: "Tomatoes, cucumber, pepper, olives, feta cheese and oregano" },
    ],
  },
  {
    en: "Desserts",
    el: "Επιδόρπια",
    dishes: [
      { name: "Apple Pie", description: "With ice cream" },
      { name: "Chocolate Soufflé", description: "With ice cream" },
      { name: "Kadaif", description: "With ice cream", allergens: ["nuts"] },
      { name: "Baklava", description: "With ice cream", allergens: ["nuts"] },
      { name: "Fruit Salad", description: "With ice cream" },
    ],
  },
];
