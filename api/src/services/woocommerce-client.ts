import crypto from 'crypto';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export interface WooCommerceConfig {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
  version?: string;
}

export interface WooCommerceOrder {
  id: number;
  order_key: string;
  status: string;
  currency: string;
  date_created: string;
  date_modified: string;
  total: string;
  billing: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    email: string;
    phone: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  line_items: Array<{
    id: number;
    name: string;
    product_id: number;
    variation_id: number;
    quantity: number;
    sku: string;
    price: string;
    total: string;
  }>;
  customer_note: string;
}

export interface WooCommerceProduct {
  id: number;
  name: string;
  sku: string;
  stock_quantity: number | null;
  manage_stock: boolean;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  variations?: number[];
}

export class WooCommerceClient {
  private config: WooCommerceConfig;
  private apiVersion: string;
  private axiosInstance: AxiosInstance;

  constructor(config: WooCommerceConfig) {
    this.config = {
      ...config,
      version: config.version || 'wc/v3'
    };
    this.apiVersion = this.config.version!;

    this.axiosInstance = axios.create({
      baseURL: `${this.config.siteUrl}/wp-json/${this.apiVersion}`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Kubacco-Warehouse-System/1.0'
      }
    });
  }

  private generateOAuthSignature(method: string, url: string, params: Record<string, string>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    const signatureBaseString = [
      method.toUpperCase(),
      encodeURIComponent(url),
      encodeURIComponent(sortedParams)
    ].join('&');

    const signingKey = `${encodeURIComponent(this.config.consumerSecret)}&`;

    return crypto
      .createHmac('sha256', signingKey)
      .update(signatureBaseString)
      .digest('base64');
  }

  private getOAuthParams(): Record<string, string> {
    return {
      oauth_consumer_key: this.config.consumerKey,
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA256',
      oauth_version: '1.0'
    };
  }

  private async request<T>(
    method: string,
    endpoint: string,
    data?: any,
    queryParams?: Record<string, any>
  ): Promise<T> {
    const url = `${this.config.siteUrl}/wp-json/${this.apiVersion}${endpoint}`;

    const oauthParams = this.getOAuthParams();
    const allParams = { ...oauthParams, ...queryParams };

    const signature = this.generateOAuthSignature(method, url, allParams);
    allParams.oauth_signature = signature;

    const config: AxiosRequestConfig = {
      method,
      url,
      params: allParams,
      data
    };

    try {
      const response = await this.axiosInstance.request<T>(config);
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `WooCommerce API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        );
      }
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request('GET', '/system_status');
      return true;
    } catch (error) {
      console.error('WooCommerce connection test failed:', error);
      return false;
    }
  }

  async getOrders(params?: {
    status?: string;
    page?: number;
    per_page?: number;
    after?: string;
    before?: string;
  }): Promise<WooCommerceOrder[]> {
    return this.request<WooCommerceOrder[]>('GET', '/orders', undefined, params);
  }

  async getOrder(orderId: number): Promise<WooCommerceOrder> {
    return this.request<WooCommerceOrder>('GET', `/orders/${orderId}`);
  }

  async updateOrderStatus(orderId: number, status: string): Promise<WooCommerceOrder> {
    return this.request<WooCommerceOrder>('PUT', `/orders/${orderId}`, { status });
  }

  async getProducts(params?: {
    page?: number;
    per_page?: number;
    sku?: string;
  }): Promise<WooCommerceProduct[]> {
    return this.request<WooCommerceProduct[]>('GET', '/products', undefined, params);
  }

  async getProduct(productId: number): Promise<WooCommerceProduct> {
    return this.request<WooCommerceProduct>('GET', `/products/${productId}`);
  }

  async updateProductStock(
    productId: number,
    stockQuantity: number
  ): Promise<WooCommerceProduct> {
    return this.request<WooCommerceProduct>('PUT', `/products/${productId}`, {
      stock_quantity: stockQuantity,
      manage_stock: true,
      stock_status: stockQuantity > 0 ? 'instock' : 'outofstock'
    });
  }

  async batchUpdateProducts(updates: Array<{
    id: number;
    stock_quantity: number;
  }>): Promise<any> {
    const batchData = {
      update: updates.map(u => ({
        id: u.id,
        stock_quantity: u.stock_quantity,
        manage_stock: true,
        stock_status: u.stock_quantity > 0 ? 'instock' : 'outofstock'
      }))
    };

    return this.request('POST', '/products/batch', batchData);
  }

  async getProductVariations(productId: number): Promise<any[]> {
    return this.request('GET', `/products/${productId}/variations`);
  }

  async updateProductVariationStock(
    productId: number,
    variationId: number,
    stockQuantity: number
  ): Promise<any> {
    return this.request('PUT', `/products/${productId}/variations/${variationId}`, {
      stock_quantity: stockQuantity,
      manage_stock: true,
      stock_status: stockQuantity > 0 ? 'instock' : 'outofstock'
    });
  }

  async createWebhook(topic: string, deliveryUrl: string): Promise<any> {
    return this.request('POST', '/webhooks', {
      name: `Kubacco - ${topic}`,
      topic,
      delivery_url: deliveryUrl,
      secret: crypto.randomBytes(32).toString('hex')
    });
  }

  async getWebhooks(): Promise<any[]> {
    return this.request('GET', '/webhooks');
  }

  async deleteWebhook(webhookId: number): Promise<void> {
    await this.request('DELETE', `/webhooks/${webhookId}`);
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64');

    return hash === signature;
  }
}
