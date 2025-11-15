// src/components/EditOrderButton.tsx
"use client";

import React, { useState, useEffect } from "react";
import productsData from "@/data/product.json";

// --- pomocnicze typy ---
export type OrderOption = "local" | "takeaway" | "delivery";

export interface Product {
  name: string;
  price: number;
  quantity: number;
  meatType?: "wołowina" | "kurczak";
  addons?: string[];
  extraMeatCount?: number;
  note?: string;
}

interface EditOrderButtonProps {
  orderId: string;
  currentProducts: Product[];
  currentSelectedOption: OrderOption;
  onOrderUpdated: (orderId: string, updatedData?: Partial<any>) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
}

// --- dane pomocnicze ---
function flattenProducts(data: any[]): { name: string; price: number }[] {
  let products: { name: string; price: number }[] = [];
  data.forEach((category) => {
    if (category.subcategories) {
      category.subcategories.forEach((subcat: any) => {
        if (subcat.items) {
          products = products.concat(
            subcat.items.map((item: any) => ({
              name: item.name,
              price: item.price,
            }))
          );
        }
      });
    }
    if (category.items) {
      products = products.concat(
        category.items.map((item: any) => ({
          name: item.name,
          price: item.price,
        }))
      );
    }
  });
  return products;
}

const MENU_PRODUCTS = flattenProducts(productsData);

const ALL_ADDONS = [
  "Ser",
  "Bekon",
  "Jalapeño",
  "Ogórek",
  "Rukola",
  "Czerwona cebula",
  "Pomidor",
  "Pikle",
  "Nachosy",
  "Konfitura z cebuli",
  "Gruszka",
  "Płynny ser",
];

// --- normalizacja nazwy bez błędu jeśli undefined ---
function normalizeName(str?: string): string {
  if (!str || typeof str !== "string") return "";
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}

function getOptionLabel(option: OrderOption) {
  if (option === "local") return "NA MIEJSCU";
  if (option === "takeaway") return "NA WYNOS";
  if (option === "delivery") return "DOSTAWA";
  return "";
}

export default function EditOrderButton({
  orderId,
  currentProducts,
  currentSelectedOption,
  onOrderUpdated,
  onEditStart,
  onEditEnd,
}: EditOrderButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedOption, setSelectedOption] =
    useState<OrderOption>(currentSelectedOption);
  const [showAddProduct, setShowAddProduct] = useState(false);

  // inicjalizacja lokalnego stanu przy otwarciu
  useEffect(() => {
    if (showModal) {
      onEditStart?.();
      const normalized = currentProducts.map((item) => {
        const found = MENU_PRODUCTS.find(
          (p) => normalizeName(p.name) === normalizeName(item.name)
        );
        if (!found) {
          console.warn("Nie znaleziono ceny dla produktu:", item.name);
        }
        return {
          name: item.name,
          price: found?.price ?? item.price ?? 0,
          quantity: item.quantity !== undefined ? item.quantity : 1,
          extraMeatCount:
            item.extraMeatCount !== undefined ? item.extraMeatCount : 0,
          addons: item.addons ? [...item.addons] : [],
          meatType: item.meatType || "wołowina",
          note: item.note || "",
        } as Product;
      });
      setProducts(normalized);
      setSelectedOption(currentSelectedOption);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal]);

  // zamknięcie modala - wywołaj onEditEnd
  const closeModal = () => {
    setShowModal(false);
    onEditEnd?.();
  };

  const handleQuantityChange = (index: number, newValue: string) => {
    const qty = parseInt(newValue);
    setProducts((prev) =>
      prev.map((p, i) =>
        i === index ? { ...p, quantity: isNaN(qty) ? 1 : qty } : p
      )
    );
  };

  const handleExtraMeatChange = (index: number, newValue: string) => {
    const count = parseInt(newValue);
    setProducts((prev) =>
      prev.map((p, i) =>
        i === index
          ? { ...p, extraMeatCount: isNaN(count) ? 0 : count }
          : p
      )
    );
  };

  const handleMeatChange = (index: number, meat: "wołowina" | "kurczak") => {
    setProducts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, meatType: meat } : p))
    );
  };

  const toggleAddon = (index: number, addon: string) => {
    setProducts((prev) =>
      prev.map((p, i) => {
        if (i !== index) return p;
        const hasAddon = p.addons?.includes(addon);
        return {
          ...p,
          addons: hasAddon
            ? p.addons!.filter((a) => a !== addon)
            : [...(p.addons || []), addon],
        };
      })
    );
  };

  const handleRemoveProduct = (index: number) => {
    setProducts((prev) => prev.filter((_, i) => i !== index));
  };

  const calculateBaseTotal = () => {
    return products.reduce((acc, item) => {
      const quantity = item.quantity || 1;
      const addonsCost = (item.addons?.length || 0) * 3;
      const extraMeatCost = (item.extraMeatCount || 0) * 10;
      return acc + (item.price + addonsCost + extraMeatCost) * quantity;
    }, 0);
  };

  const getPackagingCost = () => {
    return selectedOption === "takeaway" || selectedOption === "delivery"
      ? 2
      : 0;
  };

  const calculateTotalWithPackaging = () => {
    return calculateBaseTotal() + getPackagingCost();
  };

  const handleAddNewProduct = (productName: string, productPrice: number) => {
    setProducts((prev) => [
      ...prev,
      {
        name: productName,
        price: productPrice,
        quantity: 1,
        addons: [],
        extraMeatCount: 0,
        meatType: "wołowina",
        note: "",
      },
    ]);
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: JSON.stringify(products),
          selected_option: selectedOption,
          total_price: calculateTotalWithPackaging(),
        }),
      });
      if (res.ok) {
        const { order } = await res.json();
        onOrderUpdated(orderId, order);
        closeModal();
      } else {
        const result = await res.json();
        console.error("Błąd edycji zamówienia:", result);
      }
    } catch (error) {
      console.error("Fetch error:", error);
    }
  };

  const ProductEditor: React.FC<{ product: Product; index: number }> = ({
    product,
    index,
  }) => {
    return (
      <div className="border p-3 mb-4 rounded-xl shadow-sm">
        <div className="flex justify-between flex-wrap">
          <p className="font-semibold">{product.name}</p>
          <span>{product.price.toFixed(2)} zł</span>
        </div>

        <div className="mt-2">
          <span className="font-semibold text-sm">Mięso:</span>
          <div className="flex gap-2 mt-1 flex-wrap">
            <button
              type="button"
              onClick={() => handleMeatChange(index, "wołowina")}
              className={`px-2 py-1 text-xs rounded-full ${
                product.meatType === "wołowina"
                  ? "bg-yellow-300 font-bold"
                  : "bg-gray-200"
              }`}
            >
              Wołowina
            </button>
            <button
              type="button"
              onClick={() => handleMeatChange(index, "kurczak")}
              className={`px-2 py-1 text-xs rounded-full ${
                product.meatType === "kurczak"
                  ? "bg-yellow-300 font-bold"
                  : "bg-gray-200"
              }`}
            >
              Kurczak
            </button>
          </div>
        </div>

        <div className="mt-2">
          <span className="font-semibold text-sm">Dodatki:</span>
          <div className="flex flex-wrap gap-2 mt-1">
            {ALL_ADDONS.map((addon) => {
              const hasAddon = product.addons?.includes(addon);
              return (
                <button
                  key={addon}
                  type="button"
                  onClick={() => toggleAddon(index, addon)}
                  className={`border text-xs px-2 py-1 rounded-full flex-shrink-0 min-w-[60px] ${
                    hasAddon
                      ? "bg-gray-800 text-white"
                      : "bg-white text:black"
                  }`}
                >
                  {hasAddon ? `✓ ${addon}` : `+ ${addon}`}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center gap-2 flex-1">
            <label className="text-sm min-w-[120px]">
              Dodatkowe mięso:
            </label>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() =>
                  handleExtraMeatChange(
                    index,
                    String(Math.max((product.extraMeatCount || 0) - 1, 0))
                  )
                }
                disabled={(product.extraMeatCount || 0) <= 0}
                className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-black rounded-full"
              >
                -
              </button>
              <span className="mx-2">{product.extraMeatCount || 0}</span>
              <button
                type="button"
                onClick={() =>
                  handleExtraMeatChange(
                    index,
                    String((product.extraMeatCount || 0) + 1)
                  )
                }
                className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-black rounded-full"
              >
                +
              </button>
              <span className="text-xs text-gray-500 ml-2">x +10 zł</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-1">
            <label className="text-sm min-w-[120px]">Ilość burgera:</label>
            <div className="flex items:center">
              <button
                type="button"
                onClick={() =>
                  handleQuantityChange(
                    index,
                    String(Math.max(product.quantity - 1, 1))
                  )
                }
                disabled={product.quantity <= 1}
                className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-black rounded-full"
              >
                -
              </button>
              <span className="mx-2">{product.quantity}</span>
              <button
                type="button"
                onClick={() =>
                  handleQuantityChange(
                    index,
                    String(product.quantity + 1)
                  )
                }
                className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-black rounded-full"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleRemoveProduct(index)}
          className="mt-3 bg-red-500 hover:bg-red-600 text-white px-3 py-1 text-sm rounded-full"
        >
          Usuń produkt
        </button>
      </div>
    );
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-full"
      >
        Edytuj
      </button>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 p-4 z-50">
          <div className="relative bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            {/* header */}
            <div className="sticky top-0 bg-white z-10 border-b px-5 py-3 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold leading-tight truncate">
                  Zamówienie: {getOptionLabel(selectedOption)}
                </h3>
                <h4 className="text-base font-semibold mt-1">
                  Edytuj zamówienie
                </h4>
              </div>
              <button
                type="button"
                aria-label="Zamknij"
                onClick={closeModal}
                className="p-2 rounded-full hover:bg-gray-100 flex-shrink-0"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-gray-600"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col space-y-4">
              <div className="flex flex-wrap gap-2">
                {(["local", "takeaway", "delivery"] as OrderOption[]).map(
                  (option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSelectedOption(option)}
                      className={`px-3 py-2 rounded-full text-xs font-medium flex-1 min-w-[90px] ${
                        selectedOption === option
                          ? "bg-yellow-400 font-bold"
                          : "bg-gray-200"
                      }`}
                    >
                      {option === "local"
                        ? "NA MIEJSCU"
                        : option === "takeaway"
                        ? "NA WYNOS"
                        : "DOSTAWA"}
                    </button>
                  )
                )}
              </div>

              {products.map((product, index) => (
                <ProductEditor
                  key={`${product.name}-${index}`}
                  product={product}
                  index={index}
                />
              ))}

              <div>
                <button
                  type="button"
                  onClick={() => setShowAddProduct(true)}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-3 rounded-full font-medium"
                >
                  Dodaj produkt
                </button>
              </div>

              {showAddProduct && (
                <div className="border p-3 rounded-lg">
                  <h4 className="font-bold mb-2">Wybierz produkt</h4>
                  <ul className="space-y-2 max-h-52 overflow-auto">
                    {MENU_PRODUCTS.map((prod) => (
                      <li key={prod.name}>
                        <button
                          type="button"
                          onClick={() => {
                            handleAddNewProduct(prod.name, prod.price);
                            setShowAddProduct(false);
                          }}
                          className="block w-full text-left px-3 py-2 border-b hover:bg-gray-100 rounded-full"
                        >
                          {prod.name} - {prod.price} zł
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setShowAddProduct(false)}
                    className="mt-2 text-red-500 text-sm rounded-full"
                  >
                    Anuluj
                  </button>
                </div>
              )}

              <div className="mt-2 text-sm space-y-1 border-t pt-2">
                <div className="flex justify-between">
                  <span>Suma produktów:</span>
                  <span>{calculateBaseTotal().toFixed(2)} zł</span>
                </div>
                {(selectedOption === "takeaway" ||
                  selectedOption === "delivery") && (
                  <div className="flex justify-between">
                    <span>Opakowanie:</span>
                    <span>{getPackagingCost().toFixed(2)} zł</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-2 mt-2">
                  <span>Razem do zapłaty:</span>
                  <span>{calculateTotalWithPackaging().toFixed(2)} zł</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-3">
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white py-3 rounded-full font-semibold"
                >
                  Zapisz zmiany
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-3 rounded-full font-semibold"
                >
                  Anuluj
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
