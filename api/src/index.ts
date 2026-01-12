import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import productsRoutes from './routes/products.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import shippingRoutes from './routes/shipping.routes.js';
import integrationsRoutes from './routes/integrations.routes.js';
import webhooksRoutes from './routes/webhooks.routes.js';
import apiKeysRoutes from './routes/api-keys.routes.js';
import kubaccoApiRoutes from './routes/kubacco-api.routes.js';
import customersRoutes from './routes/customers.routes.js';
import labelGenerationRoutes from './routes/label-generation.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/api-keys', apiKeysRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/labels', labelGenerationRoutes);
app.use('/kubacco/v1', kubaccoApiRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Kubacco API server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 CORS enabled for: ${allowedOrigins.join(', ')}`);
  console.log(`✅ Health check available at: /health`);
  console.log(`🔑 Kubacco API available at: /kubacco/v1`);
});

export default app;
