/**
 * The 14 allergens of EU law and the restaurant's three lists, used by the
 * database seed and by tests. After seeding, the manager edits the menu at
 * /manage/menu and the database is the source of truth.
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

export type MenuKey = "FOOD" | "BAR" | "WINE";

export interface InitialDish {
  name: string;
  /** Greek name; empty shows the English one. */
  el?: string;
  description?: string;
  descriptionEl?: string;
  /** Longer text under the description: for wines, the tasting notes. */
  notes?: string;
  notesEl?: string;
  vegetarian?: boolean;
  /** Allergen codes. Not a complete declaration. */
  allergens?: string[];
}

export interface InitialSection {
  menu: MenuKey;
  en: string;
  el: string;
  dishes: InitialDish[];
}

/** A wine: name, origin and grapes, then the tasting notes from the wine list. */
const wine = (
  name: string,
  el: string,
  origin: string,
  originEl: string,
  notes?: string,
  notesEl?: string,
): InitialDish => ({ name, el, description: origin, descriptionEl: originEl, notes, notesEl });

/** A drink whose name is the same in both languages. */
const drink = (name: string, description?: string): InitialDish => ({ name, description });

/**
 * The restaurant's three printed lists as photographed in October 2026: the
 * dinner menu, the bar list and the wine list. Prices are deliberately left
 * out: the owner does not publish them, and they are handwritten on the cards.
 * Obvious misprints on the cards were corrected.
 */
const FOOD: InitialSection[] = [
  {
    menu: "FOOD",
    en: "Starters",
    el: "Ορεκτικά",
    dishes: [
      { name: "Freshly Baked Bread", el: "Φρεσκοψημένο ψωμί", description: "Per person", descriptionEl: "Ανά άτομο" },
      { name: "Prosciutto with Melon or Mozzarella", el: "Προσούτο με Πεπόνι και Μοτσαρέλα" },
      { name: "Smoked Salmon with Lettuce and Capers", el: "Καπνιστός Σολομός με Μαρούλι και Κάπαρη" },
      {
        name: "Bruschetta",
        el: "Μπρουσκέτα",
        description: "Toast with tomatoes, olive oil and fresh basil",
        descriptionEl: "Φρυγανιά με ντομάτα, ελαιόλαδο και φρέσκο βασιλικό",
      },
      {
        name: "Roasted Aubergines with Tomato, Basil and Parmesan",
        el: "Ψητές Μελιτζάνες με Ντομάτα, Βασιλικό και Παρμεζάνα",
        vegetarian: true,
      },
      { name: "Saganaki Cavalieri", el: "Σαγανάκι Καβαλιέρι" },
    ],
  },
  {
    menu: "FOOD",
    en: "Mains",
    el: "Κυρίως πιάτα",
    dishes: [
      { name: "USA Black Angus Rib-Eye 350gr", el: "USA Black Angus Rib-Eye (Φιλέτο Μπριζόλας) 350γρ" },
      { name: "USA Black Angus Tenderloin 250gr", el: "USA Black Angus Tenderloin (Φιλέτο) 250γρ" },
      { name: "Pork with Plums and Cream with Brandy Sauce", el: "Χοιρινό με Δαμάσκηνα και Κρέμα με Σάλτσα Μπράντυ" },
      {
        name: "Grilled Fillet Steak 250gr",
        el: "Ψητό Φιλέτο Σχάρας 250γρ",
        description: "Sauces: Béarnaise, green peppercorn or mushroom",
        descriptionEl: "Σάλτσες: Béarnaise, πράσινο πιπέρι ή μανιτάρια",
      },
      { name: "Grilled Chicken", el: "Ψητό Κοτόπουλο" },
      {
        name: "Perch Fillet",
        el: "Πέρκα Φιλέτο",
        description: "In the oven with potatoes, peppers and herbs in tomato sauce",
        descriptionEl: "Στο φούρνο με πατάτες, πιπεριές, φρέσκα βότανα σε σάλτσα ντομάτας",
      },
      { name: "Swordfish with Roasted Vegetables", el: "Ξιφίας με Ψητά Λαχανικά" },
      {
        name: "Prawns with Tomatoes, Feta Cheese and Basil",
        el: "Γαρίδες με Ντομάτα, Φέτα και Βασιλικό",
        description: "Baked in the oven",
        descriptionEl: "Ψημένα στο φούρνο",
      },
      { name: "Soutzoukakia", el: "Σουτζουκάκια", description: "Meatballs in tomato sauce", descriptionEl: "Κεφτεδάκια με σάλτσα ντομάτας" },
    ],
  },
  {
    menu: "FOOD",
    en: "Pasta",
    el: "Ζυμαρικά",
    dishes: [
      {
        name: "Prawns in Tomato Sauce with Cuttlefish Ink Spaghetti and Basil",
        el: "Γαριδομακαρονάδα με Σπαγγέτι με Μελάνι Σουπιάς, Ντομάτα και Βασιλικό",
      },
      { name: "Seafood with Cuttlefish Ink Spaghetti", el: "Σπαγγέτι με Θαλασσινά, με Μελάνι Σουπιάς" },
      {
        name: "Linguine with Chicken",
        el: "Λινγκουίνι με Κοτόπουλο",
        description: "With gorgonzola cream, sun-dried tomatoes and rocket",
        descriptionEl: "Με κρέμα γκοργκοντζόλας, λιαστές ντομάτες και ρόκα",
      },
      {
        name: "Fresh Truffle-Stuffed Tortelloni",
        el: "Φρέσκα Ζυμαρικά Tortelloni με Πάστα Τρούφας",
        description: "Butter, white truffle oil, Parmesan and black pepper",
        descriptionEl: "Με βούτυρο, λάδι λευκής τρούφας, παρμεζάνα και μαύρο πιπέρι",
      },
    ],
  },
  {
    menu: "FOOD",
    en: "Salads",
    el: "Σαλάτες",
    dishes: [
      {
        name: "Cavalieri Salad",
        el: "Σαλάτα Cavalieri",
        description:
          "Lollo rosso, lollo verde, radicchio and Chinese cabbage with raspberry sauce, raisins, mixed nuts and halloumi cheese",
        descriptionEl: "Ανάμεικτη σαλάτα με βινεγκρέτ βατόμουρο, σταφίδες, ξηρούς καρπούς και ψητό χαλούμι",
        allergens: ["nuts"],
      },
      {
        name: "Corfiot Salad",
        el: "Σαλάτα Κορφιάτα",
        description:
          "Colourful salad, cherry tomatoes, figs, citrus dressing (orange, kumquat), fresh anthotyro cheese, slices of noumboulo (local cured meat) and a drop of white truffle oil",
        descriptionEl:
          "Πολύχρωμη σαλάτα, τοματίνια, σύκα, βινεγκρέτ εσπεριδοειδών (πορτοκάλι, κουμ κουάτ), ανθότυρο, νούμπουλο (τοπικό αλλαντικό), λάδι τρούφας",
      },
      {
        name: "Greek Salad",
        el: "Ελληνική Σαλάτα",
        description: "Tomatoes, cucumber, pepper, olives, feta cheese and oregano",
        descriptionEl: "Ντομάτα, αγγούρι, πιπεριές, ελιές, φέτα και ρίγανη",
      },
    ],
  },
  {
    menu: "FOOD",
    en: "Desserts",
    el: "Επιδόρπια",
    dishes: [
      { name: "Chocolate Soufflé", el: "Σουφλέ Σοκολάτας", description: "Also with ice cream", descriptionEl: "Και με παγωτό" },
      { name: "Tiramisu", el: "Τιραμισού" },
      { name: "Baklava", el: "Μπακλαβάς", allergens: ["nuts"] },
      { name: "Apple Pie", el: "Μηλόπιτα" },
      { name: "Cherry Cheesecake", el: "Τσιζκέικ Κεράσι" },
      { name: "Fruit Salad", el: "Φρουτοσαλάτα", description: "Also with ice cream", descriptionEl: "Και με παγωτό" },
      {
        name: "Ice Cream",
        el: "Παγωτό",
        description: "By the scoop: vanilla, chocolate, strawberry, lemon, mocha or stracciatella",
        descriptionEl: "Η μπάλα: βανίλια, σοκολάτα, φράουλα, λεμόνι, μόκα ή στρατσιατέλα",
      },
    ],
  },
];

const BAR: InitialSection[] = [
  {
    menu: "BAR",
    en: "Premium Cocktails",
    el: "Premium Κοκτέιλ",
    dishes: [
      drink("Moscow Mule", "Vodka, fresh lime juice, simple syrup, topped up with ginger beer"),
      drink("Espresso Martini", "Vodka, coffee liqueur, hot espresso coffee"),
      drink("Paloma", "Zignum blanco, fresh lime juice, pink grapefruit soda, agave syrup"),
      drink("Mystic & Spice", "Marama spiced rum, fresh lime juice, mystic mango"),
      drink("Rhubarb Ginger in Pink", "Grace gin, ginger liqueur, pink grapefruit soda"),
      drink("Dark 'n' Stormy", "Havana 7, sugar syrup, fresh lime juice, ginger beer"),
      drink("La Vie en Rose", "Chambéryzette, cucumber syrup, fresh lime juice, pink grapefruit soda"),
    ],
  },
  {
    menu: "BAR",
    en: "Cocktails",
    el: "Κοκτέιλ",
    dishes: [
      drink("Ramazzotti Spritz", "Aperitivo rosato, prosecco, soda"),
      drink("Cocktail Cavalieri", "Aperitivo rosato, fresh lime, Ursus, strawberry"),
      drink("Mojito", "Havana 3 years, fresh lime, spearmint, sugar"),
      drink("Caipirinha", "Fresh lime, cachaça, sugar"),
      drink("Americano", "Campari, Martini rosso, soda"),
      drink("Black Russian", "Vodka, Kahlúa"),
      drink("Manhattan", "American whisky, Martini bianco, Angostura"),
      drink("Margarita", "Tequila, Cointreau, lemon juice, salt"),
      drink("Dry Martini Cocktail", "Gin, dry Martini, olive"),
      drink("Bloody Mary", "Vodka, lemon juice, tomato juice, salt, pepper, Tabasco"),
      drink("Gin Fizz", "Gin, lemon juice, sugar, soda"),
      drink("Piña Colada", "Bacardi, cream of coconut, milk, pineapple juice"),
      drink("Brandy Alexander", "Brandy, Baileys, milk, cinnamon"),
      drink("Miami Wami", "Bacardi, banana liqueur, orange and pineapple juice, grenadine"),
      drink("Strawberry Margarita", "Tequila, Cointreau, fresh strawberries, sugar"),
      drink("Daiquiri", "Bacardi, Cointreau, lemon juice"),
      drink("Daiquiri Strawberry", "Bacardi, Cointreau, fresh strawberries"),
      drink("Daiquiri Passion", "Bacardi, Cointreau, passion fruit"),
      drink("Kir Royale", "Crème de cassis, prosecco"),
      drink("Bellini", "Prosecco with peach juice"),
      drink("Aperol Spritz", "Aperol, prosecco, soda"),
    ],
  },
  { menu: "BAR", en: "Mocktails", el: "Κοκτέιλ χωρίς αλκοόλ", dishes: [drink("Bitter Orange Spritz", "250ml")] },
  {
    menu: "BAR",
    en: "Whiskey",
    el: "Ουίσκι",
    dishes: [
      drink("Black Label, Chivas, Cardhu, Jack Daniel's, Jameson"),
      drink("Glenmorangie, Talisker, Glenlivet"),
      drink("Lagavulin, Oban, Nikka From The Barrel"),
    ],
  },
  { menu: "BAR", en: "Vodka", el: "Βότκα", dishes: [drink("Absolut"), drink("Absolut Elyx, Grey Goose, Beluga")] },
  {
    menu: "BAR",
    en: "Gin",
    el: "Τζιν",
    dishes: [
      drink("Beefeater"),
      drink("Beefeater 0%", "Alcohol free"),
      drink("Beefeater 24, Tanqueray 10"),
      drink("Monkey 47, Hendrick's, Grace"),
    ],
  },
  {
    menu: "BAR",
    en: "Tequila",
    el: "Τεκίλα",
    dishes: [drink("Olmeca Altos, Don Julio Blanco"), drink("Mezcal Zignum Añejo"), drink("Mezcal Zignum Blanco")],
  },
  {
    menu: "BAR",
    en: "Rum",
    el: "Ρούμι",
    dishes: [
      drink("Havana 7"),
      drink("Havana Reserva, Captain Morgan"),
      drink("Havana Selección de Maestros, Diplomático Exclusiva"),
      drink("Marama Spiced"),
    ],
  },
  { menu: "BAR", en: "Vermouth", el: "Βερμούτ", dishes: [drink("Dolin Bianco, Dry, Rosso")] },
  {
    menu: "BAR",
    en: "Liqueurs",
    el: "Λικέρ",
    dishes: [drink("Baileys, Cointreau, Drambuie, Grand Marnier, Kahlúa"), drink("Amaretto, Southern Comfort, Grappa, Porto")],
  },
  {
    menu: "BAR",
    en: "Aperitifs",
    el: "Απεριτίφ",
    dishes: [
      { name: "Ouzo", el: "Ούζο" },
      { name: "Ouzo, small carafe", el: "Ούζο, καραφάκι" },
      { name: "Tsipouro Pilavas 50ml", el: "Τσίπουρο Πιλάβας 50ml" },
      drink("Campari, Ricard, Pernod"),
    ],
  },
  {
    menu: "BAR",
    en: "Cognac and Brandy",
    el: "Κονιάκ και Μπράντυ",
    dishes: [drink("Metaxa 7"), drink("Metaxa 12, Courvoisier, Napoleon, Calvados"), drink("Metaxa Private Reserve")],
  },
  {
    menu: "BAR",
    en: "Beers",
    el: "Μπίρες",
    dishes: [
      { name: "Draught Budweiser", el: "Βαρελίσια Budweiser", description: "300ml or 500ml", descriptionEl: "300ml ή 500ml" },
      drink("Pils Hellas Radler, Heineken, Pils Hellas 0.0%"),
      drink("Corfu Real Ale: Red, Black, Pilsner"),
      drink("San Miguel Especial, Mahou Lager, Gulden Draak"),
      drink("Cretan Kings Pilsner"),
    ],
  },
  {
    menu: "BAR",
    en: "Coffee",
    el: "Καφές",
    dishes: [drink("Espresso"), drink("Cappuccino"), { name: "Irish Coffee", el: "Ιρλανδικός" }, { name: "Calypso Coffee", el: "Καλυψώ" }],
  },
  {
    menu: "BAR",
    en: "Soft Drinks and Water",
    el: "Αναψυκτικά και Νερό",
    dishes: [
      drink("Coca-Cola", "Regular, zero or light"),
      { name: "Orangeade", el: "Πορτοκαλάδα" },
      { name: "Lemonade", el: "Λεμονάδα" },
      drink("Sprite"),
      { name: "Soda", el: "Σόδα" },
      { name: "Tonic", el: "Τόνικ" },
      drink("Evian 750ml"),
      drink("San Pellegrino 750ml"),
      { name: "Souroti 300ml", el: "Σουρωτή 300ml" },
    ],
  },
];

/** The bar list is printed in English only; these are its descriptions in Greek. */
const BAR_EL: Record<string, string> = {
  "Moscow Mule": "Βότκα, φρέσκος χυμός λάιμ, σιρόπι ζάχαρης, συμπλήρωμα με ginger beer",
  "Espresso Martini": "Βότκα, λικέρ καφέ, ζεστός καφές espresso",
  Paloma: "Zignum blanco, φρέσκος χυμός λάιμ, σόδα ροζ γκρέιπφρουτ, σιρόπι αγαύης",
  "Mystic & Spice": "Ρούμι Marama spiced, φρέσκος χυμός λάιμ, mystic mango",
  "Rhubarb Ginger in Pink": "Τζιν Grace, λικέρ τζίντζερ, σόδα ροζ γκρέιπφρουτ",
  "Dark 'n' Stormy": "Havana 7, σιρόπι ζάχαρης, φρέσκος χυμός λάιμ, ginger beer",
  "La Vie en Rose": "Chambéryzette, σιρόπι αγγουριού, φρέσκος χυμός λάιμ, σόδα ροζ γκρέιπφρουτ",
  "Ramazzotti Spritz": "Aperitivo rosato, prosecco, σόδα",
  "Cocktail Cavalieri": "Aperitivo rosato, φρέσκο λάιμ, Ursus, φράουλα",
  Mojito: "Havana 3 ετών, φρέσκο λάιμ, δυόσμος, ζάχαρη",
  Caipirinha: "Φρέσκο λάιμ, cachaça, ζάχαρη",
  Americano: "Campari, Martini rosso, σόδα",
  "Black Russian": "Βότκα, Kahlúa",
  Manhattan: "Αμερικανικό ουίσκι, Martini bianco, Angostura",
  Margarita: "Τεκίλα, Cointreau, χυμός λεμονιού, αλάτι",
  "Dry Martini Cocktail": "Τζιν, dry Martini, ελιά",
  "Bloody Mary": "Βότκα, χυμός λεμονιού, χυμός ντομάτας, αλάτι, πιπέρι, Tabasco",
  "Gin Fizz": "Τζιν, χυμός λεμονιού, ζάχαρη, σόδα",
  "Piña Colada": "Bacardi, κρέμα καρύδας, γάλα, χυμός ανανά",
  "Brandy Alexander": "Μπράντυ, Baileys, γάλα, κανέλα",
  "Miami Wami": "Bacardi, λικέρ μπανάνα, χυμός πορτοκάλι και ανανά, γρεναδίνη",
  "Strawberry Margarita": "Τεκίλα, Cointreau, φρέσκες φράουλες, ζάχαρη",
  Daiquiri: "Bacardi, Cointreau, χυμός λεμονιού",
  "Daiquiri Strawberry": "Bacardi, Cointreau, φρέσκες φράουλες",
  "Daiquiri Passion": "Bacardi, Cointreau, φρούτο του πάθους",
  "Kir Royale": "Crème de cassis, prosecco",
  Bellini: "Prosecco με χυμό ροδάκινο",
  "Aperol Spritz": "Aperol, prosecco, σόδα",
  "Beefeater 0%": "Χωρίς αλκοόλ",
  "Coca-Cola": "Κανονική, zero ή light",
};
for (const section of BAR) {
  for (const dish of section.dishes) dish.descriptionEl ??= BAR_EL[dish.name];
}

const PELOPONNESE = ["P.G.I. Peloponnese", "Π.Γ.Ε. Πελοπόννησος"] as const;
const SERRES = ["P.G.I. Serres", "Π.Γ.Ε. Σέρρες"] as const;
const KITHAIRON = ["P.G.I. Slopes of Kithairon", "Π.Γ.Ε. Πλαγιές Κιθαιρώνα"] as const;
const CRETE = ["P.G.I. Crete", "Π.Γ.Ε. Κρήτη"] as const;
const LAKONIA = ["P.G.I. Lakonia", "Π.Γ.Ε. Λακωνία"] as const;

const WINE: InitialSection[] = [
  {
    menu: "WINE",
    en: "White Wine by the Glass",
    el: "Λευκός Οίνος σε Ποτήρι",
    dishes: [
      wine("Monolithos, Bairaktaris", "Μονόλιθος, Μπαϊρακτάρης", `${PELOPONNESE[0]} · Malagouzia, Assyrtiko, Muscat of Alexandria`, `${PELOPONNESE[1]} · Μαλαγουζιά, Ασύρτικο, Μοσχάτο Αλεξανδρείας`),
      wine("White Elephant, Skiouros", "Λευκός Ελέφαντας, Σκίουρος", `${SERRES[0]} · 100% Sauvignon Blanc`, `${SERRES[1]} · 100% Sauvignon Blanc`),
      wine("Kidonitsa, Vatistas", "Κυδωνίτσα, Βατίστας", `${LAKONIA[0]} · 100% Kidonitsa`, `${LAKONIA[1]} · 100% Κυδωνίτσα`),
      wine("Thesis, Bairaktaris", "Thesis, Μπαϊρακτάρης", `${PELOPONNESE[0]} · 100% Malagouzia`, `${PELOPONNESE[1]} · 100% Μαλαγουζιά`),
      wine("White Hare, Douloufakis", "Άσπρος Λαγός, Δουλουφάκης", `${CRETE[0]} · 100% Vidiano`, `${CRETE[1]} · 100% Βιδιανό`),
      wine("Retsina Pine Forest, Gikas", "Ρετσίνα Pine Forest, Γκίκας", `${KITHAIRON[0]} · 100% Assyrtiko`, `${KITHAIRON[1]} · 100% Ασύρτικο`),
    ],
  },
  {
    menu: "WINE",
    en: "Rosé Wine by the Glass",
    el: "Ροζέ Οίνος σε Ποτήρι",
    dishes: [
      wine("Rock n Rose medium sweet, Bairaktaris", "Rock n Rose ημίγλυκος, Μπαϊρακτάρης", "Varietal · 60% Agiorgitiko, 40% Malagouzia", "Ποικιλιακός · 60% Αγιωργίτικο, 40% Μαλαγουζιά"),
      wine("Gikas Rosé", "Γκίκας Ροζέ", "Varietal · 80% Augustolidi, 20% Grenache Rouge", "Ποικιλιακός · 80% Αυγουστολίδι, 20% Grenache Rouge"),
      wine("Côtes de Provence, Maison Castel", "Côtes de Provence, Maison Castel", "Provence · Syrah, Grenache, Cinsault", "Προβηγκία · Syrah, Grenache, Cinsault"),
      wine("Wild Strawberries, Skiouros", "Άγριες Φράουλες, Σκίουρος", `${SERRES[0]} · 100% Xinomavro`, `${SERRES[1]} · 100% Ξινόμαυρο`),
    ],
  },
  {
    menu: "WINE",
    en: "Red Wine by the Glass",
    el: "Κόκκινος Οίνος σε Ποτήρι",
    dishes: [
      wine("Red Elephant, Skiouros", "Κόκκινος Ελέφαντας, Σκίουρος", `${SERRES[0]} · 100% Merlot`, `${SERRES[1]} · 100% Merlot`),
      wine("Pinot Noir, Paul Mas", "Pinot Noir, Paul Mas", "I.G.P. Pays d'Oc · 100% Pinot Noir", "I.G.P. Pays d'Oc · 100% Pinot Noir"),
      wine("Red Squirrel Limited, Skiouros", "Κόκκινος Σκίουρος Limited, Σκίουρος", `${SERRES[0]} · Cabernet Sauvignon`, `${SERRES[1]} · Cabernet Sauvignon`),
      wine("Syrah, Gikas", "Syrah, Γκίκας", `${KITHAIRON[0]} · 100% Syrah`, `${KITHAIRON[1]} · 100% Syrah`),
      wine("Terra Opus, Bairaktaris", "Terra Opus, Μπαϊρακτάρης", `${PELOPONNESE[0]} · Agiorgitiko, Cabernet Sauvignon`, `${PELOPONNESE[1]} · Αγιωργίτικο, Cabernet Sauvignon`),
    ],
  },
  {
    menu: "WINE",
    en: "Sparkling and Dessert Wine by the Glass",
    el: "Αφρώδεις και Επιδόρπιοι Οίνοι σε Ποτήρι",
    dishes: [
      wine("Prosecco Brilla", "Prosecco Brilla", "Glera", "Glera"),
      wine("Brut, Douloufakis", "Brut, Δουλουφάκης", "Méthode Traditionnelle · 100% Vidiano", "Méthode Traditionnelle · 100% Βιδιανό"),
      wine("Moscato d'Asti", "Moscato d'Asti", "Muscat", "Μοσχάτο"),
      wine("Esperia White, Gikas", "Εσπερία Λευκός, Γκίκας", `${KITHAIRON[0]} · Savatiano, Assyrtiko`, `${KITHAIRON[1]} · Σαββατιανό, Ασύρτικο`),
      wine("3/.13 Red medium sweet, Bairaktaris", "3/.13 Ερυθρός ημίγλυκος, Μπαϊρακτάρης", "P.D.O. Nemea · 100% Agiorgitiko", "Π.Ο.Π. Νεμέα · 100% Αγιωργίτικο"),
    ],
  },
  {
    menu: "WINE",
    en: "White Wines",
    el: "Λευκοί Οίνοι",
    dishes: [
      wine("Small Road, Kissas", "Μικρός Δρόμος, Κίσσας", `750ml · ${PELOPONNESE[0]} · 100% Moschofilero`, `750ml · ${PELOPONNESE[1]} · Μοσχοφίλερο`,
        "Translucent with hay-blonde hues. Flowers on the nose. Acidity makes its presence felt in the mouth, offering coolness and freshness, while notes reminiscent of lemon flowers complete the sensory loop.",
        "Διαυγής με αχυρόξανθες νότες. Αρώματα ανθών στη μύτη. Η οξύτητα κάνει αισθητή την παρουσία της στο στόμα, προσφέροντας δροσιά και φρεσκάδα, ενώ νότες που θυμίζουν λεμονανθούς ολοκληρώνουν τον κύκλο των αισθήσεων."),
      wine("White Elephant, Skiouros", "Λευκός Ελέφαντας, Σκίουρος", `750ml · ${SERRES[0]} · 100% Sauvignon Blanc`, `750ml · ${SERRES[1]} · 100% Sauvignon Blanc`,
        "Dry white, yellow-green colour with explosive aromas of lemon, mango and pineapple, balanced acidity and intense finish.",
        "Οίνος λευκός ξηρός, κιτρινοπράσινος με εκρηκτικά αρώματα λεμονιού, μάνγκο και ανανά, ισορροπημένη οξύτητα και έντονο τελείωμα."),
      wine("Blue Rooster, Siomos", "Μπλε Κόκορας, Σιώμος", "750ml · P.G.I. Macedonia · Sauvignon Blanc, Xinomavro", "750ml · Π.Γ.Ε. Μακεδονία · Sauvignon Blanc, Ξινόμαυρο",
        "Fresh, aromatic and expressive. Notes of citrus, fresh herbs and tropical fruits. Vital acidity, great purity and a pure, elegant aftertaste.",
        "Φρέσκο, αρωματικό και εκφραστικό. Νότες εσπεριδοειδών, φρέσκων βοτάνων και τροπικών φρούτων. Ζωηρή οξύτητα, μεγάλη καθαρότητα και καθαρή, κομψή επίγευση."),
      wine("Kidonitsa, Vatistas", "Κυδωνίτσα, Βατίστας", `750ml · ${LAKONIA[0]} · 100% Kidonitsa`, `750ml · ${LAKONIA[1]} · 100% Κυδωνίτσα`,
        "Bright, light-golden colour with green highlights. Intense aromas of flowers and quinces. Full-bodied, fresh, pleasant acidity with a long aftertaste.",
        "Χρυσοκίτρινο χρώμα με πράσινες ανταύγειες. Έντονα αρώματα ανθών και κυδωνιού. Πλούσιο σώμα, φρεσκάδα, ευχάριστη οξύτητα, μακρά υπέροχη επίγευση."),
      wine("Monolithos, Bairaktaris", "Μονόλιθος, Μπαϊρακτάρης", `750ml · ${PELOPONNESE[0]} · Malagouzia, Assyrtiko, Muscat of Alexandria`, `750ml · ${PELOPONNESE[1]} · Μαλαγουζιά, Ασύρτικο, Μοσχάτο Αλεξανδρείας`,
        "Pale yellow-gold colour with a bunch of exotic fragrances and sweet tropical fruits like mango, banana and pineapple. Round body with the aromas of the mouth following those of the nose.",
        "Απαλό λευκόχρυσο χρώμα με ένα μπουκέτο εξωτικών αρωμάτων και γλυκών τροπικών φρούτων όπως μπανάνα, ανανάς και μάνγκο. Γεμάτο σώμα με τα αρώματα στόματος να ακολουθούν αυτά της μύτης."),
      wine("White Hare, Douloufakis", "Άσπρος Λαγός, Δουλουφάκης", `750ml · ${CRETE[0]} · 100% Vidiano`, `750ml · ${CRETE[1]} · 100% Βιδιανό`,
        "Golden colour with green and yellow hues. Aromas of white flowers and citrus fruits. Rich flavour with a seductive mineral background. Superior, long-lasting aftertaste.",
        "Χρυσαφί χρώμα με κιτρινοπράσινες ανταύγειες. Αρώματα λευκών λουλουδιών και εσπεριδοειδών. Πλούσια γεύση με ένα σαγηνευτικό υπόβαθρο ορυκτών. Επίγευση μακράς διάρκειας."),
      wine("Viognier, Gerovassiliou", "Viognier, Γεροβασιλείου", `${KITHAIRON[0]} · 100% Viognier`, `${KITHAIRON[1]} · 100% Viognier`,
        "Intense gold in colour, it exhibits an aroma of apricot, peach and smoky accents in its long aftertaste.",
        "Το χρώμα του είναι έντονο χρυσοκίτρινο και παρουσιάζει πλούσιο ποικιλιακό χαρακτήρα με αρώματα από βερίκοκο, ροδάκινο και νότες καπνού στην μακρά επίγευση."),
      wine("Thesis, Bairaktaris", "Thesis, Μπαϊρακτάρης", `750ml · ${PELOPONNESE[0]} · 100% Malagouzia`, `750ml · ${PELOPONNESE[1]} · 100% Μαλαγουζιά`,
        "Bright pale yellow colour with green highlights. High intensity aromas. In the mouth a dry wine with medium to high acidity, quite full-bodied round structure and quite a good aftertaste.",
        "Λαμπερό απαλό κίτρινο χρώμα με πράσινες ανταύγειες. Αρώματα υψηλής έντασης. Στο στόμα έχουμε ένα ξηρό κρασί με μέτρια προς υψηλή οξύτητα, αρκετά γεμάτο σώμα, στρογγυλή δομή και αρκετά καλή επίγευση."),
      wine("Santovato, Gikas", "Santovato, Γκίκας", `750ml · ${KITHAIRON[0]} · 100% Savatiano`, `750ml · ${KITHAIRON[1]} · 100% Σαββατιανό`,
        "A very special Savatiano that stays with its wine lees for 6 months, completely dry with a nutty taste, rich body and long aftertaste.",
        "Είναι ένα πολύ ιδιαίτερο Σαββατιανό που παραμένει σε οινολάσπες για 6 μήνες. Αρώματα ώριμων φρούτων, ξηρό με γεύση ξηρών καρπών, πολύ πλούσιο όγκο και μακριά επίγευση."),
      wine("Skylights, Oenogenesis", "Φεγγίτες, Οινογένεσις", "750ml · P.G.I. Macedonia · 50% Sauvignon Blanc, 50% Assyrtiko", "750ml · Π.Γ.Ε. Μακεδονία · 50% Sauvignon Blanc, 50% Ασύρτικο",
        "A bright, crystal-clear colour with soft golden reflections. Intense and complex nose. Balanced and full mouth, with a pleasant aromatic duration.",
        "Χρώμα φωτεινό, με απαλές χρυσοκίτρινες ανταύγειες. Έντονη και σύνθετη μύτη. Ισορροπημένο και πλούσιο στο στόμα με ευχάριστη αρωματική διάρκεια."),
      wine("Malagouzia, Gikas", "Μαλαγουζιά, Γκίκας", `750ml · ${KITHAIRON[0]} · 100% Malagouzia`, `750ml · ${KITHAIRON[1]} · 100% Μαλαγουζιά`,
        "Wine and sediment aged in oak barrels for two months. Boasts a bright golden-yellow colour and a scent of ripe fruit, full mouth.",
        "Παραμένει με τις οινολάσπες του για 2 μήνες σε δρύινα βαρέλια. Λαμπερό χρυσοκίτρινο χρώμα με αρώματα ώριμων φρούτων, πλούσιο στο στόμα."),
      wine("Ovilos, Biblia Chora", "Οβηλός, Βιβλία Χώρα", "750ml · 50% Semillon, 50% Assyrtiko", "750ml · 50% Semillon, 50% Ασύρτικο",
        "Yellow-green in colour with a distinctive aroma of apricot and honey. Elegant and rich with a balanced acidity structure.",
        "Κιτρινοπράσινο χρώμα με ιδιαίτερο άρωμα βερίκοκου και μελιού. Κρασί με πληθωρική και πλούσια γεύση, έντονη λιπαρότητα, ευχάριστη οξύτητα."),
      wine("Tachtas, Douloufakis", "Ταχτάς, Δουλουφάκης", `750ml · ${CRETE[0]} · 100% Tachtas`, `750ml · ${CRETE[1]} · 100% Ταχτάς`,
        "Deep yellow colour. On the nose fruity aromas mainly from pink grapefruit. In the mouth it is balanced with moderate acidity and a buttery aftertaste.",
        "Βαθύ κίτρινο χρώμα. Στη μύτη φρουτώδη αρώματα κυρίως από pink grapefruit. Στο στόμα είναι ισορροπημένο με μέτρια οξύτητα και βουτυράτη επίγευση."),
      wine("Chardonnay Agrilia, Dereskos", "Chardonnay Αγριλιά, Δέρεσκος", "750ml · P.G.I. Messinia · 100% Chardonnay", "750ml · Π.Γ.Ε. Μεσσηνία · 100% Chardonnay",
        "Golden coloured with aromas of bitter almond, mango and pineapple. Oaked, full-bodied with a nice, persistent aftertaste.",
        "Χρυσαφένιο χρώμα με αρώματα πικραμύγδαλου, μάνγκο και ανανά. Στόμα πληθωρικό με μεγάλο βάθος και πλούτο που εξελίσσεται σε ωραία επίγευση με μεγάλη διάρκεια."),
      wine("Petroulianos, Vatistas", "Πετρουλιανός, Βατίστας", `750ml · ${LAKONIA[0]} · 100% Petroulianos`, `750ml · ${LAKONIA[1]} · 100% Πετρουλιανός`,
        "Yellow-green colour. Pleasant aromas, balanced taste and pleasant aftertaste.",
        "Κιτρινοπράσινο χρώμα. Ευχάριστα αρώματα στη μύτη, ισορροπημένη γεύση και ευχάριστη επίγευση."),
      wine("Sustainable, Bairaktaris", "Sustainable, Μπαϊρακτάρης", "750ml · Natural · 100% Roditis", "750ml · Φυσικός · 100% Ροδίτης",
        "White-yellow colour with characteristic fruit aromas. Full body and elegant acidity. The aftertaste is fruity and refreshing.",
        "Λευκοκίτρινο χρώμα με χαρακτηριστικά αρώματα φρούτων. Γεμάτο σώμα και δροσιστική οξύτητα. Η επίγευση είναι φρουτένια και αναζωογονητική."),
      wine("Typaeon Amphora Wild Ferment, Markogiannis", "Τυπαίον Amphora Wild Ferment, Μαρκόγιαννης", "750ml · P.G.I. Ilia · 100% Assyrtiko", "750ml · Π.Γ.Ε. Ηλεία · 100% Ασύρτικο",
        "Pale straw yellow colour with soft greenish tints. Citrus flavours, white-fleshed fruit, floral and herbal aromas. Rich, round in the mouth with a good aftertaste.",
        "Χρώμα κιτρινοπράσινο. Αρώματα εσπεριδοειδών, λευκόσαρκων φρούτων, νύξεις άνθεων και βοτάνων. Πλούσιο, στρογγυλό στο στόμα με ικανοποιητική επίγευση."),
      wine("Thrapsathiri, Digenakis", "Θραψαθήρι, Διγενάκης", `750ml · ${CRETE[0]} · 100% Thrapsathiri`, `750ml · ${CRETE[1]} · 100% Θραψαθήρι`,
        "Bright yellow colour and soft aromas of lemon blossom and citrus. Nice thick mouth with persistent fruit, botanicality and characteristic acidity. Cool and fruity aftertaste.",
        "Κίτρινο λαμπερό χρώμα και απαλά αρώματα λεμονανθού και κίτρου. Ωραίο παχύ στόμα με επίμονο φρούτο, βοτανικότητα και χαρακτηριστική οξύτητα. Δροσερό και με φρουτώδη επίγευση."),
      wine("Santorini Nykteri, Santo Wines", "Σαντορίνη Νυχτέρι, Santo Wines", "750ml · P.D.O. Santorini · 85% Assyrtiko, 10% Athiri, 5% Aidani", "750ml · Π.Ο.Π. Σαντορίνη · 85% Ασύρτικο, 10% Αθήρι, 5% Αηδάνι",
        "Lemon colour. Flowery aromas on the nose, along with green fruits. On the palate it is dry, with crispy, refreshing acidity, in great balance with the delicate floral and fruity flavours. Just an elegant touch of oak contributes to the overall balance. Long aftertaste.",
        "Χρώμα λεμονί. Ανθικά αρώματα, μαζί με αρώματα από πράσινα φρούτα. Ξηρό, με τραγανή, δροσιστική οξύτητα, σε αρμονία με ανθικές και φρουτώδεις νότες. Διακριτικές νότες δρυός συνεισφέρουν στην ένταση και την πολυπλοκότητα στο στόμα."),
    ],
  },
  {
    menu: "WINE",
    en: "Retsina",
    el: "Ρετσίνα",
    dishes: [
      wine("Pine Forest, Gikas", "Pine Forest, Γκίκας", `750ml · ${KITHAIRON[0]} · 100% Assyrtiko`, `750ml · ${KITHAIRON[1]} · 100% Ασύρτικο`,
        "Modern retsina with yellowish colour and lemon highlights. Pine and stone fruit aromas dominate the nose, with traces of lavender and mastic. Full mouth with discreet acidity and aromatic aftertaste.",
        "Μια μοντέρνα ρετσίνα με κιτρινωπό χρώμα και λεμονί ανταύγειες. Αρώματα πεύκου και πυρηνόκαρπων φρούτων κυριαρχούν στη μύτη, με ίχνη λεβάντας και μαστίχας. Στόμα γεμάτο με διακριτική οξύτητα και αρωματική επίγευση."),
    ],
  },
  {
    menu: "WINE",
    en: "Imported White Wines",
    el: "Λευκοί Οίνοι Εισαγωγής",
    dishes: [
      wine("Pinot Grigio, Elena Walch", "Pinot Grigio, Elena Walch", "750ml · Alto Adige DOC · 100% Pinot Grigio", "750ml · Alto Adige DOC · 100% Pinot Grigio",
        "Light straw yellow and fruity notes of ripe pears, white pepper and a bit of sage in the nose. Mineral-salty richness and a crisp acidity are distinctive on the palate.",
        "Αχυροκίτρινο χρώμα με φρουτώδεις νότες ώριμων αχλαδιών, λευκό πιπέρι και λίγο φασκόμηλο στη μύτη. Ορυκτός-αλμυρός πλούτος και τραγανή οξύτητα."),
      wine("Chablis 1er Cru Vaillons, Maison Castel", "Chablis 1er Cru Vaillons, Maison Castel", "750ml · Burgundy · 100% Chardonnay", "750ml · Βουργουνδία · 100% Chardonnay",
        "Light yellow colour with a delicate bouquet of floral and fruity notes. It presents a fresh taste on the palate with a balanced aftertaste and notes of exotic and citrus fruit.",
        "Ανοικτό κίτρινο χρώμα. Μπουκέτο με ντελικάτες ανθικές και φρουτώδεις νότες. Παρουσιάζει μια φρέσκια γεύση στην παλέτα με ισορροπημένη επίγευση και νότες εξωτικών φρούτων και εσπεριδοειδών."),
    ],
  },
  {
    menu: "WINE",
    en: "Rosé Wines",
    el: "Ροζέ Οίνοι",
    dishes: [
      wine("Small Road, Kissas", "Μικρός Δρόμος, Κίσσας", `750ml · ${PELOPONNESE[0]} · 100% Moschofilero`, `750ml · ${PELOPONNESE[1]} · Μοσχοφίλερο`,
        "The colour is light pink with the nose being intense. Aromas, with the same intensity, continue in the mouth, which is rich and refreshing due to the acidity, with an aftertaste that lasts.",
        "Ανοιχτό ροζ χρώμα με τη μύτη να είναι έντονη. Τα αρώματα συνεχίζουν με την ίδια ένταση και στο στόμα, το οποίο είναι λιπαρό αλλά και δροσερό λόγω της οξύτητας, με επίγευση που έχει διάρκεια."),
      wine("Skylights, Oenogenesis", "Φεγγίτες, Οινογένεσις", "750ml · P.G.I. Drama · 85% Grenache Rouge, 15% Cabernet Sauvignon", "750ml · Π.Γ.Ε. Δράμα · 85% Grenache Rouge, 15% Cabernet Sauvignon",
        "Light salmon pink colour and purple reflections. It has a nose of intense rose aromas with wild flower notes, a mouth with fine acidity and an aftertaste of white-fleshed peach.",
        "Με ανοιχτό σομόν χρώμα και πορφυρίζουσες ανταύγειες, δίνει στη μύτη έντονα αρώματα τριαντάφυλλου με νότες αγριολούλουδων και στόμα με πολύ σωστή οξύτητα και επίγευση λευκόσαρκου ροδάκινου."),
      wine("Thesoa, Markogiannis", "Θείσοα, Μαρκόγιαννης", "750ml · P.G.I. Ilia · 100% Vertzami", "750ml · Π.Γ.Ε. Ηλεία · 100% Βερτζαμί",
        "Aromas of small forest fruits, cherry and mint. Rich mouth, acidity that gives vitality and energy, and a nice aromatic aftertaste.",
        "Αρώματα μικρών φρούτων του δάσους, κεράσι και μέντας. Πλούσιο στόμα, οξύτητα που δίνει ζωντάνια και ενέργεια, και με ωραία αρωματική επίγευση."),
      wine("Gikas Rosé", "Γκίκας Ροζέ", "750ml · Varietal · 80% Augustolidi, 20% Grenache Rouge", "750ml · Ποικιλιακός · 80% Αυγουστολίδι, 20% Grenache Rouge",
        "Salmon colour with aromas of red flowers and red fruits. It has a rich taste with crispy acidity and long aftertaste.",
        "Χρώμα σομόν. Μύτη με αρώματα κόκκινων λουλουδιών και κόκκινων φρούτων. Στόμα με πλούσιο όγκο, τραγανή οξύτητα και μακρά επίγευση."),
      wine("Wild Strawberries, Skiouros", "Άγριες Φράουλες, Σκίουρος", `750ml · ${SERRES[0]} · 100% Xinomavro`, `750ml · ${SERRES[1]} · 100% Ξινόμαυρο`,
        "Faint salmon colour, full-bodied, with high acidity. Aromas of strawberry, rose and jam, intense aftertaste.",
        "Χρώμα αχνό σομόν, γεμάτο σώμα, με υψηλή οξύτητα. Έχει αρώματα φράουλας, τριαντάφυλλου και μαρμελάδα ντομάτας, έντονη επίγευση."),
      wine("Nouveau, Chrisohoou", "Nouveau, Χρυσοχόου", "750ml · P.G.I. Imathia · 100% Xinomavro", "750ml · Π.Γ.Ε. Ημαθία · 100% Ξινόμαυρο",
        "Shiny and bright salmon pink colour with pink highlights. Delicate aromas of exotic fruit. Elegant mouth, crisp acidity and a long aftertaste with hints of citrus.",
        "Λαμπερό και φωτεινό σομόν χρώμα με ρόδινες ανταύγειες. Ντελικάτα αρώματα εξωτικών φρούτων. Φινετσάτο στόμα, τραγανή οξύτητα και μακρά επίγευση με νύξεις εσπεριδοειδών."),
      wine("Xinomavro Rosé, Gerovassiliou", "Ξινόμαυρο Ροζέ, Γεροβασιλείου", "P.G.I. Epanomi · 100% Xinomavro", "Π.Γ.Ε. Επανομή · 100% Ξινόμαυρο",
        "Its colour is very pale pink. Its aroma is extroverted, with tropical fruits such as passion fruit and mango smoothing out red fruits such as cherries and cranberries, with some hints of sweet spices and flowers in the background. The mouth is lively, with a noticeable acidity and enough body, and leaves a long aftertaste.",
        "Απαλό σομόν χρώμα. Στη μύτη απελευθερώνονται αρώματα κόκκινων φρούτων και λουλουδιών. Στο στόμα έχει ελαφρύ σώμα και δροσιστική οξύτητα, που καταλήγει σε μια ευχάριστη φρουτώδη επίγευση."),
    ],
  },
  {
    menu: "WINE",
    en: "Imported Rosé Wines",
    el: "Ροζέ Οίνοι Εισαγωγής",
    dishes: [
      wine("Pinot Grigio Rosé, Brilla", "Pinot Grigio Ροζέ, Brilla", "750ml · Veneto I.G.T. · 100% Pinot Grigio", "750ml · Veneto I.G.T. · 100% Pinot Grigio",
        "Elegant pink colour with soft highlights and a complex bouquet with floral and fruity notes.",
        "Κομψό ροζ χρώμα με απαλές ανταύγειες και σύνθετο μπουκέτο με νότες λουλουδιών και φρούτων."),
      wine("Whispering Angel, Caves d'Esclans", "Whispering Angel, Caves d'Esclans", "750ml · Côtes de Provence · Cinsault, Grenache, Rolle, Syrah, Tibouren", "750ml · Côtes de Provence · Cinsault, Grenache, Rolle, Syrah, Tibouren",
        "Pale coral pink colour. Enticing aromas of ripe strawberry, white peach, passion fruit and lemon peel.",
        "Απαλό κοραλλιογενές ροζ χρώμα. Δελεαστικά αρώματα ώριμης φράουλας, λευκού ροδάκινου, φρούτου του πάθους και φλούδας λεμονιού."),
      wine("Côtes de Provence, Maison Castel", "Côtes de Provence, Maison Castel", "750ml · Côtes de Provence · Syrah, Grenache, Cinsault", "750ml · Côtes de Provence · Syrah, Grenache, Cinsault",
        "Light pink colour with bouquets of red fruits, citrus and floral notes, lovely freshness on the palate with good balance and structure and a pleasant floral aftertaste.",
        "Ανοιχτό ροζ χρώμα με μπουκέτα κόκκινων φρούτων, νότες εσπεριδοειδών και λουλουδιών, υπέροχη φρεσκάδα στον ουρανίσκο με καλή ισορροπία και δομή με ευχάριστη ανθική επίγευση."),
    ],
  },
  {
    menu: "WINE",
    en: "Red Wines",
    el: "Κόκκινοι Οίνοι",
    dishes: [
      wine("Red Elephant, Skiouros", "Κόκκινος Ελέφαντας, Σκίουρος", `750ml · ${SERRES[0]} · Merlot`, `750ml · ${SERRES[1]} · Merlot`,
        "Velvety texture in the mouth, aromas of red fruits, soft tannins and a sweet, pleasant aftertaste.",
        "Βελούδινη υφή στο στόμα, αρώματα κόκκινων φρούτων, μαλακές τανίνες και γλυκιά ευχάριστη επίγευση."),
      wine("Nemea, Bairaktaris", "Νεμέα, Μπαϊρακτάρης", "750ml · P.D.O. Nemea · 100% Agiorgitiko", "750ml · Π.Ο.Π. Νεμέα · 100% Αγιωργίτικο",
        "Deep ruby red colour. Aromas of ripe fruits, vanilla, spices and bitter chocolate. The fragrances of the fruits and the oak are blended in a perfect balance. Round body, gentle and soft tannins.",
        "Χρώμα βαθύ κόκκινο ρουμπινί. Συνδυάζει τα αρώματα του φρούτου με τις γεύσεις και τα αρώματα της δρυός με απόλυτη ισορροπία. Γεμάτο σώμα και απόλυτα ισορροπημένες τανίνες."),
      wine("Skylights, Oenogenesis", "Φεγγίτες, Οινογένεσις", "750ml · P.G.I. Drama · 65% Cabernet Sauvignon, 30% Merlot, 5% Cabernet Franc", "750ml · Π.Γ.Ε. Δράμα · 65% Cabernet Sauvignon, 30% Merlot, 5% Cabernet Franc",
        "A gleaming purple red colour with violet reflections. Nose of fresh red and black fruit aromas with discreet mineral notes. Full-bodied and balanced wine with silky tannins. Long, velvety aftertaste.",
        "Έντονα λαμπερό πορφυρό χρώμα με ιώδεις ανταύγειες. Αρώματα φρέσκων κοκκινόμαυρων φρούτων με διακριτικές mineral νότες. Πλούσιο σώμα με γευστική ισορροπία και μεταξένιες τανίνες. Βελούδινη, μεγάλης διάρκειας επίγευση."),
      wine("Antilalos, Markogiannis", "Αντίλαλος, Μαρκόγιαννης", "750ml · Varietal · 100% Refosco", "750ml · Ποικιλιακός · 100% Refosco",
        "Deep ruby colour. Fragrances of small red and black fruit of the forest, herbs and spices. The mouth is round with fine tannins and notes of red fruits and herbs. The flavour is complex and the aftertaste is long and velvety.",
        "Χρώμα βαθύ ρουμπινί. Αρώματα μικρών κόκκινων και μαύρων φρούτων του δάσους, βοτάνων και μπαχαρικών. Στόμα στρογγυλό με λεπτόκοκκες και μαλακές τανίνες, γευστική αρωματική πολυπλοκότητα και ιδιαίτερα ευχάριστη μακρά επίγευση."),
      wine("Syrah, Gikas", "Syrah, Γκίκας", `750ml · ${KITHAIRON[0]} · 100% Syrah`, `750ml · ${KITHAIRON[1]} · 100% Syrah`,
        "Deep ruby colour with violet hues, as well as aromas of black and red fruits. Full-bodied, rich and balanced, with a long finish.",
        "Βαθύ ρουμπινί χρώμα με ιώδεις αποχρώσεις και αρώματα μαύρων και κόκκινων φρούτων. Στόμα γεμάτο, πλούσιο και ισορροπημένο με μακρά επίγευση."),
      wine("Gold Selection, Chrisohoou", "Gold Selection, Χρυσοχόου", "750ml · P.D.O. Naoussa · 100% Xinomavro", "750ml · Π.Ο.Π. Νάουσα · 100% Ξινόμαυρο",
        "Rich nose, mellow flavours, with aromas of red fruit and hints of pepper and tomato. Full mouth, expressive, with the raciness of tannins that testify to its origin as a typical Xinomavro.",
        "Μύτη πλούσια, μεστή αρωμάτων, με αρώματα κόκκινων φρούτων και νότες πιπεριού και ντομάτας. Στόμα γεμάτο, εκφραστικό με την σπιρτάδα των τανινών ως τυπικό Ξινόμαυρο."),
      wine("Red Squirrel Limited, Skiouros", "Κόκκινος Σκίουρος Limited, Σκίουρος", `750ml · ${SERRES[0]} · Cabernet Sauvignon`, `750ml · ${SERRES[1]} · Cabernet Sauvignon`,
        "Deep red wine, dry, with plum and raspberry aromas with strong touches of tobacco and spices, robust tannins, harmonious acidity and long finish.",
        "Βαθύς ερυθρός οίνος, ξηρός με αρώματα δαμάσκηνου και βατόμουρου με έντονες πινελιές καπνού και μπαχαρικών, στιβαρές τανίνες, αρμονική οξύτητα και μακρύ τελείωμα."),
      wine("Terra Opus, Bairaktaris", "Terra Opus, Μπαϊρακτάρης", `750ml · ${PELOPONNESE[0]} · Agiorgitiko, Cabernet Sauvignon`, `750ml · ${PELOPONNESE[1]} · Αγιωργίτικο, Cabernet Sauvignon`,
        "Its colour is light ruby. Its aromatic profile is complex and refined with forest fruits. A high complexity wine that blends the fragrances of the fruits, the oak and amphora in a perfect balance. A puzzle even for the richest palates, round body, gentle and soft tannins.",
        "Το χρώμα του είναι ανοιχτό ρουμπινί. Το αρωματικό του προφίλ πολύπλοκο και κυρίαρχα τα φρούτα του δάσους. Ένας γρίφος ακόμα και για τους πιο εκπαιδευμένους ουρανίσκους, με ένα γεμάτο σώμα και απόλυτα ισορροπημένες τανίνες."),
      wine("Tsapournakos, Kamkoutis", "Τσαπουρνάκος, Καμκούτης", "750ml · P.G.I. Velvento · 100% Tsapournakos", "750ml · Π.Γ.Ε. Βελβεντό · 100% Τσαπουρνάκος",
        "Tsapournakos is an old grape variety of Velvento, of the Cabernet Franc family. Its aromas recall ripe black fruits and spices, its body is balanced and it has a long aftertaste.",
        "Ο Τσαπουρνάκος είναι μια παλιά ποικιλία σταφυλιού στο Βελβεντό. Εντάσσεται στην οικογένεια του Cabernet Franc. Τα αρώματά του παραπέμπουν σε μαύρα ώριμα φρούτα και μπαχάρια, το σώμα του είναι ισορροπημένο και έχει μακρά επίγευση."),
      wine("Grande Reserve, Douloufakis", "Grande Reserve, Δουλουφάκης", "750ml · P.D.O. Dafnes · 100% Liatiko", "750ml · Π.Ο.Π. Δάφνες · 100% Λιάτικο",
        "Luminous deep ruby colour with brownish highlights. The aromatic bouquet is rich and complex. On the palate it is equally impressive: the acidity wonderfully integrated and the tannins well crafted, with an exceptionally long finish.",
        "Λαμπερό βαθύ ρουμπινί χρώμα με καφετιές ανταύγειες. Το αρωματικό μπουκέτο είναι πλούσιο και σύνθετο. Στο στόμα είναι εξίσου εντυπωσιακό. Η οξύτητα υπέροχα ενσωματωμένη και οι τανίνες καλοδουλεμένες, με ιδιαίτερα μακρύ τελείωμα."),
    ],
  },
  {
    menu: "WINE",
    en: "Imported Red Wines",
    el: "Κόκκινοι Οίνοι Εισαγωγής",
    dishes: [
      wine("Châteauneuf-du-Pape, Maison Castel", "Châteauneuf-du-Pape, Maison Castel", "750ml · Rhône · Grenache, Syrah", "750ml · Ροδανός · Grenache, Syrah",
        "Bright purple colour, aromas of red fruits such as wild strawberry, flowers like violet, with hints of spices. Quite soft on the palate with an elegant texture and soft aftertaste.",
        "Λαμπερό πορφυρό χρώμα με πορφυρές ανταύγειες. Αρώματα κόκκινων φρούτων, άγριας φράουλας, βιολέτας με νότες μπαχαρικών. Αρκετά απαλό στο στόμα με κομψή υφή και απαλή επίγευση."),
      wine("Chianti Classico, Brancaia", "Chianti Classico, Brancaia", "DOCG Chianti · 100% Sangiovese", "DOCG Chianti · 100% Sangiovese",
        "Deep perfumes and rich fruit, focused tannins and structure. In the nose and palate, bright cherries and raspberries predominate with notes of roses. Good acidity and a mid-weight structure keep everything in harmony.",
        "Βαθιά αρώματα και πλούσιο φρούτο, σωστές τανίνες και δομή. Στη μύτη και τον ουρανίσκο, κεράσια και βατόμουρα κυριαρχούν με νότες από τριαντάφυλλα. Καλή οξύτητα που δένει αρμονικά με μια δομή μεσαίου βάρους."),
    ],
  },
  {
    menu: "WINE",
    en: "Dessert Wines",
    el: "Επιδόρπιοι Οίνοι",
    dishes: [
      wine("Esperia, Gikas", "Εσπερία, Γκίκας", `500ml · ${KITHAIRON[0]} · Savatiano, Assyrtiko`, `500ml · ${KITHAIRON[1]} · Σαββατιανό, Ασύρτικο`),
      wine("3/.13 Red medium sweet, Bairaktaris", "3/.13 Ερυθρός ημίγλυκος, Μπαϊρακτάρης", "750ml · P.D.O. Nemea · 100% Agiorgitiko", "750ml · Π.Ο.Π. Νεμέα · 100% Αγιωργίτικο"),
      wine("Rock n Rose medium sweet, Bairaktaris", "Rock n Rose ημίγλυκος, Μπαϊρακτάρης", "750ml · Varietal · 60% Agiorgitiko, 40% Malagouzia", "750ml · Ποικιλιακός · 60% Αγιωργίτικο, 40% Μαλαγουζιά",
        "Light pink colour with vivid aromas of small red fruits and discreet citrus notes. Gentle sweet taste with a short aftertaste and a full but balanced body.",
        "Απαλό, ανοιχτό ροδί χρώμα με ζωηρά αρώματα μικρών κόκκινων φρούτων και διακριτικές νότες εσπεριδοειδών. Απαλή γλυκιά γεύση με σύντομη επίγευση και ένα γεμάτο αλλά ισορροπημένο σώμα."),
      wine("Allusion demi-sec Rosé, Digenakis", "Υποψία demi-sec Ροζέ, Διγενάκης", `750ml · ${CRETE[0]} · Syrah, Kotsifali, Cabernet Sauvignon, Muscat`, `750ml · ${CRETE[1]} · Syrah, Κοτσιφάλι, Cabernet Sauvignon, Μοσχάτο`),
    ],
  },
  {
    menu: "WINE",
    en: "Champagne and Sparkling Wines",
    el: "Σαμπάνιες και Αφρώδεις Οίνοι",
    dishes: [
      wine("Brut, Douloufakis", "Brut, Δουλουφάκης", "750ml · Méthode Traditionnelle · 100% Vidiano", "750ml · Méthode Traditionnelle · 100% Βιδιανό"),
      wine("Prosecco Brilla", "Prosecco Brilla", "750ml · 100% Glera", "750ml · 100% Glera"),
      wine("Prosecco Brilla Magnum", "Prosecco Brilla Magnum", "1.5L · 100% Glera", "1,5L · 100% Glera"),
      wine("Prosecco, Barollo", "Prosecco, Barollo", "750ml · 100% Glera", "750ml · 100% Glera"),
      wine("Prosecco Rosé Brilla", "Prosecco Rosé Brilla", "750ml · 87% Glera, 13% Pinot Nero", "750ml · 87% Glera, 13% Pinot Nero"),
      wine("Prosecco Rosé Brilla Magnum", "Prosecco Rosé Brilla Magnum", "1.5L · 87% Glera, 13% Pinot Nero", "1,5L · 87% Glera, 13% Pinot Nero"),
      wine("Moscato d'Asti", "Moscato d'Asti", "750ml · 100% Muscat", "750ml · 100% Μοσχάτο"),
      wine("Moët & Chandon Impérial", "Moët & Chandon Impérial", "750ml · Pinot Noir, Pinot Meunier, Chardonnay", "750ml · Pinot Noir, Pinot Meunier, Chardonnay"),
      wine("Moët & Chandon Rosé Impérial", "Moët & Chandon Rosé Impérial", "750ml · Pinot Noir, Pinot Meunier, Chardonnay", "750ml · Pinot Noir, Pinot Meunier, Chardonnay"),
      wine("Veuve Clicquot Yellow Label", "Veuve Clicquot Yellow Label", "750ml · Pinot Noir, Pinot Meunier, Chardonnay", "750ml · Pinot Noir, Pinot Meunier, Chardonnay"),
      wine("Dom Pérignon Brut", "Dom Pérignon Brut", "750ml · Pinot Noir, Chardonnay", "750ml · Pinot Noir, Chardonnay"),
    ],
  },
];

/** Every section of the three lists, in display order. */
export const MENU: readonly InitialSection[] = [...FOOD, ...BAR, ...WINE];
