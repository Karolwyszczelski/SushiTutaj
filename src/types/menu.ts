export interface MenuItem {
    id: string;
    name: string;
    price: number;
    category: string;
    /** jeżeli dana pozycja leży w większej jednostce (np. „Burger > 100% Wołowina”) */
    subcategory?: string;
    description?: string;
    imageUrl?: string;
    available: boolean;
    addons: string[];
  }
  