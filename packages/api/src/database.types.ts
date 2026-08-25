export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_system: boolean
          name: string
          organization_id: string
          parent_id: string | null
          type: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          organization_id: string
          parent_id?: string | null
          type: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          organization_id?: string
          parent_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          actor_id: string
          actor_name: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          metadata: Json | null
          organization_id: string
        }
        Insert: {
          action: string
          actor_id: string
          actor_name: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          actor_name?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          balance: number
          created_at: string
          email: string | null
          gstin: string | null
          id: string
          name: string
          organization_id: string
          phone: string | null
          state_code: string | null
        }
        Insert: {
          address?: string | null
          balance?: number
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          organization_id: string
          phone?: string | null
          state_code?: string | null
        }
        Update: {
          address?: string | null
          balance?: number
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
          state_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_advances: {
        Row: {
          advance_date: string
          amount: number
          created_at: string
          created_by: string
          employee_id: string
          id: string
          notes: string | null
          organization_id: string
          status: string
        }
        Insert: {
          advance_date?: string
          amount: number
          created_at?: string
          created_by: string
          employee_id: string
          id?: string
          notes?: string | null
          organization_id: string
          status?: string
        }
        Update: {
          advance_date?: string
          amount?: number
          created_at?: string
          created_by?: string
          employee_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_advances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          base_salary: number
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          joined_date: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          role: string
          salary_advance_balance: number
        }
        Insert: {
          base_salary?: number
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          joined_date?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          role?: string
          salary_advance_balance?: number
        }
        Update: {
          base_salary?: number
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          joined_date?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          role?: string
          salary_advance_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string
          description: string | null
          expense_date: string
          id: string
          notes: string | null
          organization_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by: string
          description?: string | null
          expense_date?: string
          id?: string
          notes?: string | null
          organization_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          expense_date?: string
          id?: string
          notes?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          organization_id: string
          product_id: string
          reorder_level: number
          stock_qty: number
          updated_at: string
        }
        Insert: {
          organization_id: string
          product_id: string
          reorder_level?: number
          stock_qty?: number
          updated_at?: string
        }
        Update: {
          organization_id?: string
          product_id?: string
          reorder_level?: number
          stock_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          batch_no: string
          cost_price: number
          created_at: string
          expiry_date: string | null
          id: string
          organization_id: string
          product_id: string
          qty: number
        }
        Insert: {
          batch_no: string
          cost_price?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          organization_id: string
          product_id: string
          qty?: number
        }
        Update: {
          batch_no?: string
          cost_price?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          organization_id?: string
          product_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_customers: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          organization_id: string
          points_balance: number
          total_points_earned: number
          total_points_redeemed: number
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          organization_id: string
          points_balance?: number
          total_points_earned?: number
          total_points_redeemed?: number
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          organization_id?: string
          points_balance?: number
          total_points_earned?: number
          total_points_redeemed?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_customers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_settings: {
        Row: {
          id: string
          min_redeem_points: number
          organization_id: string
          points_per_rupee: number
          rupees_per_point: number
          updated_at: string
        }
        Insert: {
          id?: string
          min_redeem_points?: number
          organization_id: string
          points_per_rupee?: number
          rupees_per_point?: number
          updated_at?: string
        }
        Update: {
          id?: string
          min_redeem_points?: number
          organization_id?: string
          points_per_rupee?: number
          rupees_per_point?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          loyalty_customer_id: string
          note: string | null
          organization_id: string
          points: number
          sale_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          loyalty_customer_id: string
          note?: string | null
          organization_id: string
          points: number
          sale_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          loyalty_customer_id?: string
          note?: string | null
          organization_id?: string
          points?: number
          sale_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_loyalty_customer_id_fkey"
            columns: ["loyalty_customer_id"]
            isOneToOne: false
            referencedRelation: "loyalty_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          custom_role_id: string | null
          employee_id: string | null
          id: string
          is_active: boolean
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_role_id?: string | null
          employee_id?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          custom_role_id?: string | null
          employee_id?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_plans: {
        Row: {
          auto_renew: boolean
          billing_cycle: string
          created_at: string
          expiry_date: string | null
          id: string
          organization_id: string
          plan_id: string
          start_date: string
          status: string
        }
        Insert: {
          auto_renew?: boolean
          billing_cycle?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          organization_id: string
          plan_id: string
          start_date?: string
          status?: string
        }
        Update: {
          auto_renew?: boolean
          billing_cycle?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          organization_id?: string
          plan_id?: string
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_plans_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          branding: Json
          feature_flags: Json
          id: string
          invoice_template: Json | null
          organization_id: string
          tax_profile: Json
          updated_at: string
        }
        Insert: {
          branding?: Json
          feature_flags?: Json
          id?: string
          invoice_template?: Json | null
          organization_id: string
          tax_profile?: Json
          updated_at?: string
        }
        Update: {
          branding?: Json
          feature_flags?: Json
          id?: string
          invoice_template?: Json | null
          organization_id?: string
          tax_profile?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          city: string | null
          pincode: string | null
          phone: string | null
          email: string | null
          pan: string | null
          website: string | null
          business_type: Database["public"]["Enums"]["business_type"]
          country: string
          created_at: string
          gstin: string | null
          id: string
          name: string
          plan: Database["public"]["Enums"]["org_plan"]
          state_code: string
          status: Database["public"]["Enums"]["org_status"]
        }
        Insert: {
          address?: string | null
          city?: string | null
          pincode?: string | null
          phone?: string | null
          email?: string | null
          pan?: string | null
          website?: string | null
          business_type?: Database["public"]["Enums"]["business_type"]
          country?: string
          created_at?: string
          gstin?: string | null
          id?: string
          name: string
          plan?: Database["public"]["Enums"]["org_plan"]
          state_code?: string
          status?: Database["public"]["Enums"]["org_status"]
        }
        Update: {
          address?: string | null
          city?: string | null
          pincode?: string | null
          phone?: string | null
          email?: string | null
          pan?: string | null
          website?: string | null
          business_type?: Database["public"]["Enums"]["business_type"]
          country?: string
          created_at?: string
          gstin?: string | null
          id?: string
          name?: string
          plan?: Database["public"]["Enums"]["org_plan"]
          state_code?: string
          status?: Database["public"]["Enums"]["org_status"]
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          is_default: boolean
          limits: Json
          monthly_price: number
          name: string
          trial_days: number
          yearly_price: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_default?: boolean
          limits?: Json
          monthly_price?: number
          name: string
          trial_days?: number
          yearly_price?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_default?: boolean
          limits?: Json
          monthly_price?: number
          name?: string
          trial_days?: number
          yearly_price?: number | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          allow_registrations: boolean
          currency: string
          default_trial_days: number
          id: number
          maintenance_mode: boolean
          platform_name: string
          privacy_policy_url: string | null
          support_email: string | null
          support_phone: string | null
          terms_url: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          allow_registrations?: boolean
          currency?: string
          default_trial_days?: number
          id?: number
          maintenance_mode?: boolean
          platform_name?: string
          privacy_policy_url?: string | null
          support_email?: string | null
          support_phone?: string | null
          terms_url?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          allow_registrations?: boolean
          currency?: string
          default_trial_days?: number
          id?: number
          maintenance_mode?: boolean
          platform_name?: string
          privacy_policy_url?: string | null
          support_email?: string | null
          support_phone?: string | null
          terms_url?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          barcode_value: string | null
          color: string | null
          created_at: string
          id: string
          organization_id: string
          price_delta: number
          product_id: string
          size: string | null
          stock_qty: number
        }
        Insert: {
          barcode_value?: string | null
          color?: string | null
          created_at?: string
          id?: string
          organization_id: string
          price_delta?: number
          product_id: string
          size?: string | null
          stock_qty?: number
        }
        Update: {
          barcode_value?: string | null
          color?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          price_delta?: number
          product_id?: string
          size?: string | null
          stock_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode_value: string | null
          brand: string | null
          category_id: string | null
          conversion_factor: number | null
          cost_price: number
          created_at: string
          has_batches: boolean
          has_variants: boolean
          hsn_code: string | null
          id: string
          image_url: string | null
          is_active: boolean
          mrp: number | null
          name: string
          organization_id: string
          price: number
          secondary_unit_id: string | null
          sku: string | null
          special_price: number | null
          tax_rate: number
          track_stock: boolean
          unit_id: string
        }
        Insert: {
          barcode_value?: string | null
          brand?: string | null
          category_id?: string | null
          conversion_factor?: number | null
          cost_price?: number
          created_at?: string
          has_batches?: boolean
          has_variants?: boolean
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          mrp?: number | null
          name: string
          organization_id: string
          price: number
          secondary_unit_id?: string | null
          sku?: string | null
          special_price?: number | null
          tax_rate?: number
          track_stock?: boolean
          unit_id: string
        }
        Update: {
          barcode_value?: string | null
          brand?: string | null
          category_id?: string | null
          conversion_factor?: number | null
          cost_price?: number
          created_at?: string
          has_batches?: boolean
          has_variants?: boolean
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          mrp?: number | null
          name?: string
          organization_id?: string
          price?: number
          secondary_unit_id?: string | null
          sku?: string | null
          special_price?: number | null
          tax_rate?: number
          track_stock?: boolean
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_secondary_unit_id_fkey"
            columns: ["secondary_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          full_name: string
          id: string
          is_super_admin: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string
          id: string
          is_super_admin?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          full_name?: string
          id?: string
          is_super_admin?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          max_discount_amount: number | null
          max_uses: number | null
          min_order_amount: number | null
          name: string
          organization_id: string
          scope: string
          target_id: string | null
          type: string
          usage_count: number
          valid_from: string | null
          valid_until: string | null
          value: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          max_uses?: number | null
          min_order_amount?: number | null
          name: string
          organization_id: string
          scope?: string
          target_id?: string | null
          type: string
          usage_count?: number
          valid_from?: string | null
          valid_until?: string | null
          value: number
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          max_uses?: number | null
          min_order_amount?: number | null
          name?: string
          organization_id?: string
          scope?: string
          target_id?: string | null
          type?: string
          usage_count?: number
          valid_from?: string | null
          valid_until?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          cgst_amount: number
          id: string
          igst_amount: number
          line_total: number
          organization_id: string | null
          product_id: string | null
          product_name: string
          purchase_id: string
          qty: number
          sgst_amount: number
          tax_rate: number
          taxable_amount: number
          unit_cost: number
        }
        Insert: {
          cgst_amount?: number
          id?: string
          igst_amount?: number
          line_total: number
          organization_id?: string | null
          product_id?: string | null
          product_name?: string
          purchase_id: string
          qty: number
          sgst_amount?: number
          tax_rate?: number
          taxable_amount?: number
          unit_cost: number
        }
        Update: {
          cgst_amount?: number
          id?: string
          igst_amount?: number
          line_total?: number
          organization_id?: string | null
          product_id?: string | null
          product_name?: string
          purchase_id?: string
          qty?: number
          sgst_amount?: number
          tax_rate?: number
          taxable_amount?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          bill_discount_type: string | null
          bill_discount_value: number | null
          created_at: string
          created_by: string
          id: string
          invoice_no: string | null
          notes: string | null
          organization_id: string
          purchase_date: string | null
          purchase_no: string | null
          purchase_type: string
          round_off: number
          supplier_id: string | null
          total_amount: number
        }
        Insert: {
          bill_discount_type?: string | null
          bill_discount_value?: number | null
          created_at?: string
          created_by: string
          id?: string
          invoice_no?: string | null
          notes?: string | null
          organization_id: string
          purchase_date?: string | null
          purchase_no?: string | null
          purchase_type?: string
          round_off?: number
          supplier_id?: string | null
          total_amount?: number
        }
        Update: {
          bill_discount_type?: string | null
          bill_discount_value?: number | null
          created_at?: string
          created_by?: string
          id?: string
          invoice_no?: string | null
          notes?: string | null
          organization_id?: string
          purchase_date?: string | null
          purchase_no?: string | null
          purchase_type?: string
          round_off?: number
          supplier_id?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          discount_pct: number
          id: string
          line_total: number
          organization_id: string
          product_name: string
          qty: number
          quotation_id: string
          unit_price: number
        }
        Insert: {
          discount_pct?: number
          id?: string
          line_total?: number
          organization_id: string
          product_name: string
          qty?: number
          quotation_id: string
          unit_price?: number
        }
        Update: {
          discount_pct?: number
          id?: string
          line_total?: number
          organization_id?: string
          product_name?: string
          qty?: number
          quotation_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          created_at: string
          created_by: string
          customer_name: string
          customer_phone: string | null
          id: string
          notes: string | null
          organization_id: string
          quote_no: string
          status: string
          total_amount: number
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          customer_name: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          quote_no: string
          status?: string
          total_amount?: number
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_name?: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          quote_no?: string
          status?: string
          total_amount?: number
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_templates: {
        Row: {
          category: string
          created_at: string
          default_amount: number
          due_day: number
          id: string
          is_active: boolean
          last_billed_month: string | null
          name: string
          organization_id: string
        }
        Insert: {
          category: string
          created_at?: string
          default_amount?: number
          due_day: number
          id?: string
          is_active?: boolean
          last_billed_month?: string | null
          name: string
          organization_id: string
        }
        Update: {
          category?: string
          created_at?: string
          default_amount?: number
          due_day?: number
          id?: string
          is_active?: boolean
          last_billed_month?: string | null
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      return_items: {
        Row: {
          id: string
          line_total: number
          organization_id: string
          product_name: string
          qty: number
          return_id: string
          unit_price: number
        }
        Insert: {
          id?: string
          line_total?: number
          organization_id: string
          product_name: string
          qty?: number
          return_id: string
          unit_price?: number
        }
        Update: {
          id?: string
          line_total?: number
          organization_id?: string
          product_name?: string
          qty?: number
          return_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          created_at: string
          created_by: string
          id: string
          notes: string | null
          organization_id: string
          original_invoice_no: string
          purchase_ref: string | null
          reason: string
          refund_amount: number
          refund_mode: string
          return_type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          organization_id: string
          original_invoice_no: string
          purchase_ref?: string | null
          reason: string
          refund_amount?: number
          refund_mode?: string
          return_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          organization_id?: string
          original_invoice_no?: string
          purchase_ref?: string | null
          reason?: string
          refund_amount?: number
          refund_mode?: string
          return_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          organization_id: string
          permissions: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          organization_id: string
          permissions?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          organization_id?: string
          permissions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_payments: {
        Row: {
          advance_deducted: number
          allowances_bonus: number
          base_salary: number
          created_at: string
          created_by: string
          employee_id: string
          expense_id: string | null
          id: string
          net_paid: number
          organization_id: string
          other_deductions: number
          payment_date: string
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          payment_month: string
        }
        Insert: {
          advance_deducted?: number
          allowances_bonus?: number
          base_salary: number
          created_at?: string
          created_by: string
          employee_id: string
          expense_id?: string | null
          id?: string
          net_paid: number
          organization_id: string
          other_deductions?: number
          payment_date?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          payment_month: string
        }
        Update: {
          advance_deducted?: number
          allowances_bonus?: number
          base_salary?: number
          created_at?: string
          created_by?: string
          employee_id?: string
          expense_id?: string | null
          id?: string
          net_paid?: number
          organization_id?: string
          other_deductions?: number
          payment_date?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          payment_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          cgst_amount: number
          discount_amount: number
          discount_pct: number
          discount_type: string
          hsn_code: string | null
          id: string
          igst_amount: number
          line_total: number
          organization_id: string
          product_id: string
          product_name: string
          qty: number
          sale_id: string
          sgst_amount: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          cgst_amount?: number
          discount_amount?: number
          discount_pct?: number
          discount_type?: string
          hsn_code?: string | null
          id?: string
          igst_amount?: number
          line_total: number
          organization_id: string
          product_id: string
          product_name: string
          qty: number
          sale_id: string
          sgst_amount?: number
          tax_rate?: number
          unit_price: number
        }
        Update: {
          cgst_amount?: number
          discount_amount?: number
          discount_pct?: number
          discount_type?: string
          hsn_code?: string | null
          id?: string
          igst_amount?: number
          line_total?: number
          organization_id?: string
          product_id?: string
          product_name?: string
          qty?: number
          sale_id?: string
          sgst_amount?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          card_amount: number | null
          cash_amount: number | null
          created_at: string
          created_by: string
          customer_id: string | null
          discount_total: number
          grand_total: number
          id: string
          invoice_no: string
          loyalty_customer_id: string | null
          loyalty_points_earned: number
          loyalty_points_redeemed: number
          loyalty_redeem_amount: number
          net_payable: number
          notes: string | null
          order_discount_amount: number
          order_discount_type: string | null
          order_discount_value: number
          organization_id: string
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          purge_after: string | null
          subtotal: number
          tax_total: number
          upi_amount: number | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          card_amount?: number | null
          cash_amount?: number | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          discount_total?: number
          grand_total: number
          id?: string
          invoice_no: string
          loyalty_customer_id?: string | null
          loyalty_points_earned?: number
          loyalty_points_redeemed?: number
          loyalty_redeem_amount?: number
          net_payable?: number
          notes?: string | null
          order_discount_amount?: number
          order_discount_type?: string | null
          order_discount_value?: number
          organization_id: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          purge_after?: string | null
          subtotal: number
          tax_total?: number
          upi_amount?: number | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          card_amount?: number | null
          cash_amount?: number | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          discount_total?: number
          grand_total?: number
          id?: string
          invoice_no?: string
          loyalty_customer_id?: string | null
          loyalty_points_earned?: number
          loyalty_points_redeemed?: number
          loyalty_redeem_amount?: number
          net_payable?: number
          notes?: string | null
          order_discount_amount?: number
          order_discount_type?: string | null
          order_discount_value?: number
          organization_id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          purge_after?: string | null
          subtotal?: number
          tax_total?: number
          upi_amount?: number | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_loyalty_customer_id_fkey"
            columns: ["loyalty_customer_id"]
            isOneToOne: false
            referencedRelation: "loyalty_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          bill_count: number
          cash_difference: number | null
          closed_at: string | null
          closed_by: string | null
          closing_cash: number | null
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_cash: number
          organization_id: string
          status: string
          total_sales: number
        }
        Insert: {
          bill_count?: number
          cash_difference?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_cash?: number
          organization_id: string
          status?: string
          total_sales?: number
        }
        Update: {
          bill_count?: number
          cash_difference?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash?: number
          organization_id?: string
          status?: string
          total_sales?: number
        }
        Relationships: [
          {
            foreignKeyName: "shifts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string
          id: string
          note: string | null
          organization_id: string
          product_id: string
          qty_change: number
          reason: Database["public"]["Enums"]["stock_movement_reason"]
          reference_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          note?: string | null
          organization_id: string
          product_id: string
          qty_change: number
          reason: Database["public"]["Enums"]["stock_movement_reason"]
          reference_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          organization_id?: string
          product_id?: string
          qty_change?: number
          reason?: Database["public"]["Enums"]["stock_movement_reason"]
          reference_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_ifsc: string | null
          bank_name: string | null
          created_at: string
          email: string | null
          gstin: string | null
          id: string
          name: string
          organization_id: string
          phone: string | null
          upi_id: string | null
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          organization_id: string
          phone?: string | null
          upi_id?: string | null
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          allow_decimal: boolean
          created_at: string
          id: string
          name: string
          organization_id: string
          symbol: string
        }
        Insert: {
          allow_decimal?: boolean
          created_at?: string
          id?: string
          name: string
          organization_id: string
          symbol: string
        }
        Update: {
          allow_decimal?: boolean
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_entries: {
        Row: {
          account_id: string
          amount: number
          id: string
          narration: string | null
          type: string
          voucher_id: string
        }
        Insert: {
          account_id: string
          amount: number
          id?: string
          narration?: string | null
          type: string
          voucher_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          id?: string
          narration?: string | null
          type?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_entries_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          created_at: string
          created_by: string
          date: string
          id: string
          narration: string | null
          organization_id: string
          reference: string | null
          type: string
          voucher_no: string
        }
        Insert: {
          created_at?: string
          created_by: string
          date?: string
          id?: string
          narration?: string | null
          organization_id: string
          reference?: string | null
          type: string
          voucher_no: string
        }
        Update: {
          created_at?: string
          created_by?: string
          date?: string
          id?: string
          narration?: string | null
          organization_id?: string
          reference?: string | null
          type?: string
          voucher_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_organization_for_user: {
        Args: {
          p_business_type: string
          p_feature_flags?: Json
          p_gstin?: string
          p_name: string
          p_primary_color?: string
          p_state_code: string
        }
        Returns: Json
      }
      increment_inventory: {
        Args: { p_org_id: string; p_product_id: string; p_qty: number }
        Returns: undefined
      }
      is_super_admin: { Args: never; Returns: boolean }
      my_org_ids: { Args: never; Returns: string[] }
      my_role_in_org: {
        Args: { org_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
    }
    Enums: {
      business_type:
        | "grocery"
        | "textile"
        | "pharmacy"
        | "electronics"
        | "service"
        | "general"
      org_plan: "free" | "pro" | "enterprise"
      org_status: "active" | "suspended" | "deleted"
      payment_mode: "cash" | "card" | "upi" | "split"
      stock_movement_reason:
        | "sale"
        | "purchase"
        | "adjustment"
        | "return"
        | "damage"
        | "opening"
      user_role: "super_admin" | "owner" | "manager" | "cashier"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      business_type: [
        "grocery",
        "textile",
        "pharmacy",
        "electronics",
        "service",
        "general",
      ],
      org_plan: ["free", "pro", "enterprise"],
      org_status: ["active", "suspended", "deleted"],
      payment_mode: ["cash", "card", "upi", "split"],
      stock_movement_reason: [
        "sale",
        "purchase",
        "adjustment",
        "return",
        "damage",
        "opening",
      ],
      user_role: ["super_admin", "owner", "manager", "cashier"],
    },
  },
} as const
