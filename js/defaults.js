/*
 * js/defaults.js - seed data for a freshly created data file
 * ---------------------------------------------------------------------------
 * The default price list contains common ingredients for special group
 * meals in a German kindergarten ("Kita"), with realistic 2026
 * supermarket prices per pack. It is only a starting point: the staff
 * can add, edit and remove entries in the "Price list" view until it
 * matches their local supermarket.
 *
 * NOTE: the entries are grouped by category instead of being sorted
 * alphabetically - on purpose, the staff navigates the price list by
 * category.
 *
 * Entry shape (localized):
 *   name      - { de, en } ingredient name, resolved into the app
 *               language when the data file is created
 *   quantity  - pack quantity as a plain number (500, 2.5, 6, ...)
 *   unit      - { de, en } unit of the quantity ("g", "piece", ...)
 *   category  - { de, en } group heading of the price list view
 *   price     - default price of that pack in EUR
 */

(function () {
  'use strict';

  /**
   * The unique, alphabetically sorted default category names for the
   * given language (used for datalist suggestions).
   *
   * @param {string} language - 'de' | 'en'
   * @returns {string[]}
   */
  function categoryNames(language) {
    const names = [];

    DEFAULT_PRICE_LIST.forEach(function (item) {
      const name =
        item.category[language] || item.category.de || item.category.en || '';

      if ('' !== name && -1 === names.indexOf(name)) {
        names.push(name);
      }
    });

    return names.sort(function (a, b) {
      return a.localeCompare(b, 'de');
    });
  }

  const DEFAULT_PRICE_LIST = [
    /* Vegetables / Gemüse */
    {
      name: { de: 'Gurke', en: 'Cucumber' },
      quantity: 1,
      unit: { de: 'Stück', en: 'piece' },
      category: { de: 'Gemüse', en: 'Vegetables' },
      price: 0.79,
    },
    {
      name: { de: 'Zucchini', en: 'Zucchini' },
      quantity: 1,
      unit: { de: 'Stück', en: 'piece' },
      category: { de: 'Gemüse', en: 'Vegetables' },
      price: 1.29,
    },
    {
      name: { de: 'Tomaten', en: 'Tomatoes' },
      quantity: 500,
      unit: { de: 'g', en: 'g' },
      category: { de: 'Gemüse', en: 'Vegetables' },
      price: 1.49,
    },
    {
      name: { de: 'Kartoffeln', en: 'Potatoes' },
      quantity: 2.5,
      unit: { de: 'kg', en: 'kg' },
      category: { de: 'Gemüse', en: 'Vegetables' },
      price: 2.99,
    },
    {
      name: { de: 'Möhren', en: 'Carrots' },
      quantity: 1,
      unit: { de: 'kg', en: 'kg' },
      category: { de: 'Gemüse', en: 'Vegetables' },
      price: 1.49,
    },
    {
      name: { de: 'Zwiebeln', en: 'Onions' },
      quantity: 1,
      unit: { de: 'kg', en: 'kg' },
      category: { de: 'Gemüse', en: 'Vegetables' },
      price: 1.29,
    },
    {
      name: { de: 'Knoblauch', en: 'Garlic' },
      quantity: 1,
      unit: { de: 'Kopf', en: 'head' },
      category: { de: 'Gemüse', en: 'Vegetables' },
      price: 0.89,
    },
    {
      name: { de: 'Kopfsalat', en: 'Lettuce' },
      quantity: 1,
      unit: { de: 'Kopf', en: 'head' },
      category: { de: 'Gemüse', en: 'Vegetables' },
      price: 1.19,
    },
    {
      name: { de: 'Weißkohl', en: 'Cabbage' },
      quantity: 1,
      unit: { de: 'Kopf', en: 'head' },
      category: { de: 'Gemüse', en: 'Vegetables' },
      price: 1.99,
    },
    {
      name: { de: 'Paprika', en: 'Bell pepper' },
      quantity: 1,
      unit: { de: 'Stück', en: 'piece' },
      category: { de: 'Gemüse', en: 'Vegetables' },
      price: 1.29,
    },
    {
      name: { de: 'Chilischote', en: 'Chili pepper' },
      quantity: 1,
      unit: { de: 'Stück', en: 'piece' },
      category: { de: 'Gemüse', en: 'Vegetables' },
      price: 0.99,
    },
    {
      name: { de: 'Tomaten (Dose)', en: 'Canned tomatoes' },
      quantity: 400,
      unit: { de: 'g', en: 'g' },
      category: { de: 'Gemüse', en: 'Vegetables' },
      price: 0.59,
    },
    /* Fruit / Obst */
    {
      name: { de: 'Äpfel', en: 'Apples' },
      quantity: 1,
      unit: { de: 'kg', en: 'kg' },
      category: { de: 'Obst', en: 'Fruit' },
      price: 1.99,
    },
    {
      name: { de: 'Bananen', en: 'Bananas' },
      quantity: 1,
      unit: { de: 'kg', en: 'kg' },
      category: { de: 'Obst', en: 'Fruit' },
      price: 1.59,
    },
    {
      name: { de: 'Orangen', en: 'Oranges' },
      quantity: 1,
      unit: { de: 'kg', en: 'kg' },
      category: { de: 'Obst', en: 'Fruit' },
      price: 2.29,
    },
    {
      name: { de: 'Zitrone', en: 'Lemon' },
      quantity: 1,
      unit: { de: 'Stück', en: 'piece' },
      category: { de: 'Obst', en: 'Fruit' },
      price: 0.69,
    },
    {
      name: { de: 'Limette', en: 'Lime' },
      quantity: 1,
      unit: { de: 'Stück', en: 'piece' },
      category: { de: 'Obst', en: 'Fruit' },
      price: 0.79,
    },
    /* Grains, baking & cooking basics /
       Getreide, Backen & Grundzutaten */
    {
      name: { de: 'Reis', en: 'Rice' },
      quantity: 1,
      unit: { de: 'kg', en: 'kg' },
      category: {
        de: 'Getreide, Backen & Grundzutaten',
        en: 'Grains, baking & cooking basics',
      },
      price: 1.89,
    },
    {
      name: { de: 'Nudeln', en: 'Pasta' },
      quantity: 500,
      unit: { de: 'g', en: 'g' },
      category: {
        de: 'Getreide, Backen & Grundzutaten',
        en: 'Grains, baking & cooking basics',
      },
      price: 0.89,
    },
    {
      name: { de: 'Mehl', en: 'Flour' },
      quantity: 1,
      unit: { de: 'kg', en: 'kg' },
      category: {
        de: 'Getreide, Backen & Grundzutaten',
        en: 'Grains, baking & cooking basics',
      },
      price: 0.99,
    },
    {
      name: { de: 'Zucker', en: 'Sugar' },
      quantity: 1,
      unit: { de: 'kg', en: 'kg' },
      category: {
        de: 'Getreide, Backen & Grundzutaten',
        en: 'Grains, baking & cooking basics',
      },
      price: 0.89,
    },
    {
      name: { de: 'Semmelbrösel', en: 'Breadcrumbs' },
      quantity: 250,
      unit: { de: 'g', en: 'g' },
      category: {
        de: 'Getreide, Backen & Grundzutaten',
        en: 'Grains, baking & cooking basics',
      },
      price: 1.29,
    },
    {
      name: { de: 'Brötchen', en: 'Bread rolls' },
      quantity: 6,
      unit: { de: 'Stück', en: 'pieces' },
      category: {
        de: 'Getreide, Backen & Grundzutaten',
        en: 'Grains, baking & cooking basics',
      },
      price: 1.99,
    },
    {
      name: { de: 'Tortillas', en: 'Tortillas' },
      quantity: 6,
      unit: { de: 'Stück', en: 'pieces' },
      category: {
        de: 'Getreide, Backen & Grundzutaten',
        en: 'Grains, baking & cooking basics',
      },
      price: 2.29,
    },
    /* Dairy & eggs / Milchprodukte & Eier */
    {
      name: { de: 'Butter', en: 'Butter' },
      quantity: 250,
      unit: { de: 'g', en: 'g' },
      category: { de: 'Milchprodukte & Eier', en: 'Dairy & eggs' },
      price: 1.29,
    },
    {
      name: { de: 'Milch', en: 'Milk' },
      quantity: 1,
      unit: { de: 'l', en: 'l' },
      category: { de: 'Milchprodukte & Eier', en: 'Dairy & eggs' },
      price: 0.89,
    },
    {
      name: { de: 'Kochsahne', en: 'Cooking cream' },
      quantity: 200,
      unit: { de: 'ml', en: 'ml' },
      category: { de: 'Milchprodukte & Eier', en: 'Dairy & eggs' },
      price: 1.09,
    },
    {
      name: { de: 'Joghurt', en: 'Yogurt' },
      quantity: 500,
      unit: { de: 'g', en: 'g' },
      category: { de: 'Milchprodukte & Eier', en: 'Dairy & eggs' },
      price: 1.29,
    },
    {
      name: { de: 'Eier', en: 'Eggs' },
      quantity: 10,
      unit: { de: 'Stück', en: 'pieces' },
      category: { de: 'Milchprodukte & Eier', en: 'Dairy & eggs' },
      price: 1.99,
    },
    {
      name: { de: 'Käse, gerieben', en: 'Cheese, grated' },
      quantity: 200,
      unit: { de: 'g', en: 'g' },
      category: { de: 'Milchprodukte & Eier', en: 'Dairy & eggs' },
      price: 2.49,
    },
    {
      name: { de: 'Mozzarella', en: 'Mozzarella' },
      quantity: 125,
      unit: { de: 'g', en: 'g' },
      category: { de: 'Milchprodukte & Eier', en: 'Dairy & eggs' },
      price: 1.49,
    },
    {
      name: { de: 'Frischkäse', en: 'Cream cheese' },
      quantity: 250,
      unit: { de: 'g', en: 'g' },
      category: { de: 'Milchprodukte & Eier', en: 'Dairy & eggs' },
      price: 1.79,
    },
    /* Meat, fish & pantry / Fleisch, Fisch & Vorrat */
    {
      name: { de: 'Hackfleisch (Rind)', en: 'Minced beef' },
      quantity: 500,
      unit: { de: 'g', en: 'g' },
      category: { de: 'Fleisch, Fisch & Vorrat', en: 'Meat, fish & pantry' },
      price: 4.49,
    },
    {
      name: { de: 'Hähnchenbrust', en: 'Chicken breast' },
      quantity: 500,
      unit: { de: 'g', en: 'g' },
      category: { de: 'Fleisch, Fisch & Vorrat', en: 'Meat, fish & pantry' },
      price: 5.49,
    },
    {
      name: { de: 'Speck', en: 'Bacon' },
      quantity: 200,
      unit: { de: 'g', en: 'g' },
      category: { de: 'Fleisch, Fisch & Vorrat', en: 'Meat, fish & pantry' },
      price: 1.99,
    },
    {
      name: { de: 'Thunfisch (Dose)', en: 'Tuna (canned)' },
      quantity: 120,
      unit: { de: 'g', en: 'g' },
      category: { de: 'Fleisch, Fisch & Vorrat', en: 'Meat, fish & pantry' },
      price: 1.49,
    },
    {
      name: { de: 'Olivenöl', en: 'Olive oil' },
      quantity: 1,
      unit: { de: 'l', en: 'l' },
      category: { de: 'Fleisch, Fisch & Vorrat', en: 'Meat, fish & pantry' },
      price: 4.49,
    },
    {
      name: { de: 'Tomatensauce', en: 'Tomato sauce' },
      quantity: 500,
      unit: { de: 'g', en: 'g' },
      category: { de: 'Fleisch, Fisch & Vorrat', en: 'Meat, fish & pantry' },
      price: 0.89,
    },
    {
      name: { de: 'Essig', en: 'Vinegar' },
      quantity: 500,
      unit: { de: 'ml', en: 'ml' },
      category: { de: 'Fleisch, Fisch & Vorrat', en: 'Meat, fish & pantry' },
      price: 1.29,
    },
    {
      name: { de: 'Kokosmilch', en: 'Coconut milk' },
      quantity: 400,
      unit: { de: 'ml', en: 'ml' },
      category: { de: 'Fleisch, Fisch & Vorrat', en: 'Meat, fish & pantry' },
      price: 0.89,
    },
    {
      name: { de: 'Honig', en: 'Honey' },
      quantity: 350,
      unit: { de: 'g', en: 'g' },
      category: { de: 'Fleisch, Fisch & Vorrat', en: 'Meat, fish & pantry' },
      price: 3.49,
    },
    {
      name: { de: 'Marmelade', en: 'Jam' },
      quantity: 380,
      unit: { de: 'g', en: 'g' },
      category: { de: 'Fleisch, Fisch & Vorrat', en: 'Meat, fish & pantry' },
      price: 1.49,
    },
  ];

  const api = {
    DEFAULTS: {
      categories: categoryNames,
      priceList: DEFAULT_PRICE_LIST,
    },
  };

  if ('undefined' !== typeof window) {
    window.FairShare = window.FairShare || {};
    Object.assign(window.FairShare, api);
  }

  if ('undefined' !== typeof module && module.exports) {
    module.exports = api;
  }
})();
