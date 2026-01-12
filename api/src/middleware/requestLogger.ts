import { Request, Response, NextFunction } from 'express';
import { logApiRequest, getBodySize } from '../utils/logging.js';

interface ExtendedRequest extends Request {
  startTime?: number;
  originalSend?: any;
  statusCode?: number;
  responseBody?: string;
}

export const requestLogger = (req: ExtendedRequest, res: Response, next: NextFunction) => {
  req.startTime = Date.now();

  const originalSend = res.send;
  req.originalSend = originalSend;

  res.send = function (data: any) {
    req.responseBody = typeof data === 'string' ? data : JSON.stringify(data);
    req.statusCode = res.statusCode;
    return originalSend.call(this, data);
  };

  res.on('finish', () => {
    const startTime = req.startTime || Date.now();
    const responseTime = Date.now() - startTime;
    const endpoint = `${req.method} ${req.path}`;
    const statusCode = req.statusCode || res.statusCode;

    const logData: {
      method: string;
      endpoint: string;
      query_params: any;
      request_body_size: number;
      status_code: number;
      response_time_ms: number;
      user_agent: string | undefined;
      ip_address: string | undefined;
      error_message?: string;
    } = {
      method: req.method,
      endpoint,
      query_params: Object.keys(req.query).length > 0 ? req.query : undefined,
      request_body_size: getBodySize(req.body),
      status_code: statusCode,
      response_time_ms: responseTime,
      user_agent: req.get('user-agent'),
      ip_address: req.ip,
    };

    if (statusCode >= 400) {
      logData.error_message = req.responseBody ? req.responseBody.substring(0, 500) : undefined;
    }

    logApiRequest(logData).catch((error) => {
      console.error('Failed to log API request:', error);
    });
  });

  next();
};
