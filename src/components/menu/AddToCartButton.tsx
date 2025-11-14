'use client';

interface AddToCartButtonProps {
  onClick: () => void;
}

export default function AddToCartButton({ onClick }: AddToCartButtonProps) {
  return (
    <div className="relative mt-6 group w-14 hover:w-64 transition-all duration-300 ease-in-out">
      <button
        onClick={onClick}
        className="flex items-center justify-center group-hover:justify-start w-full h-14 bg-white text-black px-4 overflow-hidden transition-all duration-300 ease-in-out rounded-full group-hover:rounded-[999px] shadow-md"
      >
        {/* Ikona plusa */}
        <div className="w-6 h-6 flex items-center justify-center text-xl font-bold z-10">
          +
        </div>

        {/* Tekst po najechaniu */}
        <span className="ml-3 text-base font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap z-10">
          Dodaj do koszyka
        </span>
      </button>
    </div>
  );
}

