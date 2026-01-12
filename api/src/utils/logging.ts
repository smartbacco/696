import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface ApiRequestLogData {
  integration_id?: string;
  api_key_id?: string;
  method: string;
  endpoint: string;
  query_params?: Record<string, any>;
  request_body_size?: number;
  status_code: number;
  response_time_ms?: number;
  error_message?: string;
  user_agent?: string;
  ip_address?: string;
}

export interface ApiResponseLogData {
  integration_id: string;
  sync_log_id?: string;
  request_type: string;
  target_url: string;
  method: string;
  request_body_size?: number;
  status_code: number;
  response_body_size?: number;
  response_time_ms?: number;
  retry_attempt?: number;
  max_retries?: number;
  error_message?: string;
  response_sample?: string;
}

export async function logApiRequest(data: ApiRequestLogData): Promise<void> {
  try {
    await supabase.from('api_request_logs').insert([data]);
  } catch (error) {
    console.error('Failed to log API request:', error);
  }
}

export async function logApiResponse(data: ApiResponseLogData): Promise<void> {
  try {
    await supabase.from('api_response_logs').insert([data]);
  } catch (error) {
    console.error('Failed to log API response:', error);
  }
}

export function calculateResponseTime(startTime: number): number {
  return Date.now() - startTime;
}

export function getBodySize(body: any): number {
  if (!body) return 0;
  if (typeof body === 'string') return Buffer.byteLength(body);
  if (typeof body === 'object') return Buffer.byteLength(JSON.stringify(body));
  return 0;
}
