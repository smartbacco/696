export type Role = 'ADMIN' | 'MANAGEMENT' | 'SHIPPER';

export interface User {
  id: string;
  email: string;
  role: Role;
  full_name?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthRequest extends Express.Request {
  user?: {
    id: string;
    email: string;
    role: Role;
  };
}

export type OrderStatus =
  | 'PROCESSING'
  | 'READY_TO_SHIP'
  | 'SHIPMENT_CREATED'
  | 'PACKAGING'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

export type Channel = 'WHOLESALE' | 'ONLINE';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export type SyncResult = 'SUCCESS' | 'FAILED' | 'PENDING';
export type PlatformType = 'WOOCOMMERCE' | 'KUBACCO_APP';

export interface OrderWithSyncStatus {
  id: string;
  order_code: string;
  channel: Channel;
  status: OrderStatus;
  receiver: string;
  email?: string;
  sync_status?: SyncResult;
  last_sync_at?: string;
  ops_order_items?: any[];
}

export interface SyncResponse {
  success: boolean;
  syncLogId: string;
  orderId: string;
  platformType: string;
  newStatus: string;
  error?: string;
  retryCount?: number;
}
