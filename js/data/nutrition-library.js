export const NUTRITION_LIBRARY_VERSION = 2;

const ALL_PATTERNS = ["omnivore", "vegetarian", "vegan", "pescatarian"];
const PATTERNS = {
  vegan: ALL_PATTERNS,
  vegetarian: ["omnivore", "vegetarian", "pescatarian"],
  pescatarian: ["omnivore", "pescatarian"],
  omnivore: ["omnivore"]
};

const LEGACY_IDS = {
  "breakfast-couscous:eggs-tomato": "couscous-eggs",
  "breakfast-couscous:chicken-pumpkin": "couscous-chicken",
  "breakfast-oat-cream:yogurt-fruit": "yogurt-fruit-oats",
  "lunch-rice-beans:chicken-vegetables": "rice-beans-chicken",
  "lunch-rice-beans:eggs-spinach": "rice-beans-eggs",
  "lunch-rice-beans:tofu-broccoli": "rice-beans-tofu",
  "lunch-potato:chicken-vegetables": "potato-chicken",
  "lunch-pasta:lentil-tomato": "pasta-tomato",
  "snack-fruit-bowl:banana-oats": "fruit-oats",
  "pre-tapioca:banana-cinnamon": "banana-tapioca",
  "pre-bread:banana-honey": "bread-banana",
  "post-smoothie:banana-milk": "banana-milk-smoothie",
  "post-smoothie:banana-soy": "banana-soy-smoothie"
};

const foundation = (id, label, base, slots, tags = [], options = {}) => ({
  id, label, base, slots, tags, prep: options.prep || "medium",
  minutes: options.minutes || 20, budget: options.budget || "medium",
  allergens: options.allergens || []
});

const pairing = (id, label, components, diet, allergens = [], tags = []) => ({
  id, label, components, diet, allergens, tags
});

function expand(foundations, pairings) {
  return foundations.flatMap(base => pairings.map(option => {
    const key = `${base.id}:${option.id}`;
    const tags = [...new Set([...base.tags, ...option.tags, "whole-food"])];
    const composition = [base.base, ...option.components].join(" · ");
    return {
      id: LEGACY_IDS[key] || `${base.id}-${option.id}`,
      family: base.id,
      name: `${base.label} com ${option.label}`,
      composition,
      ingredients: [base.base, ...option.components],
      slotTypes: base.slots,
      contexts: base.slots.includes("pre_run") ? ["before"] : base.slots.some(slot => ["post_run", "post_strength"].includes(slot)) ? ["after"] : ["regular"],
      patterns: PATTERNS[option.diet] || PATTERNS.omnivore,
      allergens: [...new Set([...base.allergens, ...option.allergens])],
      budget: tags.includes("premium") ? "high" : tags.includes("economic") ? "low" : base.budget,
      prep: tags.includes("quick") ? "low" : tags.includes("slow-prep") ? "high" : base.prep,
      minutes: tags.includes("quick") ? Math.min(base.minutes, 10) : tags.includes("slow-prep") ? Math.max(base.minutes, 35) : base.minutes,
      tags
    };
  }));
}

const breakfastSavoryBases = [
  foundation("breakfast-couscous", "Cuscuz", "Cuscuz de milho", ["breakfast"], ["gluten-free", "carb-rich"], { prep: "low", minutes: 12, budget: "low" }),
  foundation("breakfast-tapioca", "Tapioca matinal", "Tapioca", ["breakfast"], ["gluten-free", "carb-rich"], { prep: "low", minutes: 12, budget: "low" }),
  foundation("breakfast-cassava", "Mandioca no café", "Mandioca cozida", ["breakfast"], ["gluten-free", "carb-rich"], { minutes: 18, budget: "low" }),
  foundation("breakfast-polenta", "Polenta cremosa", "Polenta de milho", ["breakfast"], ["gluten-free", "carb-rich"], { minutes: 18, budget: "low" })
];

const breakfastSavoryPairings = [
  pairing("eggs-tomato", "ovos e tomate", ["Ovos mexidos", "Tomate", "Cheiro-verde"], "vegetarian", ["egg"], ["protein-rich", "economic"]),
  pairing("chicken-pumpkin", "frango e abóbora", ["Frango desfiado", "Abóbora", "Couve"], "omnivore", [], ["protein-rich"]),
  pairing("tofu-broccoli", "tofu e brócolis", ["Tofu mexido", "Brócolis", "Cenoura"], "vegan", ["soy"], ["protein-rich"]),
  pairing("chickpea-kale", "grão-de-bico e couve", ["Grão-de-bico", "Couve", "Tomate"], "vegan", [], ["plant-protein", "economic"]),
  pairing("tuna-corn", "atum, milho e pepino", ["Atum", "Milho", "Pepino"], "pescatarian", ["fish"], ["protein-rich"]),
  pairing("cheese-guava", "queijo e goiaba", ["Queijo minas", "Goiaba", "Canela"], "vegetarian", ["milk"], ["protein-rich"]),
  pairing("beans-avocado", "feijão e abacate", ["Feijão-fradinho", "Abacate", "Tomate"], "vegan", [], ["plant-protein", "economic"]),
  pairing("sardine-vinaigrette", "sardinha e vinagrete", ["Sardinha", "Tomate", "Cebola", "Limão"], "pescatarian", ["fish"], ["protein-rich", "economic"])
];

const breakfastSweetBases = [
  foundation("breakfast-oat-cream", "Aveia cremosa", "Aveia", ["breakfast"], ["carb-rich"], { prep: "low", minutes: 8, budget: "low", allergens: ["gluten"] })
];

const breakfastSweetPairings = [
  pairing("yogurt-fruit", "iogurte e fruta", ["Iogurte natural", "Mamão", "Chia"], "vegetarian", ["milk"], ["protein-rich", "quick"]),
  pairing("banana-tahini", "banana e tahine", ["Banana", "Tahine", "Canela"], "vegan", ["sesame"], ["plant-protein", "quick"]),
  pairing("apple-peanut", "maçã e amendoim", ["Maçã", "Pasta de amendoim", "Canela"], "vegan", ["peanut"], ["plant-protein"]),
  pairing("mango-chia", "manga e chia", ["Manga", "Chia", "Bebida de coco"], "vegan", [], ["lactose-free", "quick"]),
  pairing("cocoa-soy", "cacau e soja", ["Bebida de soja", "Cacau", "Banana"], "vegan", ["soy"], ["protein-rich", "quick"]),
  pairing("papaya-seeds", "mamão e sementes", ["Mamão", "Sementes de abóbora", "Canela"], "vegan", [], ["plant-protein", "economic"]),
  pairing("pear-ricotta", "pera e ricota", ["Pera", "Ricota", "Canela"], "vegetarian", ["milk"], ["protein-rich"]),
  pairing("guava-coconut", "goiaba e coco", ["Goiaba", "Coco sem açúcar", "Linhaça"], "vegan", [], ["lactose-free"])
];

const lunchBases = [
  foundation("lunch-rice-beans", "Arroz e feijão", "Arroz e feijão", ["lunch"], ["carb-rich", "balanced", "gluten-free"], { minutes: 28, budget: "low" }),
  foundation("lunch-quinoa", "Bowl de quinoa", "Quinoa", ["lunch"], ["balanced", "gluten-free"], { minutes: 24 }),
  foundation("lunch-pasta", "Macarrão", "Macarrão", ["lunch"], ["carb-rich", "balanced"], { minutes: 24, budget: "low", allergens: ["gluten"] }),
  foundation("lunch-potato", "Prato de batata", "Batata cozida", ["lunch"], ["carb-rich", "balanced", "gluten-free"], { minutes: 28, budget: "low" }),
  foundation("lunch-cassava", "Prato de mandioca", "Mandioca", ["lunch"], ["carb-rich", "balanced", "gluten-free"], { minutes: 30, budget: "low" }),
  foundation("lunch-wrap", "Wrap integral", "Pão folha integral", ["lunch"], ["balanced"], { prep: "low", minutes: 14, allergens: ["gluten"] })
];

const lunchPairings = [
  pairing("lentil-tomato", "lentilha e tomate", ["Lentilha", "Tomate", "Espinafre"], "vegan", [], ["plant-protein", "economic"]),
  pairing("chickpea-pumpkin", "grão-de-bico e abóbora", ["Grão-de-bico", "Abóbora", "Rúcula"], "vegan", [], ["plant-protein", "economic"]),
  pairing("tofu-broccoli", "tofu e brócolis", ["Tofu", "Brócolis", "Cenoura"], "vegan", ["soy"], ["protein-rich"]),
  pairing("eggs-spinach", "ovos e espinafre", ["Ovos", "Espinafre", "Tomate"], "vegetarian", ["egg"], ["protein-rich", "economic"]),
  pairing("chicken-vegetables", "frango e legumes", ["Frango", "Abobrinha", "Cenoura"], "omnivore", [], ["protein-rich", "economic"]),
  pairing("fish-vinaigrette", "peixe e vinagrete", ["Peixe", "Tomate", "Cebola", "Limão"], "pescatarian", ["fish"], ["protein-rich"]),
  pairing("beef-okra", "carne e quiabo", ["Carne magra", "Quiabo", "Abóbora"], "omnivore", [], ["protein-rich"]),
  pairing("sardine-kale", "sardinha e couve", ["Sardinha", "Couve", "Tomate"], "pescatarian", ["fish"], ["protein-rich", "economic"])
];

const snackSweetBases = [
  foundation("snack-fruit-bowl", "Taça de frutas", "Fruta fresca", ["snack"], ["quick", "gluten-free"], { prep: "low", minutes: 5, budget: "low" }),
  foundation("snack-chia-cup", "Pudim de chia", "Chia hidratada em bebida vegetal", ["snack"], ["plant-protein", "gluten-free"], { prep: "low", minutes: 8 }),
  foundation("snack-rice-cream", "Creme de arroz", "Arroz cremoso com bebida vegetal", ["snack"], ["carb-rich", "gluten-free"], { prep: "low", minutes: 10, budget: "low" })
];

const snackSweetPairings = [
  pairing("banana-oats", "banana, aveia e sementes", ["Banana", "Aveia", "Sementes de abóbora"], "vegan", ["gluten"], ["plant-protein", "economic"]),
  pairing("apple-peanut", "maçã e amendoim", ["Maçã", "Pasta de amendoim", "Canela"], "vegan", ["peanut"], ["plant-protein"]),
  pairing("papaya-oats", "mamão e aveia", ["Mamão", "Aveia", "Linhaça"], "vegan", ["gluten"], ["carb-rich", "economic"]),
  pairing("mango-coconut", "manga e coco", ["Manga", "Coco sem açúcar", "Chia"], "vegan", [], ["lactose-free"]),
  pairing("guava-seeds", "goiaba e sementes", ["Goiaba", "Sementes de girassol", "Canela"], "vegan", [], ["plant-protein", "economic"]),
  pairing("berries-soy-yogurt", "frutas vermelhas e iogurte de soja", ["Frutas vermelhas", "Iogurte de soja", "Granola"], "vegan", ["soy", "gluten"], ["protein-rich", "premium"])
];

const snackSavoryBases = [
  foundation("snack-sandwich", "Mini sanduíche", "Pão integral", ["snack"], ["quick", "balanced"], { prep: "low", minutes: 8, budget: "low", allergens: ["gluten"] }),
  foundation("snack-tapioca", "Tapioca", "Tapioca", ["snack"], ["quick", "balanced", "gluten-free"], { prep: "low", minutes: 10, budget: "low" }),
  foundation("snack-savory-cake", "Bolinho assado", "Massa de mandioca e milho", ["snack"], ["balanced", "gluten-free"], { minutes: 24, budget: "low" })
];

const snackSavoryPairings = [
  pairing("hummus-carrot", "homus e cenoura", ["Homus", "Cenoura", "Pepino"], "vegan", ["sesame"], ["plant-protein"]),
  pairing("tofu-tomato", "tofu e tomate", ["Tofu", "Tomate", "Rúcula"], "vegan", ["soy"], ["protein-rich"]),
  pairing("eggs-spinach", "ovos e espinafre", ["Ovos", "Espinafre", "Tomate"], "vegetarian", ["egg"], ["protein-rich", "economic"]),
  pairing("chicken-carrot", "frango e cenoura", ["Frango", "Cenoura", "Alface"], "omnivore", [], ["protein-rich"]),
  pairing("tuna-corn", "atum e milho", ["Atum", "Milho", "Tomate"], "pescatarian", ["fish"], ["protein-rich"]),
  pairing("beans-pumpkin", "feijão e abóbora", ["Feijão-branco", "Abóbora", "Couve"], "vegan", [], ["plant-protein", "economic"])
];

const dinnerBases = [
  foundation("dinner-stew", "Ensopado", "Caldo de tomate e legumes", ["dinner"], ["balanced", "gluten-free"], { minutes: 32, budget: "low" }),
  foundation("dinner-rice", "Arroz cremoso", "Arroz", ["dinner"], ["balanced", "carb-rich", "gluten-free"], { minutes: 24, budget: "low" }),
  foundation("dinner-polenta", "Polenta", "Polenta de milho", ["dinner"], ["balanced", "carb-rich", "gluten-free"], { minutes: 24, budget: "low" }),
  foundation("dinner-roots", "Raízes assadas", "Batata-doce e cenoura", ["dinner"], ["balanced", "carb-rich", "gluten-free"], { minutes: 35 }),
  foundation("dinner-pasta", "Massa curta", "Macarrão", ["dinner"], ["balanced", "carb-rich"], { minutes: 22, allergens: ["gluten"] })
];

const dinnerPairings = [
  pairing("lentil-spinach", "lentilha e espinafre", ["Lentilha", "Espinafre", "Tomate"], "vegan", [], ["plant-protein", "economic"]),
  pairing("chickpea-pumpkin", "grão-de-bico e abóbora", ["Grão-de-bico", "Abóbora", "Couve"], "vegan", [], ["plant-protein", "economic"]),
  pairing("tofu-vegetables", "tofu e legumes", ["Tofu", "Abobrinha", "Brócolis"], "vegan", ["soy"], ["protein-rich"]),
  pairing("eggs-tomato", "ovos e tomate", ["Ovos", "Tomate", "Espinafre"], "vegetarian", ["egg"], ["protein-rich", "economic"]),
  pairing("chicken-pumpkin", "frango e abóbora", ["Frango", "Abóbora", "Vagem"], "omnivore", [], ["protein-rich"]),
  pairing("fish-potato", "peixe e ervilhas", ["Peixe", "Ervilhas", "Tomate"], "pescatarian", ["fish"], ["protein-rich"]),
  pairing("beef-vegetables", "carne e legumes", ["Carne magra", "Cenoura", "Couve"], "omnivore", [], ["protein-rich"]),
  pairing("mushroom-beans", "cogumelos e feijão-branco", ["Cogumelos", "Feijão-branco", "Rúcula"], "vegan", [], ["plant-protein"])
];

const preRunBases = [
  foundation("pre-tapioca", "Tapioca fina", "Tapioca", ["pre_run"], ["carb-rich", "easy-digest", "quick", "gluten-free"], { prep: "low", minutes: 5, budget: "low" }),
  foundation("pre-bread", "Pão branco", "Pão branco", ["pre_run"], ["carb-rich", "easy-digest", "quick"], { prep: "low", minutes: 5, budget: "low", allergens: ["gluten"] }),
  foundation("pre-rice-cream", "Creme de arroz", "Creme de arroz", ["pre_run"], ["carb-rich", "easy-digest", "gluten-free"], { prep: "low", minutes: 8, budget: "low" }),
  foundation("pre-couscous", "Cuscuz simples", "Cuscuz de milho", ["pre_run"], ["carb-rich", "easy-digest", "gluten-free"], { prep: "low", minutes: 10, budget: "low" })
];

const preRunPairings = [
  pairing("banana-cinnamon", "banana e canela", ["Banana", "Canela"], "vegan", [], ["quick", "economic"]),
  pairing("banana-honey", "banana e mel", ["Banana", "Mel"], "vegetarian", [], ["quick", "economic"]),
  pairing("fruit-jam", "geleia de fruta", ["Geleia de fruta"], "vegan", [], ["quick"]),
  pairing("molasses", "melado de cana", ["Melado de cana", "Pitada de sal"], "vegan", [], ["quick", "economic"]),
  pairing("dates", "tâmaras", ["Tâmaras", "Canela"], "vegan", [], ["quick"]),
  pairing("apple-puree", "purê de maçã", ["Maçã cozida", "Canela"], "vegan", [], ["quick"])
];

const postSweetBases = [
  foundation("post-smoothie", "Vitamina", "Banana ou fruta madura", ["post_run", "post_strength"], ["recovery", "carb-rich", "quick"], { prep: "low", minutes: 7, budget: "low" }),
  foundation("post-cream-bowl", "Bowl cremoso", "Creme de arroz", ["post_run", "post_strength"], ["recovery", "carb-rich"], { prep: "low", minutes: 10, budget: "low" })
];

const postSweetPairings = [
  pairing("banana-milk", "banana, leite e aveia", ["Banana", "Leite", "Aveia"], "vegetarian", ["milk", "gluten"], ["protein-rich", "economic"]),
  pairing("banana-soy", "banana e bebida de soja", ["Banana", "Bebida de soja", "Aveia sem glúten"], "vegan", ["soy"], ["protein-rich", "gluten-free"]),
  pairing("mango-yogurt", "manga e iogurte", ["Manga", "Iogurte natural", "Aveia"], "vegetarian", ["milk", "gluten"], ["protein-rich"]),
  pairing("cocoa-peanut", "cacau e amendoim", ["Cacau", "Bebida de soja", "Pasta de amendoim"], "vegan", ["soy", "peanut"], ["protein-rich"]),
  pairing("papaya-milk", "mamão e leite", ["Mamão", "Leite", "Canela"], "vegetarian", ["milk"], ["protein-rich", "gluten-free"]),
  pairing("berries-tofu", "frutas vermelhas e tofu", ["Frutas vermelhas", "Tofu macio", "Banana"], "vegan", ["soy"], ["protein-rich", "gluten-free", "premium"])
];

const postSavoryBases = [
  foundation("post-couscous", "Cuscuz pós-treino", "Cuscuz de milho", ["post_run", "post_strength"], ["recovery", "carb-rich", "gluten-free"], { minutes: 14, budget: "low" }),
  foundation("post-rice-beans", "Arroz e feijão pós-treino", "Arroz e feijão", ["post_run", "post_strength"], ["recovery", "carb-rich", "gluten-free"], { minutes: 20, budget: "low" }),
  foundation("post-sandwich", "Sanduíche pós-treino", "Pão integral", ["post_run", "post_strength"], ["recovery", "carb-rich", "quick"], { prep: "low", minutes: 10, budget: "low", allergens: ["gluten"] })
];

const postSavoryPairings = [
  pairing("eggs-fruit", "ovos e fruta", ["Ovos", "Mamão", "Tomate"], "vegetarian", ["egg"], ["protein-rich", "economic"]),
  pairing("chicken-vegetables", "frango e legumes", ["Frango", "Cenoura", "Abobrinha"], "omnivore", [], ["protein-rich", "economic"]),
  pairing("tofu-vegetables", "tofu, abobrinha e beterraba", ["Tofu", "Abobrinha", "Beterraba"], "vegan", ["soy"], ["protein-rich"]),
  pairing("tuna-tomato", "atum e tomate", ["Atum", "Tomate", "Milho"], "pescatarian", ["fish"], ["protein-rich"]),
  pairing("hummus-chickpea", "homus e grão-de-bico", ["Homus", "Grão-de-bico", "Pepino"], "vegan", ["sesame"], ["plant-protein"]),
  pairing("lentil-spinach", "lentilha e espinafre", ["Lentilha", "Espinafre", "Tomate"], "vegan", [], ["plant-protein", "economic"])
];

const supperSweetBases = [
  foundation("supper-porridge", "Mingau pequeno", "Aveia", ["supper"], ["light"], { prep: "low", minutes: 8, budget: "low", allergens: ["gluten"] })
];

const supperSweetPairings = [
  pairing("banana-cinnamon", "banana e canela", ["Banana", "Canela"], "vegan", [], ["carb-rich", "quick"]),
  pairing("milk-cocoa", "leite e cacau", ["Leite", "Cacau"], "vegetarian", ["milk"], ["protein-rich", "quick"]),
  pairing("soy-cocoa", "soja e cacau", ["Bebida de soja", "Cacau"], "vegan", ["soy"], ["protein-rich", "quick"]),
  pairing("papaya-chia", "mamão e chia", ["Mamão", "Chia"], "vegan", [], ["plant-protein"]),
  pairing("pear-ricotta", "pera e ricota", ["Pera", "Ricota"], "vegetarian", ["milk"], ["protein-rich"]),
  pairing("mango-tofu", "manga e tofu", ["Manga", "Tofu macio"], "vegan", ["soy"], ["protein-rich"])
];

const supperSavoryBases = [
  foundation("supper-toast", "Torrada leve", "Pão integral", ["supper"], ["light", "quick"], { prep: "low", minutes: 7, budget: "low", allergens: ["gluten"] })
];

const supperSavoryPairings = [
  pairing("hummus-tomato", "homus e tomate", ["Homus", "Tomate"], "vegan", ["sesame"], ["plant-protein"]),
  pairing("tofu-herbs", "tofu e ervas", ["Tofu", "Ervas", "Pepino"], "vegan", ["soy"], ["protein-rich"]),
  pairing("ricotta-papaya", "ricota e mamão", ["Ricota", "Mamão"], "vegetarian", ["milk"], ["protein-rich"]),
  pairing("egg-tomato", "ovo e tomate", ["Ovo", "Tomate"], "vegetarian", ["egg"], ["protein-rich", "economic"]),
  pairing("beans-herbs", "feijão-branco e ervas", ["Feijão-branco", "Salsinha", "Limão"], "vegan", [], ["plant-protein", "economic"]),
  pairing("tuna-cucumber", "atum e pepino", ["Atum", "Pepino"], "pescatarian", ["fish"], ["protein-rich"])
];

const generatedMeals = [
  ...expand(breakfastSavoryBases, breakfastSavoryPairings),
  ...expand(breakfastSweetBases, breakfastSweetPairings),
  ...expand(lunchBases, lunchPairings),
  ...expand(snackSweetBases, snackSweetPairings),
  ...expand(snackSavoryBases, snackSavoryPairings),
  ...expand(dinnerBases, dinnerPairings),
  ...expand(preRunBases, preRunPairings),
  ...expand(postSweetBases, postSweetPairings),
  ...expand(postSavoryBases, postSavoryPairings),
  ...expand(supperSweetBases, supperSweetPairings),
  ...expand(supperSavoryBases, supperSavoryPairings)
];

const legacyFruit = {
  id: "fruit-simple", family: "pre-fruit", name: "Fruta habitual com água",
  composition: "Banana, maçã ou mamão · Água",
  ingredients: ["Banana", "Maçã", "Mamão", "Água"],
  slotTypes: ["pre_run", "snack"], contexts: ["before", "regular"],
  patterns: ALL_PATTERNS, allergens: [], budget: "low", prep: "low", minutes: 2,
  tags: ["carb-rich", "easy-digest", "quick", "gluten-free", "lactose-free", "whole-food"]
};

export const NUTRITION_LIBRARY = Object.freeze([...generatedMeals, legacyFruit]);

export function nutritionItemById(id) {
  return NUTRITION_LIBRARY.find(item => item.id === id) || null;
}
