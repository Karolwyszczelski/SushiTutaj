import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

console.log("Starting migration function...");

// Interfejsy do typowania danych, dla porządku
interface OldOrderItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
  // Dodaj inne pola, jeśli istnieją w Twoim JSONie
}

interface ProductMap {
  [name: string]: { id: number; price: number };
}

interface NewOrderItem {
  order_id: string;
  product_id: number;
  quantity: number;
  unit_price: number;
}


Deno.serve(async (req) => {
  try {
    // Utwórz klienta Supabase, który ma uprawnienia administratora
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Pobierz wszystkie produkty, aby stworzyć mapę "nazwa -> id"
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, name, price');

    if (productsError) throw productsError;

    const productMap: ProductMap = products.reduce((acc, product) => {
      acc[product.name] = { id: product.id, price: product.price };
      return acc;
    }, {});
    
    console.log(`Loaded ${products.length} products into map.`);

    // 2. Pobierz wszystkie zamówienia, które mają dane w kolumnie "items"
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id, items')
      .neq('items', null); // Pobieramy tylko te, gdzie 'items' nie jest puste

    if (ordersError) throw ordersError;
    
    console.log(`Found ${orders.length} orders to migrate.`);

    // 3. Przygotuj nowe dane do wstawienia
    const itemsToInsert: NewOrderItem[] = [];

    for (const order of orders) {
      // Bezpiecznie parsowanie JSON-a
      let oldItems: OldOrderItem[] = [];
      try {
        oldItems = JSON.parse(order.items);
      } catch (e) {
        console.error(`Could not parse items for order ${order.id}. Skipping.`, e);
        continue; // Pomiń to zamówienie, jeśli JSON jest uszkodzony
      }

      for (const item of oldItems) {
        const productInfo = productMap[item.name];

        if (productInfo) {
          itemsToInsert.push({
            order_id: order.id,
            product_id: productInfo.id,
            quantity: item.quantity,
            unit_price: item.price, // Używamy ceny z momentu zamówienia
          });
        } else {
          console.warn(`Product "${item.name}" from order ${order.id} not found in product map. Skipping this item.`);
        }
      }
    }

    if (itemsToInsert.length === 0) {
      return new Response("No new items to insert.", {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`Prepared ${itemsToInsert.length} items to insert into order_items.`);

    // 4. Wstaw wszystkie nowe pozycje do tabeli order_items
    const { error: insertError } = await supabaseAdmin
      .from('order_items')
      .insert(itemsToInsert);

    if (insertError) throw insertError;

    // 5. Zwróć sukces
    return new Response(JSON.stringify({ message: `Successfully migrated ${itemsToInsert.length} items.` }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error during migration:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});