// Auto-generated types from Supabase schema
// Run: supabase gen types typescript --local > packages/api/src/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'super_admin' | 'owner' | 'manager' | 'cashier'
export type GSTRate = 0 | 5 | 12 | 18 | 28
export type PaymentMode = 'cash' | 'card' | 'upi' | 'split'
export type BusinessType = 'grocery' | 'textile' | 'pharmacy' | 'electronics' | 'service' | 'general'
export type StockMovementReason = 'sale' | 'purchase' | 'adjustment' | 'return' | 'damage' | 'opening'

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          gstin: string | null
          state_code: string
          country: string
          business_type: BusinessType
          plan: 'free' | 'pro' | 'enterprise'
          status: 'active' | 'suspended'
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['organizations']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
      }
      org_settings: {
        Row: {
          id: string
          organization_id: string
          branding: Json
          feature_flags: Json
          tax_profile: Json
          invoice_template: Json | null
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['org_settings']['Row'], 'id' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['org_settings']['Insert']>
      }
      profiles: {
        Row: {
          id: string
          full_name: string
          avatar_url: string | null
          phone: string | null
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      memberships: {
        Row: {
          id: string
          user_id: string
          organization_id: string
          role: UserRole
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['memberships']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['memberships']['Insert']>
      }
      categories: {
        Row: {
          id: string
          organization_id: string
          name: string
          color: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['categories']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['categories']['Insert']>
      }
      products: {
        Row: {
          id: string
          organization_id: string
          category_id: string | null
          name: string
          sku: string | null
          hsn_code: string | null
          tax_rate: GSTRate
          price: number
          cost_price: number
          barcode_value: string | null
          image_url: string | null
          track_stock: boolean
          is_active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['products']['Insert']>
      }
      inventory: {
        Row: {
          product_id: string
          organization_id: string
          stock_qty: number
          reorder_level: number
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['inventory']['Row'], 'updated_at'>
        Update: Partial<Database['public']['Tables']['inventory']['Insert']>
      }
      stock_movements: {
        Row: {
          id: string
          organization_id: string
          product_id: string
          qty_change: number
          reason: StockMovementReason
          reference_id: string | null
          note: string | null
          created_by: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['stock_movements']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['stock_movements']['Insert']>
      }
      customers: {
        Row: {
          id: string
          organization_id: string
          name: string
          phone: string | null
          email: string | null
          gstin: string | null
          state_code: string | null
          address: string | null
          balance: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['customers']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['customers']['Insert']>
      }
      suppliers: {
        Row: {
          id: string
          organization_id: string
          name: string
          phone: string | null
          email: string | null
          gstin: string | null
          address: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['suppliers']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['suppliers']['Insert']>
      }
      sales: {
        Row: {
          id: string
          organization_id: string
          invoice_no: string
          customer_id: string | null
          subtotal: number
          discount_total: number
          tax_total: number
          grand_total: number
          payment_mode: PaymentMode
          cash_amount: number | null
          card_amount: number | null
          upi_amount: number | null
          notes: string | null
          created_by: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['sales']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['sales']['Insert']>
      }
      sale_items: {
        Row: {
          id: string
          sale_id: string
          organization_id: string
          product_id: string
          product_name: string
          hsn_code: string | null
          qty: number
          unit_price: number
          discount_pct: number
          tax_rate: GSTRate
          cgst_amount: number
          sgst_amount: number
          igst_amount: number
          line_total: number
        }
        Insert: Omit<Database['public']['Tables']['sale_items']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['sale_items']['Insert']>
      }
      purchases: {
        Row: {
          id: string
          organization_id: string
          supplier_id: string | null
          invoice_ref: string | null
          total_amount: number
          notes: string | null
          created_by: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['purchases']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['purchases']['Insert']>
      }
      expenses: {
        Row: {
          id: string
          organization_id: string
          category: string
          amount: number
          description: string | null
          date: string
          created_by: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['expenses']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['expenses']['Insert']>
      }
      activity_log: {
        Row: {
          id: string
          organization_id: string
          actor_id: string
          actor_name: string
          action: string
          entity: string
          entity_id: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['activity_log']['Row'], 'id' | 'created_at'>
        Update: never
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      my_org_ids: {
        Args: Record<string, never>
        Returns: { organization_id: string }[]
      }
    }
    Enums: {
      user_role: UserRole
      gst_rate: GSTRate
      payment_mode: PaymentMode
    }
  }
}
