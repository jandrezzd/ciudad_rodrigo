import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';

const ALLOWED_MIME_TYPES = ['application/pdf'];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const uploadDir = './uploads/invoice';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export const multerConfigInvoice = {
  storage: diskStorage({
    destination: uploadDir,
    filename: (req, file, callback) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = extname(file.originalname);
      const name = `invoice-${uniqueSuffix}${ext}`;
      callback(null, name);
    },
  }),
  fileFilter: (req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return callback(
        new Error(
          `Tipo de archivo no permitido: ${file.mimetype}. Solo se permiten: PDF`,
        ),
        false,
      );
    }

    const allowedFields = ['invoice'];
    if (!allowedFields.includes(file.fieldname)) {
      return callback(
        new Error(
          `Campo no permitido: ${file.fieldname}. Solo se permite: invoice`,
        ),
        false,
      );
    }

    callback(null, true);
  },
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
};
