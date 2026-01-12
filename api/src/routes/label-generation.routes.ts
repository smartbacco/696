import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { generateLocalLabel, LabelRequest } from '../services/label-generation.service.js';

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

router.post('/generate-local-label', async (req: Request, res: Response) => {
  try {
    const labelRequest = req.body as LabelRequest;

    if (!labelRequest.orderNumber || !labelRequest.shipmentCode) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderNumber, shipmentCode',
      });
    }

    const pdfBuffer = await generateLocalLabel(labelRequest);

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const fileName = `${labelRequest.shipmentCode}_label.pdf`;

    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('shipment-labels')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Failed to upload label:', uploadError);
      throw new Error(`Failed to upload label: ${uploadError.message}`);
    }

    const { data: urlData } = supabaseClient.storage
      .from('shipment-labels')
      .getPublicUrl(fileName);

    return res.status(200).json({
      success: true,
      labelUrl: urlData.publicUrl,
    });
  } catch (error) {
    console.error('Error generating local label:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

export default router;
