/**
 * Hand-maintained mirror of the Supabase-generated database types, matching
 * the schema created by supabase/migrations/*.sql. Keep in sync when the
 * schema changes (or regenerate with `npx supabase gen types typescript`).
 *
 * Numeric/bigint Postgres columns are serialized by PostgREST as JSON numbers,
 * so they're typed `number` here (not `string`).
 *
 * Tables the current UI never joins across are given `Relationships: []`; call
 * sites that embed a related table (e.g. `.select('*, category:categories(*)')`)
 * assert the joined shape explicitly with `.returns<T>()` rather than relying on
 * relationship-based inference.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRoleEnum = 'VIEWER' | 'STAFF' | 'MANAGER' | 'ADMIN' | 'OWNER';
export type ProductTypeEnum = 'PRODUCT' | 'RAW_MATERIAL';
export type LocationTypeEnum = 'WAREHOUSE' | 'STORE' | 'PRODUCTION' | 'TRANSIT' | 'OTHER';
export type BarcodeSymbologyEnum =
  | 'EAN13'
  | 'EAN8'
  | 'UPCA'
  | 'UPCE'
  | 'CODE128'
  | 'CODE39'
  | 'ITF14'
  | 'GS1_128'
  | 'QR'
  | 'DATAMATRIX'
  | 'OTHER';
export type MovementTypeEnum =
  | 'PURCHASE'
  | 'SALE'
  | 'ADJUSTMENT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'RETURN'
  | 'INITIAL_STOCK'
  | 'PRODUCTION_IN'
  | 'PRODUCTION_OUT';
export type PurchaseOrderStatusEnum =
  'DRAFT' | 'SUBMITTED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED' | 'CLOSED';
export type SalesChannelEnum =
  'MANUAL' | 'AMAZON' | 'FLIPKART' | 'MEESHO' | 'SHOPIFY' | 'INSTAGRAM' | 'MYNTRA' | 'OTHER';
export type OrderStatusEnum = 'NEW' | 'DISPATCH_READY' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
export type ReturnStatusEnum = 'REQUESTED' | 'AUTHORIZED' | 'REJECTED' | 'RECEIVED' | 'REFUNDED';
export type ExchangeStatusEnum = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'DISPATCHED' | 'COMPLETED';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          role: UserRoleEnum;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          role?: UserRoleEnum;
          is_active?: boolean;
        };
        Update: {
          full_name?: string | null;
          role?: UserRoleEnum;
          is_active?: boolean;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          parent_id: string | null;
          name: string;
          slug: string | null;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          parent_id?: string | null;
          name: string;
          slug?: string | null;
          description?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['categories']['Insert']>;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          sku: string;
          name: string;
          description: string | null;
          category_id: string | null;
          product_type: ProductTypeEnum;
          unit_of_measure: string;
          hsn_sac_code: string | null;
          cost_price: number;
          selling_price: number;
          tax_rate: number;
          minimum_stock_level: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          sku: string;
          name: string;
          description?: string | null;
          category_id?: string | null;
          product_type?: ProductTypeEnum;
          unit_of_measure?: string;
          hsn_sac_code?: string | null;
          cost_price?: number;
          selling_price?: number;
          tax_rate?: number;
          minimum_stock_level?: number;
          is_active?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['products']['Insert']>;
        Relationships: [];
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          sku: string;
          name: string | null;
          size: string | null;
          color: string | null;
          design: string | null;
          cost_price: number | null;
          selling_price: number | null;
          hsn_sac_code: string | null;
          attributes: Json;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          sku: string;
          name?: string | null;
          size?: string | null;
          color?: string | null;
          design?: string | null;
          cost_price?: number | null;
          selling_price?: number | null;
          hsn_sac_code?: string | null;
          attributes?: Json;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['product_variants']['Insert']>;
        Relationships: [];
      };
      barcodes: {
        Row: {
          id: string;
          barcode: string;
          symbology: BarcodeSymbologyEnum;
          product_id: string | null;
          variant_id: string | null;
          owner_key: string;
          is_primary: boolean;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          barcode: string;
          symbology?: BarcodeSymbologyEnum;
          product_id?: string | null;
          variant_id?: string | null;
          is_primary?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['barcodes']['Insert']>;
        Relationships: [];
      };
      product_images: {
        Row: {
          id: string;
          product_id: string | null;
          variant_id: string | null;
          owner_key: string;
          bucket_id: string;
          storage_path: string;
          alt_text: string | null;
          position: number;
          is_primary: boolean;
          content_type: string | null;
          size_bytes: number | null;
          width: number | null;
          height: number | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          product_id?: string | null;
          variant_id?: string | null;
          bucket_id?: string;
          storage_path: string;
          alt_text?: string | null;
          position?: number;
          is_primary?: boolean;
          content_type?: string | null;
          size_bytes?: number | null;
          width?: number | null;
          height?: number | null;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['product_images']['Insert']>;
        Relationships: [];
      };
      vendors: {
        Row: {
          id: string;
          company_name: string;
          contact_person: string | null;
          phone: string | null;
          email: string | null;
          gstin: string | null;
          address: string | null;
          payment_terms: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          company_name: string;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          gstin?: string | null;
          address?: string | null;
          payment_terms?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['vendors']['Insert']>;
        Relationships: [];
      };
      locations: {
        Row: {
          id: string;
          code: string;
          name: string;
          location_type: LocationTypeEnum;
          address: string | null;
          is_active: boolean;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          location_type?: LocationTypeEnum;
          address?: string | null;
          is_active?: boolean;
          is_default?: boolean;
        };
        Update: Partial<Database['public']['Tables']['locations']['Insert']>;
        Relationships: [];
      };
      inventory: {
        Row: {
          id: string;
          product_id: string;
          variant_id: string | null;
          variant_key: string;
          location_id: string;
          quantity: number;
          reserved_quantity: number;
          available_quantity: number;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      inventory_movements: {
        Row: {
          id: string;
          product_id: string;
          variant_id: string | null;
          location_id: string;
          movement_type: MovementTypeEnum;
          quantity: number;
          unit_cost: number | null;
          vendor_id: string | null;
          reference_type: string | null;
          reference_id: string | null;
          notes: string | null;
          occurred_at: string;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          product_id: string;
          variant_id?: string | null;
          location_id: string;
          movement_type: MovementTypeEnum;
          quantity: number;
          unit_cost?: number | null;
          vendor_id?: string | null;
          reference_type?: string | null;
          reference_id?: string | null;
          notes?: string | null;
          occurred_at?: string;
          created_by?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      // Purchasing tables: typed for reads; the UI does not write to them yet.
      purchase_orders: {
        Row: {
          id: string;
          po_number: string;
          vendor_id: string;
          location_id: string | null;
          status: PurchaseOrderStatusEnum;
          order_date: string;
          expected_date: string | null;
          currency: string;
          subtotal: number;
          discount_amount: number;
          tax_amount: number;
          shipping_amount: number;
          total_amount: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['purchase_orders']['Row']>;
        Update: Partial<Database['public']['Tables']['purchase_orders']['Row']>;
        Relationships: [];
      };
      purchase_order_items: {
        Row: {
          id: string;
          purchase_order_id: string;
          product_id: string;
          variant_id: string | null;
          description: string | null;
          quantity_ordered: number;
          unit_cost: number;
          discount_amount: number;
          tax_rate: number;
          quantity_received: number;
          line_net: number;
          line_tax: number;
          line_total: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['purchase_order_items']['Row']>;
        Update: Partial<Database['public']['Tables']['purchase_order_items']['Row']>;
        Relationships: [];
      };
      purchase_receipts: {
        Row: {
          id: string;
          receipt_number: string;
          purchase_order_id: string;
          location_id: string;
          received_date: string;
          vendor_invoice_number: string | null;
          idempotency_key: string | null;
          notes: string | null;
          created_at: string;
          received_by: string | null;
        };
        Insert: Partial<Database['public']['Tables']['purchase_receipts']['Row']>;
        Update: Partial<Database['public']['Tables']['purchase_receipts']['Row']>;
        Relationships: [];
      };
      purchase_receipt_items: {
        Row: {
          id: string;
          purchase_receipt_id: string;
          purchase_order_item_id: string;
          quantity_received: number;
          unit_cost: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['purchase_receipt_items']['Row']>;
        Update: Partial<Database['public']['Tables']['purchase_receipt_items']['Row']>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          sales_channel: SalesChannelEnum;
          external_order_id: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          customer_email: string | null;
          shipping_address: string | null;
          location_id: string | null;
          status: OrderStatusEnum;
          order_date: string;
          subtotal: number;
          discount_amount: number;
          tax_amount: number;
          shipping_amount: number;
          total_amount: number;
          courier_name: string | null;
          awb_number: string | null;
          ready_at: string | null;
          ready_by: string | null;
          dispatched_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          order_number?: string;
          sales_channel?: SalesChannelEnum;
          external_order_id?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          customer_email?: string | null;
          shipping_address?: string | null;
          location_id?: string | null;
          status?: OrderStatusEnum;
          order_date?: string;
          discount_amount?: number;
          shipping_amount?: number;
          courier_name?: string | null;
          awb_number?: string | null;
          notes?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          variant_id: string | null;
          description: string | null;
          quantity: number;
          unit_price: number;
          discount_amount: number;
          tax_rate: number;
          line_net: number;
          line_tax: number;
          line_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          variant_id?: string | null;
          description?: string | null;
          quantity: number;
          unit_price?: number;
          discount_amount?: number;
          tax_rate?: number;
        };
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>;
        Relationships: [];
      };
      returns: {
        Row: {
          id: string;
          return_number: string;
          order_id: string;
          sales_channel: SalesChannelEnum;
          status: ReturnStatusEnum;
          reason: string | null;
          refund_amount: number;
          location_id: string | null;
          requested_at: string;
          authorized_at: string | null;
          authorized_by: string | null;
          received_at: string | null;
          refunded_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          return_number?: string;
          order_id: string;
          status?: ReturnStatusEnum;
          reason?: string | null;
          refund_amount?: number;
          location_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
        };
        Update: {
          status?: ReturnStatusEnum;
          reason?: string | null;
          refund_amount?: number;
          location_id?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      return_items: {
        Row: {
          id: string;
          return_id: string;
          order_item_id: string;
          product_id: string;
          variant_id: string | null;
          quantity: number;
          condition: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          return_id: string;
          order_item_id: string;
          quantity: number;
          condition?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      exchanges: {
        Row: {
          id: string;
          exchange_number: string;
          original_order_id: string;
          sales_channel: SalesChannelEnum;
          status: ExchangeStatusEnum;
          reason: string | null;
          location_id: string | null;
          requested_at: string;
          approved_at: string | null;
          approved_by: string | null;
          completed_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          exchange_number?: string;
          original_order_id: string;
          status?: ExchangeStatusEnum;
          reason?: string | null;
          location_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
        };
        Update: {
          status?: ExchangeStatusEnum;
          reason?: string | null;
          location_id?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      exchange_items: {
        Row: {
          id: string;
          exchange_id: string;
          original_order_item_id: string;
          returned_product_id: string;
          returned_variant_id: string | null;
          returned_quantity: number;
          new_product_id: string;
          new_variant_id: string | null;
          new_quantity: number;
          price_difference: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          exchange_id: string;
          original_order_item_id: string;
          returned_quantity: number;
          new_product_id: string;
          new_variant_id?: string | null;
          new_quantity: number;
          price_difference?: number;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      generate_ean13: {
        Args: { p_prefix?: string };
        Returns: string;
      };
      ean13_check_digit: {
        Args: { p_digits: string };
        Returns: string;
      };
      create_return: {
        Args: { p_return: Json; p_items: Json };
        Returns: string;
      };
      create_exchange: {
        Args: { p_exchange: Json; p_items: Json };
        Returns: string;
      };
      create_order: {
        Args: { p_order: Json; p_items: Json };
        Returns: string;
      };
      current_app_role: {
        Args: Record<string, never>;
        Returns: UserRoleEnum | null;
      };
      is_staff: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_manager: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRoleEnum;
      product_type: ProductTypeEnum;
      location_type: LocationTypeEnum;
      barcode_symbology: BarcodeSymbologyEnum;
      movement_type: MovementTypeEnum;
      purchase_order_status: PurchaseOrderStatusEnum;
      sales_channel: SalesChannelEnum;
      order_status: OrderStatusEnum;
      return_status: ReturnStatusEnum;
      exchange_status: ExchangeStatusEnum;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
