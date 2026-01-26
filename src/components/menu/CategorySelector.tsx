'use client';

interface CategorySelectorProps {
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  selectedSubcategory: string | null;
  setSelectedSubcategory: (subcategory: string | null) => void;
  subcategories: string[];
}

export default function CategorySelector({
  selectedCategory,
  setSelectedCategory,
  selectedSubcategory,
  setSelectedSubcategory,
  subcategories,
}: CategorySelectorProps) {
  const categories = ['Burger', 'Pancake', 'Kids', 'Frytki', 'Napoje'];

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* kategorie główne */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-center">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setSelectedCategory(cat);
              setSelectedSubcategory(null);
            }}
            className={`px-4 py-2 rounded-full border font-semibold ${
              selectedCategory === cat
                ? 'bg-black text-white'
                : 'bg-white text-black border-black'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* subkategorie */}
      {selectedCategory === 'Burger' && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4 w-full text-center">
          {subcategories.map((sub) => (
            <button
              key={sub}
              onClick={() => setSelectedSubcategory(sub)}
              className={`px-3 py-1 text-sm rounded-full border ${
                selectedSubcategory === sub
                  ? 'bg-yellow-400 text-black'
                  : 'bg-white text-black border-black'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
